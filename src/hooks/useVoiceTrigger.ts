import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSpeechRecognitionConstructor,
  isSpeechPlaybackActive,
  queryMicrophonePermission,
  SpeechRecognitionInstanceLike,
} from '../services/speech/speechService';

export type VoiceTriggerStatus = 'listening' | 'muted' | 'unsupported';

export type VoiceTriggerErrorCode =
  | 'permission-denied'
  | 'audio-capture'
  | 'network'
  | 'language-not-supported'
  | 'browser-unsupported'
  | 'https-required'
  | 'start-failed';

export interface UseVoiceTriggerOptions {
  /** Primary wake phrase to detect (case-insensitive, punctuation-insensitive). */
  wakePhrase?: string;
  /** Optional extra wake phrase variations or aliases. */
  wakeAliases?: string[];
  /** BCP-47 speech recognition language tag (default: 'en-US'). */
  lang?: string;
  /** Temporarily pause continuous listening (e.g. while assistant modal holds the mic). */
  paused?: boolean;
  /** Start enabled immediately on mount when supported (default: false for explicit user consent). */
  initialEnabled?: boolean;
  /** Minimum delay in ms between consecutive wake triggers (default: 2500). */
  cooldownMs?: number;
  /** Delay in ms before auto-restarting after a normal disconnect or silence timeout (default: 350). */
  autoRestartDelayMs?: number;
  /** Maximum consecutive transient errors before pausing with an error alert (default: 5). */
  maxConsecutiveErrors?: number;
  /** Minimum recognition confidence (0..1) when provided by browser to filter background noise (default: 0.35). */
  minConfidence?: number;
  /** Optional predicate to suppress recognition while assistant TTS playback is active. */
  shouldIgnoreResult?: () => boolean;
  /** Callback invoked when the wake phrase is heard. */
  onTrigger: (matchedTranscript: string) => void;
}

export interface UseVoiceTriggerResult {
  status: VoiceTriggerStatus;
  /** Explicit flag: true while continuous wake listening is active (kept steady across seamless auto-restarts). */
  isListening: boolean;
  /** Explicit flag: true when underlying SpeechRecognition session currently holds the mic. */
  isRecognitionActive: boolean;
  isEnabled: boolean;
  isPaused: boolean;
  /** Explicit flag: true when SpeechRecognition is available and running in a secure HTTPS/localhost context. */
  isSupported: boolean;
  /** Explicit flag: true when mic permission is granted, false when denied, null while prompt/unknown. */
  hasPermission: boolean | null;
  isSecureContext: boolean;
  error: string | null;
  errorCode: VoiceTriggerErrorCode | null;
  lastTranscript: string;
  triggerCount: number;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  clearError: () => void;
}

interface SpeechRecognitionAlternativeWithResult {
  transcript?: string;
  confidence?: number;
}

interface SpeechRecognitionResultEntry {
  isFinal?: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeWithResult | undefined;
}

interface SpeechRecognitionResultEvent {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultEntry>;
}

const DEFAULT_ERROR_MESSAGES: Record<VoiceTriggerErrorCode, string> = {
  'permission-denied':
    'Microphone permission was blocked. Allow microphone access in browser settings, then turn wake listening back on.',
  'audio-capture':
    'No working microphone was detected or another application is using it.',
  network:
    'Continuous speech recognition lost its connection. Select the wake microphone control to retry.',
  'language-not-supported':
    'Continuous wake-phrase recognition is not supported for the selected speech language.',
  'browser-unsupported':
    'Continuous voice wake recognition is not supported in this browser.',
  'https-required':
    'Hands-free voice wake listening requires a secure HTTPS connection.',
  'start-failed':
    'Could not start the wake microphone cleanly. Please check microphone permissions and try again.',
};

const HEALTHY_SESSION_RESET_MS = 2000;

export function normalizeSpeechPhrase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesWakePhrase(transcript: string, phrases: string[]): boolean {
  const normalizedTranscript = normalizeSpeechPhrase(transcript);
  if (!normalizedTranscript) return false;

  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeSpeechPhrase(phrase);
    if (!normalizedPhrase) return false;
    if (normalizedTranscript === normalizedPhrase) return true;
    const paddedTranscript = ` ${normalizedTranscript} `;
    const paddedPhrase = ` ${normalizedPhrase} `;
    return paddedTranscript.includes(paddedPhrase);
  });
}

function checkIsSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  // Localhost and HTTPS set window.isSecureContext to true; explicit false indicates insecure HTTP.
  return window.isSecureContext !== false;
}

export function useVoiceTrigger({
  wakePhrase = 'Hey Access',
  wakeAliases = [],
  lang = 'en-US',
  paused = false,
  initialEnabled = false,
  cooldownMs = 2500,
  autoRestartDelayMs = 350,
  maxConsecutiveErrors = 5,
  minConfidence = 0.35,
  shouldIgnoreResult,
  onTrigger,
}: UseVoiceTriggerOptions): UseVoiceTriggerResult {
  const recognitionCtor = getSpeechRecognitionConstructor();
  const isSecureContext = checkIsSecureContext();
  const isSupported = Boolean(recognitionCtor) && isSecureContext;

  const [isEnabled, setIsEnabled] = useState<boolean>(
    () => Boolean(initialEnabled && isSupported)
  );
  // FIX 2 (Explicit State Management): Track live recognition hardware state & microphone permission explicitly.
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceTriggerErrorCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [triggerCount, setTriggerCount] = useState(0);

  const normalizedPhrases = useMemo(
    () => [wakePhrase, ...wakeAliases].filter((p) => normalizeSpeechPhrase(p).length > 0),
    [wakePhrase, wakeAliases]
  );

  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const phrasesRef = useRef(normalizedPhrases);
  phrasesRef.current = normalizedPhrases;

  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const pausedRef = useRef(paused);
  const [isPageHidden, setIsPageHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.hidden) : false
  );
  const effectivePaused = paused || isPageHidden;
  pausedRef.current = effectivePaused;

  const shouldIgnoreResultRef = useRef(shouldIgnoreResult);
  shouldIgnoreResultRef.current = shouldIgnoreResult;

  const isMountedRef = useRef(true);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  // FIX 2: Synchronous active/starting guard prevents duplicate recognition.start() calls & InvalidStateError.
  const isStartingOrRunningRef = useRef(false);
  // FIX 1: Monotonic session ID ensures stale onend/onerror callbacks from torn-down instances cannot corrupt state.
  const activeSessionIdRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionallyStoppedRef = useRef(false);
  const fatalStopRef = useRef(false);
  const consecutiveTransientErrorsRef = useRef(0);
  const lastTriggeredAtRef = useRef(0);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // FIX 2: Synchronize hasPermission with the browser Permissions API when supported.
  useEffect(() => {
    let active = true;
    let permStatusObj: PermissionStatus | null = null;

    const applyPermissionState = (state: string) => {
      if (!active || !isMountedRef.current) return;
      if (state === 'granted') {
        setHasPermission(true);
      } else if (state === 'denied') {
        setHasPermission(false);
      } else {
        setHasPermission(null);
      }
    };

    void queryMicrophonePermission().then(({ state, statusObj }) => {
      applyPermissionState(state);
      if (active && statusObj) {
        permStatusObj = statusObj;
        statusObj.onchange = () => {
          applyPermissionState(statusObj.state);
        };
      }
    });

    return () => {
      active = false;
      if (permStatusObj) {
        permStatusObj.onchange = null;
      }
    };
  }, []);

  const teardownRecognition = useCallback(() => {
    clearRestartTimer();
    // Invalidate current session immediately so any delayed native onend/onerror event becomes a no-op.
    activeSessionIdRef.current += 1;
    intentionallyStoppedRef.current = true;
    isStartingOrRunningRef.current = false;

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (isMountedRef.current) {
      setIsRecognitionActive(false);
    }

    if (!rec) return;

    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;

    try {
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        // Ignore cleanup stop failures on already-stopped instances
      }
    }
  }, [clearRestartTimer]);

  const setFailure = useCallback(
    (code: VoiceTriggerErrorCode, stopListeningCompletely: boolean) => {
      const message = DEFAULT_ERROR_MESSAGES[code];
      console.warn(`[useVoiceTrigger] Error (${code}): ${message}`);
      setErrorCode(code);
      setError(message);

      if (code === 'permission-denied') {
        setHasPermission(false);
      }

      if (stopListeningCompletely) {
        fatalStopRef.current = true;
        isEnabledRef.current = false;
        setIsEnabled(false);
        teardownRecognition();
      }
    },
    [teardownRecognition]
  );

  // Use a stable ref so scheduled auto-restarts always invoke the latest startRecognitionSession callback.
  const startSessionRef = useRef<() => void>(() => {});

  const scheduleAutoRestart = useCallback(
    (delayMs: number, reason: string) => {
      if (
        !isMountedRef.current ||
        intentionallyStoppedRef.current ||
        fatalStopRef.current ||
        !isEnabledRef.current ||
        pausedRef.current
      ) {
        return;
      }

      clearRestartTimer();
      console.info(
        `[useVoiceTrigger] Scheduling seamless restart in ${delayMs}ms (${reason}).`
      );
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        startSessionRef.current();
      }, delayMs);
    },
    [clearRestartTimer]
  );

  const startRecognitionSession = useCallback(() => {
    if (!isMountedRef.current || !isEnabledRef.current || pausedRef.current) {
      return;
    }

    const Ctor = getSpeechRecognitionConstructor();
    const secure = checkIsSecureContext();
    if (!secure) {
      setFailure('https-required', true);
      return;
    }
    if (!Ctor) {
      setFailure('browser-unsupported', true);
      return;
    }

    // FIX 2: Guard against duplicate initialization calls when recognition is already running or starting.
    if (isStartingOrRunningRef.current || recognitionRef.current) {
      return;
    }

    clearRestartTimer();
    intentionallyStoppedRef.current = false;
    fatalStopRef.current = false;
    isStartingOrRunningRef.current = true;

    const sessionId = activeSessionIdRef.current + 1;
    activeSessionIdRef.current = sessionId;

    let recognition: SpeechRecognitionInstanceLike;
    try {
      recognition = new Ctor();
    } catch (err) {
      isStartingOrRunningRef.current = false;
      console.warn('[useVoiceTrigger] Failed to construct SpeechRecognition:', err);
      setFailure('start-failed', true);
      return;
    }

    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      if (!isMountedRef.current || activeSessionIdRef.current !== sessionId) return;
      sessionStartedAtRef.current = Date.now();
      isStartingOrRunningRef.current = true;
      setIsRecognitionActive(true);
      // Successful start confirms browser permission is active.
      setHasPermission(true);
      setError(null);
      setErrorCode(null);
    };

    recognition.onresult = (rawEvent) => {
      if (
        !isMountedRef.current ||
        activeSessionIdRef.current !== sessionId ||
        !isEnabledRef.current ||
        pausedRef.current ||
        isSpeechPlaybackActive() ||
        shouldIgnoreResultRef.current?.()
      ) {
        return;
      }

      consecutiveTransientErrorsRef.current = 0;
      setHasPermission(true);

      const event = rawEvent as unknown as SpeechRecognitionResultEvent;
      if (!event?.results) return;

      const startIndex = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
      for (let i = startIndex; i < event.results.length; i += 1) {
        const resultEntry = event.results[i];
        if (!resultEntry) continue;

        const altCount = Math.max(1, resultEntry.length || 1);
        for (let a = 0; a < altCount; a += 1) {
          const alt = resultEntry[a];
          const transcript = alt?.transcript?.trim() || '';
          if (!transcript) continue;
          // Ignore low-confidence background noise when browser provides finite confidence > 0
          if (
            typeof alt?.confidence === 'number' &&
            alt.confidence > 0 &&
            alt.confidence < minConfidence
          ) {
            continue;
          }

          setLastTranscript(transcript);

          if (matchesWakePhrase(transcript, phrasesRef.current)) {
            const now = Date.now();
            if (now - lastTriggeredAtRef.current >= cooldownMs) {
              lastTriggeredAtRef.current = now;
              setTriggerCount((prev) => prev + 1);
              onTriggerRef.current(transcript);
            }
            return;
          }
        }
      }
    };

    // FIX 3: Structured error handling & recovery for not-allowed, network, aborted, audio-capture, and no-speech.
    recognition.onerror = (ev) => {
      if (!isMountedRef.current || activeSessionIdRef.current !== sessionId) return;
      const code = ev?.error || 'unknown';

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setFailure('permission-denied', true);
        return;
      }

      if (code === 'audio-capture') {
        setFailure('audio-capture', true);
        return;
      }

      if (code === 'language-not-supported') {
        setFailure('language-not-supported', true);
        return;
      }

      if (
        code === 'aborted' &&
        (intentionallyStoppedRef.current || pausedRef.current || !isEnabledRef.current)
      ) {
        return;
      }

      // 'no-speech' occurs routinely during quiet intervals; allow onend to restart cleanly without incrementing error count.
      if (code === 'no-speech') {
        console.info('[useVoiceTrigger] Silence timeout (no-speech); keeping wake listener alive.');
        return;
      }

      // Reset error streak if this session had been healthy for a sustained period before a brief blip.
      if (
        sessionStartedAtRef.current > 0 &&
        Date.now() - sessionStartedAtRef.current >= HEALTHY_SESSION_RESET_MS
      ) {
        consecutiveTransientErrorsRef.current = 0;
      }

      consecutiveTransientErrorsRef.current += 1;
      console.warn(
        `[useVoiceTrigger] Transient recognition error "${code}" (attempt ${consecutiveTransientErrorsRef.current}/${maxConsecutiveErrors}).`
      );

      if (consecutiveTransientErrorsRef.current >= maxConsecutiveErrors) {
        setFailure('network', true);
      }
    };

    // FIX 1: Seamless onend handler preserves isListening state and auto-restarts cleanly with bounded backoff.
    recognition.onend = () => {
      if (activeSessionIdRef.current !== sessionId) {
        return;
      }

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      isStartingOrRunningRef.current = false;

      if (isMountedRef.current) {
        setIsRecognitionActive(false);
      }

      if (
        !isMountedRef.current ||
        intentionallyStoppedRef.current ||
        fatalStopRef.current ||
        !isEnabledRef.current ||
        pausedRef.current
      ) {
        return;
      }

      const backoffMs =
        consecutiveTransientErrorsRef.current > 0
          ? Math.min(4000, autoRestartDelayMs * 2 ** (consecutiveTransientErrorsRef.current - 1))
          : autoRestartDelayMs;

      scheduleAutoRestart(
        backoffMs,
        consecutiveTransientErrorsRef.current > 0
          ? 'transient-error-recovery'
          : 'continuous-keepalive'
      );
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      isStartingOrRunningRef.current = false;
      if (isMountedRef.current) {
        setIsRecognitionActive(false);
      }

      const errName = (err as Error)?.name || '';
      if (errName === 'NotAllowedError') {
        setFailure('permission-denied', true);
      } else if (errName === 'InvalidStateError') {
        // FIX 1 & 3: Browser may still be releasing a prior audio handle (e.g., StrictMode remount or rapid blip).
        // Keep isListening true and schedule a bounded deferred retry instead of killing the session.
        consecutiveTransientErrorsRef.current += 1;
        console.warn(
          `[useVoiceTrigger] InvalidStateError during start() (attempt ${consecutiveTransientErrorsRef.current}/${maxConsecutiveErrors}); retrying cleanly.`
        );
        if (consecutiveTransientErrorsRef.current >= maxConsecutiveErrors) {
          setFailure('start-failed', true);
        } else {
          scheduleAutoRestart(Math.max(autoRestartDelayMs, 250), 'invalid-state-recovery');
        }
      } else {
        console.warn('[useVoiceTrigger] Unexpected start() exception:', err);
        setFailure('start-failed', true);
      }
    }
  }, [
    autoRestartDelayMs,
    clearRestartTimer,
    cooldownMs,
    lang,
    maxConsecutiveErrors,
    scheduleAutoRestart,
    setFailure,
  ]);

  startSessionRef.current = startRecognitionSession;

  // Visibility awareness: pause continuous mic when tab moves to background to conserve battery & CPU.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setIsPageHidden(Boolean(document.hidden));
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Synchronize live recognition session whenever enabled/paused/lang state changes.
  useEffect(() => {
    isMountedRef.current = true;

    if (!isEnabled || effectivePaused) {
      teardownRecognition();
      return () => {
        clearRestartTimer();
      };
    }

    startRecognitionSession();

    return () => {
      teardownRecognition();
    };
  }, [
    isEnabled,
    effectivePaused,
    lang,
    startRecognitionSession,
    teardownRecognition,
    clearRestartTimer,
  ]);

  // Ensure complete teardown on component unmount.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      teardownRecognition();
    };
  }, [teardownRecognition]);

  const startListening = useCallback(() => {
    if (!checkIsSecureContext()) {
      setFailure('https-required', true);
      return;
    }
    if (!getSpeechRecognitionConstructor()) {
      setFailure('browser-unsupported', true);
      return;
    }

    // FIX 2: If already enabled & unpaused with an active/scheduled session, avoid duplicate initialization.
    if (
      isEnabledRef.current &&
      !pausedRef.current &&
      (isStartingOrRunningRef.current || recognitionRef.current || restartTimerRef.current !== null)
    ) {
      return;
    }

    fatalStopRef.current = false;
    intentionallyStoppedRef.current = false;
    consecutiveTransientErrorsRef.current = 0;
    setError(null);
    setErrorCode(null);
    isEnabledRef.current = true;
    setIsEnabled(true);
  }, [setFailure]);

  const stopListening = useCallback(() => {
    isEnabledRef.current = false;
    setIsEnabled(false);
    teardownRecognition();
  }, [teardownRecognition]);

  const toggleListening = useCallback(() => {
    if (isEnabledRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const status: VoiceTriggerStatus = !isSupported
    ? 'unsupported'
    : isEnabled
    ? 'listening'
    : 'muted';

  // Explicit state flags maintained consistently across seamless restarts, pauses, and errors.
  const isPaused = Boolean(isSupported && isEnabled && effectivePaused);
  const isListening = Boolean(isSupported && isEnabled && !effectivePaused);

  return {
    status,
    isListening,
    isRecognitionActive,
    isEnabled,
    isPaused,
    isSupported,
    hasPermission,
    isSecureContext,
    error,
    errorCode,
    lastTranscript,
    triggerCount,
    startListening,
    stopListening,
    toggleListening,
    clearError,
  };
}
