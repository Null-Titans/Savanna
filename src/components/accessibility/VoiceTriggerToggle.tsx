import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Mic, MicOff, PauseCircle, Slash, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import type {
  VoiceTriggerErrorCode,
  VoiceTriggerStatus,
} from '../../hooks/useVoiceTrigger';
import {
  findNativeBrowserVoice,
  resolveUtteranceLangTag,
  stopAllSpeechPlayback,
} from '../../services/speech/speechService';

export interface VoiceTriggerToggleProps {
  status: VoiceTriggerStatus;
  /** Optional explicit flags synchronized from useVoiceTrigger. */
  isListening?: boolean;
  isSupported?: boolean;
  hasPermission?: boolean | null;
  isPaused?: boolean;
  isSecureContext?: boolean;
  wakePhrase?: string;
  triggerCount?: number;
  error?: string | null;
  errorCode?: VoiceTriggerErrorCode | null;
  /** Speak state transitions & errors aloud using native SpeechSynthesis when available (default: true). */
  announceWithSpeech?: boolean;
  onToggle: () => void;
  onClearError?: () => void;
  onUnsupportedActivate?: (reason: string) => void;
  /** When true, omits inline alert box below the button so a parent bar can render it full-width. */
  hideInlineAlert?: boolean;
  className?: string;
}

function formatMessage(template: string, phrase: string): string {
  return template.replace('{phrase}', phrase);
}

export function resolveVoiceTriggerErrorMessage(
  errorCode: VoiceTriggerErrorCode | null | undefined,
  fallbackError: string | null | undefined,
  vt: {
    errorPermissionDenied: string;
    errorAudioCapture: string;
    errorNetwork: string;
    errorLanguageUnsupported: string;
    errorBrowserUnsupported: string;
    errorHttpsRequired: string;
  }
): string | null {
  if (!errorCode && !fallbackError) return null;
  switch (errorCode) {
    case 'permission-denied':
      return vt.errorPermissionDenied;
    case 'audio-capture':
      return vt.errorAudioCapture;
    case 'network':
      return vt.errorNetwork;
    case 'language-not-supported':
      return vt.errorLanguageUnsupported;
    case 'browser-unsupported':
      return vt.errorBrowserUnsupported;
    case 'https-required':
      return vt.errorHttpsRequired;
    default:
      return fallbackError || null;
  }
}

export const VoiceTriggerToggle: React.FC<VoiceTriggerToggleProps> = ({
  status,
  isListening,
  isSupported,
  hasPermission = null,
  isPaused = false,
  isSecureContext = true,
  wakePhrase = 'Hey Access',
  triggerCount = 0,
  error = null,
  errorCode = null,
  announceWithSpeech = true,
  onToggle,
  onClearError,
  onUnsupportedActivate,
  hideInlineAlert = false,
  className = '',
}) => {
  const { language, t } = useI18n();
  const vt = t.voiceTrigger;
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(null);
  const prevTriggerCountRef = useRef(triggerCount);
  const lastSpokenMessageRef = useRef<string>('');
  const lastSpokenAtRef = useRef<number>(0);

  // Derive normalized status cleanly whether callers pass status alone or explicit booleans.
  const effectiveSupported = isSupported ?? status !== 'unsupported';
  const effectiveStatus: VoiceTriggerStatus = !effectiveSupported
    ? 'unsupported'
    : isPaused
    ? status === 'muted'
      ? 'muted'
      : 'listening'
    : isListening === true
    ? 'listening'
    : isListening === false
    ? 'muted'
    : status;

  const prevTransitionKeyRef = useRef<string>(
    `${effectiveStatus}|${isPaused}|${isSecureContext}|${wakePhrase}`
  );

  const localizedError =
    resolveVoiceTriggerErrorMessage(errorCode, error, vt) || unsupportedNotice;

  // FIX 4: Speak immediate concise audio cues for blind and visually impaired users alongside ARIA live announcements.
  // Strictly uses an authentic native browser voice for the active UI language (never speaking Amharic/Oromo with an English voice).
  const speakStatusCue = useCallback(
    (message: string) => {
      if (!announceWithSpeech || !message.trim()) return;
      if (
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        typeof window.SpeechSynthesisUtterance === 'undefined' ||
        typeof window.speechSynthesis.speak !== 'function'
      ) {
        return;
      }

      const now = Date.now();
      if (lastSpokenMessageRef.current === message && now - lastSpokenAtRef.current < 800) {
        return;
      }

      const nativeVoice = findNativeBrowserVoice(language);
      if (!nativeVoice) {
        return;
      }

      try {
        lastSpokenMessageRef.current = message;
        lastSpokenAtRef.current = now;
        stopAllSpeechPlayback();
        const utterance = new window.SpeechSynthesisUtterance(message);
        utterance.voice = nativeVoice;
        utterance.lang = resolveUtteranceLangTag(nativeVoice, language);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore browser autoplay or speech synthesis runtime errors gracefully
      }
    },
    [announceWithSpeech, language]
  );

  // Clean up any queued toggle audio cue on unmount.
  useEffect(() => {
    return () => {
      if (
        typeof window !== 'undefined' &&
        window.speechSynthesis &&
        typeof window.speechSynthesis.cancel === 'function' &&
        lastSpokenMessageRef.current
      ) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore unmount speech cancel errors
        }
      }
    };
  }, []);

  // Announce microphone state transitions (Listening, Paused, Muted, Unsupported) after initial mount.
  useEffect(() => {
    const nextTransitionKey = `${effectiveStatus}|${isPaused}|${isSecureContext}|${wakePhrase}`;
    if (prevTransitionKeyRef.current === nextTransitionKey) {
      return;
    }
    prevTransitionKeyRef.current = nextTransitionKey;

    let message = '';
    if (effectiveStatus === 'unsupported') {
      message = isSecureContext ? vt.errorBrowserUnsupported : vt.errorHttpsRequired;
    } else if (effectiveStatus === 'listening' && isPaused) {
      message = vt.announcedPaused;
    } else if (effectiveStatus === 'listening') {
      message = formatMessage(vt.announcedListening, wakePhrase);
    } else {
      message = vt.announcedMuted;
    }

    setLiveAnnouncement(message);
    speakStatusCue(message);
  }, [
    effectiveStatus,
    isPaused,
    isSecureContext,
    wakePhrase,
    speakStatusCue,
    vt.announcedListening,
    vt.announcedMuted,
    vt.announcedPaused,
    vt.errorBrowserUnsupported,
    vt.errorHttpsRequired,
  ]);

  // Announce wake-phrase detection immediately when triggered.
  useEffect(() => {
    if (triggerCount > prevTriggerCountRef.current) {
      prevTriggerCountRef.current = triggerCount;
      const triggeredMsg = formatMessage(vt.announcedTriggered, wakePhrase);
      setLiveAnnouncement(triggeredMsg);
      speakStatusCue(triggeredMsg);
    }
  }, [triggerCount, wakePhrase, speakStatusCue, vt.announcedTriggered]);

  // Announce runtime errors immediately via both ARIA live region and speech synthesis.
  useEffect(() => {
    if (!localizedError) return;
    setLiveAnnouncement(localizedError);
    speakStatusCue(localizedError);
  }, [localizedError, speakStatusCue]);

  const effectiveStatusLabel =
    effectiveStatus === 'unsupported'
      ? vt.statusUnsupported
      : effectiveStatus === 'listening' && isPaused
      ? vt.statusPaused
      : effectiveStatus === 'listening'
      ? vt.statusListening
      : vt.statusMuted;

  const baseAriaLabel =
    effectiveStatus === 'unsupported'
      ? vt.ariaUnsupported
      : effectiveStatus === 'listening' && isPaused
      ? vt.ariaPaused
      : effectiveStatus === 'listening'
      ? formatMessage(vt.ariaListening, wakePhrase)
      : formatMessage(vt.ariaMuted, wakePhrase);

  const ariaLabel =
    hasPermission === false && effectiveStatus === 'muted'
      ? `${baseAriaLabel} ${vt.errorPermissionDenied}`
      : baseAriaLabel;

  const handlePress = () => {
    if (effectiveStatus === 'unsupported') {
      const reason = isSecureContext
        ? vt.errorBrowserUnsupported
        : vt.errorHttpsRequired;
      setUnsupportedNotice(reason);
      setLiveAnnouncement(reason);
      speakStatusCue(reason);
      onUnsupportedActivate?.(reason);
      return;
    }
    setUnsupportedNotice(null);
    onToggle();
  };

  const buttonClasses =
    effectiveStatus === 'unsupported'
      ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 cursor-not-allowed'
      : effectiveStatus === 'listening' && isPaused
      ? 'border-amber-600 bg-amber-50 text-[#0F1E36] dark:border-amber-400 dark:bg-slate-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-slate-700 cursor-pointer'
      : effectiveStatus === 'listening'
      ? 'border-emerald-700 bg-emerald-700 text-white dark:border-amber-400 dark:bg-amber-500 dark:text-[#0F1E36] hover:bg-emerald-800 dark:hover:bg-amber-400 cursor-pointer'
      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer';

  const statusDotClasses =
    effectiveStatus === 'unsupported'
      ? 'bg-slate-500 dark:bg-slate-400'
      : effectiveStatus === 'listening' && isPaused
      ? 'bg-amber-600 dark:bg-amber-400'
      : effectiveStatus === 'listening'
      ? 'bg-emerald-200 dark:bg-[#0F1E36] animate-pulse motion-reduce:animate-none'
      : hasPermission === false
      ? 'bg-red-600 dark:bg-red-400'
      : 'bg-slate-400 dark:bg-slate-500';

  return (
    <div className={`inline-flex flex-col items-end ${className}`}>
      <button
        type="button"
        onClick={handlePress}
        aria-pressed={effectiveStatus === 'unsupported' ? undefined : effectiveStatus === 'listening'}
        aria-disabled={effectiveStatus === 'unsupported' ? true : undefined}
        aria-label={ariaLabel}
        title={
          effectiveStatus === 'unsupported'
            ? ariaLabel
            : `${vt.buttonPrefix}: ${effectiveStatusLabel} (${formatMessage(
                vt.wakePhraseLabel,
                wakePhrase
              )})`
        }
        className={`inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg border text-xs sm:text-sm font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F] dark:focus-visible:outline-amber-400 ${buttonClasses}`}
      >
        {effectiveStatus === 'unsupported' ? (
          <Slash className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : effectiveStatus === 'listening' && isPaused ? (
          <PauseCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : effectiveStatus === 'listening' ? (
          <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <MicOff
            className="w-4 h-4 shrink-0 text-[#1E3A5F] dark:text-amber-400"
            aria-hidden="true"
          />
        )}

        <span>{vt.buttonPrefix}:</span>

        <span className="inline-flex items-center gap-1.5 font-bold">
          <span
            aria-hidden="true"
            className={`inline-block w-2 h-2 rounded-full ${statusDotClasses}`}
          />
          <span>{effectiveStatusLabel}</span>
        </span>
      </button>

      {/* Screen-reader live region announcing Listening, Muted, Paused, Triggered, and Error states immediately */}
      <span className="gw-sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </span>

      {!hideInlineAlert && localizedError && (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/90 px-3 py-1.5 text-xs text-red-900 dark:text-red-100 max-w-sm shadow-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
          <span className="flex-1 leading-snug">{localizedError}</span>
          {(onClearError || unsupportedNotice) && (
            <button
              type="button"
              onClick={() => {
                setUnsupportedNotice(null);
                onClearError?.();
              }}
              aria-label={vt.dismissError}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
