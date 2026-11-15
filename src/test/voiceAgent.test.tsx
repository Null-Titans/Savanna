import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import App from '../App';
import { resetCachedSpeechCapabilitiesForTest } from '../services/speech/speechService';

import { pruneWebsiteStateForPrompt } from '../../server/assistantPrompt';
import {
  compressConversationHistory,
  GEMINI_MODELS,
  isQuotaExceededError,
  selectAssistantRoute,
} from '../../server/geminiConfig';

function mockOfflineAssistantServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/speech/capabilities')) {
      return new Response(
        JSON.stringify({ geminiConfigured: false, supportedLanguages: ['en', 'am', 'om'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/speech/assistant')) {
      const body = JSON.parse(String(init?.body || '{}')) as { language?: string; message?: string };
      const msg = body.message || '';
      const detected =
        /[\u1200-\u137F]/.test(msg)
          ? 'am'
          : /\b(galmee|hojii|barnoota|dukkana|eeyyee|lakkii|akkam)\b/i.test(msg)
          ? 'om'
          : body.language || 'en';
      return new Response(
        JSON.stringify({
          status: 'offline',
          replyText: 'Fallback',
          language: detected,
          provider: 'offline-fallback',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

describe('Voice-First End-to-End Platform Workflows (Tool Execution + Fallback + Multi-Lang)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    resetCachedSpeechCapabilitiesForTest();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('completes a full multi-step voice registration with field explanation, correction, no-ID route, and explicit confirmation', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const submittedEvents: CustomEvent[] = [];
    const onDone = (ev: Event) => submittedEvents.push(ev as CustomEvent);
    window.addEventListener('db-signup:done', onDone);

    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      const sendVoiceCommand = async (cmd: string) => {
        const dialog = screen.getByRole('dialog');
        const input = within(dialog).getByRole('textbox');
        await user.type(input, cmd);
        await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));
      };

      // 1. Start registration via voice -> switches background page to Onboarding Step 1
      await sendVoiceCommand('I want to register');
      await waitFor(() => {
        expect(screen.getByText(/Question 1 of 6/i)).toBeInTheDocument();
        expect(
          screen.getByRole('heading', { name: /Before we start: are you on a shared phone/i })
        ).toBeInTheDocument();
      });

      // 2. Answer device check
      await sendVoiceCommand('no, my own device');
      await waitFor(() => {
        expect(screen.getByText(/Question 2 of 6: What is your full name/i)).toBeInTheDocument();
      });

      // 3. Enter full name
      await sendVoiceCommand('My name is Selam Tesfaye');
      await waitFor(() => {
        expect(screen.getByText(/Saved your name as Selam Tesfaye/i)).toBeInTheDocument();
      });

      // 4. Ask for field explanation before answering contact
      await sendVoiceCommand('explain why');
      await waitFor(() => {
        expect(screen.getByText(/Contact details are optional/i)).toBeInTheDocument();
      });

      // 5. Enter Ethiopian phone number -> normalized to +251911223344
      await sendVoiceCommand('0911223344');
      await waitFor(() => {
        expect(screen.getByText(/Question 4 of 6: Choose an identity option/i)).toBeInTheDocument();
      });

      // 6. Correct previous field mid-flow
      await sendVoiceCommand('change my name to Hanna Bekele');
      await waitFor(() => {
        expect(screen.getByText(/Updated your full name to Hanna Bekele/i)).toBeInTheDocument();
      });

      // 7. Choose "no documents" (no Kebele ID / passport required)
      await sendVoiceCommand('I do not have documents');
      await waitFor(() => {
        expect(screen.getByText(/Question 5 of 6/i)).toBeInTheDocument();
      });

      // 8. Skip optional private support step -> lands on Review Summary & Confirmation gate
      await sendVoiceCommand('skip');
      await waitFor(() => {
        expect(screen.getByText(/Here is your registration summary: Name is Hanna Bekele/i)).toBeInTheDocument();
      });
      expect(submittedEvents.length).toBe(0);

      // 9. Explicit user confirmation submits the real registration form
      await sendVoiceCommand('yes, submit');
      await waitFor(() => {
        expect(screen.getByText(/Confirmed! Your registration is submitted/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Registration ready/i })).toBeInTheDocument();
      });
      expect(submittedEvents.length).toBe(1);
      expect(submittedEvents[0].detail.profile.fullName).toBe('Hanna Bekele');
    } finally {
      window.removeEventListener('db-signup:done', onDone);
    }
  });

  it('searches real jobs, reads job details, completes and submits a job application via voice', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const jobEvents: CustomEvent[] = [];
    const onApplied = (ev: Event) => jobEvents.push(ev as CustomEvent);
    window.addEventListener('gateway:job-applied', onApplied);

    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      const sendVoiceCommand = async (cmd: string) => {
        const dialog = screen.getByRole('dialog');
        const input = within(dialog).getByRole('textbox');
        await user.type(input, cmd);
        await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));
      };

      // Search remote + screen-reader jobs -> navigates to CareerGateway and filters real jobs
      await sendVoiceCommand('find remote screen reader jobs');
      await waitFor(() => {
        expect(screen.getByText(/I opened Accessible Jobs and found/i)).toBeInTheDocument();
        expect(screen.getByText(/Junior Customer Support Specialist/i)).toBeInTheDocument();
      });

      // Ask for details of job 1
      await sendVoiceCommand('details about job 1');
      await waitFor(() => {
        expect(screen.getByText(/Accommodations offered:/i)).toBeInTheDocument();
      });

      // Apply for job 1 -> opens real JobApplicationFlow and steps through
      await sendVoiceCommand('apply for job 1');
      await waitFor(() => {
        expect(screen.getByText(/Opened job application for Junior Customer Support Specialist/i)).toBeInTheDocument();
      });

      await sendVoiceCommand('Abebe Bikila');
      await waitFor(() => {
        expect(screen.getByText(/Entered your name as Abebe Bikila/i)).toBeInTheDocument();
      });

      await sendVoiceCommand('0911445566');
      await waitFor(() => {
        expect(screen.getByText(/Saved contact 0911445566/i)).toBeInTheDocument();
      });

      await sendVoiceCommand('Customer support and Amharic chat');
      await waitFor(() => {
        expect(screen.getByText(/Saved your experience/i)).toBeInTheDocument();
      });

      await sendVoiceCommand('keep private');
      await waitFor(() => {
        expect(screen.getByText(/Ready to review your application/i)).toBeInTheDocument();
      });
      expect(jobEvents.length).toBe(0);

      await sendVoiceCommand('yes, submit');
      await waitFor(() => {
        expect(
          screen.getByText(/Confirmed! Your application for Junior Customer Support Specialist has been submitted/i)
        ).toBeInTheDocument();
      });
      expect(jobEvents.length).toBe(1);
    } finally {
      window.removeEventListener('gateway:job-applied', onApplied);
    }
  });

  it('controls Dark Mode, Easy Read, Learning Resources, Profile Read, and Confirmation-Gated Delete + WCAG check', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    window.localStorage.setItem(
      'gw_mock_learner_profile_v1',
      JSON.stringify({
        id: 'learner-99',
        fullName: 'Marta Girma',
        contactMethod: 'phone',
        contactValue: '+251911000111',
        identityRoute: 'no_documents',
        registrationMode: 'self',
        updatedAtIso: new Date().toISOString(),
      })
    );

    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const sendVoiceCommand = async (cmd: string) => {
      const dialog = screen.getByRole('dialog');
      const input = within(dialog).getByRole('textbox');
      await user.type(input, cmd);
      await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));
    };

    // Dark mode toggle via voice
    await sendVoiceCommand('turn on dark mode');
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    // Easy Read toggle via voice
    await sendVoiceCommand('turn on easy read');
    await waitFor(() => {
      expect(container.querySelector('.gw-easy-read')).toBeInTheDocument();
    });

    // Learning resources navigation + filtering
    await sendVoiceCommand('show AI courses');
    await waitFor(() => {
      expect(screen.getByText(/I opened ALX Learning Resources/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /ALX AI Career Essentials/i })).toBeInTheDocument();
    });

    // Profile lookup
    await sendVoiceCommand('check my profile');
    await waitFor(() => {
      expect(screen.getByText(/Your saved name is Marta Girma/i)).toBeInTheDocument();
    });

    // Profile delete must ask confirmation first and respect "no"
    await sendVoiceCommand('delete my profile');
    await waitFor(() => {
      expect(screen.getByText(/Warning: deleting your saved profile/i)).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('gw_mock_learner_profile_v1')).not.toBeNull();

    await sendVoiceCommand('no');
    await waitFor(() => {
      expect(screen.getByText(/cancelled that action/i)).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('gw_mock_learner_profile_v1')).not.toBeNull();

    // Confirm delete
    await sendVoiceCommand('delete my profile');
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getAllByText(/Warning: deleting your saved profile/i).length
      ).toBeGreaterThanOrEqual(2);
    });
    await sendVoiceCommand('yes, delete');
    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText(/permanently deleted/i)).toBeInTheDocument();
      expect(window.localStorage.getItem('gw_mock_learner_profile_v1')).toBeNull();
    });

    // Switch to Amharic via voice
    await sendVoiceCommand('ምዝገባ ጀምር');
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getByText(/የተማሪ ምዝገባን ከፍቼ ደረጃ 1ን ጀምሬያለሁ/i)
      ).toBeInTheDocument();
    });

    // Switch to Afaan Oromo via voice
    await sendVoiceCommand('Hojii barbaadi');
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getByText(/Hojiiwwan mijatoo baneera/i)
      ).toBeInTheDocument();
    });

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('executes Gemini server-returned FunctionDeclaration toolCalls and returns continuation toolResponses', async () => {
    const continuationBodies: Array<Record<string, unknown>> = [];
    let callCount = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/speech/capabilities')) {
        return new Response(
          JSON.stringify({ geminiConfigured: true, supportedLanguages: ['en', 'am', 'om'] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/speech/assistant')) {
        callCount += 1;
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        if (!body.continuation) {
          return new Response(
            JSON.stringify({
              status: 'tool_calls',
              toolCalls: [
                {
                  id: 'fc-1',
                  name: 'search_jobs',
                  args: { categories: ['remote_flexible'], navigateToCareers: true },
                },
              ],
              contentsSoFar: [{ role: 'user', parts: [{ text: 'Show remote roles' }] }],
              language: 'en',
              provider: 'gemini-assistant',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        continuationBodies.push(body);
        return new Response(
          JSON.stringify({
            status: 'complete',
            replyText: 'I opened Accessible Jobs and filtered for remote roles.',
            language: 'en',
            provider: 'gemini-assistant',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Show remote roles');
    await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/I opened Accessible Jobs and filtered for remote roles/i)
      ).toBeInTheDocument();
    });

    expect(callCount).toBe(2);
    expect(continuationBodies.length).toBe(1);
    const sentResponses = (continuationBodies[0].continuation as { toolResponses: Array<{ name: string; response: { totalMatches: number } }> }).toolResponses;
    expect(sentResponses[0].name).toBe('search_jobs');
    expect(sentResponses[0].response.totalMatches).toBeGreaterThanOrEqual(3);
  });

  it('never automatically speaks page explanations on load or navigation, and only speaks when explicitly requested', async () => {
    const speakMock = vi.fn((u: { onstart?: () => void; onend?: () => void }) => {
      u.onstart?.();
      setTimeout(() => u.onend?.(), 0);
    });
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalUtterance = window.SpeechSynthesisUtterance;

    class MockUtterance {
      text: string;
      lang = 'en-US';
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
        getVoices: () => [{ lang: 'en-US', name: 'English US' } as SpeechSynthesisVoice],
        speak: speakMock,
        cancel: vi.fn(),
      },
      configurable: true,
    });

    try {
      const user = userEvent.setup();
      render(<App />);

      // Navigate across pages -> ZERO automatic voice playback
      const banner = screen.getByRole('banner');
      await user.click(within(banner).getByRole('button', { name: /Learning Resources/i }));
      await user.click(within(banner).getByRole('button', { name: /Accessible Jobs/i }));
      expect(speakMock).not.toHaveBeenCalled();

      // Explicit request ("Where am I?") triggers speech output intentionally
      await user.click(screen.getByRole('button', { name: /Announce my exact page location/i }));
      expect(speakMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        configurable: true,
      });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: originalUtterance,
        configurable: true,
      });
    }
  });

  it('runs hands-free Hey Access 7-state continuous loop across multiple turns and exits cleanly on Goodbye', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalUtterance = window.SpeechSynthesisUtterance;
    const spokenTexts: string[] = [];

    class MockUtterance {
      text: string;
      lang = 'en-US';
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
        getVoices: () => [{ lang: 'en-US', name: 'English US' } as SpeechSynthesisVoice],
        speak: vi.fn((u: MockUtterance) => {
          spokenTexts.push(u.text);
          u.onstart?.();
          setTimeout(() => u.onend?.(), 5);
        }),
        cancel: vi.fn(),
      },
      configurable: true,
    });

    const sessions: Array<{
      continuous: boolean;
      onstart: (() => void) | null;
      onresult: ((ev: unknown) => void) | null;
      onend: (() => void) | null;
      stop: () => void;
      emitSpeech: (text: string) => void;
    }> = [];

    class MockLoopSpeechRecognition {
      lang = 'en-US';
      interimResults = true;
      continuous = true;
      maxAlternatives = 3;
      onstart: (() => void) | null = null;
      onresult: ((ev: unknown) => void) | null = null;
      onerror: ((ev: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        sessions.push(this);
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      abort() {}
      emitSpeech(text: string) {
        this.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript: text, confidence: 0.94 }], { isFinal: true })],
        });
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockLoopSpeechRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    try {
      const user = userEvent.setup();
      render(<App />);

      const wakeBtn = screen.getByRole('button', { name: /wake microphone/i });
      await user.click(wakeBtn);

      // 1. User says "Hey Access" -> opens modal & greets aloud
      const wakeSession = sessions[0];
      wakeSession.emitSpeech('Hey Access');

      const dialog = await screen.findByRole('dialog');
      await waitFor(() => {
        expect(within(dialog).getByText(/Hello! I'm listening\. How can I help you\?/i)).toBeInTheDocument();
        expect(spokenTexts.join(' ')).toMatch(/Hello! I'm listening/i);
      });

      // 2. Greeting TTS ended -> mic automatically opened for Turn 1 without repeating Hey Access
      await waitFor(() => {
        expect(sessions.length).toBeGreaterThanOrEqual(2);
      });
      const turn1Session = sessions[sessions.length - 1];
      turn1Session.emitSpeech('Explain this page');
      turn1Session.stop();

      await waitFor(() => {
        expect(within(dialog).getByText(/You are on the Home page/i)).toBeInTheDocument();
      });

      // 3. Reply TTS ended -> mic automatically re-opened for Turn 2 without saying Hey Access again
      await waitFor(() => {
        expect(sessions.length).toBeGreaterThanOrEqual(3);
      });
      const turn2Session = sessions[sessions.length - 1];
      turn2Session.emitSpeech('Goodbye');
      turn2Session.stop();

      // 4. Exit phrase speaks farewell, closes panel, and returns Wake Mic to Listening (waiting)
      await waitFor(() => {
        expect(spokenTexts.join(' ')).toMatch(/Goodbye! Say "Hey Access"/i);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(wakeBtn).toHaveTextContent(/Listening/i);
      });
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        configurable: true,
      });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: originalUtterance,
        configurable: true,
      });
    }
  });

  it('supports contextual follow-ups (remote filter -> read first -> apply), learning course enroll, login/skills updates, and explicit form explanations', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    window.localStorage.setItem(
      'gw_mock_learner_profile_v1',
      JSON.stringify({
        id: 'learner-77',
        fullName: 'Dawit Tadesse',
        contactMethod: 'phone',
        contactValue: '+251911778899',
        identityRoute: 'no_documents',
        registrationMode: 'self',
        updatedAtIso: new Date().toISOString(),
      })
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    const dialog = await screen.findByRole('dialog');
    const sendCmd = async (cmd: string) => {
      await user.type(within(dialog).getByRole('textbox'), cmd);
      await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));
    };

    // Log in / resume existing profile
    await sendCmd('I want to log in');
    await waitFor(() => {
      expect(within(dialog).getByText(/Welcome back, Dawit Tadesse/i)).toBeInTheDocument();
    });

    // Update phone + skills via voice
    await sendCmd('Change my phone number to 0911554433');
    await waitFor(() => {
      expect(within(dialog).getByText(/Updated your phone number to 0911554433/i)).toBeInTheDocument();
    });

    await sendCmd('Update my skills to React, TypeScript');
    await waitFor(() => {
      expect(within(dialog).getByText(/I can save your skills \("React, TypeScript"\)/i)).toBeInTheDocument();
    });
    await sendCmd('yes');
    await waitFor(() => {
      expect(within(dialog).getByText(/Confirmed\. Your profile changes have been saved/i)).toBeInTheDocument();
    });

    // Contextual job search: Search -> Refine -> Read first -> Apply for it
    await sendCmd('Find jobs');
    await waitFor(() => {
      expect(within(dialog).getByText(/I opened Accessible Jobs and found \d+ matching/i)).toBeInTheDocument();
    });

    await sendCmd('Only remote ones');
    await waitFor(() => {
      expect(within(dialog).getAllByText(/\(Remote\)/i).length).toBeGreaterThanOrEqual(2);
    });

    await sendCmd('Read the first one');
    await waitFor(() => {
      expect(within(dialog).getByText(/Accommodations offered:/i)).toBeInTheDocument();
    });

    await sendCmd('Apply for it');
    await waitFor(() => {
      expect(within(dialog).getByText(/(Started application for|Opened job application for)/i)).toBeInTheDocument();
    });

    // Explicit button & form explanations (without advancing form)
    await sendCmd('Explain this form');
    await waitFor(() => {
      expect(within(dialog).getByText(/Job Application form/i)).toBeInTheDocument();
    });

    await sendCmd('What does this button do?');
    await waitFor(() => {
      expect(within(dialog).getByText(/main controls on/i)).toBeInTheDocument();
    });

    // Learning courses search -> read -> enroll
    await sendCmd('Find software courses');
    await waitFor(() => {
      expect(within(dialog).getByText(/ALX Software Engineering/i)).toBeInTheDocument();
    });

    await sendCmd('Read this course description');
    await waitFor(() => {
      expect(within(dialog).getByText(/Assistive notes:/i)).toBeInTheDocument();
    });

    await sendCmd('Help me enroll');
    await waitFor(() => {
      expect(within(dialog).getByText(/Learner Registration step 1/i)).toBeInTheDocument();
    });
  });

  it('handles Gemini HTTP 429 quota limits gracefully via local agent and optimizes model routing & prompt tokens', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/speech/capabilities')) {
        return new Response(
          JSON.stringify({ geminiConfigured: true, supportedLanguages: ['en', 'am', 'om'] }),
          { status: 200 }
        );
      }
      if (url.includes('/api/speech/assistant')) {
        return new Response(
          JSON.stringify({
            code: 'ASSISTANT_QUOTA',
            error: 'Gemini voice assistant reached its rate limit. Switching to built-in website controls.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'show AI courses');
    await user.click(within(dialog).getByRole('button', { name: /Send/i }));

    // Despite 429 from Gemini API, user still completes navigation seamlessly
    await waitFor(() => {
      expect(within(dialog).getByText(/rate limit/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/I opened ALX Learning Resources/i)).toBeInTheDocument();
    });

    // Verify Gemini model routing & token optimization utilities
    const liteRoute = selectAssistantRoute('What can I do here?', false, 'home');
    expect(liteRoute.model).toBe(GEMINI_MODELS.lite);
    expect(liteRoute.includeTools).toBe(false);

    const actionRoute = selectAssistantRoute('Find remote developer jobs and apply', false, 'home');
    expect(actionRoute.model).toBe(GEMINI_MODELS.flash);
    expect(actionRoute.includeTools).toBe(true);

    const compressed = compressConversationHistory(
      Array.from({ length: 10 }, (_, idx) => ({
        role: (idx % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        text: `Turn ${idx + 1} conversation line`,
      })),
      () => false
    );
    expect(compressed.recentTurns).toHaveLength(4);
    expect(compressed.earlierSummary?.length).toBeGreaterThan(10);

    const pruned = pruneWebsiteStateForPrompt('career', {
      activeModule: 'career',
      onboarding: { currentStep: 2, draft: { fullName: 'Hidden', idNumber: '999' } },
      career: { searchQuery: 'remote', visibleJobs: [] },
      savedLearnerProfile: { fullName: 'Dawit', contactMethod: 'phone' },
    });
    expect(pruned?.hasSavedProfile).toBe(true);
    expect(pruned?.onboarding).toBeUndefined();
    expect(isQuotaExceededError(new Error('429 RESOURCE_EXHAUSTED'))).toBe(true);
  });
});
