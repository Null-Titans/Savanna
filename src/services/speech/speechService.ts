import { SpeechLanguageOption, SupportedLanguage } from '../../types/gateway';
import { LANGUAGE_REGISTRY } from '../../i18n/types';

export interface ServerSpeechCapabilities {
  geminiConfigured: boolean;
  supportedLanguages: SupportedLanguage[];
  checked: boolean;
}

export interface SpeechCapabilities {
  recognitionSupported: boolean;
  serverSttAvailable: boolean;
  serverTtsAvailable: boolean;
  synthesisSupported: boolean;
  hasNativeBrowserVoice: boolean;
  hasAnyAuthenticVoice: boolean;
  matchedVoiceName: string | null;
  speechLangTag: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstanceLike;

const ETHIOPIC_REGEX = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/;
const OROMO_LEXICAL_REGEX =
  /\b(akkam|nagaa|maaloo|galatoomi|galatoomaa|eeyyee|lakkii|maqaa|gargaarsa|deeggarsa|hojiin|hojii|hojjetaa|barataa|barnoota|galmee|keessan|keessa|irraa|argachuu|barbaada|barbaadu|afaan|oromoo|oromiffa|oromiffaa|ani|ati|nuti|isaan|maal|maaliif|eessa|yoom|akkamitti|fayyaa|mijataa|gaaffii|deebii|barbaachisa|bilbila|waraqaa|eenyummaa|dhaabbata|michuu|iccitii|itti|fufi|duubatti|sirreessi|maxxansi|hayyama|dubbisi|dubbachuu|sagalee|qajeelfama|ergaa|fudhadhu|dhaabi)\b/i;

let cachedServerCaps: ServerSpeechCapabilities = {
  geminiConfigured: false,
  supportedLanguages: ['en', 'am', 'om'],
  checked: false,
};

let activeAudioElement: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeAbortController: AbortController | null = null;
let activeSpeechSessionId = 0;
let speechPlaybackActive = false;
const speechPlaybackListeners = new Set<(active: boolean, sessionId: number) => void>();

function notifySpeechPlayback(active: boolean, forceNotifyOnStop = false): void {
  if (speechPlaybackActive === active && !(forceNotifyOnStop && !active)) return;
  speechPlaybackActive = active;
  speechPlaybackListeners.forEach((listener) => {
    try {
      listener(active, activeSpeechSessionId);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function getActiveSpeechSessionId(): number {
  return activeSpeechSessionId;
}

export function isSpeechPlaybackActive(): boolean {
  return speechPlaybackActive;
}

export function subscribeSpeechPlayback(
  listener: (active: boolean, sessionId: number) => void
): () => void {
  speechPlaybackListeners.add(listener);
  return () => {
    speechPlaybackListeners.delete(listener);
  };
}

export function resetCachedSpeechCapabilitiesForTest(): void {
  cachedServerCaps = {
    geminiConfigured: false,
    supportedLanguages: ['en', 'am', 'om'],
    checked: false,
  };
}

export async function fetchServerSpeechCapabilities(): Promise<ServerSpeechCapabilities> {
  if (cachedServerCaps.checked) {
    return cachedServerCaps;
  }
  if (typeof fetch === 'undefined' || typeof window === 'undefined') {
    return cachedServerCaps;
  }
  try {
    const res = await fetch('/api/speech/capabilities');
    if (res.ok) {
      const data = (await res.json()) as {
        geminiConfigured?: boolean;
        supportedLanguages?: SupportedLanguage[];
      };
      cachedServerCaps = {
        geminiConfigured: Boolean(data.geminiConfigured),
        supportedLanguages: data.supportedLanguages || ['en', 'am', 'om'],
        checked: true,
      };
      return cachedServerCaps;
    }
  } catch {
    // Offline or unit test environment without Express server
  }
  return cachedServerCaps;
}

export function getSpeechLangTag(language: SupportedLanguage): string {
  const found = LANGUAGE_REGISTRY.find((l) => l.code === language);
  return found ? found.speechLangTag : 'en-US';
}

export function detectLanguageFromText(text: string, fallback: SupportedLanguage = 'en'): SupportedLanguage {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  const ethiopicMatches = trimmed.match(/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/g) || [];
  const latinMatches = trimmed.match(/[A-Za-z]/g) || [];
  if (ethiopicMatches.length > 0) {
    // If caller explicitly selected Afaan Oromo or Amharic and text is predominantly Latin
    // (e.g., an Afaan Oromo UI label mentioning "(አማርኛ)"), do not hijack Oromo into Amharic.
    if (fallback === 'om' && latinMatches.length > ethiopicMatches.length) {
      return 'om';
    }
    return 'am';
  }
  if (OROMO_LEXICAL_REGEX.test(trimmed)) return 'om';
  return fallback;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionConstructor());
}

export type MicrophonePermissionState = 'prompt' | 'granted' | 'denied' | 'unknown';

export async function queryMicrophonePermission(): Promise<{
  state: MicrophonePermissionState;
  statusObj: PermissionStatus | null;
}> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return { state: 'unknown', statusObj: null };
  }
  try {
    const statusObj = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    const state: MicrophonePermissionState =
      statusObj.state === 'granted' || statusObj.state === 'denied' || statusObj.state === 'prompt'
        ? statusObj.state
        : 'unknown';
    return { state, statusObj };
  } catch {
    return { state: 'unknown', statusObj: null };
  }
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Strictly matches an authentic native browser voice for the exact requested language.
 * NEVER substitutes an English voice for Amharic or Afaan Oromo, and NEVER substitutes
 * Amharic for Afaan Oromo or Afaan Oromo for Amharic.
 */
export function findNativeBrowserVoice(language: SupportedLanguage): SpeechSynthesisVoice | null {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.speechSynthesis.getVoices !== 'function'
  ) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!Array.isArray(voices) || voices.length === 0) {
    return null;
  }

  const langTag = getSpeechLangTag(language).toLowerCase();
  const shortCode = language.toLowerCase();
  const iso3Code = shortCode === 'am' ? 'amh' : shortCode === 'om' ? 'orm' : 'eng';

  const normalizeVoiceLang = (v: SpeechSynthesisVoice) =>
    (v.lang || '').trim().toLowerCase().replace(/_/g, '-');

  return (
    voices.find((v) => normalizeVoiceLang(v) === langTag) ||
    voices.find((v) => {
      const vl = normalizeVoiceLang(v);
      return vl === shortCode || vl.startsWith(`${shortCode}-`);
    }) ||
    voices.find((v) => {
      const vl = normalizeVoiceLang(v);
      return vl === iso3Code || vl.startsWith(`${iso3Code}-`);
    }) ||
    null
  );
}

/**
 * Resolves the normalized BCP-47 speech synthesis language tag for a matched voice
 * and selected website language (`en-US`, `am-ET`, `om-ET`).
 */
export function resolveUtteranceLangTag(
  voice: SpeechSynthesisVoice | null,
  language: SupportedLanguage
): string {
  const fallback = getSpeechLangTag(language);
  const raw = (voice?.lang || '').trim().replace(/_/g, '-');
  if (!raw) return fallback;
  if (language === 'am' && /^am(h)?$/i.test(raw)) return 'am-ET';
  if (language === 'om' && /^o(m|rm)$/i.test(raw)) return 'om-ET';
  return raw;
}

async function waitForVoicesIfEmpty(timeoutMs = 150): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.speechSynthesis.getVoices !== 'function'
  ) {
    return;
  }
  if (window.speechSynthesis.getVoices().length > 0) {
    return;
  }
  if (typeof window.speechSynthesis.addEventListener !== 'function') {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', done);
      } catch {
        // Ignore cleanup errors
      }
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    try {
      window.speechSynthesis.addEventListener('voiceschanged', done);
    } catch {
      done();
    }
  });
}

export function detectSpeechCapabilities(language: SupportedLanguage): SpeechCapabilities {
  const speechLangTag = getSpeechLangTag(language);
  const browserSttSupported = Boolean(getSpeechRecognitionConstructor());
  const serverSttAvailable = cachedServerCaps.geminiConfigured && isMediaRecorderSupported();
  const serverTtsAvailable = cachedServerCaps.geminiConfigured;

  const synthesisSupported =
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const matchedVoice = synthesisSupported ? findNativeBrowserVoice(language) : null;
  const hasNativeBrowserVoice = Boolean(matchedVoice);

  // Browser Web Speech API generally cannot recognize Afaan Oromo (om-ET); require server STT for om
  const recognitionSupported =
    serverSttAvailable || (browserSttSupported && language !== 'om');

  const hasAnyAuthenticVoice = serverTtsAvailable || hasNativeBrowserVoice;

  return {
    recognitionSupported,
    serverSttAvailable,
    serverTtsAvailable,
    synthesisSupported,
    hasNativeBrowserVoice,
    hasAnyAuthenticVoice,
    matchedVoiceName: matchedVoice ? matchedVoice.name : null,
    speechLangTag,
  };
}

export function stopAllSpeechPlayback(): void {
  activeSpeechSessionId += 1;
  notifySpeechPlayback(false, true);
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // Ignore audio cleanup errors
    }
    activeAudioElement = null;
  }
  if (activeAudioUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function splitBrowserSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?።])\s+/)
    .filter((s) => s.trim().length > 0);
}

function speakWithStrictNativeBrowserVoice(
  text: string,
  language: SupportedLanguage,
  voice: SpeechSynthesisVoice | null,
  sessionId: number,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (reason: string) => void
): () => void {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance === 'undefined'
  ) {
    onError?.('Speech synthesis is not supported in this browser.');
    return () => {};
  }

  window.speechSynthesis.cancel();
  const sentences = splitBrowserSentences(text);
  if (sentences.length === 0) {
    onEnd?.();
    return () => {};
  }

  let cancelled = false;
  let currentIndex = 0;

  const isStale = () => cancelled || sessionId !== activeSpeechSessionId;

  const speakNext = () => {
    if (isStale()) {
      return;
    }
    if (currentIndex >= sentences.length) {
      notifySpeechPlayback(false);
      onEnd?.();
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(sentences[currentIndex]);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.lang = resolveUtteranceLangTag(voice, language);
    utterance.rate = 0.95;

    if (currentIndex === 0) {
      utterance.onstart = () => {
        if (isStale()) return;
        notifySpeechPlayback(true);
        onStart?.();
      };
    }
    utterance.onend = () => {
      if (isStale()) return;
      currentIndex += 1;
      speakNext();
    };
    utterance.onerror = (ev) => {
      if (isStale() || ev.error === 'interrupted' || ev.error === 'canceled') {
        notifySpeechPlayback(false);
        return;
      }
      notifySpeechPlayback(false);
      onError?.(ev.error || 'Read-aloud stopped.');
    };

    notifySpeechPlayback(true);
    window.speechSynthesis.speak(utterance);
  };

  speakNext();

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (sessionId === activeSpeechSessionId) {
      activeSpeechSessionId += 1;
      notifySpeechPlayback(false);
      window.speechSynthesis.cancel();
    }
    onEnd?.();
  };
}

function base64ToWavBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function speakText(
  text: string,
  language: SupportedLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (reason: string) => void,
  onLoading?: (loading: boolean) => void
): Promise<() => void> {
  stopAllSpeechPlayback();
  const sessionId = activeSpeechSessionId;

  const resolvedLanguage = detectLanguageFromText(text, language);
  const serverCaps = await fetchServerSpeechCapabilities();
  if (sessionId !== activeSpeechSessionId) {
    return () => {};
  }

  let serverErrorReason: string | null = null;

  if (serverCaps.geminiConfigured && typeof fetch !== 'undefined') {
    const controller = new AbortController();
    activeAbortController = controller;
    onLoading?.(true);

    try {
      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: resolvedLanguage }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || sessionId !== activeSpeechSessionId) {
        onLoading?.(false);
        return () => stopAllSpeechPlayback();
      }

      if (response.ok) {
        const data = (await response.json()) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (sessionId !== activeSpeechSessionId) {
          onLoading?.(false);
          return () => {};
        }
        if (data.audioBase64) {
          const blob = base64ToWavBlob(data.audioBase64, data.mimeType || 'audio/wav');
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          activeAudioElement = audio;
          activeAudioUrl = url;

          audio.onplay = () => {
            if (sessionId !== activeSpeechSessionId) return;
            notifySpeechPlayback(true);
            onLoading?.(false);
            onStart?.();
          };
          audio.onended = () => {
            if (sessionId !== activeSpeechSessionId) return;
            stopAllSpeechPlayback();
            onEnd?.();
          };
          audio.onerror = () => {
            if (sessionId !== activeSpeechSessionId) return;
            stopAllSpeechPlayback();
            onLoading?.(false);
            onError?.('Audio playback failed in this browser.');
          };

          try {
            notifySpeechPlayback(true);
            await audio.play();
            return () => stopAllSpeechPlayback();
          } catch (playErr) {
            if (sessionId !== activeSpeechSessionId) {
              return () => {};
            }
            stopAllSpeechPlayback();
            onLoading?.(false);
            const errName = (playErr as Error)?.name || '';
            onError?.(
              errName === 'NotAllowedError'
                ? 'Browser blocked automatic audio playback. Select Read aloud / Speak again to play.'
                : 'Audio playback failed in this browser.'
            );
            return () => stopAllSpeechPlayback();
          }
        }
      } else {
        const errBody = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (errBody.code === 'TTS_QUOTA' && errBody.error) {
          serverErrorReason = errBody.error;
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || sessionId !== activeSpeechSessionId) {
        onLoading?.(false);
        return () => stopAllSpeechPlayback();
      }
      // Fall through to strict native browser check below
    } finally {
      onLoading?.(false);
      if (activeAbortController?.signal.aborted || sessionId === activeSpeechSessionId) {
        activeAbortController = null;
      }
    }
  }

  if (sessionId !== activeSpeechSessionId) {
    return () => {};
  }

  await waitForVoicesIfEmpty();
  if (sessionId !== activeSpeechSessionId) {
    return () => {};
  }

  // Fallback ONLY if an exact matching native browser voice exists for this language
  // (or English when the browser has not populated getVoices() yet).
  // NEVER pronounce Amharic or Afaan Oromo with an English voice, and never cross-substitute AM/OM!
  const nativeVoice = findNativeBrowserVoice(resolvedLanguage);
  const browserVoices =
    typeof window !== 'undefined' &&
    window.speechSynthesis &&
    typeof window.speechSynthesis.getVoices === 'function'
      ? window.speechSynthesis.getVoices()
      : [];
  const allowEnglishDefaultVoice =
    resolvedLanguage === 'en' &&
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance !== 'undefined' &&
    Array.isArray(browserVoices) &&
    browserVoices.length === 0;

  if (!nativeVoice && !allowEnglishDefaultVoice) {
    const langLabel =
      LANGUAGE_REGISTRY.find((l) => l.code === resolvedLanguage)?.nativeName || resolvedLanguage;
    onError?.(
      serverErrorReason ||
        `No authentic ${langLabel} voice is available on this device without the neural speech service. Text remains readable on screen rather than using an incorrect English voice.`
    );
    return () => {};
  }

  return speakWithStrictNativeBrowserVoice(
    text,
    resolvedLanguage,
    nativeVoice,
    sessionId,
    onStart,
    onEnd,
    onError
  );
}

/**
 * Speaks text cleanly and resolves only once playback finishes (or settles/times out safely),
 * preventing continuous voice listening from triggering on the assistant's own voice.
 */
export async function speakTextAndWait(
  text: string,
  language: SupportedLanguage,
  callbacks?: {
    onStart?: () => void;
    onLoading?: (loading: boolean) => void;
    onError?: (reason: string) => void;
    maxWaitMs?: number;
  }
): Promise<void> {
  const maxWaitMs = callbacks?.maxWaitMs ?? Math.min(25000, Math.max(2500, text.length * 95));
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      notifySpeechPlayback(false);
      resolve();
    };
    const timer = setTimeout(finish, maxWaitMs);

    void speakText(
      text,
      language,
      () => callbacks?.onStart?.(),
      finish,
      (reason) => {
        callbacks?.onError?.(reason);
        finish();
      },
      callbacks?.onLoading
    ).catch(finish);
  });
}

export async function transcribeAudioOnServer(
  audioBlob: Blob,
  targetLanguage: SpeechLanguageOption = 'auto'
): Promise<{ transcript: string; detectedLanguage: SupportedLanguage }> {
  const arrayBuf = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const audioBase64 = btoa(binary);

  const response = await fetch('/api/speech/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
      targetLanguage,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
    const error = new Error(err.error || 'Could not transcribe speech.') as Error & { code?: string };
    error.code = err.code;
    throw error;
  }

  const data = (await response.json()) as {
    transcript: string;
    detectedLanguage: SupportedLanguage;
  };
  return {
    transcript: data.transcript || '',
    detectedLanguage: data.detectedLanguage || 'en',
  };
}
