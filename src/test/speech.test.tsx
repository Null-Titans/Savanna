import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import express from 'express';
import { AddressInfo } from 'net';
import axe from 'axe-core';
import App from '../App';
import { LANGUAGE_REGISTRY } from '../i18n/types';
import { normalizeSupportedLanguage } from '../i18n';
import { matchesWakePhrase, useVoiceTrigger } from '../hooks/useVoiceTrigger';
import {
  detectLanguageFromText,
  resetCachedSpeechCapabilitiesForTest,
  speakText,
} from '../services/speech/speechService';
import {
  createSpeechRouter,
  heuristicDetectLanguage,
  splitIntoSpeechChunks,
} from '../../server/speechRouter';

describe('Strictly Three-Language Enforcement (EN / AM / OM)', () => {
  it('exposes strictly English, Amharic, and Afaan Oromo with active status', () => {
    const codes = LANGUAGE_REGISTRY.map((l) => l.code);
    expect(codes).toEqual(['en', 'am', 'om']);
    expect(LANGUAGE_REGISTRY.every((l) => l.status === 'active')).toBe(true);
    expect(normalizeSupportedLanguage('ti')).toBe('en');
    expect(normalizeSupportedLanguage('so')).toBe('en');
    expect(normalizeSupportedLanguage('ar')).toBe('en');
    expect(normalizeSupportedLanguage('am-ET')).toBe('am');
    expect(normalizeSupportedLanguage('om-ET')).toBe('om');
  });

  it('switches the UI cleanly across English, Amharic, and Afaan Oromo with only 3 dropdown options', async () => {
    const user = userEvent.setup();
    render(<App />);

    const langSelect = screen.getByLabelText(/Language/i) as HTMLSelectElement;
    const optionValues = Array.from(langSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['en', 'am', 'om']);

    await user.selectOptions(langSelect, 'om');
    await waitFor(() => {
      expect(screen.getByText(/Galmee salphaa fi carraa hojii mijataa/i)).toBeInTheDocument();
    });

    await user.selectOptions(langSelect, 'am');
    await waitFor(() => {
      expect(screen.getByText(/ቀላል ምዝገባ እና ተደራሽ የስራ እድሎች/i)).toBeInTheDocument();
    });

    await user.selectOptions(langSelect, 'en');
    await waitFor(() => {
      expect(screen.getByText(/Simple registration and accessible work/i)).toBeInTheDocument();
    });
  });
});

describe('Language Detection & Long-Response Continuity', () => {
  it('identifies Amharic, Afaan Oromo, and English accurately without translating', () => {
    expect(detectLanguageFromText('ሰላም፣ የምዝገባውን ሂደት መጀመር እፈልጋለሁ።', 'en')).toBe('am');
    expect(detectLanguageFromText('Akkam jirtu? Galmee barataa fi hojii barbaada.', 'en')).toBe('om');
    expect(detectLanguageFromText('Hello, I want to apply for an accessible job.', 'en')).toBe('en');

    expect(heuristicDetectLanguage('አማርኛ ድጋፍ እፈልጋለሁ')).toBe('am');
    expect(heuristicDetectLanguage('Maaloo gargaarsa afaan oromoo naaf kenni')).toBe('om');
    expect(heuristicDetectLanguage('How do I register without a kebele ID?')).toBe('en');
  });

  it('splits long multi-sentence responses across Ethiopic and Latin punctuation without dropping words', () => {
    const longText = [
      'First sentence explains registration without a kebele ID.',
      'Second sentence explains partner referrals for learners.',
      'Third sentence explains workplace accommodations without medical proof!',
      'አራተኛው ዓረፍተ ነገር በአማርኛ ሙሉ ንባብ ያቀርባል።',
      'Fifth sentence confirms Afaan Oromo support works naturally too?',
    ].join(' ');

    const chunks = splitIntoSpeechChunks(longText, 120);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(' ')).toBe(longText);
  });
});

describe('Anti-Mismatch Voice Guard & Speech Synthesis Safeguards', () => {
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetCachedSpeechCapabilitiesForTest();
  });

  afterEach(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: originalUtterance,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('NEVER uses an English browser voice to pronounce Amharic or Afaan Oromo', async () => {
    const speakSpy = vi.fn();
    const cancelSpy = vi.fn();
    const englishOnlyVoices = [
      { name: 'English US Default', lang: 'en-US', default: true, localService: true, voiceURI: 'en-US' },
    ];

    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => englishOnlyVoices,
        speak: speakSpy,
        cancel: cancelSpy,
        onvoiceschanged: null,
      },
      configurable: true,
    });

    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ geminiConfigured: false, supportedLanguages: ['en', 'am', 'om'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const amErrors: string[] = [];
    await speakText(
      'ሰላም፣ የምዝገባውን ሂደት ይጀምሩ።',
      'am',
      undefined,
      undefined,
      (err) => amErrors.push(err)
    );
    expect(speakSpy).not.toHaveBeenCalled();
    expect(amErrors[0]).toMatch(/No authentic/i);

    const omErrors: string[] = [];
    await speakText(
      'Akkam jirtu? Galmee barataa jalqabi.',
      'om',
      undefined,
      undefined,
      (err) => omErrors.push(err)
    );
    expect(speakSpy).not.toHaveBeenCalled();
    expect(omErrors[0]).toMatch(/No authentic/i);

    // English DOES work cleanly with the native English voice
    await speakText('Welcome to the Accessible Gateway.', 'en');
    expect(speakSpy).toHaveBeenCalledTimes(1);
    const spokenUtterance = speakSpy.mock.calls[0][0] as MockUtterance;
    expect(spokenUtterance.lang).toBe('en-US');
  });
});

describe('Integrated Voice Assistant Panel (Manual + Auto-Detect + Error Handling)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetCachedSpeechCapabilitiesForTest();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('opens from the utility bar, switches languages via auto-detect, and handles API failures gracefully', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/speech/capabilities')) {
        return new Response(
          JSON.stringify({ geminiConfigured: false, supportedLanguages: ['en', 'am', 'om'] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/speech/assistant')) {
        const body = JSON.parse(String(init?.body || '{}')) as { message: string };
        if (body.message.includes('TRIGGER_ERROR')) {
          return new Response(JSON.stringify({ error: 'Assistant service temporarily unavailable.' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (body.message.includes('Akkam')) {
          return new Response(
            JSON.stringify({
              replyText: 'Nagaa! Galmee barataa salphaatti jalqabuu dandeessu.',
              language: 'om',
              provider: 'mock-test',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            replyText: 'ሰላም! ያለ ቀበሌ መታወቂያ መመዝገብ ይችላሉ።',
            language: 'am',
            provider: 'mock-test',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Verify manual selector inside assistant has strictly 3 options
    const vaLangSelect = screen.getByLabelText(/Language:/i) as HTMLSelectElement;
    expect(Array.from(vaLangSelect.options).map((o) => o.value)).toEqual(['en', 'am', 'om']);

    // Send Afaan Oromo message -> auto-detect switches conversation & UI to Afaan Oromoo
    const input = screen.getByPlaceholderText(/Type or use the microphone/i);
    await user.type(input, 'Akkam jirtu? Galmee barbaada');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Nagaa! Galmee barataa salphaatti jalqabuu dandeessu/i)
      ).toBeInTheDocument();
      expect(vaLangSelect.value).toBe('om');
    });

    // Send Amharic message -> switches to Amharic
    const omInput = screen.getByRole('textbox');
    await user.type(omInput, 'ሰላም መመዝገብ እፈልጋለሁ');
    await user.click(screen.getByRole('button', { name: /Ergi|ላክ|Send/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/ሰላም! ያለ ቀበሌ መታወቂያ መመዝገብ ይችላሉ።/i)
      ).toBeInTheDocument();
      expect(vaLangSelect.value).toBe('am');
    });

    // Simulate API failure -> shows clean inline error without crashing
    const amInput = screen.getByRole('textbox');
    await user.type(amInput, 'TRIGGER_ERROR');
    await user.click(screen.getByRole('button', { name: /ላክ|Send/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Assistant service temporarily unavailable/i);
    });

    // Strict Privacy Guardrail: pasting a token/password clears input, blocks send, and warns immediately
    const guardInput = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(guardInput, 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    await user.click(screen.getByRole('button', { name: /ላክ|Send/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /clear that sensitive text|ወዲያውኑ ያጽዱ/i
      );
    });
    expect(guardInput.value).toBe('');
    expect(screen.queryByText(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/)).not.toBeInTheDocument();

    // Quick navigation button confirms navigation clearly
    await user.click(screen.getAllByRole('button', { name: /Go to/i })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Confirmed: opened/i)).toBeInTheDocument();
    });
  }, 15000);
});

describe('Server Speech Router Endpoints', () => {
  it('serves /capabilities, /detect-language, and /assistant cleanly across all 3 languages', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/speech', createSpeechRouter());

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}/api/speech`;

      const capsRes = await fetch(`${base}/capabilities`);
      expect(capsRes.status).toBe(200);
      const caps = (await capsRes.json()) as { supportedLanguages: string[] };
      expect(caps.supportedLanguages).toEqual(['en', 'am', 'om']);

      const detAm = await fetch(`${base}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'እንደምን አደሩ' }),
      });
      expect(((await detAm.json()) as { language: string }).language).toBe('am');

      const detOm = await fetch(`${base}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Akkam bultan? Galatoomaa.' }),
      });
      expect(((await detOm.json()) as { language: string }).language).toBe('om');

      const detEn = await fetch(`${base}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Good morning, how do I register?' }),
      });
      expect(((await detEn.json()) as { language: string }).language).toBe('en');

      const astOm = await fetch(`${base}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Maaloo gargaarsa hojii barbaada', autoDetect: true }),
      });
      expect(astOm.status).toBe(200);
      const astData = (await astOm.json()) as { language: string; replyText: string };
      expect(astData.language).toBe('om');
      expect(astData.replyText.length).toBeGreaterThan(10);

      const secretRes = await fetch(`${base}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'My password is MySecret123! and PIN: 4589', language: 'en', autoDetect: false }),
      });
      expect(secretRes.status).toBe(200);
      const secretData = (await secretRes.json()) as {
        provider: string;
        privacyBlocked?: boolean;
        replyText: string;
      };
      expect(secretData.provider).toBe('privacy-guard');
      expect(secretData.privacyBlocked).toBe(true);
      expect(secretData.replyText).toMatch(/clear/i);
      expect(secretData.replyText).not.toContain('MySecret123');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('Voice Input Repair (webkitSpeechRecognition, Empty Guard, Permissions & Fallback)', () => {
  const originalSpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

  afterEach(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: originalSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: originalWebkitSpeechRecognition,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function installMockWebkitRecognition(
    behavior: (instance: {
      lang: string;
      onstart: (() => void) | null;
      onresult: ((ev: unknown) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
    }) => void
  ) {
    class MockWebkitSpeechRecognition {
      lang = 'en-US';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onstart?.();
        behavior(this);
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: MockWebkitSpeechRecognition,
      configurable: true,
    });
  }

  it('captures spoken transcript via webkitSpeechRecognition and inserts it into the field', async () => {
    installMockWebkitRecognition((rec) => {
      rec.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'Abebe Bikila' }], { isFinal: true }),
        ],
      });
      rec.onend?.();
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);
    await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    await user.click(screen.getByRole('button', { name: /Start microphone/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Review what we heard/i)).toHaveValue('Abebe Bikila');
    });

    await user.click(screen.getByRole('button', { name: /Use this text/i }));
    expect(screen.getByLabelText(/Full name/i)).toHaveValue('Abebe Bikila');
  });

  it('shows a clear error instead of empty review when microphone stops with no speech', async () => {
    installMockWebkitRecognition((rec) => {
      rec.onend?.();
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);
    await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    await user.click(screen.getByRole('button', { name: /Start microphone/i }));

    await waitFor(() => {
      expect(screen.getByText(/No speech was heard/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Review what we heard/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try microphone again/i })).toBeInTheDocument();
  });

  it('recovers from permission denied and supports English dictation fallback when locale is unsupported', async () => {
    let attempt = 0;
    installMockWebkitRecognition((rec) => {
      attempt += 1;
      if (attempt === 1) {
        rec.onerror?.({ error: 'not-allowed' });
      } else if (rec.lang === 'om-ET') {
        rec.onerror?.({ error: 'language-not-supported' });
      } else {
        rec.onresult?.({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: 'Hanna Tesfaye' }], { isFinal: true }),
          ],
        });
        rec.onend?.();
      }
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);
    await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // 1. Permission denied state offers Retry button
    await user.click(screen.getByRole('button', { name: /Start microphone/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Microphone permission was blocked/i);
    });
    expect(screen.getByRole('button', { name: /Try microphone again/i })).toBeInTheDocument();

    // 2. Switch to Afaan Oromo without server STT -> offers English dictation fallback immediately
    await user.selectOptions(screen.getByLabelText(/Language/i), 'om');
    const fallbackBtn = await screen.findByRole('button', { name: /Ingiliffaan dubbadhu/i });
    await user.click(fallbackBtn);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Review what we heard|Waan dhagahame ilaalaa/i)
      ).toHaveValue('Hanna Tesfaye');
    });
  });

  it('captures MediaRecorder audio chunks via server STT and populates the field', async () => {
    resetCachedSpeechCapabilitiesForTest();
    const originalFetch = globalThis.fetch;
    const originalMediaRecorder = globalThis.MediaRecorder;
    const originalMediaDevices = navigator.mediaDevices;

    let recordedTimeslice: number | undefined;
    let requestedData = false;

    class MockMediaRecorder {
      static isTypeSupported = () => true;
      mimeType = 'audio/webm;codecs=opus';
      state: 'inactive' | 'recording' = 'inactive';
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start(timeslice?: number) {
        recordedTimeslice = timeslice;
        this.state = 'recording';
        this.ondataavailable?.({ data: new Blob([new Uint8Array(600)], { type: this.mimeType }) });
      }
      requestData() {
        requestedData = true;
      }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }

    try {
      Object.defineProperty(globalThis, 'MediaRecorder', {
        value: MockMediaRecorder,
        configurable: true,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: vi.fn() }],
          })),
        },
        configurable: true,
      });
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/speech/capabilities')) {
          return new Response(
            JSON.stringify({ geminiConfigured: true, supportedLanguages: ['en', 'am', 'om'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/api/speech/stt')) {
          return new Response(
            JSON.stringify({ transcript: 'Dawit Mekonnen', detectedLanguage: 'en', provider: 'gemini-stt' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 404 });
      }) as typeof fetch;

      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);
      await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await user.click(screen.getByRole('button', { name: /Start microphone/i }));
      const stopBtn = await screen.findByRole('button', { name: /Stop microphone/i });
      expect(recordedTimeslice).toBe(250);

      await user.click(stopBtn);
      expect(requestedData).toBe(true);

      await waitFor(() => {
        expect(screen.getByLabelText(/Review what we heard/i)).toHaveValue('Dawit Mekonnen');
      });

      await user.click(screen.getByRole('button', { name: /Use this text/i }));
      expect(screen.getByLabelText(/Full name/i)).toHaveValue('Dawit Mekonnen');
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', {
        value: originalMediaRecorder,
        configurable: true,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
      globalThis.fetch = originalFetch;
      resetCachedSpeechCapabilitiesForTest();
    }
  });

  it('auto-falls back from webkitSpeechRecognition network error to MediaRecorder server STT seamlessly', async () => {
    resetCachedSpeechCapabilitiesForTest();
    const originalFetch = globalThis.fetch;
    const originalMediaRecorder = globalThis.MediaRecorder;
    const originalMediaDevices = navigator.mediaDevices;

    installMockWebkitRecognition((rec) => {
      rec.onerror?.({ error: 'network' });
    });

    class MockMediaRecorder {
      static isTypeSupported = () => true;
      mimeType = 'audio/webm;codecs=opus';
      state: 'inactive' | 'recording' = 'inactive';
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = 'recording';
        this.ondataavailable?.({ data: new Blob([new Uint8Array(600)], { type: this.mimeType }) });
      }
      requestData() {}
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }

    try {
      Object.defineProperty(globalThis, 'MediaRecorder', {
        value: MockMediaRecorder,
        configurable: true,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: vi.fn() }],
          })),
        },
        configurable: true,
      });
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/speech/capabilities')) {
          return new Response(
            JSON.stringify({ geminiConfigured: true, supportedLanguages: ['en', 'am', 'om'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/api/speech/stt')) {
          return new Response(
            JSON.stringify({ transcript: 'Selamawit Tadesse', detectedLanguage: 'en', provider: 'gemini-stt' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 404 });
      }) as typeof fetch;

      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);
      await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
      await user.click(screen.getByRole('button', { name: /Continue/i }));

      await user.click(screen.getByRole('button', { name: /Start microphone/i }));
      const stopBtn = await screen.findByRole('button', { name: /Stop microphone/i });
      await user.click(stopBtn);

      await waitFor(() => {
        expect(screen.getByLabelText(/Review what we heard/i)).toHaveValue('Selamawit Tadesse');
      });
    } finally {
      Object.defineProperty(globalThis, 'MediaRecorder', {
        value: originalMediaRecorder,
        configurable: true,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
      globalThis.fetch = originalFetch;
      resetCachedSpeechCapabilitiesForTest();
    }
  });
});

describe('VoiceConversationFilter (SpeechRecognition States, Job Filtering & WCAG 2.2 AA)', () => {
  const originalSpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

  afterEach(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: originalSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: originalWebkitSpeechRecognition,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('filters CareerGateway jobs via native SpeechRecognition, handles errors, and shows Ready/Listening/Error states', async () => {
    let attempt = 0;
    class MockFilterRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        attempt += 1;
        this.onstart?.();
        if (attempt === 1) {
          this.onerror?.({ error: 'not-allowed' });
          return;
        }
        this.onresult?.({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: 'Remote screen reader jobs' }], { isFinal: true }),
          ],
        });
        this.onend?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockFilterRecognition,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Accessible Jobs/i }));
    await waitFor(() => {
      expect(screen.getByText(/Voice Filter & Real-Time Conversation/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/State: Ready/i)).toBeInTheDocument();

    // First attempt -> permission error state
    await user.click(screen.getByRole('button', { name: /Speak to Filter Jobs/i }));
    await waitFor(() => {
      expect(screen.getByText(/State: Error/i)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Microphone access was blocked/i);
    });

    // Retry -> filters jobs cleanly and returns to Ready
    await user.click(screen.getByRole('button', { name: /Try again/i }));
    await waitFor(() => {
      expect(screen.getByText(/State: Ready/i)).toBeInTheDocument();
      expect(screen.getByText(/Recognized speech:/i)).toBeInTheDocument();
    });

    const remoteBtn = screen.getByRole('button', { name: /Remote or flexible work/i });
    expect(remoteBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Hands-Free Wake-Phrase Trigger (useVoiceTrigger + VoiceTriggerToggle)', () => {
  const originalSpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'SpeechRecognition', {
      value: originalSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: originalWebkitSpeechRecognition,
      configurable: true,
    });
    if (originalSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalSecureContext);
    }
    vi.restoreAllMocks();
  });

  it('normalizes punctuation/casing cleanly when matching wake phrases', () => {
    expect(matchesWakePhrase('Hey Access!', ['Hey Access'])).toBe(true);
    expect(matchesWakePhrase('Hey, assistant!', ['hey assistant'])).toBe(true);
    expect(matchesWakePhrase('Could you open now hey access please', ['Hey Access'])).toBe(true);
    expect(matchesWakePhrase('hello world', ['Hey Access', 'hey assistant'])).toBe(false);
  });

  it('shows Unsupported status when SpeechRecognition or HTTPS is unavailable', async () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<App />);

    const wakeBtn = screen.getByRole('button', { name: /wake microphone/i });
    expect(wakeBtn).toHaveTextContent(/Unsupported/i);
    expect(wakeBtn).toHaveAttribute('aria-disabled', 'true');

    await user.click(wakeBtn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/HTTPS/i);
    });
  });

  it('listens continuously, opens VoiceAssistantPanel on "hey assistant", pauses while open, and auto-restarts on disconnect', async () => {
    const instances: Array<{
      onstart: (() => void) | null;
      onresult: ((ev: unknown) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
      emitPhrase: (phrase: string) => void;
      emitEnd: () => void;
    }> = [];
    let startCount = 0;

    class MockContinuousRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        startCount += 1;
        instances.push(this);
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {}
      emitPhrase(phrase: string) {
        this.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript: phrase }], { isFinal: true })],
        });
      }
      emitEnd() {
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockContinuousRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const user = userEvent.setup();
    const { container } = render(<App />);

    const wakeBtn = screen.getByRole('button', { name: /wake microphone/i });
    expect(wakeBtn).toHaveTextContent(/Muted/i);
    expect(wakeBtn).toHaveAttribute('aria-pressed', 'false');

    // Toggle on -> Listening
    await user.click(wakeBtn);
    expect(wakeBtn).toHaveTextContent(/Listening/i);
    expect(wakeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(startCount).toBe(1);

    // Simulate transient browser disconnect -> auto-restarts session cleanly
    act(() => {
      instances[0].emitEnd();
    });
    await waitFor(() => {
      expect(startCount).toBeGreaterThanOrEqual(2);
    });

    // Speak wake phrase -> opens VoiceAssistantPanel modal and pauses wake mic
    act(() => {
      instances[instances.length - 1].emitPhrase('Hey Access');
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(wakeBtn).toHaveTextContent(/Paused/i);
    });

    // Close modal -> resumes Listening cleanly
    await user.click(screen.getByRole('button', { name: /Close assistant/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(wakeBtn).toHaveTextContent(/Listening/i);
    });

    // Check WCAG compliance with active toggle
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('stops cleanly and announces error without infinite restart when microphone permission is denied', async () => {
    let startCount = 0;

    class MockDeniedRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        startCount += 1;
        this.onstart?.();
        this.onerror?.({ error: 'not-allowed' });
      }
      stop() {}
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockDeniedRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<App />);

    const wakeBtn = screen.getByRole('button', { name: /wake microphone/i });
    await user.click(wakeBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Microphone permission was blocked/i);
      expect(wakeBtn).toHaveTextContent(/Muted/i);
    });
    expect(startCount).toBe(1);
  });

  it('tracks isListening, isSupported, and hasPermission explicitly and prevents duplicate start() calls', async () => {
    let startCount = 0;

    class MockGuardedRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        startCount += 1;
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockGuardedRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const onTrigger = vi.fn();
    const { result } = renderHook(() =>
      useVoiceTrigger({
        autoRestartDelayMs: 25,
        onTrigger,
      })
    );

    expect(result.current.isSupported).toBe(true);
    expect(result.current.isListening).toBe(false);
    expect(result.current.isRecognitionActive).toBe(false);

    act(() => {
      result.current.startListening();
    });

    await waitFor(() => {
      expect(result.current.isListening).toBe(true);
      expect(result.current.isRecognitionActive).toBe(true);
      expect(result.current.hasPermission).toBe(true);
    });
    expect(startCount).toBe(1);

    // Calling startListening() repeatedly while active must NOT trigger duplicate recognition.start() calls
    act(() => {
      result.current.startListening();
      result.current.startListening();
    });
    expect(startCount).toBe(1);

    act(() => {
      result.current.stopListening();
    });
    expect(result.current.isListening).toBe(false);
    expect(result.current.isRecognitionActive).toBe(false);
  });

  it('recovers seamlessly from no-speech, transient network/aborted events, and InvalidStateError without dropping isListening', async () => {
    let attempt = 0;
    const instances: Array<{
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
    }> = [];

    class MockResilientRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        attempt += 1;
        instances.push(this);
        if (attempt === 2) {
          const domErr = new Error('recognition has already started');
          domErr.name = 'InvalidStateError';
          throw domErr;
        }
        this.onstart?.();
      }
      stop() {}
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockResilientRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useVoiceTrigger({
        autoRestartDelayMs: 20,
        maxConsecutiveErrors: 5,
        onTrigger: vi.fn(),
      })
    );

    act(() => {
      result.current.startListening();
    });

    await waitFor(() => {
      expect(attempt).toBe(1);
      expect(result.current.isListening).toBe(true);
    });

    // Silence timeout + unexpected drop -> schedules attempt 2 (which throws InvalidStateError) -> auto-recovers on attempt 3
    act(() => {
      instances[0].onerror?.({ error: 'no-speech' });
      instances[0].onerror?.({ error: 'network' });
      instances[0].onerror?.({ error: 'aborted' });
      instances[0].onend?.();
    });

    await waitFor(
      () => {
        expect(attempt).toBe(3);
      },
      { timeout: 2000 }
    );

    expect(result.current.isListening).toBe(true);
    expect(result.current.error).toBeNull();

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('announces microphone state transitions and errors via ARIA live region and native SpeechSynthesis', async () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalUtterance = window.SpeechSynthesisUtterance;

    class MockSpeechSynthesisUtterance {
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      lang = 'en-US';
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockSpeechSynthesisUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [{ lang: 'en-US', name: 'English US' } as SpeechSynthesisVoice],
        speak: speakMock,
        cancel: cancelMock,
      },
      configurable: true,
    });

    class MockCueRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onstart?.();
      }
      stop() {}
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockCueRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<App />);

    const wakeBtn = screen.getByRole('button', { name: /wake microphone/i });
    await user.click(wakeBtn);

    await waitFor(() => {
      const texts = speakMock.mock.calls.map((c) => (c[0] as { text: string }).text);
      expect(texts.some((txt) => /listening for "Hey Access"/i.test(txt))).toBe(true);
    });

    await user.click(wakeBtn);
    await waitFor(() => {
      const texts = speakMock.mock.calls.map((c) => (c[0] as { text: string }).text);
      expect(texts.some((txt) => /microphone muted/i.test(txt))).toBe(true);
    });

    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: originalUtterance,
      configurable: true,
    });
  });

  it('pauses in background tabs, suppresses self-voice playback echoes, and ignores low-confidence background noise', async () => {
    const instances: Array<{
      onstart: (() => void) | null;
      onresult: ((ev: unknown) => void) | null;
    }> = [];

    class MockFilterRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        instances.push(this);
        this.onstart?.();
      }
      stop() {}
      abort() {}
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockFilterRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    const onTrigger = vi.fn();
    let assistantSpeaking = false;
    const { result } = renderHook(() =>
      useVoiceTrigger({
        wakePhrase: 'Hey Access',
        minConfidence: 0.35,
        shouldIgnoreResult: () => assistantSpeaking,
        onTrigger,
      })
    );

    act(() => {
      result.current.startListening();
    });
    await waitFor(() => {
      expect(result.current.isListening).toBe(true);
    });

    // Low-confidence background noise must NOT trigger wake word
    act(() => {
      instances[instances.length - 1].onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Hey Access', confidence: 0.12 }], { isFinal: true })],
      });
    });
    expect(onTrigger).not.toHaveBeenCalled();

    // Self-voice playback echo suppression
    assistantSpeaking = true;
    act(() => {
      instances[instances.length - 1].onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Hey Access', confidence: 0.95 }], { isFinal: true })],
      });
    });
    expect(onTrigger).not.toHaveBeenCalled();
    assistantSpeaking = false;

    // Legitimate confident wake phrase triggers cleanly
    act(() => {
      instances[instances.length - 1].onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Hey Access', confidence: 0.92 }], { isFinal: true })],
      });
    });
    expect(onTrigger).toHaveBeenCalledTimes(1);

    // Background tab pauses listener cleanly and visible resumes
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isPaused).toBe(true);
    expect(result.current.isListening).toBe(false);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isListening).toBe(true);
  });
});

describe('Three-Language Read-Aloud Support (en / am-ET / om-ET), Anti-Substitution & Non-Overlapping', () => {
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetCachedSpeechCapabilitiesForTest();
  });

  afterEach(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: originalUtterance,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('speaks English, Amharic (am-ET), and Afaan Oromo (om-ET) with exact native voices, never cross-substitutes AM/OM, and stops prior speech on language change', async () => {
    const spokenUtterances: Array<{ text: string; lang: string; voiceName?: string }> = [];
    const cancelSpy = vi.fn();

    let currentVoices: SpeechSynthesisVoice[] = [
      { name: 'English US', lang: 'en-US', default: true, localService: true, voiceURI: 'en-US' } as SpeechSynthesisVoice,
      { name: 'Amharic Ethiopia', lang: 'am-ET', default: false, localService: true, voiceURI: 'am-ET' } as SpeechSynthesisVoice,
      { name: 'Afaan Oromo Ethiopia', lang: 'om-ET', default: false, localService: true, voiceURI: 'om-ET' } as SpeechSynthesisVoice,
    ];

    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const speakSpy = vi.fn((u: MockUtterance) => {
      spokenUtterances.push({ text: u.text, lang: u.lang, voiceName: u.voice?.name });
      u.onstart?.();
    });

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => currentVoices,
        speak: speakSpy,
        cancel: cancelSpy,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onvoiceschanged: null,
      },
      configurable: true,
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ geminiConfigured: false, supportedLanguages: ['en', 'am', 'om'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const user = userEvent.setup();
    render(<App />);

    // 1. English orientation read-aloud uses en-US
    await user.click(screen.getByRole('button', { name: /Announce my exact page location/i }));
    expect(spokenUtterances).toHaveLength(1);
    expect(spokenUtterances[0].lang).toBe('en-US');
    expect(spokenUtterances[0].voiceName).toBe('English US');

    // 2. Switch website language to Amharic -> cancels prior speech immediately & uses am-ET
    const cancelBeforeSwitch = cancelSpy.mock.calls.length;
    await user.selectOptions(screen.getByLabelText(/Language/i), 'am');
    expect(cancelSpy.mock.calls.length).toBeGreaterThan(cancelBeforeSwitch);

    await user.click(screen.getByRole('button', { name: /ያሉበትን ገጽ/i }));
    expect(spokenUtterances).toHaveLength(2);
    expect(spokenUtterances[1].lang).toBe('am-ET');
    expect(spokenUtterances[1].voiceName).toBe('Amharic Ethiopia');
    expect(spokenUtterances[1].text).toMatch(/[\u1200-\u137F]/);

    // 3. Switch website language to Afaan Oromo -> cancels Amharic speech & uses om-ET (even if Oromo text mentions "(አማርኛ)")
    await user.selectOptions(screen.getByLabelText(/^(Language|ቋንቋ|Afaan)$/i), 'om');
    await user.click(screen.getByRole('button', { name: /Bakka fuula keessanii/i }));
    expect(spokenUtterances).toHaveLength(3);
    expect(spokenUtterances[2].lang).toBe('om-ET');
    expect(spokenUtterances[2].voiceName).toBe('Afaan Oromo Ethiopia');

    // Predominantly Latin Oromo text containing "(አማርኛ)" MUST still use om-ET, never substituted with Amharic!
    expect(detectLanguageFromText('Afaan kee filadhu: Afaan Oromoo ykn (አማርኛ)', 'om')).toBe('om');
    await speakText('Afaan kee filadhu: Afaan Oromoo ykn (አማርኛ)', 'om');
    expect(spokenUtterances[3].lang).toBe('om-ET');
    expect(spokenUtterances[3].voiceName).toBe('Afaan Oromo Ethiopia');

    // 4. Remove Afaan Oromo voice (leaving English + Amharic only) -> NEVER substitutes Amharic or English for Afaan Oromo!
    currentVoices = [
      { name: 'English US', lang: 'en-US', default: true, localService: true, voiceURI: 'en-US' } as SpeechSynthesisVoice,
      { name: 'Amharic Ethiopia', lang: 'am-ET', default: false, localService: true, voiceURI: 'am-ET' } as SpeechSynthesisVoice,
    ];
    const spokenCountBeforeMissingOm = spokenUtterances.length;
    const missingOmErrors: string[] = [];
    await speakText('Galmee salphaa fi carraa hojii mijataa.', 'om', undefined, undefined, (err) =>
      missingOmErrors.push(err)
    );
    expect(spokenUtterances).toHaveLength(spokenCountBeforeMissingOm);
    expect(missingOmErrors[0]).toMatch(/No authentic/i);

    // 5. Same guard in reverse: remove Amharic voice (leaving English + Oromo only) -> NEVER substitutes Oromo or English for Amharic!
    currentVoices = [
      { name: 'English US', lang: 'en-US', default: true, localService: true, voiceURI: 'en-US' } as SpeechSynthesisVoice,
      { name: 'Afaan Oromo Ethiopia', lang: 'om-ET', default: false, localService: true, voiceURI: 'om-ET' } as SpeechSynthesisVoice,
    ];
    const missingAmErrors: string[] = [];
    await speakText('ቀላል ምዝገባ እና ተደራሽ የስራ እድሎች።', 'am', undefined, undefined, (err) =>
      missingAmErrors.push(err)
    );
    expect(spokenUtterances).toHaveLength(spokenCountBeforeMissingOm);
    expect(missingAmErrors[0]).toMatch(/No authentic/i);
  });

  it('prevents overlapping announcements across multiple ReadAloudButton clicks in Amharic & Oromo', async () => {
    const activeUtterances: Array<{ text: string; lang: string }> = [];
    const cancelSpy = vi.fn();

    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [
          { name: 'Amharic Ethiopia', lang: 'am-ET', default: false, localService: true, voiceURI: 'am-ET' } as SpeechSynthesisVoice,
          { name: 'Afaan Oromo Ethiopia', lang: 'om-ET', default: false, localService: true, voiceURI: 'om-ET' } as SpeechSynthesisVoice,
        ],
        speak: vi.fn((u: MockUtterance) => {
          activeUtterances.push({ text: u.text, lang: u.lang });
          u.onstart?.();
        }),
        cancel: cancelSpy,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onvoiceschanged: null,
      },
      configurable: true,
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ geminiConfigured: false, supportedLanguages: ['en', 'am', 'om'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText(/Language/i), 'am');
    const readBtns = screen.getAllByRole('button', { name: /በድምፅ አንብብ/i });
    expect(readBtns.length).toBeGreaterThanOrEqual(2);
    await user.click(readBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /ማንበብ አቁም/i })).toHaveLength(1);
      expect(activeUtterances[0]?.lang).toBe('am-ET');
    });

    // Clicking a second ReadAloudButton stops the first button and avoids overlapping speech
    const cancelsBeforeSecond = cancelSpy.mock.calls.length;
    await user.click(readBtns[1]);
    await waitFor(() => {
      expect(cancelSpy.mock.calls.length).toBeGreaterThan(cancelsBeforeSecond);
      expect(screen.getAllByRole('button', { name: /ማንበብ አቁም/i })).toHaveLength(1);
      expect(activeUtterances[1]?.lang).toBe('am-ET');
    });

    // Clicking Stop cancels active Amharic speech cleanly
    const cancelsBeforeStop = cancelSpy.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /ማንበብ አቁም/i }));
    expect(cancelSpy.mock.calls.length).toBeGreaterThan(cancelsBeforeStop);
    expect(screen.queryByRole('button', { name: /ማንበብ አቁም/i })).not.toBeInTheDocument();

    // Switch to Afaan Oromo and verify ReadAloudButton reads Oromo text with om-ET
    await user.selectOptions(screen.getByLabelText(/^(Language|ቋንቋ|Afaan)$/i), 'om');
    const omReadBtns = screen.getAllByRole('button', { name: /sagaleedhaan dubbisi/i });
    await user.click(omReadBtns[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dubbisuu dhaabi/i })).toBeInTheDocument();
      expect(activeUtterances[activeUtterances.length - 1]?.lang).toBe('om-ET');
    });
  });
});



