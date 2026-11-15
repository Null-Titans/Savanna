import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import App from '../App';
import { resetCachedSpeechCapabilitiesForTest } from '../services/speech/speechService';
import {
  describeFocusedElement,
  formatPageArrivalAnnouncement,
} from '../utils/focusAnnouncement';
import { getLiveListeningGreeting, isGoodbyeCommand } from '../utils/voiceCommands';

function mockOfflineAssistantServer() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/speech/capabilities')) {
      return new Response(
        JSON.stringify({ geminiConfigured: true, supportedLanguages: ['en', 'am', 'om'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/speech/assistant')) {
      const body = JSON.parse(String(init?.body || '{}')) as { language?: string; message?: string };
      const msg = body.message || '';
      const detected =
        /[\u1200-\u137F]/.test(msg)
          ? 'am'
          : /\b(galmee|hojii|barnoota|dukkana|eeyyee|lakkii|akkam|maqaan|lakkoofsi)\b/i.test(msg)
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

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sentFrames: Array<Record<string, unknown>> = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    try {
      this.sentFrames.push(JSON.parse(data) as Record<string, unknown>);
    } catch {
      this.sentFrames.push({ raw: data });
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  emitServerMessage(payload: Record<string, unknown>) {
    this.readyState = MockWebSocket.OPEN;
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }
}

describe('Keyboard Navigation, Element Reader & Gemini Live Ctrl+Tab / Ctrl+Shift+A', () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalMediaDevices = navigator.mediaDevices;
  const originalAudioContext = window.AudioContext;
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    resetCachedSpeechCapabilitiesForTest();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    Object.defineProperty(window, 'AudioContext', {
      value: originalAudioContext,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: originalUtterance,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function setupLiveAudioAndWebSocketMocks(getUserMediaImpl?: () => Promise<MediaStream>) {
    const getUserMediaMock = vi.fn(
      getUserMediaImpl ||
        (async () =>
          ({
            getTracks: () => [{ stop: vi.fn() }],
          } as unknown as MediaStream))
    );

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });

    class MockAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createScriptProcessor() {
        return {
          onaudioprocess: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createBuffer(_ch: number, len: number, sr: number) {
        return {
          duration: len / sr,
          getChannelData: () => new Float32Array(len),
        };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
    });
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    return { getUserMediaMock };
  }

  it('activates Gemini Live via Ctrl+Tab without duplicate sessions, syncs live tool calls to forms, and exits cleanly on Stop listening', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const { getUserMediaMock } = setupLiveAudioAndWebSocketMocks();

    render(<App />);

    // Focus an element outside the dialog first so we can verify focus restoration on exit
    const regTrigger = within(screen.getByRole('banner')).getByRole('button', {
      name: /^Registration$/i,
    });
    act(() => {
      regTrigger.focus();
    });
    expect(document.activeElement).toBe(regTrigger);

    // 1. Press Ctrl + Tab -> opens VoiceAssistantPanel and starts Gemini Live session
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain('/api/speech/live');

    // 2. Server signals ready -> renders greeting & sends initial context + greet frames
    act(() => {
      ws.emitServerMessage({ type: 'ready' });
    });

    await waitFor(() => {
      expect(
        within(dialog).getByText("Hello! I'm listening. How can I help you?")
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/Live Voice Active \(gemini-3\.8-live\)/i)).toBeInTheDocument();
    });

    expect(ws.sentFrames.some((f) => f.type === 'context')).toBe(true);
    expect(ws.sentFrames.some((f) => f.type === 'greet')).toBe(true);

    // 3. Pressing Ctrl+Tab or Ctrl+Alt+Shift+A while active must NOT create a duplicate session
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'A', ctrlKey: true, altKey: true, shiftKey: true });
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(1);

    // 4. Gemini Live sends toolCalls to start registration and enter "Ismael Awel" -> visible UI updates
    act(() => {
      ws.emitServerMessage({
        type: 'toolCalls',
        calls: [
          { id: 'call-1', name: 'start_registration', args: { mode: 'self' } },
          { id: 'call-2', name: 'update_registration_answer', args: { fullName: 'Ismael Awel' } },
        ],
      });
    });

    await waitFor(() => {
      const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement | null;
      expect(nameInput).not.toBeNull();
      expect(nameInput?.value).toBe('Ismael Awel');
    });

    await waitFor(() => {
      expect(ws.sentFrames.some((f) => f.type === 'toolResponses')).toBe(true);
    });

    // 5. Voice exit command ("Stop listening") closes Gemini Live and the drawer cleanly
    act(() => {
      ws.emitServerMessage({ type: 'inputTranscript', text: 'Stop listening' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    // 6. Reopening via plain mouse click must NOT auto-start Gemini Live
    await userEvent.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    await screen.findByRole('dialog');
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('activates Gemini Live via Ctrl+Shift+A and handles microphone NotAllowedError gracefully', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    setupLiveAudioAndWebSocketMocks(async () => {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    });

    render(<App />);
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(
        within(dialog).getByText(/Microphone permission was denied/i)
      ).toBeInTheDocument();
    });
  });

  it('provides concise localized focus announcements in EN/AM/OM, masks passwords, supports Tab/Arrow/Enter keyboard navigation, and passes axe-core', async () => {
    // Unit-level verification of semantic element descriptions across EN / AM / OM
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.setAttribute('aria-label', 'Full name');
    expect(describeFocusedElement(inputEl, 'en')).toBe(
      'Full name. Input field. You can enter your text.'
    );
    expect(describeFocusedElement(inputEl, 'am')).toContain('የጽሑፍ ማስገቢያ ሳጥን');
    expect(describeFocusedElement(inputEl, 'om')).toContain('Iddoo galtee');

    const pwEl = document.createElement('input');
    pwEl.type = 'password';
    pwEl.value = 'SuperSecretPassword99!';
    pwEl.setAttribute('aria-label', 'Account password');
    const pwDescEn = describeFocusedElement(pwEl, 'en');
    expect(pwDescEn).toContain('Password input field. Text is hidden for privacy.');
    expect(pwDescEn).not.toContain('SuperSecretPassword99!');
    expect(describeFocusedElement(pwEl, 'am')).not.toContain('SuperSecretPassword99!');
    expect(describeFocusedElement(pwEl, 'om')).not.toContain('SuperSecretPassword99!');

    const navBtn = document.createElement('button');
    navBtn.textContent = 'Accessible Jobs';
    const navWrap = document.createElement('nav');
    navWrap.appendChild(navBtn);
    expect(describeFocusedElement(navBtn, 'en')).toBe(
      'Accessible Jobs. Navigation link. Press Enter to open.'
    );

    const selectEl = document.createElement('select');
    selectEl.setAttribute('aria-label', 'Language');
    const opt = document.createElement('option');
    opt.text = 'English (EN)';
    selectEl.appendChild(opt);
    expect(describeFocusedElement(selectEl, 'en')).toContain(
      'Language. Dropdown selector, English (EN). Use arrow keys to choose.'
    );

    const checkEl = document.createElement('input');
    checkEl.type = 'checkbox';
    checkEl.checked = true;
    checkEl.setAttribute('aria-label', 'Screen reader support');
    expect(describeFocusedElement(checkEl, 'en')).toBe(
      'Screen reader support. Checkbox, checked. Press Space to uncheck.'
    );

    expect(formatPageArrivalAnnouncement('Accessible Jobs', 'en')).toBe(
      'You are now on the Accessible Jobs page.'
    );
    expect(formatPageArrivalAnnouncement('ክፍት የስራ ቦታዎች', 'am')).toContain('አሁን በ');
    expect(formatPageArrivalAnnouncement('Hojiiwwan Mijatoo', 'om')).toContain('Amma fuula');

    expect(isGoodbyeCommand('Stop listening')).toBe(true);
    expect(isGoodbyeCommand('Goodbye')).toBe(true);
    expect(isGoodbyeCommand('ማዳመጥ አቁም')).toBe(true);
    expect(isGoodbyeCommand('Dhaggeeffachuu dhaabi')).toBe(true);
    expect(getLiveListeningGreeting('en')).toBe("Hello! I'm listening. How can I help you?");
    expect(getLiveListeningGreeting('am')).toContain('እያዳመጥኩ ነው');
    expect(getLiveListeningGreeting('om')).toContain('Dhaggeeffachaa jira');

    // Integration test on rendered <App /> with keyboard Tab, ArrowRight, and Enter
    const spokenTexts: string[] = [];
    class MockUtterance {
      text: string;
      lang = 'en-US';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
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
        }),
        cancel: vi.fn(),
      },
      configurable: true,
    });

    const user = userEvent.setup();
    const { container } = render(<App />);

    // Tab to Skip Link, then into header navigation
    await user.tab();
    const liveRegion = screen.getByTestId('gw-keyboard-focus-live');
    expect(liveRegion.textContent).toContain('Skip to main content');

    const banner = screen.getByRole('banner');
    const homeNavBtn = within(banner).getByRole('button', { name: /^Home$/i });
    act(() => {
      homeNavBtn.focus();
    });
    await waitFor(() => {
      expect(liveRegion.textContent).toContain('Home. Navigation link. Press Enter to open.');
    });

    // ArrowRight moves cleanly across header navigation links: Home -> Registration -> My Profile -> Accessible Jobs
    fireEvent.keyDown(homeNavBtn, { key: 'ArrowRight' });
    const regNavBtn = within(banner).getByRole('button', { name: /^Registration$/i });
    expect(document.activeElement).toBe(regNavBtn);
    await waitFor(() => {
      expect(liveRegion.textContent).toContain('Registration. Navigation link.');
    });

    fireEvent.keyDown(regNavBtn, { key: 'ArrowRight' });
    const profileNavBtn = within(banner).getByRole('button', { name: /^My Profile$/i });
    expect(document.activeElement).toBe(profileNavBtn);

    fireEvent.keyDown(profileNavBtn, { key: 'ArrowRight' });
    const jobsNavBtn = within(banner).getByRole('button', { name: /Accessible Jobs/i });
    expect(document.activeElement).toBe(jobsNavBtn);

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(liveRegion.textContent).toContain(
        'You are now on the Accessible Jobs & Career Gateway page.'
      );
      expect(
        spokenTexts.some((s) =>
          s.includes('You are now on the Accessible Jobs & Career Gateway page.')
        )
      ).toBe(true);
    });

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('synchronizes visible form inputs on direct name/email/phone switches across EN, AM, and OM without losing form data', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Voice Assistant/i }));
    const dialog = await screen.findByRole('dialog');

    const sendVoiceCommand = async (cmd: string) => {
      const input = within(dialog).getByRole('textbox');
      await user.type(input, cmd);
      await user.click(within(dialog).getByRole('button', { name: /Send|ላክ|Ergi/i }));
    };

    // 1. Open registration & speak name directly
    await sendVoiceCommand('Open registration');
    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 6/i)).toBeInTheDocument();
    });

    await sendVoiceCommand('My name is Ismael Awel');
    await waitFor(() => {
      const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement | null;
      expect(nameInput).not.toBeNull();
      expect(nameInput?.value).toBe('Ismael Awel');
    });

    // 2. Speak email directly -> switches visible contact step cleanly to email with value populated
    await sendVoiceCommand('My email is example@gmail.com');
    await waitFor(() => {
      const contactInput = document.getElementById('gw-onboarding-contact') as HTMLInputElement | null;
      expect(contactInput).not.toBeNull();
      expect(contactInput?.value).toBe('example@gmail.com');
      expect(contactInput?.getAttribute('inputmode')).toBe('email');
    });

    // 3. Switch to phone ("Now my phone number") without losing saved name, then enter phone number
    await sendVoiceCommand('Now my phone number');
    await waitFor(() => {
      const contactInput = document.getElementById('gw-onboarding-contact') as HTMLInputElement | null;
      expect(contactInput).not.toBeNull();
      expect(contactInput?.getAttribute('inputmode')).toBe('tel');
    });

    await sendVoiceCommand('My phone number is 0912345678');
    await waitFor(() => {
      const contactInput = document.getElementById('gw-onboarding-contact') as HTMLInputElement | null;
      expect(contactInput?.value).toBe('+251912345678');
    });

    // Navigate back to step 2 to confirm fullName remained intact
    await sendVoiceCommand('previous');
    await waitFor(() => {
      const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement | null;
      expect(nameInput?.value).toBe('Ismael Awel');
    });

    // Advance cleanly from step 2 to step 3, then test Amharic & Oromo cross-step direct sync
    await sendVoiceCommand('continue');
    await waitFor(() => {
      expect(document.getElementById('gw-onboarding-contact')).not.toBeNull();
    });

    // 4. Amharic direct field updates (name from contact step -> phone)
    await sendVoiceCommand('ስሜ አበበ በቀለ');
    await waitFor(() => {
      const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement | null;
      expect(nameInput?.value).toBe('አበበ በቀለ');
    });

    await sendVoiceCommand('ስልክ ቁጥሬ 0912345678');
    await waitFor(() => {
      const contactInput = document.getElementById('gw-onboarding-contact') as HTMLInputElement | null;
      expect(contactInput?.value).toBe('+251912345678');
    });

    // 5. Afaan Oromo direct field updates (name from contact step -> phone)
    await sendVoiceCommand('Maqaan koo Caalaa Bultii');
    await waitFor(() => {
      const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement | null;
      expect(nameInput?.value).toBe('Caalaa Bultii');
    });

    await sendVoiceCommand('Lakkoofsi bilbilaa koo 0911223344');
    await waitFor(() => {
      const contactInput = document.getElementById('gw-onboarding-contact') as HTMLInputElement | null;
      expect(contactInput?.value).toBe('+251911223344');
    });
  });

  it('toggles Gemini Live cleanly ON and OFF with Ctrl+Shift+A, releases mic tracks, restores focus, and ignores key repeat', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const stopTrackMock = vi.fn();
    const { getUserMediaMock } = setupLiveAudioAndWebSocketMocks(async () => ({
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream));

    render(<App />);

    const jobsBtn = within(screen.getByRole('banner')).getByRole('button', {
      name: /Accessible Jobs/i,
    });
    act(() => {
      jobsBtn.focus();
    });

    // 1. Key-repeat on toggle shortcut is ignored while inactive
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true, repeat: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 2. First Ctrl+Shift+A starts Gemini Live
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitServerMessage({ type: 'ready' });
    });

    await waitFor(() => {
      expect(within(dialog).getByText(/Live Voice Active \(gemini-3\.8-live\)/i)).toBeInTheDocument();
      expect(within(dialog).getByTestId('va-lifecycle-state')).toHaveTextContent(/Active conversation/i);
    });

    // Key repeat while active must NOT toggle off prematurely
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true, repeat: true });
    expect(ws.readyState).not.toBe(MockWebSocket.CLOSED);

    // 3. Second Ctrl+Shift+A toggles Gemini Live OFF cleanly without closing popup
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      expect(stopTrackMock).toHaveBeenCalled();
      expect(within(dialog).getByTestId('va-lifecycle-state')).toHaveTextContent(/Waiting/i);
      expect(within(dialog).getByText(/Gemini Live stopped/i)).toBeInTheDocument();
      expect(document.activeElement).toBe(jobsBtn);
    });

    // 4. Third Ctrl+Shift+A re-activates Live cleanly
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  it('positions chatbot in floating bottom-right corner and allows minimizing and reopening without interrupting active Gemini Live session', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const stopTrackMock = vi.fn();
    const { getUserMediaMock } = setupLiveAudioAndWebSocketMocks(async () => ({
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream));

    const user = userEvent.setup();
    const { container } = render(<App />);

    // Start Gemini Live with Ctrl + Shift + A
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog');

    // Verify floating bottom-right placement & non-blocking page behavior
    expect(dialog).not.toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('bottom-3');
    expect(dialog.className).toContain('right-3');
    expect(document.body.style.overflow).not.toBe('hidden');

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitServerMessage({ type: 'ready' });
    });

    await waitFor(() => {
      expect(within(dialog).getByText(/Live Voice Active \(gemini-3\.8-live\)/i)).toBeInTheDocument();
    });

    // Minimize chatbot while Gemini Live is active -> WebSocket and microphone remain active!
    const minBtn = within(dialog).getByRole('button', { name: /Minimize chat/i });
    await user.click(minBtn);

    expect(ws.readyState).toBe(MockWebSocket.OPEN);
    expect(stopTrackMock).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(1);

    const minAxe = await axe.run(container);
    expect(minAxe.violations).toEqual([]);

    // Reopen via Expand button -> Gemini Live is still active without interruption
    const expandBtn = within(dialog).getByRole('button', { name: /Expand chat/i });
    await user.click(expandBtn);

    expect(ws.readyState).toBe(MockWebSocket.OPEN);
    expect(stopTrackMock).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Live Voice Active \(gemini-3\.8-live\)/i)).toBeInTheDocument();

    // Minimize again and click header/banner "Voice Assistant" button -> expands without interrupting Gemini Live
    await user.click(within(dialog).getByRole('button', { name: /Minimize chat/i }));
    await user.click(screen.getAllByRole('button', { name: /Voice Assistant/i })[0]);

    expect(ws.readyState).toBe(MockWebSocket.OPEN);
    expect(stopTrackMock).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /Minimize chat/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    const expandedAxe = await axe.run(container);
    expect(expandedAxe.violations).toEqual([]);
  });

  it('prevents overlapping speech on rapid Tab/Shift+Tab, ignores arrow keys while typing, announces validation alerts, works independently of Gemini Live, and makes zero Gemini API calls', async () => {
    const fetchSpy = mockOfflineAssistantServer();
    globalThis.fetch = fetchSpy;
    setupLiveAudioAndWebSocketMocks();

    const spokenTexts: string[] = [];
    const cancelSpy = vi.fn();
    class MockUtterance {
      text: string;
      lang = 'en-US';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
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
        }),
        cancel: cancelSpy,
      },
      configurable: true,
    });

    // Required, Optional, Menuitem, Submit, and Error description checks
    const reqInput = document.createElement('input');
    reqInput.type = 'text';
    reqInput.required = true;
    reqInput.setAttribute('aria-label', 'Full name');
    expect(describeFocusedElement(reqInput, 'en')).toBe(
      'Full name. Input field. You can enter your text. Required.'
    );
    expect(describeFocusedElement(reqInput, 'am')).toContain('ግዴታ');
    expect(describeFocusedElement(reqInput, 'om')).toContain('Dirqama');

    const optInput = document.createElement('input');
    optInput.type = 'email';
    optInput.setAttribute('aria-required', 'false');
    optInput.setAttribute('aria-label', 'Contact email');
    expect(describeFocusedElement(optInput, 'en')).toContain('Email input field');
    expect(describeFocusedElement(optInput, 'en')).toContain('Optional.');

    const menuItem = document.createElement('button');
    menuItem.setAttribute('role', 'menuitem');
    menuItem.textContent = 'Profile Settings';
    expect(describeFocusedElement(menuItem, 'en')).toBe(
      'Profile Settings. Menu item. Press Enter to select.'
    );

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Submit registration';
    expect(describeFocusedElement(submitBtn, 'en')).toBe(
      'Submit registration submit button. Press Enter to submit.'
    );

    const user = userEvent.setup();
    render(<App />);
    const liveRegion = screen.getByTestId('gw-keyboard-focus-live');

    const assistantCallsBefore = vi.mocked(fetchSpy).mock.calls.filter((c) =>
      String(c[0]).includes('/api/speech/assistant')
    ).length;

    // Rapid Tab presses -> cancel previous utterance & only speak the final settled focus target
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab({ shift: true });

    expect(cancelSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(spokenTexts).toHaveLength(1);
      expect(liveRegion.textContent?.length).toBeGreaterThan(0);
    });

    // Pressing Tab must NEVER trigger Gemini API / assistant calls
    const assistantCallsAfterTab = vi.mocked(fetchSpy).mock.calls.filter((c) =>
      String(c[0]).includes('/api/speech/assistant')
    ).length;
    expect(assistantCallsAfterTab).toBe(assistantCallsBefore);
    expect(MockWebSocket.instances).toHaveLength(0);

    // Navigate to Onboarding and advance to Full Name step to test editing & validation alert announcements
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /^Registration$/i }));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    const nameInput = document.getElementById('gw-onboarding-name') as HTMLInputElement;
    expect(nameInput).toHaveAttribute('aria-required', 'true');

    // Focus via Tab, then type and use ArrowLeft inside input -> must NOT clobber liveRegion with non-Tab arrow announcements
    await user.tab();
    act(() => {
      nameInput.focus();
    });
    await new Promise((r) => setTimeout(r, 60));
    const spokenCountBeforeTyping = spokenTexts.length;
    fireEvent.keyDown(nameInput, { key: 'ArrowLeft' });
    fireEvent.keyDown(nameInput, { key: 'Home' });
    await new Promise((r) => setTimeout(r, 70));
    expect(spokenTexts.length).toBe(spokenCountBeforeTyping);

    // Trigger validation error with keyboard Enter on Continue button
    const continueBtn = screen.getByRole('button', { name: /Continue/i });
    act(() => {
      continueBtn.focus();
    });
    fireEvent.keyDown(continueBtn, { key: 'Enter' });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(liveRegion.textContent).toContain('Validation error.');
    });

    // Activate Gemini Live (Ctrl+Shift+A) and confirm Tab announcements STILL work independently
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });
    await screen.findByRole('dialog');
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitServerMessage({ type: 'ready' });
    });

    const spokenBeforeLiveTab = spokenTexts.length;
    await user.tab();
    await waitFor(() => {
      expect(spokenTexts.length).toBeGreaterThan(spokenBeforeLiveTab);
    });
  });

  it('renders the Homepage Keyboard & Voice Navigation Guide cleanly in EN/AM/OM with actual shortcuts, expandable instructions, and zero axe violations', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const user = userEvent.setup();
    const { container } = render(<App />);

    const guide = screen.getByTestId('gw-home-nav-guide');
    expect(
      within(guide).getByRole('heading', { name: /How to Use Voice & Keyboard Navigation/i })
    ).toBeInTheDocument();

    // Verify actual implemented shortcuts & voice phrases are shown accurately
    expect(within(guide).getByText('Tab')).toBeInTheDocument();
    expect(within(guide).getByText('Shift + Tab')).toBeInTheDocument();
    expect(within(guide).getByText('Enter')).toBeInTheDocument();
    expect(within(guide).getByText('Ctrl + Shift + A')).toBeInTheDocument();
    expect(within(guide).getByText('"Hey Access"')).toBeInTheDocument();
    expect(within(guide).getByText('"Goodbye" / "Stop listening"')).toBeInTheDocument();

    // Expand "Learn how to use this website" detailed explanation
    const learnBtn = within(guide).getByRole('button', {
      name: /Learn how to use this website/i,
    });
    expect(learnBtn).toHaveAttribute('aria-expanded', 'false');
    await user.click(learnBtn);

    expect(learnBtn).toHaveAttribute('aria-expanded', 'true');
    const detailRegion = document.getElementById('gw-detailed-usage-guide');
    expect(detailRegion).not.toBeNull();
    expect(detailRegion?.textContent).toContain('Ctrl + Shift + A');

    const guideAxe = await axe.run(container);
    expect(guideAxe.violations).toEqual([]);

    // Switch language to Amharic (am) and Afaan Oromo (om) and verify localized guide headings
    const langSelect = screen.getByLabelText(/Language/i);
    await user.selectOptions(langSelect, 'am');
    expect(
      within(guide).getByRole('heading', { name: /የድምፅ እና የቁልፍ ሰሌዳ አሰሳን እንዴት መጠቀም እንደሚቻል/i })
    ).toBeInTheDocument();

    await user.selectOptions(langSelect, 'om');
    expect(
      within(guide).getByRole('heading', { name: /Akkaataa Itti Fayyadama Sagalee fi Furtuu Gabatee/i })
    ).toBeInTheDocument();
  });

  it('starts Gemini Live and microphone on first Alt+Shift+A, stops session and mic on second Alt+Shift+A, prevents duplicate sessions, and preserves manual controls', async () => {
    globalThis.fetch = mockOfflineAssistantServer();
    const stopTrackMock = vi.fn();
    const { getUserMediaMock } = setupLiveAudioAndWebSocketMocks(async () => ({
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream));

    const user = userEvent.setup();
    render(<App />);

    // 1. Key-repeat Alt+Shift+A is ignored while inactive
    fireEvent.keyDown(window, { key: 'a', altKey: true, shiftKey: true, repeat: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getUserMediaMock).not.toHaveBeenCalled();

    // 2. First Alt+Shift+A opens voice chat interface and actually starts Gemini Live + microphone
    fireEvent.keyDown(window, { key: 'a', altKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    // Duplicate activation shortcut while connecting must NOT spawn a second session or mic stream
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, altKey: true, shiftKey: true });
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitServerMessage({ type: 'ready' });
    });

    await waitFor(() => {
      expect(within(dialog).getByText(/Live Voice Active \(gemini-3\.8-live\)/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /End Live/i })).toBeInTheDocument();
    });

    // 3. Second Alt+Shift+A stops the active Gemini Live session and releases microphone tracks
    fireEvent.keyDown(window, { key: 'a', altKey: true, shiftKey: true });

    await waitFor(() => {
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
      expect(stopTrackMock).toHaveBeenCalledTimes(1);
      expect(within(dialog).getByRole('button', { name: /Start Live Voice/i })).toBeInTheDocument();
    });

    // 4. Manual Start Live Voice / End Live controls still work cleanly
    await user.click(within(dialog).getByRole('button', { name: /Start Live Voice/i }));
    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(2);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
    const ws2 = MockWebSocket.instances[1];
    act(() => {
      ws2.emitServerMessage({ type: 'ready' });
    });
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /End Live/i })).toBeInTheDocument();
    });
    await user.click(within(dialog).getByRole('button', { name: /End Live/i }));
    await waitFor(() => {
      expect(ws2.readyState).toBe(MockWebSocket.CLOSED);
      expect(stopTrackMock).toHaveBeenCalledTimes(2);
    });
  });

  it('handles microphone permission errors cleanly when activated via Alt+Shift+A and cancels pending stream if toggled off mid-connect', async () => {
    globalThis.fetch = mockOfflineAssistantServer();

    // Case 1: NotAllowedError surfaces clearly in UI
    setupLiveAudioAndWebSocketMocks(async () => {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    });

    const { unmount } = render(<App />);
    fireEvent.keyDown(window, { key: 'Å', code: 'KeyA', altKey: true, shiftKey: true });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/Microphone permission was denied/i)).toBeInTheDocument();
    });
    unmount();

    // Case 2: Stopping via second Alt+Shift+A while getUserMedia is still resolving stops leaked tracks & avoids WS creation
    MockWebSocket.instances = [];
    const pendingTrackStop = vi.fn();
    let resolveMic!: (s: MediaStream) => void;
    setupLiveAudioAndWebSocketMocks(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveMic = resolve;
        })
    );

    render(<App />);
    fireEvent.keyDown(window, { key: 'a', altKey: true, shiftKey: true });
    await screen.findByRole('dialog');

    // Stop while getUserMedia is still pending
    fireEvent.keyDown(window, { key: 'a', altKey: true, shiftKey: true });

    await act(async () => {
      resolveMic({
        getTracks: () => [{ stop: pendingTrackStop }],
      } as unknown as MediaStream);
    });

    expect(pendingTrackStop).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
