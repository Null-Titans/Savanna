import React, { useEffect, useRef, useState } from 'react';
import { GatewayModule, SupportedLanguage } from '../../types/gateway';
import { useI18n } from '../../i18n';
import { getOrientationSpec } from '../../utils/pageOrientation';
import {
  describeFocusedElement,
  formatPageArrivalAnnouncement,
  formatSubmissionResultAnnouncement,
  formatValidationAlertAnnouncement,
} from '../../utils/focusAnnouncement';
import {
  findNativeBrowserVoice,
  resolveUtteranceLangTag,
  stopAllSpeechPlayback,
} from '../../services/speech/speechService';
import { LiveRegion } from './LiveRegion';

interface KeyboardFocusAnnouncerProps {
  activeModule: GatewayModule;
  /** Optional override to mute local speech synthesis cues if explicitly requested. */
  suppressSpeech?: boolean;
}

const ARROW_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
  }
  return false;
}

function speakKeyboardCueIfSupported(text: string, language: SupportedLanguage): void {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance === 'undefined'
  ) {
    return;
  }

  const nativeVoice = findNativeBrowserVoice(language);
  const availableVoices =
    typeof window.speechSynthesis.getVoices === 'function'
      ? window.speechSynthesis.getVoices()
      : [];

  // For non-English languages, strictly avoid forcing an English voice;
  // for English, allow default browser voice when getVoices() hasn't populated yet.
  if (!nativeVoice && !(language === 'en' && availableVoices.length === 0)) {
    return;
  }

  try {
    stopAllSpeechPlayback();
    const utterance = new window.SpeechSynthesisUtterance(text);
    if (nativeVoice) {
      utterance.voice = nativeVoice;
    }
    utterance.lang = resolveUtteranceLangTag(nativeVoice, language);
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore restricted speech synthesis runtimes
  }
}

export const KeyboardFocusAnnouncer: React.FC<KeyboardFocusAnnouncerProps> = ({
  activeModule,
  suppressSpeech = false,
}) => {
  const { language } = useI18n();
  const [announcement, setAnnouncement] = useState('');

  const isKeyboardModeRef = useRef(false);
  const keyboardNavPendingUntilRef = useRef(0);
  const lastFocusedElRef = useRef<HTMLElement | null>(null);
  const lastFeedbackTextRef = useRef('');
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevModuleRef = useRef<GatewayModule>(activeModule);
  const prevLanguageRef = useRef<SupportedLanguage>(language);
  const languageRef = useRef(language);
  languageRef.current = language;
  const suppressSpeechRef = useRef(suppressSpeech);
  suppressSpeechRef.current = suppressSpeech;

  const cancelAndScheduleSpeech = (text: string, lang: SupportedLanguage) => {
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    try {
      stopAllSpeechPlayback();
    } catch {
      // Ignore cancel errors
    }
    if (suppressSpeechRef.current || !text) return;

    speechTimerRef.current = setTimeout(() => {
      speechTimerRef.current = null;
      speakKeyboardCueIfSupported(text, lang);
    }, 40);
  };

  useEffect(() => {
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;
    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    try {
      stopAllSpeechPlayback();
    } catch {
      // Ignore cancel errors
    }
    lastFocusedElRef.current = null;
    lastFeedbackTextRef.current = '';
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Warm up voice list when supported
    const onVoicesChanged = () => {
      try {
        window.speechSynthesis?.getVoices?.();
      } catch {
        // Ignore
      }
    };
    onVoicesChanged();
    const synth = window.speechSynthesis;
    if (synth && typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', onVoicesChanged);
    }

    const onPointerInput = () => {
      isKeyboardModeRef.current = false;
      keyboardNavPendingUntilRef.current = 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Tab') {
        isKeyboardModeRef.current = true;
        // Stop any previous cue immediately on Tab / Shift+Tab
        if (speechTimerRef.current) {
          clearTimeout(speechTimerRef.current);
          speechTimerRef.current = null;
        }
        try {
          window.speechSynthesis?.cancel();
        } catch {
          // Ignore
        }
      } else if (ARROW_NAV_KEYS.has(e.key)) {
        // Do not hijack cursor/selection keys inside text fields or textareas
        if (!isTextEditingTarget(e.target)) {
          isKeyboardModeRef.current = true;
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isKeyboardModeRef.current) {
          keyboardNavPendingUntilRef.current = Date.now() + 800;
        }
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isKeyboardModeRef.current) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === lastFocusedElRef.current) return;

      const text = describeFocusedElement(target, languageRef.current);
      if (!text) return;

      lastFocusedElRef.current = target;
      setAnnouncement(text);
      cancelAndScheduleSpeech(text, languageRef.current);
    };

    window.addEventListener('pointerdown', onPointerInput, true);
    window.addEventListener('mousedown', onPointerInput, true);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);

    // Observe <main> for newly rendered validation alerts or submission confirmations during keyboard navigation
    let mainObserver: MutationObserver | null = null;
    const mainEl = document.getElementById('gw-main-content');
    if (mainEl && typeof MutationObserver !== 'undefined') {
      mainObserver = new MutationObserver((mutations) => {
        const keyboardRecentlyActive =
          isKeyboardModeRef.current || Date.now() <= keyboardNavPendingUntilRef.current;
        if (!keyboardRecentlyActive) return;

        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;

            const alertEl =
              node.getAttribute('role') === 'alert'
                ? node
                : node.querySelector<HTMLElement>('[role="alert"]');
            if (alertEl) {
              const raw = (alertEl.textContent || '').replace(/\s+/g, ' ').trim();
              const formatted = formatValidationAlertAnnouncement(raw, languageRef.current);
              if (formatted && formatted !== lastFeedbackTextRef.current) {
                lastFeedbackTextRef.current = formatted;
                setAnnouncement(formatted);
                cancelAndScheduleSpeech(formatted, languageRef.current);
                return;
              }
            }

            const confirmHeading = node.matches('#gw-confirm-heading, #gw-job-app-done')
              ? node
              : node.querySelector<HTMLElement>('#gw-confirm-heading, #gw-job-app-done');
            if (confirmHeading) {
              const raw = (confirmHeading.textContent || '').replace(/\s+/g, ' ').trim();
              const formatted = formatSubmissionResultAnnouncement(raw, languageRef.current);
              if (formatted && formatted !== lastFeedbackTextRef.current) {
                lastFeedbackTextRef.current = formatted;
                setAnnouncement(formatted);
                cancelAndScheduleSpeech(formatted, languageRef.current);
                return;
              }
            }
          }
        }
      });
      mainObserver.observe(mainEl, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener('pointerdown', onPointerInput, true);
      window.removeEventListener('mousedown', onPointerInput, true);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      if (synth && typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', onVoicesChanged);
      }
      mainObserver?.disconnect();
      if (speechTimerRef.current) {
        clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
      }
    };
  }, []);

  // Announce concise new page arrival ONLY after keyboard navigation activation (never unsolicited on load or mouse click)
  useEffect(() => {
    if (prevModuleRef.current === activeModule) return;
    prevModuleRef.current = activeModule;
    lastFocusedElRef.current = null;
    lastFeedbackTextRef.current = '';

    if (!isKeyboardModeRef.current && Date.now() > keyboardNavPendingUntilRef.current) {
      return;
    }

    const spec = getOrientationSpec(activeModule, language);
    const arrival = formatPageArrivalAnnouncement(spec.title, language);
    setAnnouncement(arrival);
    cancelAndScheduleSpeech(arrival, language);
  }, [activeModule, language]);

  return (
    <div data-testid="gw-keyboard-focus-live" className="gw-sr-only">
      <LiveRegion message={announcement} politeness="polite" />
    </div>
  );
};
