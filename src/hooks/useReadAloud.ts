import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportedLanguage } from '../types/gateway';
import {
  detectSpeechCapabilities,
  fetchServerSpeechCapabilities,
  getActiveSpeechSessionId,
  speakText,
  stopAllSpeechPlayback,
  subscribeSpeechPlayback,
} from '../services/speech/speechService';

export function useReadAloud(language: SupportedLanguage) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [synthesisSupported, setSynthesisSupported] = useState(false);
  const [hasAuthenticVoice, setHasAuthenticVoice] = useState(false);
  const [usingNeuralVoice, setUsingNeuralVoice] = useState(false);
  const [voiceStatusNote, setVoiceStatusNote] = useState<string | null>(null);
  const isOwnerActiveRef = useRef(false);
  const expectedSessionIdRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeSpeechPlayback((active, sessionId) => {
      if (
        !active &&
        isOwnerActiveRef.current &&
        sessionId !== expectedSessionIdRef.current
      ) {
        isOwnerActiveRef.current = false;
        expectedSessionIdRef.current = null;
        setIsSpeaking(false);
        setIsLoadingAudio(false);
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    // Immediately cancel prior speech and clear status when website language changes
    expectedSessionIdRef.current = null;
    isOwnerActiveRef.current = false;
    stopAllSpeechPlayback();
    setIsSpeaking(false);
    setIsLoadingAudio(false);
    setVoiceStatusNote(null);

    const refresh = () => {
      if (!active) return;
      const caps = detectSpeechCapabilities(language);
      setSynthesisSupported(caps.serverTtsAvailable || caps.synthesisSupported);
      setHasAuthenticVoice(caps.hasAnyAuthenticVoice);
      setUsingNeuralVoice(caps.serverTtsAvailable);
    };

    refresh();
    void fetchServerSpeechCapabilities().then(() => {
      refresh();
    });

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const usesEventListener = Boolean(synth && typeof synth.addEventListener === 'function');
    if (synth) {
      if (usesEventListener) {
        synth.addEventListener('voiceschanged', refresh);
      } else {
        synth.onvoiceschanged = refresh;
      }
    }

    return () => {
      active = false;
      expectedSessionIdRef.current = null;
      isOwnerActiveRef.current = false;
      stopAllSpeechPlayback();
      if (synth) {
        if (usesEventListener && typeof synth.removeEventListener === 'function') {
          synth.removeEventListener('voiceschanged', refresh);
        } else if (synth.onvoiceschanged === refresh) {
          synth.onvoiceschanged = null;
        }
      }
    };
  }, [language]);

  const stop = useCallback(() => {
    expectedSessionIdRef.current = null;
    isOwnerActiveRef.current = false;
    stopAllSpeechPlayback();
    setIsLoadingAudio(false);
    setIsSpeaking(false);
  }, []);

  const read = useCallback(
    async (text: string, overrideLanguage?: SupportedLanguage) => {
      if (isSpeaking || isLoadingAudio) {
        stop();
        return;
      }
      setVoiceStatusNote(null);
      const nextSessionId = getActiveSpeechSessionId() + 1;
      expectedSessionIdRef.current = nextSessionId;
      isOwnerActiveRef.current = true;
      const targetLang = overrideLanguage || language;

      await speakText(
        text,
        targetLang,
        () => {
          if (isOwnerActiveRef.current && expectedSessionIdRef.current === nextSessionId) {
            setIsSpeaking(true);
          }
        },
        () => {
          if (expectedSessionIdRef.current === nextSessionId) {
            expectedSessionIdRef.current = null;
            isOwnerActiveRef.current = false;
            setIsSpeaking(false);
          }
        },
        (reason) => {
          if (expectedSessionIdRef.current === nextSessionId) {
            expectedSessionIdRef.current = null;
            isOwnerActiveRef.current = false;
            setIsSpeaking(false);
            setIsLoadingAudio(false);
            setVoiceStatusNote(reason);
          }
        },
        (loading) => {
          if ((isOwnerActiveRef.current && expectedSessionIdRef.current === nextSessionId) || !loading) {
            setIsLoadingAudio(loading);
          }
        }
      );
    },
    [isLoadingAudio, isSpeaking, language, stop]
  );

  return {
    isSpeaking,
    isLoadingAudio,
    synthesisSupported,
    hasAuthenticVoice,
    usingNeuralVoice,
    voiceStatusNote,
    read,
    stop,
  };
}
