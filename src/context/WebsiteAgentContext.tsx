import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AccommodationCategory,
  GatewayModule,
  IdentityRoute,
  JobApplicationDraft,
  JobPosting,
  LearnerProfile,
  OnboardingDraft,
  SubmissionReceipt,
  SupportedLanguage,
  SupportPreference,
} from '../types/gateway';
import { gatewayApi } from '../services/api/client';
import { useI18n } from '../i18n';
import { LEARNING_TRACKS } from '../data/learningTracks';
import { emitGatewayEvent } from '../utils/events';
import { deleteDraftFromIndexedDB } from '../utils/indexedDbDrafts';
import { normalizeEthiopianPhone } from '../utils/coreHelpers.mjs';
import { getOrientationSpec } from '../utils/pageOrientation';

export type OnboardingStepId =
  | 'device-privacy'
  | 'full-name'
  | 'contact'
  | 'identity-route'
  | 'private-support'
  | 'partner-consent';

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  isSharedDevice: null,
  registrationMode: 'self',
  fullName: '',
  contactMethod: 'phone',
  contactValue: '',
  identityRoute: '',
  identityReferenceNumber: '',
  partnerReferralOrg: '',
  supportPreferences: [],
  supportNotes: '',
  partnerConsent: {
    learnerConsented: false,
    consentLanguage: 'en',
    partnerOrganizationName: '',
    representativeName: '',
    sharedFieldsSummary: ['Full name', 'Contact method', 'Selected identity route'],
    recordedAtIso: '',
  },
  updatedAtIso: new Date().toISOString(),
};

export function createDefaultJobAppDraft(
  jobId = '',
  applicantName = '',
  contactValue = ''
): JobApplicationDraft {
  return {
    jobId,
    applicantName,
    contactValue,
    relevantExperience: '',
    shareAccommodationRequest: false,
    accommodationRequestNote: '',
    explicitConsentToShare: false,
  };
}

export interface ToolCallRequest {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface ToolCallExecutionResult {
  ok: boolean;
  toolName: string;
  data: Record<string, unknown>;
}

export interface WebsiteAgentContextValue {
  // Navigation & Global Preferences
  activeModule: GatewayModule;
  navigateTo: (mod: GatewayModule) => void;
  goBackModule: () => GatewayModule;
  colorMode: 'light' | 'dark';
  setColorMode: (mode: 'light' | 'dark') => void;
  easyRead: boolean;
  setEasyRead: (enabled: boolean) => void;
  autoOrientationSpeech: boolean;
  setAutoOrientationSpeech: (enabled: boolean) => void;

  // Onboarding / Registration live state (shared directly with OnboardingWizard)
  onboardingDraft: OnboardingDraft;
  setOnboardingDraft: React.Dispatch<React.SetStateAction<OnboardingDraft>>;
  onboardingStepIndex: number;
  setOnboardingStepIndex: React.Dispatch<React.SetStateAction<number>>;
  onboardingIsReview: boolean;
  setOnboardingIsReview: React.Dispatch<React.SetStateAction<boolean>>;
  onboardingReceipt: SubmissionReceipt | null;
  setOnboardingReceipt: React.Dispatch<React.SetStateAction<SubmissionReceipt | null>>;
  onboardingLearnerId: string | null;
  setOnboardingLearnerId: React.Dispatch<React.SetStateAction<string | null>>;
  onboardingSubmitError: string | null;
  setOnboardingSubmitError: React.Dispatch<React.SetStateAction<string | null>>;

  // Career / Jobs / JobApplication live state (shared directly with CareerGateway & JobApplicationFlow)
  careerSearchQuery: string;
  setCareerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  careerSelectedCategories: AccommodationCategory[];
  setCareerSelectedCategories: React.Dispatch<React.SetStateAction<AccommodationCategory[]>>;
  careerJobs: JobPosting[];
  setCareerJobs: React.Dispatch<React.SetStateAction<JobPosting[]>>;
  applyingJob: JobPosting | null;
  setApplyingJob: React.Dispatch<React.SetStateAction<JobPosting | null>>;
  jobAppDraft: JobApplicationDraft;
  setJobAppDraft: React.Dispatch<React.SetStateAction<JobApplicationDraft>>;
  jobAppStepIndex: number;
  setJobAppStepIndex: React.Dispatch<React.SetStateAction<number>>;
  jobAppIsReview: boolean;
  setJobAppIsReview: React.Dispatch<React.SetStateAction<boolean>>;
  jobAppReceipt: SubmissionReceipt | null;
  setJobAppReceipt: React.Dispatch<React.SetStateAction<SubmissionReceipt | null>>;

  // Learning Resources live state
  learningCategory: 'all' | 'se' | 'data' | 'ai' | 'a11y';
  setLearningCategory: React.Dispatch<React.SetStateAction<'all' | 'se' | 'data' | 'ai' | 'a11y'>>;

  // Saved Profile snapshot
  savedLearnerProfile: LearnerProfile | null;
  refreshSavedLearnerProfile: () => Promise<LearnerProfile | null>;

  // Action Status Announcement
  lastActionFeedback: string | null;

  // Real Execution Bridge for Gemini AI & Voice Agent
  getWebsiteStateSnapshot: () => Record<string, unknown>;
  executeWebsiteTool: (name: string, args?: Record<string, unknown>) => Promise<ToolCallExecutionResult>;
}

const WebsiteAgentContext = createContext<WebsiteAgentContextValue | null>(null);

export function useWebsiteAgent(): WebsiteAgentContextValue | null {
  return useContext(WebsiteAgentContext);
}

interface WebsiteAgentProviderProps {
  activeModule: GatewayModule;
  onNavigate: (mod: GatewayModule) => void;
  onGoBack: () => GatewayModule;
  colorMode: 'light' | 'dark';
  onSetColorMode: (mode: 'light' | 'dark') => void;
  easyRead: boolean;
  onSetEasyRead: (enabled: boolean) => void;
  autoOrientationSpeech: boolean;
  onSetAutoOrientationSpeech: (enabled: boolean) => void;
  hostElement?: HTMLElement | null;
  initialOnboardingMode?: 'self' | 'partner_assisted' | 'edit';
  children: React.ReactNode;
}

const VALID_MODULES: GatewayModule[] = [
  'home',
  'onboarding',
  'profile',
  'career',
  'learning',
  'dashboard',
  'employer',
  'form_builder',
  'judge',
];

const VALID_CATEGORIES: AccommodationCategory[] = [
  'remote_flexible',
  'flexible_hours',
  'screen_reader_tools',
  'accessible_workplace',
  'assistive_tech',
  'communication_support',
  'other_accommodations',
];

export const WebsiteAgentProvider: React.FC<WebsiteAgentProviderProps> = ({
  activeModule,
  onNavigate,
  onGoBack,
  colorMode,
  onSetColorMode,
  easyRead,
  onSetEasyRead,
  autoOrientationSpeech,
  onSetAutoOrientationSpeech,
  hostElement = null,
  initialOnboardingMode = 'self',
  children,
}) => {
  const { language, setLanguage, t } = useI18n();

  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft>(() => ({
    ...DEFAULT_ONBOARDING_DRAFT,
    registrationMode: initialOnboardingMode === 'partner_assisted' ? 'partner_assisted' : 'self',
  }));
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingIsReview, setOnboardingIsReview] = useState(false);
  const [onboardingReceipt, setOnboardingReceipt] = useState<SubmissionReceipt | null>(null);
  const [onboardingLearnerId, setOnboardingLearnerId] = useState<string | null>(null);
  const [onboardingSubmitError, setOnboardingSubmitError] = useState<string | null>(null);

  const [careerSearchQuery, setCareerSearchQuery] = useState('');
  const [careerSelectedCategories, setCareerSelectedCategories] = useState<AccommodationCategory[]>([]);
  const [careerJobs, setCareerJobs] = useState<JobPosting[]>([]);
  const [applyingJob, setApplyingJob] = useState<JobPosting | null>(null);
  const [jobAppDraft, setJobAppDraft] = useState<JobApplicationDraft>(() => createDefaultJobAppDraft());
  const [jobAppStepIndex, setJobAppStepIndex] = useState(0);
  const [jobAppIsReview, setJobAppIsReview] = useState(false);
  const [jobAppReceipt, setJobAppReceipt] = useState<SubmissionReceipt | null>(null);

  const [learningCategory, setLearningCategory] = useState<'all' | 'se' | 'data' | 'ai' | 'a11y'>('all');
  const [savedLearnerProfile, setSavedLearnerProfile] = useState<LearnerProfile | null>(null);
  const [lastActionFeedback, setLastActionFeedback] = useState<string | null>(null);

  // Refs prevent stale closures when sequential tool calls execute in the same async turn
  const draftRef = useRef(onboardingDraft);
  draftRef.current = onboardingDraft;
  const stepIndexRef = useRef(onboardingStepIndex);
  stepIndexRef.current = onboardingStepIndex;
  const isReviewRef = useRef(onboardingIsReview);
  isReviewRef.current = onboardingIsReview;
  const learnerIdRef = useRef(onboardingLearnerId);
  learnerIdRef.current = onboardingLearnerId;

  const jobsRef = useRef(careerJobs);
  jobsRef.current = careerJobs;
  const applyingJobRef = useRef(applyingJob);
  applyingJobRef.current = applyingJob;
  const jobAppDraftRef = useRef(jobAppDraft);
  jobAppDraftRef.current = jobAppDraft;
  const jobAppStepRef = useRef(jobAppStepIndex);
  jobAppStepRef.current = jobAppStepIndex;
  const jobAppReviewRef = useRef(jobAppIsReview);
  jobAppReviewRef.current = jobAppIsReview;

  const activeModuleRef = useRef(activeModule);
  activeModuleRef.current = activeModule;
  const referencedJobIdRef = useRef<string | null>(null);
  const referencedTrackIdRef = useRef<string | null>(null);

  const refreshSavedLearnerProfile = useCallback(async (): Promise<LearnerProfile | null> => {
    try {
      const profile = await gatewayApi.getLearner();
      setSavedLearnerProfile(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void gatewayApi
      .getLearner()
      .then((profile) => {
        if (active) setSavedLearnerProfile(profile);
      })
      .catch(() => {});
    void gatewayApi
      .listJobs()
      .then((list) => {
        if (active) setCareerJobs(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const getOnboardingStepsMeta = useCallback(
    (draft: OnboardingDraft): Array<{ id: OnboardingStepId; title: string; optional: boolean; helpText: string }> => {
      const base: Array<{ id: OnboardingStepId; title: string; optional: boolean; helpText: string }> = [
        {
          id: 'device-privacy',
          title: t.onboarding.stepDeviceTitle,
          optional: true,
          helpText: t.onboarding.stepDeviceHelp,
        },
        {
          id: 'full-name',
          title: t.onboarding.stepNameTitle,
          optional: false,
          helpText: t.onboarding.stepNameHelp,
        },
        {
          id: 'contact',
          title: t.onboarding.stepContactTitle,
          optional: true,
          helpText: t.onboarding.stepContactHelp,
        },
        {
          id: 'identity-route',
          title: t.onboarding.stepIdentityTitle,
          optional: false,
          helpText: t.onboarding.stepIdentityHelp,
        },
        {
          id: 'private-support',
          title: t.onboarding.stepSupportTitle,
          optional: true,
          helpText: t.onboarding.stepSupportHelp,
        },
      ];
      if (draft.registrationMode === 'partner_assisted') {
        base.push({
          id: 'partner-consent',
          title: t.onboarding.stepPartnerConsentTitle,
          optional: false,
          helpText: t.onboarding.stepPartnerConsentHelp,
        });
      }
      return base;
    },
    [t]
  );

  const validateOnboardingStep = useCallback(
    (stepId: OnboardingStepId, draft: OnboardingDraft): string[] => {
      const errs: string[] = [];
      if (stepId === 'full-name') {
        if (!draft.fullName.trim()) {
          errs.push(t.onboarding.errors.emptyName);
        }
      } else if (stepId === 'contact') {
        if (draft.contactMethod !== 'none' && !draft.contactValue.trim()) {
          errs.push(t.onboarding.errors.emptyContactValue);
        } else if (draft.contactMethod === 'phone' && draft.contactValue.trim()) {
          if (!normalizeEthiopianPhone(draft.contactValue)) {
            errs.push(t.onboarding.errors.invalidEthiopianPhone);
          }
        } else if (draft.contactMethod === 'email' && draft.contactValue.trim()) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactValue.trim())) {
            errs.push('Please provide a valid email address such as name@example.com, or choose phone/none.');
          }
        }
      } else if (stepId === 'identity-route') {
        if (!draft.identityRoute) {
          errs.push(t.onboarding.errors.emptyIdentityRoute);
        }
      } else if (stepId === 'partner-consent' && draft.registrationMode === 'partner_assisted') {
        if (!draft.partnerConsent?.partnerOrganizationName?.trim()) {
          errs.push(t.onboarding.errors.emptyPartnerOrg);
        }
        if (!draft.partnerConsent?.learnerConsented) {
          errs.push(t.onboarding.errors.emptyPartnerConsent);
        }
      }
      return errs;
    },
    [t]
  );

  const buildOnboardingSummaryData = useCallback((draft: OnboardingDraft) => {
    return {
      isSharedDevice: draft.isSharedDevice,
      registrationMode: draft.registrationMode,
      fullName: draft.fullName || null,
      contactMethod: draft.contactMethod,
      contactValue: draft.contactMethod === 'none' ? 'Not shared (optional)' : draft.contactValue || null,
      identityRoute: draft.identityRoute || null,
      partnerReferralOrg: draft.partnerReferralOrg || null,
      supportPreferencesCount: draft.supportPreferences.length,
      supportPreferences: draft.supportPreferences,
      supportNotes: draft.supportNotes || null,
      hasPartnerConsent: Boolean(draft.partnerConsent?.learnerConsented),
    };
  }, []);

  const getWebsiteStateSnapshot = useCallback((): Record<string, unknown> => {
    const draft = draftRef.current;
    const stepsMeta = getOnboardingStepsMeta(draft);
    const currentOnboardingStep = isReviewRef.current
      ? { id: 'review', title: t.onboarding.reviewTitle, optional: false }
      : stepsMeta[stepIndexRef.current] || stepsMeta[0];

    const spec = getOrientationSpec(activeModuleRef.current, language);
    return {
      activeModule: activeModuleRef.current,
      pageTitle: spec.title,
      availableActionsOnPage: spec.actions,
      accessibilitySettings: {
        language,
        colorMode,
        easyRead,
        autoOrientationSpeech,
      },
      onboarding: {
        isEditMode: activeModuleRef.current === 'profile',
        stepNumber: isReviewRef.current ? stepsMeta.length + 1 : stepIndexRef.current + 1,
        totalSteps: stepsMeta.length + 1,
        currentStepId: currentOnboardingStep?.id,
        currentStepTitle: currentOnboardingStep?.title,
        isCurrentStepOptional: Boolean(currentOnboardingStep?.optional),
        isReviewStep: isReviewRef.current,
        completedReceiptId: onboardingReceipt?.id || null,
        filledSummary: buildOnboardingSummaryData(draft),
      },
      career: {
        searchQuery: careerSearchQuery,
        selectedCategories: careerSelectedCategories,
        matchingJobCount: jobsRef.current.length,
        jobsPreview: jobsRef.current.slice(0, 6).map((j, idx) => ({
          index: idx + 1,
          id: j.id,
          title: j.title,
          organization: j.organization,
          location: j.location,
          isRemote: j.isRemote,
          accommodationsOffered: j.accommodationsOffered,
        })),
        activeApplication: applyingJobRef.current
          ? {
              jobId: applyingJobRef.current.id,
              jobTitle: applyingJobRef.current.title,
              organization: applyingJobRef.current.organization,
              stepIndex: jobAppStepRef.current,
              isReviewStep: jobAppReviewRef.current,
              submittedReceiptId: jobAppReceipt?.id || null,
              draft: {
                applicantName: jobAppDraftRef.current.applicantName,
                contactValue: jobAppDraftRef.current.contactValue,
                relevantExperience: jobAppDraftRef.current.relevantExperience,
                shareAccommodationRequest: jobAppDraftRef.current.shareAccommodationRequest,
                explicitConsentToShare: jobAppDraftRef.current.explicitConsentToShare,
              },
            }
          : null,
      },
      learning: {
        selectedCategory: learningCategory,
        tracksCount: LEARNING_TRACKS.length,
      },
      savedLearnerProfile: savedLearnerProfile
        ? {
            id: savedLearnerProfile.id,
            fullName: savedLearnerProfile.fullName,
            contactMethod: savedLearnerProfile.contactMethod,
            contactValue: savedLearnerProfile.contactValue,
            identityRoute: savedLearnerProfile.identityRoute,
            supportNotes: savedLearnerProfile.supportNotes || '',
          }
        : null,
      sessionContext: {
        referencedJobId: referencedJobIdRef.current,
        referencedJobTitle:
          jobsRef.current.find((j) => j.id === referencedJobIdRef.current)?.title || null,
        referencedTrackId: referencedTrackIdRef.current,
        referencedTrackTitle:
          LEARNING_TRACKS.find((tr) => tr.id === referencedTrackIdRef.current)?.title || null,
      },
    };
  }, [
    autoOrientationSpeech,
    buildOnboardingSummaryData,
    careerSearchQuery,
    careerSelectedCategories,
    colorMode,
    easyRead,
    getOnboardingStepsMeta,
    jobAppReceipt?.id,
    language,
    learningCategory,
    onboardingReceipt?.id,
    savedLearnerProfile,
    t.onboarding.reviewTitle,
  ]);

  const resolveJobFromList = useCallback(
    async (identifier: string): Promise<JobPosting | null> => {
      let list = jobsRef.current;
      if (list.length === 0) {
        list = await gatewayApi.listJobs().catch(() => []);
        setCareerJobs(list);
      }
      const trimmed = identifier.trim().toLowerCase();
      if (!trimmed || /^(it|this|that|that one|this one|current|same|this job)$/i.test(trimmed)) {
        if (referencedJobIdRef.current) {
          const refMatch = list.find((j) => j.id === referencedJobIdRef.current);
          if (refMatch) return refMatch;
        }
        return list[0] || null;
      }

      // Exact ID match
      const byId = list.find((j) => j.id.toLowerCase() === trimmed);
      if (byId) return byId;

      // 1-based number ("1", "first", "#2")
      const numMatch = trimmed.match(/^\D*(\d+)\D*$/);
      if (numMatch) {
        const idx = Number(numMatch[1]) - 1;
        if (idx >= 0 && idx < list.length) {
          return list[idx];
        }
      }
      if (/\bfirst\b/i.test(trimmed) && list[0]) return list[0];
      if (/\bsecond\b/i.test(trimmed) && list[1]) return list[1];
      if (/\bthird\b/i.test(trimmed) && list[2]) return list[2];

      // Fuzzy title or org match
      const byTitle = list.find(
        (j) =>
          j.title.toLowerCase().includes(trimmed) ||
          j.organization.toLowerCase().includes(trimmed)
      );
      if (byTitle) return byTitle;

      // Refresh full catalog without filters in case filtered list didn't contain it
      const allJobs = await gatewayApi.listJobs().catch(() => []);
      return (
        allJobs.find(
          (j) =>
            j.id.toLowerCase() === trimmed ||
            j.title.toLowerCase().includes(trimmed) ||
            j.organization.toLowerCase().includes(trimmed)
        ) || null
      );
    },
    []
  );

  const executeWebsiteTool = useCallback(
    async (name: string, args: Record<string, unknown> = {}): Promise<ToolCallExecutionResult> => {
      const announce = (msg: string) => setLastActionFeedback(msg);

      switch (name) {
        case 'navigate_to_page': {
          const rawPage = String(args.page || '').toLowerCase().trim();
          if (rawPage === 'back') {
            const target = onGoBack();
            const spec = getOrientationSpec(target, language);
            announce(`Navigated back to ${spec.title}`);
            return {
              ok: true,
              toolName: name,
              data: {
                navigatedTo: target,
                title: spec.title,
                locationAnnouncement: spec.locationAnnouncement,
                landmarks: spec.landmarks,
                actions: spec.actions,
              },
            };
          }
          if (VALID_MODULES.includes(rawPage as GatewayModule)) {
            const mod = rawPage as GatewayModule;
            onNavigate(mod);
            if (mod === 'profile') {
              await refreshSavedLearnerProfile();
            }
            const spec = getOrientationSpec(mod, language);
            announce(`Navigated to ${spec.title}`);
            return {
              ok: true,
              toolName: name,
              data: {
                navigatedTo: mod,
                title: spec.title,
                locationAnnouncement: spec.locationAnnouncement,
                landmarks: spec.landmarks,
                actions: spec.actions,
              },
            };
          }
          return {
            ok: false,
            toolName: name,
            data: { error: `Unknown destination "${rawPage}". Valid pages: home, onboarding, profile, career, learning, dashboard, employer.` },
          };
        }

        case 'get_current_page_information': {
          return {
            ok: true,
            toolName: name,
            data: getWebsiteStateSnapshot(),
          };
        }

        case 'update_accessibility_settings': {
          const changed: string[] = [];
          if (args.colorMode === 'light' || args.colorMode === 'dark') {
            onSetColorMode(args.colorMode);
            changed.push(`colorMode=${args.colorMode}`);
          }
          if (typeof args.easyRead === 'boolean') {
            onSetEasyRead(args.easyRead);
            changed.push(`easyRead=${args.easyRead}`);
          }
          if (args.language === 'en' || args.language === 'am' || args.language === 'om') {
            await setLanguage(args.language as SupportedLanguage);
            changed.push(`language=${args.language}`);
          }
          if (typeof args.autoOrientationSpeech === 'boolean') {
            onSetAutoOrientationSpeech(args.autoOrientationSpeech);
            changed.push(`autoOrientationSpeech=${args.autoOrientationSpeech}`);
          }
          announce(`Updated accessibility settings: ${changed.join(', ')}`);
          return {
            ok: true,
            toolName: name,
            data: { updated: changed },
          };
        }

        case 'start_registration': {
          const mode = args.mode === 'partner_assisted' ? 'partner_assisted' : 'self';
          setOnboardingReceipt(null);
          setOnboardingSubmitError(null);
          setOnboardingIsReview(false);
          setOnboardingStepIndex(0);
          setOnboardingDraft((prev) => ({
            ...prev,
            registrationMode: mode,
            updatedAtIso: new Date().toISOString(),
          }));
          onNavigate('onboarding');
          const stepsMeta = getOnboardingStepsMeta({
            ...draftRef.current,
            registrationMode: mode,
          });
          announce(`Opened Learner Registration (${mode})`);
          return {
            ok: true,
            toolName: name,
            data: {
              navigatedTo: 'onboarding',
              mode,
              currentStepIndex: 0,
              totalSteps: stepsMeta.length + 1,
              currentStep: stepsMeta[0],
              nextRequiredStep: stepsMeta[1],
            },
          };
        }

        case 'get_registration_status': {
          const draft = draftRef.current;
          const stepsMeta = getOnboardingStepsMeta(draft);
          const stepIdx = stepIndexRef.current;
          const inReview = isReviewRef.current;
          const step = stepsMeta[stepIdx] || stepsMeta[0];
          const errors = inReview ? [] : validateOnboardingStep(step.id, draft);
          return {
            ok: true,
            toolName: name,
            data: {
              stepNumber: inReview ? stepsMeta.length + 1 : stepIdx + 1,
              totalSteps: stepsMeta.length + 1,
              isReviewStep: inReview,
              currentStep: inReview ? { id: 'review', title: t.onboarding.reviewTitle, optional: false } : step,
              validationErrors: errors,
              summary: buildOnboardingSummaryData(draft),
              receipt: onboardingReceipt,
            },
          };
        }

        case 'update_registration_answer': {
          if (activeModuleRef.current !== 'onboarding' && activeModuleRef.current !== 'profile') {
            onNavigate('onboarding');
          }
          setOnboardingReceipt(null);
          setOnboardingSubmitError(null);

          const prev = draftRef.current;
          let nextDraft: OnboardingDraft = {
            ...prev,
            updatedAtIso: new Date().toISOString(),
          };
          const updatedFields: string[] = [];

          if (typeof args.isSharedDevice === 'boolean') {
            nextDraft.isSharedDevice = args.isSharedDevice;
            updatedFields.push('isSharedDevice');
            if (args.isSharedDevice) {
              void deleteDraftFromIndexedDB();
            }
          }
          if (args.registrationMode === 'self' || args.registrationMode === 'partner_assisted') {
            nextDraft.registrationMode = args.registrationMode;
            updatedFields.push('registrationMode');
          }
          if (typeof args.fullName === 'string') {
            nextDraft.fullName = args.fullName.trim();
            updatedFields.push('fullName');
          }
          if (
            args.contactMethod === 'phone' ||
            args.contactMethod === 'email' ||
            args.contactMethod === 'partner_contact' ||
            args.contactMethod === 'none'
          ) {
            nextDraft.contactMethod = args.contactMethod;
            updatedFields.push('contactMethod');
            if (args.contactMethod === 'none') {
              nextDraft.contactValue = '';
            }
          }
          if (typeof args.contactValue === 'string') {
            const rawVal = args.contactValue.trim();
            // Auto-detect email vs phone if caller did not specify contactMethod
            if (!args.contactMethod) {
              if (rawVal.includes('@')) {
                nextDraft.contactMethod = 'email';
              } else if (normalizeEthiopianPhone(rawVal) || /^\+?\d[\d\s-]{6,}$/.test(rawVal)) {
                nextDraft.contactMethod = 'phone';
              }
            }
            if (nextDraft.contactMethod === 'phone') {
              const norm = normalizeEthiopianPhone(rawVal);
              if (!norm) {
                draftRef.current = { ...nextDraft, contactValue: rawVal };
                setOnboardingDraft(draftRef.current);
                if (!args.preserveCurrentStep) {
                  setOnboardingIsReview(false);
                  setOnboardingStepIndex(2);
                  stepIndexRef.current = 2;
                  isReviewRef.current = false;
                }
                return {
                  ok: false,
                  toolName: name,
                  data: {
                    validationError: t.onboarding.errors.invalidEthiopianPhone,
                    field: 'contactValue',
                    preservedDraft: buildOnboardingSummaryData(draftRef.current),
                  },
                };
              }
              nextDraft.contactValue = norm;
            } else {
              nextDraft.contactValue = rawVal;
            }
            updatedFields.push('contactValue');
          }
          if (
            args.identityRoute === 'national_id' ||
            args.identityRoute === 'refugee_id' ||
            args.identityRoute === 'other_document' ||
            args.identityRoute === 'no_documents' ||
            args.identityRoute === 'partner_referral'
          ) {
            nextDraft.identityRoute = args.identityRoute as IdentityRoute;
            updatedFields.push('identityRoute');
          }
          if (typeof args.partnerReferralOrg === 'string') {
            nextDraft.partnerReferralOrg = args.partnerReferralOrg.trim();
            updatedFields.push('partnerReferralOrg');
          }
          if (Array.isArray(args.supportPreferences)) {
            nextDraft.supportPreferences = args.supportPreferences.filter(Boolean) as SupportPreference[];
            updatedFields.push('supportPreferences');
          }
          if (typeof args.supportNotes === 'string') {
            nextDraft.supportNotes = args.supportNotes.trim();
            updatedFields.push('supportNotes');
          }
          if (
            typeof args.partnerOrganizationName === 'string' ||
            typeof args.partnerRepresentativeName === 'string' ||
            typeof args.learnerConsented === 'boolean'
          ) {
            const pc = nextDraft.partnerConsent || {
              learnerConsented: false,
              consentLanguage: language,
              partnerOrganizationName: '',
              representativeName: '',
              sharedFieldsSummary: ['Full name', 'Contact method', 'Selected identity route'],
              recordedAtIso: '',
            };
            nextDraft.partnerConsent = {
              ...pc,
              partnerOrganizationName:
                typeof args.partnerOrganizationName === 'string'
                  ? args.partnerOrganizationName.trim()
                  : pc.partnerOrganizationName,
              representativeName:
                typeof args.partnerRepresentativeName === 'string'
                  ? args.partnerRepresentativeName.trim()
                  : pc.representativeName,
              learnerConsented:
                typeof args.learnerConsented === 'boolean'
                  ? args.learnerConsented
                  : pc.learnerConsented,
              consentLanguage: language,
              recordedAtIso:
                args.learnerConsented === true
                  ? new Date().toISOString()
                  : args.learnerConsented === false
                  ? ''
                  : pc.recordedAtIso,
            };
            updatedFields.push('partnerConsent');
          }

          draftRef.current = nextDraft;
          setOnboardingDraft(nextDraft);

          const stepsMeta = getOnboardingStepsMeta(nextDraft);
          let currentIdx = stepIndexRef.current;

          // Align active UI step with the targeted field so visible inputs reflect live edits immediately,
          // unless caller explicitly preserves the user's current forward wizard position during mid-flow correction.
          if (!args.preserveCurrentStep) {
            if (typeof args.fullName === 'string') {
              currentIdx = 1;
            } else if (typeof args.contactValue === 'string' || args.contactMethod) {
              currentIdx = 2;
            } else if (args.identityRoute) {
              currentIdx = 3;
            } else if (Array.isArray(args.supportPreferences) || typeof args.supportNotes === 'string') {
              currentIdx = 4;
            }
          }

          const stepDef = stepsMeta[currentIdx] || stepsMeta[0];
          const isMethodSwitchOnly =
            !args.advanceToNextStep &&
            Boolean(args.contactMethod) &&
            typeof args.contactValue !== 'string' &&
            nextDraft.contactMethod !== 'none' &&
            !nextDraft.contactValue.trim();

          const stepErrors = isMethodSwitchOnly ? [] : validateOnboardingStep(stepDef.id, nextDraft);
          if (stepErrors.length > 0) {
            setOnboardingIsReview(false);
            setOnboardingStepIndex(currentIdx);
            stepIndexRef.current = currentIdx;
            isReviewRef.current = false;
            return {
              ok: false,
              toolName: name,
              data: {
                updatedFields,
                validationErrors: stepErrors,
                currentStep: stepDef,
                summary: buildOnboardingSummaryData(nextDraft),
              },
            };
          }

          let advancedToReview = false;
          if (args.advanceToNextStep) {
            if (currentIdx < stepsMeta.length - 1) {
              currentIdx += 1;
              setOnboardingIsReview(false);
              setOnboardingStepIndex(currentIdx);
              stepIndexRef.current = currentIdx;
              isReviewRef.current = false;
            } else {
              advancedToReview = true;
              setOnboardingIsReview(true);
              isReviewRef.current = true;
            }
          } else {
            setOnboardingIsReview(false);
            setOnboardingStepIndex(currentIdx);
            stepIndexRef.current = currentIdx;
            isReviewRef.current = false;
          }

          const nextStepMeta = advancedToReview ? null : stepsMeta[currentIdx];
          announce(`Updated registration fields: ${updatedFields.join(', ')}`);
          return {
            ok: true,
            toolName: name,
            data: {
              updatedFields,
              isReviewStep: advancedToReview,
              currentStep: advancedToReview
                ? { id: 'review', title: t.onboarding.reviewTitle, optional: false }
                : nextStepMeta,
              stepNumber: advancedToReview ? stepsMeta.length + 1 : currentIdx + 1,
              totalSteps: stepsMeta.length + 1,
              summary: buildOnboardingSummaryData(nextDraft),
            },
          };
        }

        case 'control_registration_flow': {
          const action = String(args.action || '');
          const draft = draftRef.current;
          const stepsMeta = getOnboardingStepsMeta(draft);

          if (action === 'cancel') {
            onNavigate('home');
            announce('Cancelled registration and returned to Home');
            return { ok: true, toolName: name, data: { cancelled: true, navigatedTo: 'home' } };
          }
          if (action === 'restart') {
            const fresh = { ...DEFAULT_ONBOARDING_DRAFT, updatedAtIso: new Date().toISOString() };
            draftRef.current = fresh;
            setOnboardingDraft(fresh);
            setOnboardingReceipt(null);
            setOnboardingSubmitError(null);
            setOnboardingIsReview(false);
            setOnboardingStepIndex(0);
            stepIndexRef.current = 0;
            isReviewRef.current = false;
            onNavigate('onboarding');
            return {
              ok: true,
              toolName: name,
              data: { restarted: true, currentStep: stepsMeta[0] },
            };
          }
          if (action === 'review') {
            // Check all required steps before review
            const allErrs: Array<{ stepId: string; message: string }> = [];
            for (const s of stepsMeta) {
              for (const msg of validateOnboardingStep(s.id, draft)) {
                allErrs.push({ stepId: s.id, message: msg });
              }
            }
            if (allErrs.length > 0) {
              const firstIdx = stepsMeta.findIndex((s) => s.id === allErrs[0].stepId);
              if (firstIdx >= 0) {
                setOnboardingIsReview(false);
                setOnboardingStepIndex(firstIdx);
                stepIndexRef.current = firstIdx;
                isReviewRef.current = false;
              }
              return {
                ok: false,
                toolName: name,
                data: {
                  validationErrors: allErrs,
                  movedToStep: stepsMeta[firstIdx] || stepsMeta[0],
                },
              };
            }
            setOnboardingIsReview(true);
            isReviewRef.current = true;
            return {
              ok: true,
              toolName: name,
              data: {
                isReviewStep: true,
                summary: buildOnboardingSummaryData(draft),
              },
            };
          }
          if (action === 'goto_step' && typeof args.stepId === 'string') {
            const targetIdx = stepsMeta.findIndex((s) => s.id === args.stepId);
            if (targetIdx >= 0) {
              setOnboardingIsReview(false);
              setOnboardingStepIndex(targetIdx);
              stepIndexRef.current = targetIdx;
              isReviewRef.current = false;
              return {
                ok: true,
                toolName: name,
                data: {
                  stepNumber: targetIdx + 1,
                  totalSteps: stepsMeta.length + 1,
                  currentStep: stepsMeta[targetIdx],
                },
              };
            }
            return { ok: false, toolName: name, data: { error: `Step "${args.stepId}" is not active.` } };
          }
          if (action === 'back') {
            if (isReviewRef.current) {
              const lastIdx = stepsMeta.length - 1;
              setOnboardingIsReview(false);
              setOnboardingStepIndex(lastIdx);
              stepIndexRef.current = lastIdx;
              isReviewRef.current = false;
              return { ok: true, toolName: name, data: { currentStep: stepsMeta[lastIdx] } };
            }
            const prevIdx = Math.max(0, stepIndexRef.current - 1);
            setOnboardingStepIndex(prevIdx);
            stepIndexRef.current = prevIdx;
            return { ok: true, toolName: name, data: { currentStep: stepsMeta[prevIdx] } };
          }
          if (action === 'skip') {
            const curStep = stepsMeta[stepIndexRef.current];
            if (!curStep?.optional) {
              return {
                ok: false,
                toolName: name,
                data: {
                  error: `The "${curStep?.title}" step is required and cannot be skipped.`,
                  currentStep: curStep,
                },
              };
            }
            if (stepIndexRef.current < stepsMeta.length - 1) {
              const nextIdx = stepIndexRef.current + 1;
              setOnboardingStepIndex(nextIdx);
              stepIndexRef.current = nextIdx;
              return { ok: true, toolName: name, data: { skipped: curStep.id, currentStep: stepsMeta[nextIdx] } };
            }
            setOnboardingIsReview(true);
            isReviewRef.current = true;
            return { ok: true, toolName: name, data: { isReviewStep: true, summary: buildOnboardingSummaryData(draft) } };
          }
          // Default: 'next'
          if (isReviewRef.current) {
            return {
              ok: true,
              toolName: name,
              data: { isReviewStep: true, readyForConfirmation: true, summary: buildOnboardingSummaryData(draft) },
            };
          }
          const curStep = stepsMeta[stepIndexRef.current];
          const errs = validateOnboardingStep(curStep.id, draft);
          if (errs.length > 0) {
            return { ok: false, toolName: name, data: { validationErrors: errs, currentStep: curStep } };
          }
          if (stepIndexRef.current < stepsMeta.length - 1) {
            const nextIdx = stepIndexRef.current + 1;
            setOnboardingStepIndex(nextIdx);
            stepIndexRef.current = nextIdx;
            return { ok: true, toolName: name, data: { currentStep: stepsMeta[nextIdx] } };
          }
          setOnboardingIsReview(true);
          isReviewRef.current = true;
          return { ok: true, toolName: name, data: { isReviewStep: true, summary: buildOnboardingSummaryData(draft) } };
        }

        case 'submit_registration': {
          const draft = draftRef.current;
          const stepsMeta = getOnboardingStepsMeta(draft);
          const allErrs: Array<{ stepId: string; message: string }> = [];
          for (const s of stepsMeta) {
            for (const msg of validateOnboardingStep(s.id, draft)) {
              allErrs.push({ stepId: s.id, message: msg });
            }
          }
          if (allErrs.length > 0) {
            const firstIdx = stepsMeta.findIndex((s) => s.id === allErrs[0].stepId);
            if (firstIdx >= 0) {
              setOnboardingIsReview(false);
              setOnboardingStepIndex(firstIdx);
              stepIndexRef.current = firstIdx;
              isReviewRef.current = false;
            }
            return {
              ok: false,
              toolName: name,
              data: {
                error: 'Some required answers are missing or need correction before submitting.',
                validationErrors: allErrs,
                movedToStep: stepsMeta[firstIdx] || stepsMeta[0],
              },
            };
          }

          if (args.confirmed !== true) {
            setOnboardingIsReview(true);
            isReviewRef.current = true;
            return {
              ok: false,
              toolName: name,
              data: {
                confirmationRequired: true,
                message: 'Read this summary back to the learner and ask for explicit confirmation before calling submit_registration with confirmed=true.',
                summary: buildOnboardingSummaryData(draft),
              },
            };
          }

          try {
            const normalizedDraft =
              draft.contactMethod === 'phone' && draft.contactValue.trim()
                ? { ...draft, contactValue: normalizeEthiopianPhone(draft.contactValue) || draft.contactValue }
                : draft;

            const isEdit = activeModuleRef.current === 'profile' && Boolean(learnerIdRef.current);
            let res: SubmissionReceipt;
            if (isEdit && learnerIdRef.current) {
              const updated = await gatewayApi.updateLearner(learnerIdRef.current, normalizedDraft);
              res = {
                id: updated.id,
                submittedAtIso: updated.updatedAtIso,
                mode: gatewayApi.getMode(),
                persistedToServer: gatewayApi.getMode() === 'real',
                notice: t.onboarding.editModeSavedNote,
              };
            } else {
              res = await gatewayApi.submitOnboarding(normalizedDraft);
            }

            setOnboardingReceipt(res);
            setOnboardingSubmitError(null);
            await refreshSavedLearnerProfile();

            const emittedIdRoute =
              normalizedDraft.identityRoute === 'no_documents' || normalizedDraft.identityRoute === 'partner_referral'
                ? 'partner-referral'
                : normalizedDraft.identityRoute;

            emitGatewayEvent(
              'gateway:onboarding-submitted',
              {
                submissionId: res.id,
                mode: res.mode,
                registrationMode: normalizedDraft.registrationMode,
                identityRoute: normalizedDraft.identityRoute,
                supportRequestedFlag: normalizedDraft.supportPreferences.length > 0,
              },
              hostElement
            );
            emitGatewayEvent(
              'db-signup:done',
              {
                submissionId: res.id,
                mode: isEdit ? 'edit' : res.mode,
                profile: {
                  id: res.id,
                  fullName: normalizedDraft.fullName,
                  contactMethod: normalizedDraft.contactMethod,
                  idRoute: emittedIdRoute,
                  registrationMode: normalizedDraft.registrationMode,
                },
              },
              hostElement
            );

            announce(`Registration submitted. Reference ${res.id}`);
            return {
              ok: true,
              toolName: name,
              data: {
                submitted: true,
                receipt: res,
                profile: buildOnboardingSummaryData(normalizedDraft),
              },
            };
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Could not submit registration right now.';
            setOnboardingSubmitError(msg);
            return { ok: false, toolName: name, data: { error: msg } };
          }
        }

        case 'search_jobs': {
          const shouldClear = args.clearFilters === true;
          const nextQuery = shouldClear
            ? String(args.query || '')
            : typeof args.query === 'string'
            ? args.query
            : careerSearchQuery;
          const nextCats = shouldClear
            ? Array.isArray(args.categories)
              ? (args.categories.filter((c) => VALID_CATEGORIES.includes(c as AccommodationCategory)) as AccommodationCategory[])
              : []
            : Array.isArray(args.categories)
            ? (args.categories.filter((c) => VALID_CATEGORIES.includes(c as AccommodationCategory)) as AccommodationCategory[])
            : careerSelectedCategories;

          setCareerSearchQuery(nextQuery);
          setCareerSelectedCategories(nextCats);
          if (args.navigateToCareers !== false) {
            setApplyingJob(null);
            onNavigate('career');
          }

          try {
            const results = await gatewayApi.listJobs(nextQuery, nextCats);
            setCareerJobs(results);
            jobsRef.current = results;
            referencedJobIdRef.current = results[0]?.id || null;
            announce(`Found ${results.length} matching jobs`);
            return {
              ok: true,
              toolName: name,
              data: {
                query: nextQuery,
                categories: nextCats,
                totalMatches: results.length,
                jobs: results.map((j, i) => ({
                  index: i + 1,
                  id: j.id,
                  title: j.title,
                  organization: j.organization,
                  location: j.location,
                  isRemote: j.isRemote,
                  employmentType: j.employmentType,
                  summary: j.descriptionSummary,
                  accommodationsOffered: j.accommodationsOffered,
                  requiredSkills: j.requiredSkills,
                })),
              },
            };
          } catch (err) {
            return {
              ok: false,
              toolName: name,
              data: { error: err instanceof Error ? err.message : 'Could not load jobs right now.' },
            };
          }
        }

        case 'get_job_details': {
          const job = await resolveJobFromList(String(args.jobIdentifier || ''));
          if (!job) {
            return {
              ok: false,
              toolName: name,
              data: { error: 'No matching job found. Ask to search jobs first or specify the job number or title.' },
            };
          }
          referencedJobIdRef.current = job.id;
          return {
            ok: true,
            toolName: name,
            data: { job },
          };
        }

        case 'start_job_application': {
          const job = await resolveJobFromList(String(args.jobIdentifier || ''));
          if (!job) {
            return {
              ok: false,
              toolName: name,
              data: { error: 'Could not find that job to apply. Search jobs first or give the job title or number.' },
            };
          }
          referencedJobIdRef.current = job.id;
          const profile = savedLearnerProfile || (await refreshSavedLearnerProfile());
          const prefillName = draftRef.current.fullName || profile?.fullName || '';
          const prefillContact = draftRef.current.contactValue || profile?.contactValue || '';
          const freshDraft = createDefaultJobAppDraft(job.id, prefillName, prefillContact);
          setApplyingJob(job);
          applyingJobRef.current = job;
          setJobAppDraft(freshDraft);
          jobAppDraftRef.current = freshDraft;
          setJobAppStepIndex(0);
          jobAppStepRef.current = 0;
          setJobAppIsReview(false);
          jobAppReviewRef.current = false;
          setJobAppReceipt(null);
          onNavigate('career');
          announce(`Started application for ${job.title}`);
          return {
            ok: true,
            toolName: name,
            data: {
              started: true,
              jobTitle: job.title,
              organization: job.organization,
              prefilledName: prefillName || null,
              prefilledContact: prefillContact || null,
              currentStepIndex: 0,
              currentStepId: 'app-name',
              currentStepPrompt: t.career.applyFlow.stepNameTitle,
            },
          };
        }

        case 'update_job_application_answer': {
          const job = applyingJobRef.current;
          if (!job) {
            return {
              ok: false,
              toolName: name,
              data: { error: 'No job application is currently open. Choose a job first with start_job_application.' },
            };
          }
          const next = { ...jobAppDraftRef.current };
          const updated: string[] = [];

          if (typeof args.applicantName === 'string') {
            next.applicantName = args.applicantName.trim();
            updated.push('applicantName');
          }
          if (typeof args.contactValue === 'string') {
            const raw = args.contactValue.trim();
            const norm = !raw.includes('@') ? normalizeEthiopianPhone(raw) : null;
            next.contactValue = norm || raw;
            updated.push('contactValue');
          }
          if (typeof args.relevantExperience === 'string') {
            next.relevantExperience = args.relevantExperience.trim();
            updated.push('relevantExperience');
          }
          if (typeof args.shareAccommodationRequest === 'boolean') {
            next.shareAccommodationRequest = args.shareAccommodationRequest;
            if (!args.shareAccommodationRequest) {
              next.explicitConsentToShare = false;
            }
            updated.push('shareAccommodationRequest');
          }
          if (typeof args.accommodationRequestNote === 'string') {
            next.accommodationRequestNote = args.accommodationRequestNote.trim();
            next.shareAccommodationRequest = true;
            updated.push('accommodationRequestNote');
          }
          if (typeof args.explicitConsentToShare === 'boolean') {
            next.explicitConsentToShare = args.explicitConsentToShare;
            updated.push('explicitConsentToShare');
          }

          jobAppDraftRef.current = next;
          setJobAppDraft(next);

          let step = jobAppStepRef.current;
          if (args.advanceToNextStep) {
            if (typeof args.applicantName === 'string' && !next.contactValue) {
              step = 1;
            } else if (typeof args.contactValue === 'string') {
              step = 2;
            } else if (typeof args.relevantExperience === 'string') {
              step = 3;
            } else {
              step = Math.min(3, step + 1);
            }
          } else {
            if (typeof args.applicantName === 'string') {
              step = 0;
            } else if (typeof args.contactValue === 'string') {
              step = 1;
            } else if (typeof args.relevantExperience === 'string') {
              step = 2;
            } else if (
              typeof args.shareAccommodationRequest === 'boolean' ||
              typeof args.accommodationRequestNote === 'string' ||
              typeof args.explicitConsentToShare === 'boolean'
            ) {
              step = 3;
            }
          }

          let inReview = false;
          if (
            args.advanceToNextStep &&
            step >= 3 &&
            typeof args.shareAccommodationRequest === 'boolean' &&
            (!next.shareAccommodationRequest || next.explicitConsentToShare)
          ) {
            inReview = true;
          }

          jobAppStepRef.current = step;
          setJobAppStepIndex(step);
          jobAppReviewRef.current = inReview;
          setJobAppIsReview(inReview);

          return {
            ok: true,
            toolName: name,
            data: {
              updated,
              stepIndex: step,
              isReviewStep: inReview,
              draft: next,
            },
          };
        }

        case 'control_job_application_flow': {
          const job = applyingJobRef.current;
          if (!job) {
            return { ok: false, toolName: name, data: { error: 'No active job application.' } };
          }
          const action = String(args.action || 'next');
          if (action === 'cancel') {
            setApplyingJob(null);
            applyingJobRef.current = null;
            return { ok: true, toolName: name, data: { cancelled: true } };
          }
          if (action === 'back') {
            if (jobAppReviewRef.current) {
              setJobAppIsReview(false);
              jobAppReviewRef.current = false;
              setJobAppStepIndex(3);
              jobAppStepRef.current = 3;
            } else {
              const prev = Math.max(0, jobAppStepRef.current - 1);
              setJobAppStepIndex(prev);
              jobAppStepRef.current = prev;
            }
            return { ok: true, toolName: name, data: { stepIndex: jobAppStepRef.current, isReviewStep: jobAppReviewRef.current } };
          }
          if (action === 'review') {
            setJobAppIsReview(true);
            jobAppReviewRef.current = true;
            return { ok: true, toolName: name, data: { isReviewStep: true, draft: jobAppDraftRef.current } };
          }
          if (action === 'next' || action === 'skip') {
            if (jobAppStepRef.current < 3) {
              const next = jobAppStepRef.current + 1;
              setJobAppStepIndex(next);
              jobAppStepRef.current = next;
              return { ok: true, toolName: name, data: { stepIndex: next, isReviewStep: false } };
            }
            setJobAppIsReview(true);
            jobAppReviewRef.current = true;
            return { ok: true, toolName: name, data: { isReviewStep: true, draft: jobAppDraftRef.current } };
          }
          return { ok: false, toolName: name, data: { error: `Unsupported action ${action}` } };
        }

        case 'submit_job_application': {
          const job = applyingJobRef.current;
          if (!job) {
            return { ok: false, toolName: name, data: { error: 'No active job application to submit.' } };
          }
          const d = jobAppDraftRef.current;
          if (!d.applicantName.trim() || !d.contactValue.trim()) {
            const targetStep = !d.applicantName.trim() ? 0 : 1;
            setJobAppStepIndex(targetStep);
            jobAppStepRef.current = targetStep;
            setJobAppIsReview(false);
            jobAppReviewRef.current = false;
            return {
              ok: false,
              toolName: name,
              data: {
                error: 'Applicant name and contact information are required before submitting.',
                draft: d,
              },
            };
          }
          if (d.shareAccommodationRequest && !d.explicitConsentToShare) {
            setJobAppStepIndex(3);
            jobAppStepRef.current = 3;
            setJobAppIsReview(false);
            jobAppReviewRef.current = false;
            return {
              ok: false,
              toolName: name,
              data: {
                error: 'You selected sharing an adjustment note, so explicit consent must be confirmed or sharing turned off.',
              },
            };
          }
          if (args.confirmed !== true) {
            setJobAppIsReview(true);
            jobAppReviewRef.current = true;
            return {
              ok: false,
              toolName: name,
              data: {
                confirmationRequired: true,
                jobTitle: job.title,
                draft: d,
              },
            };
          }
          try {
            const payload: JobApplicationDraft = d.shareAccommodationRequest
              ? d
              : { ...d, accommodationRequestNote: '', explicitConsentToShare: false };
            const res = await gatewayApi.submitJobApplication(payload);
            setJobAppReceipt(res);
            emitGatewayEvent(
              'gateway:job-applied',
              {
                jobId: job.id,
                applicationId: res.id,
                mode: res.mode,
                sharedAccommodationConsent: Boolean(
                  payload.shareAccommodationRequest && payload.explicitConsentToShare
                ),
              },
              hostElement
            );
            announce(`Job application submitted for ${job.title}`);
            return {
              ok: true,
              toolName: name,
              data: { submitted: true, jobTitle: job.title, receipt: res },
            };
          } catch (err) {
            return {
              ok: false,
              toolName: name,
              data: { error: err instanceof Error ? err.message : 'Could not submit application.' },
            };
          }
        }

        case 'get_user_profile': {
          const profile = await refreshSavedLearnerProfile();
          if (args.openProfilePage) {
            onNavigate('profile');
          }
          if (!profile) {
            return {
              ok: true,
              toolName: name,
              data: {
                hasSavedProfile: false,
                message: 'No saved learner profile was found yet on this device or server.',
              },
            };
          }
          return {
            ok: true,
            toolName: name,
            data: {
              hasSavedProfile: true,
              profile: {
                id: profile.id,
                fullName: profile.fullName,
                contactMethod: profile.contactMethod,
                contactValue: profile.contactValue,
                identityRoute: profile.identityRoute,
                supportPreferences: profile.supportPreferences || [],
                supportNotes: profile.supportNotes || '',
                updatedAtIso: profile.updatedAtIso,
              },
            },
          };
        }

        case 'update_user_profile': {
          const current = savedLearnerProfile || (await refreshSavedLearnerProfile());
          if (!current) {
            return {
              ok: false,
              toolName: name,
              data: { error: 'No saved profile exists yet. Start registration first.' },
            };
          }
          if (args.confirmed !== true) {
            return {
              ok: false,
              toolName: name,
              data: {
                confirmationRequired: true,
                message: 'Ask user to confirm saving these profile updates, then pass confirmed=true.',
                pendingChanges: args,
              },
            };
          }
          const patch: Partial<OnboardingDraft> = {};
          if (typeof args.fullName === 'string') patch.fullName = args.fullName.trim();
          if (
            args.contactMethod === 'phone' ||
            args.contactMethod === 'email' ||
            args.contactMethod === 'partner_contact' ||
            args.contactMethod === 'none'
          ) {
            patch.contactMethod = args.contactMethod;
          }
          if (typeof args.contactValue === 'string') {
            const raw = args.contactValue.trim();
            patch.contactValue = normalizeEthiopianPhone(raw) || raw;
          }
          if (typeof args.identityRoute === 'string') {
            patch.identityRoute = args.identityRoute as IdentityRoute;
          }
          if (typeof args.supportNotes === 'string') {
            patch.supportNotes = args.supportNotes.trim();
          }

          try {
            const updated = await gatewayApi.updateLearner(current.id, patch);
            setSavedLearnerProfile(updated);
            setOnboardingDraft((prev) => ({ ...prev, ...patch }));
            announce('Profile updated');
            return { ok: true, toolName: name, data: { updated: true, profile: updated } };
          } catch (err) {
            return {
              ok: false,
              toolName: name,
              data: { error: err instanceof Error ? err.message : 'Failed to update profile.' },
            };
          }
        }

        case 'delete_user_profile': {
          if (args.confirmed !== true) {
            return {
              ok: false,
              toolName: name,
              data: {
                confirmationRequired: true,
                message:
                  'Account and draft deletion is permanent. Ask the user to confirm explicitly before calling delete_user_profile with confirmed=true.',
              },
            };
          }
          try {
            await gatewayApi.deleteLearner(savedLearnerProfile?.id);
            await deleteDraftFromIndexedDB();
            setSavedLearnerProfile(null);
            setOnboardingDraft({ ...DEFAULT_ONBOARDING_DRAFT, updatedAtIso: new Date().toISOString() });
            setOnboardingReceipt(null);
            announce('Saved profile and drafts permanently deleted');
            return { ok: true, toolName: name, data: { deleted: true } };
          } catch (err) {
            return {
              ok: false,
              toolName: name,
              data: { error: err instanceof Error ? err.message : 'Could not delete profile.' },
            };
          }
        }

        case 'get_learning_resources': {
          const cat =
            args.category === 'se' ||
            args.category === 'data' ||
            args.category === 'ai' ||
            args.category === 'a11y' ||
            args.category === 'all'
              ? args.category
              : 'all';
          setLearningCategory(cat);
          if (args.navigateToLearning !== false) {
            onNavigate('learning');
          }
          const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
          const tracks = LEARNING_TRACKS.filter((track) => {
            const matchesCat = cat === 'all' || track.category === cat;
            const matchesQ =
              !q ||
              track.title.toLowerCase().includes(q) ||
              track.summary.toLowerCase().includes(q) ||
              track.outcomes.some((o) => o.toLowerCase().includes(q));
            return matchesCat && matchesQ;
          });
          if (tracks[0]) {
            referencedTrackIdRef.current = tracks[0].id;
          }
          return {
            ok: true,
            toolName: name,
            data: { category: cat, count: tracks.length, tracks },
          };
        }

        default:
          return { ok: false, toolName: name, data: { error: `Unknown tool: ${name}` } };
      }
    },
    [
      buildOnboardingSummaryData,
      careerSearchQuery,
      careerSelectedCategories,
      getOnboardingStepsMeta,
      getWebsiteStateSnapshot,
      hostElement,
      language,
      onGoBack,
      onNavigate,
      onSetAutoOrientationSpeech,
      onSetColorMode,
      onSetEasyRead,
      onboardingReceipt,
      refreshSavedLearnerProfile,
      resolveJobFromList,
      savedLearnerProfile,
      setLanguage,
      t,
      validateOnboardingStep,
    ]
  );

  return (
    <WebsiteAgentContext.Provider
      value={{
        activeModule,
        navigateTo: onNavigate,
        goBackModule: onGoBack,
        colorMode,
        setColorMode: onSetColorMode,
        easyRead,
        setEasyRead: onSetEasyRead,
        autoOrientationSpeech,
        setAutoOrientationSpeech: onSetAutoOrientationSpeech,
        onboardingDraft,
        setOnboardingDraft,
        onboardingStepIndex,
        setOnboardingStepIndex,
        onboardingIsReview,
        setOnboardingIsReview,
        onboardingReceipt,
        setOnboardingReceipt,
        onboardingLearnerId,
        setOnboardingLearnerId,
        onboardingSubmitError,
        setOnboardingSubmitError,
        careerSearchQuery,
        setCareerSearchQuery,
        careerSelectedCategories,
        setCareerSelectedCategories,
        careerJobs,
        setCareerJobs,
        applyingJob,
        setApplyingJob,
        jobAppDraft,
        setJobAppDraft,
        jobAppStepIndex,
        setJobAppStepIndex,
        jobAppIsReview,
        setJobAppIsReview,
        jobAppReceipt,
        setJobAppReceipt,
        learningCategory,
        setLearningCategory,
        savedLearnerProfile,
        refreshSavedLearnerProfile,
        lastActionFeedback,
        getWebsiteStateSnapshot,
        executeWebsiteTool,
      }}
    >
      {children}
    </WebsiteAgentContext.Provider>
  );
};
