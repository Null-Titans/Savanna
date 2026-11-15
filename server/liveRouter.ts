import type { Server as HttpServer } from 'http';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ThreeLang } from './speechRouter.ts';
import { detectSensitiveInput, getSensitiveRefusalMessage } from '../src/utils/privacyGuard.ts';
import { buildSiteWideAssistantInstruction } from './assistantPrompt.ts';
import { WEBSITE_TOOL_DECLARATIONS } from './websiteTools.ts';

function getLiveAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeLang(raw?: string | null): ThreeLang {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'am' || v.startsWith('am-')) return 'am';
  if (v === 'om' || v.startsWith('om-')) return 'om';
  return 'en';
}

function buildLiveSystemInstruction(lang: ThreeLang, context: string): string {
  const langLabel =
    lang === 'am'
      ? 'Amharic (አማርኛ in Ethiopic Fidel script)'
      : lang === 'om'
      ? 'Afaan Oromo (Oromiffa in Qubee Latin script)'
      : 'English';

  return buildSiteWideAssistantInstruction(langLabel, { activeModule: context });
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachLiveVoiceServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/speech/live' });

  wss.on('connection', async (clientWs, req) => {
    const reqUrl = new URL(req.url || '/api/speech/live', 'http://localhost');
    const lang = normalizeLang(reqUrl.searchParams.get('lang'));
    const context = (reqUrl.searchParams.get('context') || 'career').slice(0, 40);

    const ai = getLiveAiClient();
    if (!ai) {
      sendJson(clientWs, {
        type: 'error',
        code: 'LIVE_UNAVAILABLE',
        message:
          'Real-time Live AI voice is not configured on the server yet. Browser voice filtering and text search remain available.',
      });
      clientWs.close();
      return;
    }

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      try {
        session?.close();
      } catch {
        // Ignore session close errors
      }
      session = null;
    };

    try {
      const voiceName = lang === 'en' ? 'Zephyr' : 'Kore';
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          tools: [{ functionDeclarations: WEBSITE_TOOL_DECLARATIONS }],
          systemInstruction: buildLiveSystemInstruction(lang, context),
        },
        callbacks: {
          onopen: () => {
            // Setup handshake completes when ai.live.connect resolves below
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.toolCall?.functionCalls?.length) {
              sendJson(clientWs, {
                type: 'toolCalls',
                calls: message.toolCall.functionCalls.map((fc) => ({
                  id: fc.id,
                  name: fc.name,
                  args: fc.args || {},
                })),
              });
            }

            const content = message.serverContent;
            if (!content) return;

            if (content.inputTranscription?.text) {
              sendJson(clientWs, {
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }
            if (content.outputTranscription?.text) {
              sendJson(clientWs, {
                type: 'outputTranscript',
                text: content.outputTranscription.text,
              });
            }
            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendJson(clientWs, {
                  type: 'audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                });
              }
            }
            if (content.interrupted) {
              sendJson(clientWs, { type: 'interrupted' });
            }
            if (content.turnComplete) {
              sendJson(clientWs, { type: 'turnComplete' });
            }
          },
          onerror: (ev) => {
            const msg =
              ev instanceof Error
                ? ev.message
                : typeof ev === 'object' && ev && 'message' in ev
                ? String((ev as { message?: unknown }).message)
                : 'Live voice session encountered a connection error.';
            sendJson(clientWs, {
              type: 'error',
              code: 'LIVE_SESSION_ERROR',
              message: msg,
            });
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === clientWs.OPEN) {
              sendJson(clientWs, { type: 'closed' });
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not start real-time Gemini Live voice session.';
      sendJson(clientWs, {
        type: 'error',
        code: 'LIVE_CONNECT_FAILED',
        message: msg,
      });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session || isClosed) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
          state?: Record<string, unknown>;
          functionResponses?: Array<{
            id?: string;
            name: string;
            response: Record<string, unknown>;
          }>;
        };
        if (parsed.type === 'audio' && typeof parsed.audio === 'string' && parsed.audio) {
          session.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (parsed.type === 'text' && typeof parsed.text === 'string' && parsed.text.trim()) {
          const text = parsed.text.trim();
          if (detectSensitiveInput(text).isSensitive) {
            sendJson(clientWs, {
              type: 'outputTranscript',
              text: getSensitiveRefusalMessage(lang),
            });
            return;
          }
          session.sendRealtimeInput({
            text,
          });
        } else if (
          parsed.type === 'toolResponses' &&
          Array.isArray(parsed.functionResponses) &&
          parsed.functionResponses.length > 0
        ) {
          session.sendToolResponse({
            functionResponses: parsed.functionResponses.map((fr) => ({
              ...(fr.id ? { id: fr.id } : {}),
              name: fr.name,
              response: { output: fr.response },
            })),
          });
        } else if (parsed.type === 'greet') {
          const greetingHint =
            lang === 'am'
              ? '[System]: Greet the user warmly right now in Amharic: "ሰላም! እያዳመጥኩ ነው። እንዴት ልርዳዎት እችላለሁ?" and wait for them to speak.'
              : lang === 'om'
              ? '[System]: Greet the user warmly right now in Afaan Oromo: "Akkam! Dhaggeeffachaa jira. Akkamitti isin gargaaruu danda\'a?" and wait for them to speak.'
              : '[System]: Greet the user warmly right now with: "Hello! I\'m listening. How can I help you?" and wait for them to speak.';
          session.sendRealtimeInput({
            text: greetingHint,
          });
        } else if (parsed.type === 'context' && parsed.state) {
          session.sendRealtimeInput({
            text: `[Website State Update] Current live non-sensitive UI state: ${JSON.stringify(
              parsed.state
            ).slice(0, 1200)}`,
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    sendJson(clientWs, {
      type: 'ready',
      model: 'gemini-3.8-live',
      language: lang,
    });
  });

  return wss;
}
