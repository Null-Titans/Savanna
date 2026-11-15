export interface AssistantContextInfo {
  activeModule?: string;
  stepTitle?: string;
  colorMode?: 'light' | 'dark';
  easyRead?: boolean;
  safePageSummary?: string;
  websiteState?: Record<string, unknown>;
}

/**
 * Prunes websiteState so only active-module state and concise global summary are sent,
 * cutting prompt token usage significantly across multi-turn conversations.
 */
export function pruneWebsiteStateForPrompt(
  activeModule: string | undefined,
  websiteState?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!websiteState) return undefined;
  const mod = activeModule || String(websiteState.activeModule || 'home');
  const pruned: Record<string, unknown> = {
    activeModule: mod,
    pageTitle: websiteState.pageTitle,
    settings: websiteState.accessibilitySettings,
  };

  if (mod === 'onboarding' || mod === 'profile') {
    pruned.onboarding = websiteState.onboarding;
  } else if (mod === 'career') {
    pruned.career = websiteState.career;
  } else if (mod === 'learning') {
    pruned.learning = websiteState.learning;
  }

  if (websiteState.savedLearnerProfile) {
    const p = websiteState.savedLearnerProfile as { fullName?: string; contactMethod?: string };
    pruned.hasSavedProfile = true;
    pruned.savedProfileSummary = { fullName: p.fullName, contactMethod: p.contactMethod };
  } else {
    pruned.hasSavedProfile = false;
  }

  if (websiteState.sessionContext) {
    pruned.sessionContext = websiteState.sessionContext;
  }

  return pruned;
}

export function buildSiteWideAssistantInstruction(
  languageDisplay: string,
  context?: AssistantContextInfo,
  options?: { isContinuation?: boolean; earlierSummary?: string | null }
): string {
  if (options?.isContinuation) {
    return [
      `You are the Savanna & ALX accessible voice controller. Respond strictly in ${languageDisplay} in 2-4 plain sentences (no markdown).`,
      'Confirm only real tool results returned above and guide the next step.',
      'Only explain or read the full page/screen if the user explicitly asked.',
      context?.activeModule ? `Active page="${context.activeModule}".` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const prunedState = pruneWebsiteStateForPrompt(context?.activeModule, context?.websiteState);
  const currentScreen = context?.activeModule
    ? `Screen: section="${context.activeModule}"${
        context.stepTitle ? `, step="${context.stepTitle}"` : ''
      }${context.colorMode ? `, theme="${context.colorMode}"` : ''}${
        typeof context.easyRead === 'boolean' ? `, easyRead=${context.easyRead}` : ''
      }${
        context.safePageSummary ? `, headings="${context.safePageSummary.slice(0, 220)}"` : ''
      }.`
    : '';

  const liveStateNote = prunedState
    ? `State: ${JSON.stringify(prunedState).slice(0, 1400)}.`
    : '';

  const earlierNote = options?.earlierSummary
    ? `Earlier turns: ${options.earlierSummary}.`
    : '';

  return [
    'You are the voice-first accessibility controller for Savanna & ALX Gateway helping people with disabilities operate the platform independently.',
    `Supported languages: ONLY English (en), Amharic (am), Afaan Oromo (om). Reply strictly in ${languageDisplay}, plain TTS-friendly text (2-4 short sentences, no markdown).`,
    'Sections: home, onboarding (no mandatory Kebele ID/medical proof), profile, career (inclusive jobs), learning (ALX SE/Data/AI/A11y tracks), dashboard, employer, back.',
    'EXPLICIT-ONLY EXPLANATIONS: Never read or explain pages automatically. Explain a page, form, button, job, or course ONLY when explicitly asked ("Explain this page", "What is on my screen", "Read this information", "Explain this form", "What does this button do").',
    'REAL EXECUTION, VISUAL SYNC & FOLLOW-UPS: Whenever the user states form values ("My name is...", "My email is...", "My phone number is...") or says "Now my phone number", immediately call update_registration_answer / update_job_application_answer / control_registration_flow / search_jobs / get_learning_resources / navigate_to_page so the visible page step and input field update on screen immediately. Keep completed fields and current form context intact across turns. Omit advanceToNextStep when the user directly enters or edits a single field so that field remains visible on screen unless advancing to the next question. Require explicit user confirmation (confirmed=true) before submit_registration, submit_job_application, update_user_profile, or delete_user_profile. Only report real tool data.',
    'PRIVACY: Never ask for, accept, repeat, or store passwords, PINs, tokens, financial records, or medical diagnoses.',
    earlierNote,
    currentScreen,
    liveStateNote,
  ]
    .filter(Boolean)
    .join(' ');
}
