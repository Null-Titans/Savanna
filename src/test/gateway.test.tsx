import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import App from '../App';
import { ensureAccessibleColor, getContrastRatio } from '../utils/contrast';
import { checkEmployerTextSafeguards } from '../utils/safeguards';
import { buildJobPostingJsonLd } from '../utils/jsonLd';
import { sanitizeDraftForLocalDevice } from '../utils/indexedDbDrafts';
import { OnboardingDraft } from '../types/gateway';

describe('WCAG contrast & theme auto-fallback', () => {
  it('auto-darkens failing yellow partner color to pass >= 4.5:1 against white', () => {
    const res = ensureAccessibleColor('#facc15', '#0a2540', 4.5);
    expect(res.adjusted).toBe(true);
    expect(getContrastRatio(res.effectiveColor, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps compliant dark navy color untouched', () => {
    const res = ensureAccessibleColor('#0a2540', '#0a2540', 4.5);
    expect(res.adjusted).toBe(false);
    expect(res.contrastWithWhite).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Addendum D4 employer safeguards', () => {
  it('blocks medical proof, diagnosis, and disability type wording', () => {
    const violations = checkEmployerTextSafeguards({
      interviewAcc: 'Applicants must submit a medical certificate and diagnosis.',
    });
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('allows neutral workplace accommodation descriptions', () => {
    const violations = checkEmployerTextSafeguards({
      interviewAcc: 'Questions provided in writing 24 hours in advance; live captions enabled.',
    });
    expect(violations).toHaveLength(0);
  });
});

describe('Privacy & Level 3 JSON-LD', () => {
  it('strips sensitive ID numbers and support preferences from local device drafts', () => {
    const fullDraft: OnboardingDraft = {
      isSharedDevice: false,
      registrationMode: 'self',
      fullName: 'Selam Tadesse',
      contactMethod: 'phone',
      contactValue: '+251911000000',
      identityRoute: 'refugee_id',
      identityReferenceNumber: 'REF-99887766',
      partnerReferralOrg: '',
      supportPreferences: ['discuss_privately', 'alternative_materials'],
      supportNotes: 'Need large print',
      updatedAtIso: new Date().toISOString(),
    };
    const sanitized = sanitizeDraftForLocalDevice(fullDraft);
    expect(JSON.stringify(sanitized)).not.toContain('REF-99887766');
    expect(JSON.stringify(sanitized)).not.toContain('discuss_privately');
    expect(JSON.stringify(sanitized)).not.toContain('Need large print');
  });

  it('builds valid schema.org/JobPosting JSON-LD with additionalProperty', () => {
    const ld = buildJobPostingJsonLd({
      id: 'j1',
      title: 'Support Agent',
      organization: 'Open Org',
      location: 'Addis Ababa',
      isRemote: true,
      employmentType: 'Full-time',
      descriptionSummary: 'Help learners by chat.',
      requiredSkills: ['Typing'],
      accommodationCategories: ['remote_flexible'],
      accommodationsOffered: ['Remote 4 days'],
      accommodationDetails: {
        workEnvironmentAccessibility: 'Step-free',
        remoteOrFlexibleArrangements: 'Remote',
        assistiveTechnologyAvailable: 'NVDA tested',
        communicationOptions: 'Chat only',
        interviewAccommodations: 'Written Qs',
        applicationProcessAccommodations: 'Voice input',
        additionalSupportOffered: 'Buddy',
      },
      postedAtIso: '2026-11-01T00:00:00Z',
      isDemoData: true,
    });
    expect(ld['@type']).toBe('JobPosting');
    expect(Array.isArray(ld.additionalProperty)).toBe(true);
  });
});

describe('Onboarding & Career Gateway end-to-end UI journeys', () => {
  it('completes onboarding without kebele ID, skips private support, and passes axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // Axe check on Main Gateway
    const homeAxe = await axe.run(container);
    expect(homeAxe.violations).toEqual([]);

    // Start registration
    await user.click(screen.getAllByRole('button', { name: /Start registration/i })[0]);

    // Step 1: Shared device -> No
    await user.click(screen.getByRole('button', { name: /No, this is my own device/i }));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 2: Empty validation check -> 3-part plain error
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/This name box is empty/i);

    // Type name and continue
    await user.type(screen.getByLabelText(/Full name/i), 'Hanna Bekele');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 3: Skip optional contact
    await user.click(screen.getByRole('button', { name: /Skip this question/i }));

    // Step 4: Choose "I do not have these documents" (no kebele ID required)
    await user.click(screen.getByLabelText(/I do not have these documents/i));
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 5: Private support request -> select option -> review
    await user.click(screen.getByLabelText(/Alternative learning materials/i));
    await user.click(screen.getByRole('button', { name: /Review my answers/i }));

    expect(screen.getByText('Hanna Bekele')).toBeInTheDocument();

    // Submit registration
    await user.click(screen.getByRole('button', { name: /Submit registration/i }));
    await waitFor(() => {
      expect(screen.getByText(/Registration ready/i)).toBeInTheDocument();
    });

    // Navigate to Career Gateway from confirmation
    await user.click(screen.getByRole('button', { name: /Explore accessible jobs next/i }));
    await waitFor(() => {
      expect(screen.getByText(/Junior Customer Support Specialist/i)).toBeInTheDocument();
    });
  });

  it('switches to Amharic (am) and preserves plain-language Ethiopic UI', async () => {
    const user = userEvent.setup();
    render(<App />);
    const langSelect = screen.getByLabelText(/Language/i);
    await user.selectOptions(langSelect, 'am');

    await waitFor(() => {
      expect(screen.getByText(/ቀላል ምዝገባ እና ተደራሽ የስራ እድሎች/i)).toBeInTheDocument();
    });
  });

  it('blocks Employer publishing when medical proof or diagnosis is requested', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /For Employers/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Job title/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Interview accommodations/i), 'Bring medical proof and diagnosis.');
    expect(screen.getByText(/Please remove medical or diagnosis language before publishing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publish accessible job listing/i })).toBeDisabled();
  });

  it('toggles dark mode cleanly, updates document root & aria-pressed, and passes axe-core in dark mode', async () => {
    localStorage.removeItem('gw_color_scheme');
    document.documentElement.classList.remove('dark');
    const user = userEvent.setup();
    const { container } = render(<App />);

    const darkBtn = screen.getByRole('button', { name: /Dark mode/i });
    expect(darkBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(darkBtn);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(localStorage.getItem('gw_color_scheme')).toBe('dark');

    const lightBtn = screen.getByRole('button', { name: /Light mode/i });
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');

    const darkAxe = await axe.run(container);
    expect(darkAxe.violations).toEqual([]);

    const langSelect = screen.getByLabelText(/Language/i) as HTMLSelectElement;
    expect(langSelect.className).toContain('dark:text-white');
    expect(langSelect.className).toContain('dark:bg-slate-800');
    expect(langSelect.parentElement?.className).toContain('dark:border-slate-500');
    expect(Array.from(langSelect.options).every((o) => o.className.includes('dark:bg-slate-900'))).toBe(
      true
    );

    await user.click(lightBtn);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('resolves gateway image assets relative to script origin or local fallbacks', async () => {
    const { resolveAssetUrl, getAssetCandidates } = await import('../utils/assetUrl');
    const url = resolveAssetUrl('assets/images/saia_hero_team_1794654721733.jpg');
    expect(url).toContain('assets/images/saia_hero_team_1794654721733.jpg');

    const script = document.createElement('script');
    script.src = 'http://localhost:4173/subpath/accessible-gateway.js';
    document.head.appendChild(script);
    try {
      const candidates = getAssetCandidates('/assets/images/saia_hero_team_1794654721733.jpg');
      expect(candidates[0]).toBe(
        'http://localhost:4173/subpath/assets/images/saia_hero_team_1794654721733.jpg'
      );
      expect(candidates).toContain('/assets/images/saia_hero_team_1794654721733.jpg');
      expect(candidates).toContain('./assets/images/saia_hero_team_1794654721733.jpg');
      expect(candidates).toContain('/public/assets/images/saia_hero_team_1794654721733.jpg');
    } finally {
      script.remove();
    }
  });

  it('contains scroll inside ThemeSwitcherDrawer, locks background body scroll, and closes on Escape or backdrop click', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.body.style.overflow).toBe('');
    await user.click(screen.getByRole('button', { name: /Theme & API/i }));

    const dialog = await screen.findByRole('dialog');
    const drawerPanel = dialog.firstElementChild as HTMLElement;
    expect(drawerPanel.className).toContain('h-screen');
    expect(drawerPanel.className).toContain('overflow-y-auto');
    expect(drawerPanel.className).toContain('overscroll-contain');
    expect(document.body.style.overflow).toBe('hidden');

    // Escape closes drawer and restores body scroll
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');

    // Re-open and test backdrop click close
    await user.click(screen.getByRole('button', { name: /Theme & API/i }));
    const reopenedDialog = await screen.findByRole('dialog');
    await user.click(reopenedDialog);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Site-Wide Orientation, Learning Resources, Dashboard, DOM Masking & ALX Footer', () => {
  it('announces exact location on load/navigation, answers Where am I & What can I do, and masks DOM passwords', async () => {
    const { maskSensitiveDomInputs, extractSafeDomSummary } = await import('../utils/privacyGuard');
    const user = userEvent.setup();
    const { container } = render(<App />);

    // 1. Initial Home orientation live announcement
    expect(screen.getByText(/You are on the Home page/i)).toBeInTheDocument();

    // 2. Navigate to Learning Resources and verify automatic orientation update + axe compliance
    await user.click(screen.getByRole('button', { name: /^Learning Resources$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Learning Resources/i })).toBeInTheDocument();
      expect(screen.getByText(/ALX Software Engineering Foundations/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/You are on the Learning Resources page/i)).toBeInTheDocument();
    expect((await axe.run(container)).violations).toEqual([]);

    // 3. Navigate to User Dashboard
    await user.click(screen.getByRole('button', { name: /^Dashboard$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /User Dashboard/i })).toBeInTheDocument();
      expect(screen.getByText(/DOM Password Masking & Server Proxy Active/i)).toBeInTheDocument();
    });

    // 4. Open assistant via "What can I do here?" and confirm spatial guidance reply
    await user.click(screen.getByRole('button', { name: /What can I do here\?/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Available actions on User Dashboard/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Close assistant/i }));

    // 5. Verify client-side DOM input masking shields password inputs
    const fakeForm = document.createElement('div');
    const pwdInput = document.createElement('input');
    pwdInput.type = 'password';
    pwdInput.value = 'TopSecretPass123!';
    const heading = document.createElement('h2');
    heading.textContent = 'Safe Heading';
    fakeForm.append(heading, pwdInput);
    document.body.appendChild(fakeForm);

    try {
      const maskedCount = maskSensitiveDomInputs(fakeForm);
      expect(maskedCount).toBe(1);
      expect(pwdInput.getAttribute('data-ai-masked')).toBe('true');
      const extracted = extractSafeDomSummary(fakeForm);
      expect(extracted).toContain('Safe Heading');
      expect(extracted).not.toContain('TopSecretPass123');
    } finally {
      fakeForm.remove();
    }
  });

  it('renders WCAG 2.2 AA ALX Footer with Addis Ababa Hub mission, governance dialogs, privacy-guarded feedback, and EN/AM toggle', async () => {
    const user = userEvent.setup();
    render(<App />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/About ALX/i);
    expect(footer).toHaveTextContent(/Software Engineering, Data Science, and AI/i);
    expect(footer).toHaveTextContent(/Addis Ababa/i);

    // Open Feedback dialog and verify privacy guard blocks secret token
    await user.click(screen.getByRole('button', { name: /Accessibility Feedback/i }));
    const msgBox = await screen.findByLabelText(/Share feedback/i);
    await user.type(msgBox, 'My password is SecretPassword99');
    await user.click(screen.getByRole('button', { name: /Submit accessibility feedback/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/clear that sensitive text/i);

    // Close modal with Escape and test footer bilingual switch to Amharic and back
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /አማርኛ/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /ስለ ALX/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^English$/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /About ALX/i })).toBeInTheDocument();
    });
  });
});



