import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../../i18n';
import { GatewayModule, SupportedLanguage } from '../../types/gateway';
import {
  buildFullOrientationText,
  getOrientationSpec,
} from '../../utils/pageOrientation';
import {
  detectSpeechCapabilities,
  fetchServerSpeechCapabilities,
  findNativeBrowserVoice,
  resolveUtteranceLangTag,
  speakText,
  stopAllSpeechPlayback,
} from '../../services/speech/speechService';

interface PageOrientationAnnouncerProps {
  activeModule: GatewayModule;
  onAskWhereAmI?: () => void;
  onAskWhatCanIDo?: () => void;
  autoSpeechEnabled: boolean;
  onToggleAutoSpeech: () => void;
}

function speakOrientationWithStrictVoice(
  text: string,
  language: SupportedLanguage,
  unavailableFallbackMessage: string,
  onUnavailable: (message: string | null) => void
): void {
  const synthAvailable =
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const nativeVoice = synthAvailable ? findNativeBrowserVoice(language) : null;
  const availableVoices =
    synthAvailable && typeof window.speechSynthesis.getVoices === 'function'
      ? window.speechSynthesis.getVoices()
      : [];

  // Strictly match an authentic browser voice for the active language;
  // never force an English voice to read Amharic or Afaan Oromo.
  if (synthAvailable && (nativeVoice || (language === 'en' && availableVoices.length === 0))) {
    try {
      stopAllSpeechPlayback();
      onUnavailable(null);
      const utterance = new window.SpeechSynthesisUtterance(text);
      if (nativeVoice) {
        utterance.voice = nativeVoice;
      }
      utterance.lang = resolveUtteranceLangTag(nativeVoice, language);
      utterance.rate = 0.98;
      window.speechSynthesis.speak(utterance);
      return;
    } catch {
      // Fall through to server TTS / unavailable notice
    }
  }

  const caps = detectSpeechCapabilities(language);
  if (caps.serverTtsAvailable) {
    onUnavailable(null);
    void speakText(text, language, undefined, undefined, (reason) => {
      onUnavailable(
        language !== 'en' && /^No authentic/i.test(reason)
          ? unavailableFallbackMessage
          : reason
      );
    });
    return;
  }

  stopAllSpeechPlayback();
  onUnavailable(unavailableFallbackMessage);
}

export const PageOrientationAnnouncer: React.FC<PageOrientationAnnouncerProps> = ({
  activeModule,
  onAskWhereAmI,
  onAskWhatCanIDo,
  autoSpeechEnabled,
  onToggleAutoSpeech,
}) => {
  const { language, t } = useI18n();
  const [announcement, setAnnouncement] = useState<string>(() =>
    buildFullOrientationText(activeModule, language)
  );
  const [voiceUnavailableNote, setVoiceUnavailableNote] = useState<string | null>(null);
  const prevLanguageRef = useRef<SupportedLanguage>(language);

  const spec = getOrientationSpec(activeModule, language);

  useEffect(() => {
    void fetchServerSpeechCapabilities();
  }, []);

  const announceNow = useCallback(() => {
    const text = buildFullOrientationText(activeModule, language);
    setAnnouncement(text);
    speakOrientationWithStrictVoice(
      text,
      language,
      t.common.readAloudUnavailable,
      setVoiceUnavailableNote
    );
  }, [activeModule, language, t.common.readAloudUnavailable]);

  // Update visual/screen-reader status text silently on route change without unsolicited auto-speech.
  // Speech synthesis runs ONLY when user explicitly requests orientation ("Where am I?" / Alt+Shift+L).
  useEffect(() => {
    const text = buildFullOrientationText(activeModule, language);
    setAnnouncement(text);
    setVoiceUnavailableNote(null);
    if (prevLanguageRef.current !== language) {
      prevLanguageRef.current = language;
      stopAllSpeechPlayback();
    }
  }, [activeModule, language]);

  // Global shortcut: Alt+Shift+L speaks and updates exact spatial orientation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        announceNow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [announceNow]);

  return (
    <section
      aria-label="Page orientation and spatial guide"
      className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Compass
          className="w-5 h-5 text-[#1E3A5F] dark:text-amber-400 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-[#0F1E36] dark:text-white">
            {spec.title}
          </p>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-snug"
          >
            {announcement}
          </p>
          {voiceUnavailableNote && (
            <p
              role="status"
              className="text-xs text-amber-950 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-md px-2.5 py-1 mt-1"
            >
              {voiceUnavailableNote}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            announceNow();
            onAskWhereAmI?.();
          }}
          aria-label={t.orientation.announceNowAria}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5 text-[#1E3A5F] dark:text-amber-400" aria-hidden="true" />
          <span>{t.orientation.whereAmIButton}</span>
        </button>

        {onAskWhatCanIDo && (
          <button
            type="button"
            onClick={onAskWhatCanIDo}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            <span>{t.orientation.whatCanIDoButton}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleAutoSpeech}
          aria-pressed={autoSpeechEnabled}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
            autoSpeechEnabled
              ? 'border-[#0F1E36] bg-[#0F1E36] text-white dark:border-amber-400 dark:bg-amber-500 dark:text-[#0F1E36]'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0F1E36] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {autoSpeechEnabled ? (
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>
            {autoSpeechEnabled ? t.orientation.autoSpeechOn : t.orientation.autoSpeechOff}
          </span>
        </button>
      </div>
    </section>
  );
};
