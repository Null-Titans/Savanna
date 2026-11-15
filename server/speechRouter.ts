import express, { type Request, type Response } from 'express';
import { type Content, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { detectSensitiveInput, getSensitiveRefusalMessage } from '../src/utils/privacyGuard.ts';
import { buildSiteWideAssistantInstruction, type AssistantContextInfo } from './assistantPrompt.ts';
import { WEBSITE_TOOL_DECLARATIONS } from './websiteTools.ts';
import {
  buildDedupKey,
  compressConversationHistory,
  GEMINI_MODELS,
  getCachedAssistantReply,
  getLocalizedQuotaMessage,
  getTokenUsageStats,
  isQuotaExceededError,
  recordQuotaError,
  recordTokenUsage,
  selectAssistantRoute,
  setCachedAssistantReply,
} from './geminiConfig.ts';

export type ThreeLang = 'en' | 'am' | 'om';

const SUPPORTED_LANGUAGES: ThreeLang[] = ['en', 'am', 'om'];

const ETHIOPIC_REGEX = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
const OROMO_LEXICAL_REGEX =
  /\b(akkam|nagaa|maaloo|galatoomi|galatoomaa|eeyyee|lakkii|maqaa|gargaarsa|deeggarsa|hojiin|hojii|hojjetaa|barataa|barnoota|galmee|keessan|keessa|irraa|argachuu|barbaada|barbaadu|afaan|oromoo|oromiffa|oromiffaa|ani|ati|nuti|isaan|maal|maaliif|eessa|yoom|akkamitti|fayyaa|mijataa|gaaffii|deebii|barbaachisa|bilbila|waraqaa|eenyummaa|dhaabbata|michuu|iccitii|itti|fufi|duubatti|sirreessi|maxxansi|hayyama|dubbisi|dubbachuu|sagalee|qajeelfama|ergaa|fudhadhu|dhaabi|nagaatti)\b/i;
const CLEAR_ENGLISH_HINT_REGEX =
  /\b(the|is|are|am|what|where|how|can|open|show|find|jobs|job|work|remote|apply|course|courses|register|registration|profile|help|dark|light|mode|language|english|amharic|oromo|hello|hi|goodbye|stop|thank|thanks|yes|no|please|explain|read|screen|form|button|login|log|sign|phone|skills|next|back|skip|submit)\b/i;

const ttsAudioCache = new Map<string, Buffer>();

function getAiClient(apiVersion: 'v1beta' | 'v1alpha' = 'v1beta'): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      apiVersion,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeThreeLang(raw?: string | null): ThreeLang {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'am' || v.startsWith('am-')) return 'am';
  if (v === 'om' || v.startsWith('om-')) return 'om';
  return 'en';
}

export function heuristicDetectLanguage(text: string): ThreeLang {
  const trimmed = text.trim();
  if (!trimmed) return 'en';
  if (ETHIOPIC_REGEX.test(trimmed)) return 'am';
  if (OROMO_LEXICAL_REGEX.test(trimmed)) return 'om';
  return 'en';
}

async function detectLanguageServer(ai: GoogleGenAI | null, text: string): Promise<ThreeLang> {
  const trimmed = text.trim();
  if (!trimmed) return 'en';
  if (ETHIOPIC_REGEX.test(trimmed)) return 'am';
  if (OROMO_LEXICAL_REGEX.test(trimmed)) return 'om';
  // Token optimization: skip LLM classification when clear common English vocabulary is present
  if (!ai || CLEAR_ENGLISH_HINT_REGEX.test(trimmed) || /^[\d+\s@._-]+$/.test(trimmed)) {
    return 'en';
  }

  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODELS.lite,
      contents: `Classify into "en", "am", or "om": """${trimmed.slice(0, 300)}"""`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            language: {
              type: Type.STRING,
              enum: ['en', 'am', 'om'],
            },
          },
          required: ['language'],
        },
      },
    });
    recordTokenUsage(GEMINI_MODELS.lite, resp.usageMetadata);
    const parsed = JSON.parse((resp.text || '{}').trim()) as { language?: string };
    if (parsed.language && SUPPORTED_LANGUAGES.includes(parsed.language as ThreeLang)) {
      return parsed.language as ThreeLang;
    }
  } catch {
    // Fall back to heuristic on classification failure
  }
  return heuristicDetectLanguage(trimmed);
}

/**
 * Splits long text into sentence-aligned chunks so TTS never truncates or cuts off mid-sentence.
 */
export function splitIntoSpeechChunks(text: string, maxChars = 380): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const rawSentences = normalized.split(/(?<=[.!?።])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of rawSentences) {
    if (!sentence.trim()) continue;
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      const words = sentence.split(' ');
      let part = '';
      for (const word of words) {
        if ((part + ' ' + word).trim().length > maxChars) {
          if (part) chunks.push(part.trim());
          part = word;
        } else {
          part = (part + ' ' + word).trim();
        }
      }
      if (part) chunks.push(part.trim());
    } else if ((current + ' ' + sentence).trim().length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function concatWavBuffers(wavClips: Buffer[]): Buffer {
  if (wavClips.length === 0) return Buffer.alloc(0);
  if (wavClips.length === 1) return wavClips[0];

  const header = Buffer.from(wavClips[0].subarray(0, 44));
  const pcmParts = wavClips.map((buf) => (buf.length > 44 ? buf.subarray(44) : Buffer.alloc(0)));
  const combinedPcm = Buffer.concat(pcmParts);

  header.writeUInt32LE(36 + combinedPcm.length, 4);
  header.writeUInt32LE(combinedPcm.length, 40);

  return Buffer.concat([header, combinedPcm]);
}

function getTtsVoiceConfig(language: ThreeLang): { voiceName: string; style: string } {
  if (language === 'am') {
    return {
      voiceName: 'Kore',
      style:
        'Speak in clear, natural Ethiopian Amharic (አማርኛ) with authentic Ethiopian Amharic pronunciation, natural rhythm, and calm conversational warmth. Read every word strictly in Amharic; never switch to English pronunciation.',
    };
  }
  if (language === 'om') {
    return {
      voiceName: 'Kore',
      style:
        'Speak in clear, natural Ethiopian Afaan Oromo (Oromiffa) using authentic Oromo Qubee phonology: pronounce double vowels as long vowels, single vowels as short, geminated consonants cleanly, and apostrophe glottal stops (hudhaa) naturally. Never pronounce words using Amharic or English phonetics.',
    };
  }
  return {
    voiceName: 'Zephyr',
    style: 'Speak in clear, warm, natural English at an easy-to-follow conversational pace.',
  };
}

export function createSpeechRouter() {
  const router = express.Router();

  router.get('/capabilities', (_req: Request, res: Response) => {
    const ai = getAiClient();
    res.json({
      geminiConfigured: Boolean(ai),
      supportedLanguages: SUPPORTED_LANGUAGES,
      models: {
        tts: GEMINI_MODELS.ttsLite,
        stt: GEMINI_MODELS.stt,
        assistant: GEMINI_MODELS.flash,
        assistantLite: GEMINI_MODELS.lite,
        live: GEMINI_MODELS.live,
      },
      tokenUsage: getTokenUsageStats(),
    });
  });

  router.post('/detect-language', async (req: Request, res: Response) => {
    const { text } = (req.body || {}) as { text?: string };
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required for language detection.' });
      return;
    }
    const ai = getAiClient();
    const language = await detectLanguageServer(ai, text);
    res.json({ language });
  });

  router.post('/tts', async (req: Request, res: Response) => {
    const ai = getAiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Neural speech service is not configured on the server.',
        code: 'TTS_UNAVAILABLE',
      });
      return;
    }

    const { text, language } = (req.body || {}) as { text?: string; language?: string };
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }

    let resolvedLanguage = normalizeThreeLang(language);
    const ethiopicCount = (
      text.match(/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/g) || []
    ).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;
    if (ethiopicCount > 0 && !(resolvedLanguage === 'om' && latinCount > ethiopicCount)) {
      resolvedLanguage = 'am';
    } else if (ethiopicCount === 0 && OROMO_LEXICAL_REGEX.test(text) && resolvedLanguage === 'en') {
      resolvedLanguage = 'om';
    }

    const { voiceName, style } = getTtsVoiceConfig(resolvedLanguage);
    const cacheKey = `${resolvedLanguage}::${text.trim()}`;
    const cachedWav = ttsAudioCache.get(cacheKey);
    if (cachedWav) {
      res.json({
        audioBase64: cachedWav.toString('base64'),
        mimeType: 'audio/wav',
        language: resolvedLanguage,
        provider: 'gemini-tts-cache',
      });
      return;
    }

    const chunks = splitIntoSpeechChunks(text, 380);

    const synthesizeChunk = async (chunk: string): Promise<Buffer> => {
      const attemptWith = async (
        model: typeof GEMINI_MODELS.ttsLite | typeof GEMINI_MODELS.ttsFallback,
        version: 'v1beta' | 'v1alpha',
        includeSpeechMetadata: boolean
      ): Promise<Buffer> => {
        const client = getAiClient(version) || ai;
        const ttsResponse = await client.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                includeSpeechMetadata
                  ? {
                      text: chunk,
                      speechMetadata: { style },
                    }
                  : {
                      text: `Direction: ${style}\n\nSpeak this exact text:\n${chunk}`,
                    },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });
        recordTokenUsage(model, ttsResponse.usageMetadata);

        const base64Audio =
          ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error('Empty audio returned by TTS model.');
        }
        return Buffer.from(base64Audio, 'base64');
      };

      const runForModel = async (
        model: typeof GEMINI_MODELS.ttsLite | typeof GEMINI_MODELS.ttsFallback
      ): Promise<Buffer> => {
        try {
          return await attemptWith(model, 'v1beta', true);
        } catch (firstErr) {
          const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
          if (msg.includes('speechMetadata') || msg.includes('INVALID_ARGUMENT') || msg.includes('NOT_FOUND')) {
            try {
              return await attemptWith(model, 'v1alpha', true);
            } catch {
              return await attemptWith(model, 'v1beta', false);
            }
          }
          throw firstErr;
        }
      };

      try {
        return await runForModel(GEMINI_MODELS.ttsLite);
      } catch (liteErr) {
        const msg = liteErr instanceof Error ? liteErr.message : String(liteErr);
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('503') ||
          msg.includes('UNAVAILABLE')
        ) {
          return await runForModel(GEMINI_MODELS.ttsFallback);
        }
        throw liteErr;
      }
    };

    try {
      const wavBuffers: Buffer[] = [];
      for (const chunk of chunks) {
        wavBuffers.push(await synthesizeChunk(chunk));
      }

      const finalWav = concatWavBuffers(wavBuffers);
      if (ttsAudioCache.size >= 60) {
        const firstKey = ttsAudioCache.keys().next().value;
        if (firstKey) ttsAudioCache.delete(firstKey);
      }
      ttsAudioCache.set(cacheKey, finalWav);

      res.json({
        audioBase64: finalWav.toString('base64'),
        mimeType: 'audio/wav',
        language: resolvedLanguage,
        provider: 'gemini-tts',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS generation failed.';
      const isQuota = isQuotaExceededError(err);
      if (isQuota) recordQuotaError();
      res.status(isQuota ? 429 : 502).json({
        error: isQuota
          ? 'Neural speech daily limit was reached on the server. Please try again shortly.'
          : message,
        code: isQuota ? 'TTS_QUOTA' : 'TTS_GENERATION_FAILED',
      });
    }
  });

  router.post('/stt', async (req: Request, res: Response) => {
    const ai = getAiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Server speech recognition is not configured.',
        code: 'STT_UNAVAILABLE',
      });
      return;
    }

    const { audioBase64, mimeType, targetLanguage } = (req.body || {}) as {
      audioBase64?: string;
      mimeType?: string;
      targetLanguage?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Audio data is required.' });
      return;
    }

    const safeMime = (mimeType || 'audio/webm').split(';')[0].trim();
    const isAuto = !targetLanguage || targetLanguage === 'auto';
    const languageHint = isAuto
      ? 'The speaker is speaking English, Amharic (write in Ethiopic Fidel script), or Afaan Oromo (write in Qubee Latin script).'
      : targetLanguage === 'am'
      ? 'The speaker is speaking Amharic. Write the transcription verbatim in Ethiopic Fidel script.'
      : targetLanguage === 'om'
      ? 'The speaker is speaking Afaan Oromo. Write the transcription verbatim in Qubee Latin script.'
      : 'The speaker is speaking English.';

    const extractText = (resp: {
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    }): string => {
      if (resp.text && resp.text.trim()) return resp.text.trim();
      const parts = resp.candidates?.[0]?.content?.parts || [];
      return parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text || '')
        .join(' ')
        .trim();
    };

    try {
      const audioPart = {
        inlineData: {
          mimeType: safeMime,
          data: audioBase64,
        },
      };

      const transcribePrompt = `Transcribe this audio verbatim in its original language. ${languageHint} Return only the spoken words.`;

      let transcript = '';
      let primaryErr: unknown = null;
      let fallbackErr: unknown = null;
      let liteErr: unknown = null;

      try {
        const primaryResponse = await ai.models.generateContent({
          model: GEMINI_MODELS.stt,
          contents: {
            parts: [audioPart, { text: transcribePrompt }],
          },
          config: {
            abortSignal: AbortSignal.timeout(9000),
          },
        });
        recordTokenUsage(GEMINI_MODELS.stt, primaryResponse.usageMetadata);
        transcript = extractText(primaryResponse);
      } catch (err) {
        primaryErr = err;
        console.warn(
          '[speechRouter] gemini-3.5-transcribe error:',
          err instanceof Error ? err.message : String(err)
        );
      }

      if (!transcript && !isQuotaExceededError(primaryErr)) {
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: GEMINI_MODELS.flash,
            contents: {
              parts: [audioPart, { text: transcribePrompt }],
            },
            config: {
              abortSignal: AbortSignal.timeout(10000),
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          recordTokenUsage(GEMINI_MODELS.flash, fallbackResponse.usageMetadata);
          transcript = extractText(fallbackResponse);
        } catch (err) {
          fallbackErr = err;
        }
      }

      if (!transcript && (primaryErr || fallbackErr) && !isQuotaExceededError(primaryErr || fallbackErr)) {
        try {
          const liteResponse = await ai.models.generateContent({
            model: GEMINI_MODELS.lite,
            contents: {
              parts: [audioPart, { text: transcribePrompt }],
            },
            config: {
              abortSignal: AbortSignal.timeout(9000),
            },
          });
          recordTokenUsage(GEMINI_MODELS.lite, liteResponse.usageMetadata);
          transcript = extractText(liteResponse);
        } catch (err) {
          liteErr = err;
        }
      }

      if (!transcript && (liteErr || fallbackErr || primaryErr)) {
        throw liteErr || fallbackErr || primaryErr;
      }

      const detectedLanguage = transcript
        ? await detectLanguageServer(ai, transcript)
        : isAuto
        ? 'en'
        : normalizeThreeLang(targetLanguage);

      res.json({
        transcript,
        detectedLanguage,
        provider: 'gemini-stt',
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const isQuota = isQuotaExceededError(err);
      if (isQuota) recordQuotaError();
      const isBusy =
        rawMsg.includes('503') ||
        rawMsg.includes('UNAVAILABLE') ||
        rawMsg.includes('Timeout') ||
        rawMsg.includes('aborted');
      const friendly = isQuota
        ? 'Speech transcription quota reached on the server. Please try again shortly, use browser speech recognition, or type your answer.'
        : isBusy
        ? 'Speech service is temporarily busy. Please try again or type your answer.'
        : 'Could not transcribe audio right now. Please try again or type your answer.';
      res.status(isQuota ? 429 : 502).json({
        error: friendly,
        code: isQuota ? 'STT_QUOTA' : isBusy ? 'STT_BUSY' : 'STT_FAILED',
      });
    }
  });

  router.post('/assistant', async (req: Request, res: Response) => {
    const ai = getAiClient();
    const {
      message,
      language,
      autoDetect = true,
      context,
      history = [],
      continuation,
    } = (req.body || {}) as {
      message?: string;
      language?: string;
      autoDetect?: boolean;
      context?: AssistantContextInfo;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      continuation?: {
        contents?: Content[];
        toolResponses?: Array<{ id?: string; name: string; response: Record<string, unknown> }>;
      };
    };

    const isContinuation = Boolean(
      continuation &&
        Array.isArray(continuation.contents) &&
        Array.isArray(continuation.toolResponses) &&
        continuation.toolResponses.length > 0
    );

    if (!isContinuation && (!message || typeof message !== 'string' || !message.trim())) {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    const detectedLang: ThreeLang = autoDetect && message
      ? await detectLanguageServer(ai, message)
      : normalizeThreeLang(language);

    if (message && detectSensitiveInput(message).isSensitive) {
      res.json({
        status: 'complete',
        replyText: getSensitiveRefusalMessage(detectedLang),
        language: detectedLang,
        provider: 'privacy-guard',
        privacyBlocked: true,
      });
      return;
    }

    const languageDisplay =
      detectedLang === 'am'
        ? 'Amharic (አማርኛ in Ethiopic Fidel script)'
        : detectedLang === 'om'
        ? 'Afaan Oromo (Oromiffa in Qubee Latin script)'
        : 'English';

    if (!ai) {
      const offlineReply =
        detectedLang === 'am'
          ? 'የድምፅ ረዳት AI አገልግሎት አሁን ከሰርቨሩ ጋር አልተገናኘም። 1) በላይኛው አሞሌ ላይ መነሻ፣ ምዝገባ ወይም ተደራሽ ስራዎችን ይክፈቱ። 2) የቀበሌ መታወቂያ ወይም የህክምና ማስረጃ ሳያስፈልግ መመዝገብ ይችላሉ።'
          : detectedLang === 'om'
          ? 'Tajaajilli AI gargaaraa sagalee amma sarvara irratti hin qindaa\'in jira. 1) Barruu gubbaa irraa Fuula Duraa, Galmee ykn Hojiiwwan Mijatoo banaa. 2) Waraqaa eenyummaa gandaa ykn ragaan yaalaa malee galmaa\'uu dandeessu.'
          : 'The AI voice assistant service is not connected right now. 1. Use the top bar to open Home, Register, My Profile, Accessible Jobs, or Employers. 2. You can register without a kebele ID or medical proof.';

      res.json({
        status: 'offline',
        replyText: offlineReply,
        language: detectedLang,
        provider: 'offline-fallback',
      });
      return;
    }

    const route = selectAssistantRoute(message, isContinuation, context?.activeModule);

    // Check short-TTL duplicate request cache for non-tool informational turns
    const dedupKey =
      !isContinuation && !route.includeTools && message
        ? buildDedupKey(message, detectedLang, context?.activeModule)
        : null;
    if (dedupKey) {
      const cached = getCachedAssistantReply(dedupKey);
      if (cached) {
        res.json({ ...cached, deduplicated: true });
        return;
      }
    }

    try {
      let sentContents: Content[];
      let earlierSummary: string | null = null;

      if (isContinuation && continuation?.contents && continuation.toolResponses) {
        const responseParts = continuation.toolResponses.map((tr) => ({
          functionResponse: {
            ...(tr.id ? { id: tr.id } : {}),
            name: tr.name,
            response: { result: tr.response },
          },
        }));
        sentContents = [
          ...continuation.contents,
          {
            role: 'user',
            parts: responseParts,
          },
        ];
      } else {
        const compressed = compressConversationHistory(
          history,
          (txt) => detectSensitiveInput(txt).isSensitive
        );
        earlierSummary = compressed.earlierSummary;
        sentContents = [
          ...compressed.recentTurns.map((h) => ({
            role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
            parts: [{ text: h.text }],
          })),
          {
            role: 'user' as const,
            parts: [{ text: message!.trim() }],
          },
        ];
      }

      const response = await ai.models.generateContent({
        model: route.model,
        contents: sentContents,
        config: {
          thinkingConfig: { thinkingLevel: route.thinkingLevel },
          systemInstruction: buildSiteWideAssistantInstruction(languageDisplay, context, {
            isContinuation,
            earlierSummary,
          }),
          ...(route.includeTools
            ? { tools: [{ functionDeclarations: WEBSITE_TOOL_DECLARATIONS }] }
            : {}),
        },
      });
      recordTokenUsage(route.model, response.usageMetadata);

      const functionCalls = response.functionCalls;
      const modelContent = response.candidates?.[0]?.content;
      if (functionCalls && functionCalls.length > 0 && modelContent) {
        res.json({
          status: 'tool_calls',
          toolCalls: functionCalls.map((fc) => ({
            id: fc.id,
            name: fc.name,
            args: fc.args || {},
          })),
          contentsSoFar: [...sentContents, modelContent],
          language: detectedLang,
          modelUsed: route.model,
          provider: 'gemini-assistant',
        });
        return;
      }

      const replyText = (response.text || '').trim();
      const payload = {
        status: 'complete',
        replyText,
        language: detectedLang,
        modelUsed: route.model,
        provider: 'gemini-assistant',
      };
      if (dedupKey && replyText) {
        setCachedAssistantReply(dedupKey, payload);
      }
      res.json(payload);
    } catch (err) {
      if (isQuotaExceededError(err)) {
        recordQuotaError();
        res.status(429).json({
          error: getLocalizedQuotaMessage(detectedLang),
          code: 'ASSISTANT_QUOTA',
          language: detectedLang,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Assistant request failed.';
      res.status(502).json({
        error: msg,
        code: 'ASSISTANT_FAILED',
      });
    }
  });

  return router;
}
