export type SupportedLanguage = 'en' | 'am' | 'om';
export type ActiveLanguage = SupportedLanguage;
export type SpeechLanguageOption = 'auto' | SupportedLanguage;

export type GatewayModule =
  | 'home'
  | 'onboarding'
  | 'profile'
  | 'career'
  | 'learning'
  | 'dashboard'
  | 'employer'
  | 'form_builder'
  | 'judge';

export type IdentityRoute =
  | 'national_id'
  | 'refugee_id'
  | 'other_document'
  | 'no_documents'
  | 'partner_referral';

export type SupportPreference =
  | 'help_completing'
  | 'communication_assistance'
  | 'alternative_materials'
  | 'flexible_scheduling'
  | 'other_support'
  | 'discuss_privately';

export type AccommodationCategory =
  | 'remote_flexible'
  | 'flexible_hours'
  | 'screen_reader_tools'
  | 'accessible_workplace'
  | 'assistive_tech'
  | 'communication_support'
  | 'other_accommodations';

export type SaveStorageStatus =
  | 'memory_only'
  | 'device_indexeddb'
  | 'server_saved'
  | 'not_saved_error';

export interface ConsentRecord {
  learnerConsented: boolean;
  consentLanguage: SupportedLanguage;
  partnerOrganizationName: string;
  representativeName: string;
  sharedFieldsSummary: string[];
  recordedAtIso: string;
}

export interface OnboardingDraft {
  isSharedDevice: boolean | null;
  registrationMode: 'self' | 'partner_assisted';
  fullName: string;
  contactMethod: 'phone' | 'email' | 'partner_contact' | 'none';
  contactValue: string;
  identityRoute: IdentityRoute | '';
  identityReferenceNumber: string; // Never persisted in localStorage or unconsented IndexedDB
  partnerReferralOrg: string;
  supportPreferences: SupportPreference[];
  supportNotes: string;
  partnerConsent?: ConsentRecord;
  updatedAtIso: string;
}

// ADDED: Track 1 Learner Profile record for /api/v1/learners CRUD & profile edit mode
export interface LearnerProfile {
  id: string;
  registrationMode: 'self' | 'partner_assisted';
  fullName: string;
  contactMethod: 'phone' | 'email' | 'partner_contact' | 'none';
  contactValue: string;
  identityRoute: IdentityRoute | '';
  idRoute: string;
  partnerReferralOrg: string;
  supportPreferences?: SupportPreference[];
  supportNotes?: string;
  partnerConsent?: ConsentRecord;
  updatedAtIso: string;
}

export interface EmployerAccommodationDetails {
  workEnvironmentAccessibility: string;
  remoteOrFlexibleArrangements: string;
  assistiveTechnologyAvailable: string;
  communicationOptions: string;
  interviewAccommodations: string;
  applicationProcessAccommodations: string;
  additionalSupportOffered: string;
}

export interface JobPosting {
  id: string;
  organizationId?: string;
  title: string;
  organization: string;
  location: string;
  isRemote: boolean;
  employmentType: 'Full-time' | 'Part-time' | 'Apprenticeship' | 'Contract' | 'Fellowship';
  descriptionSummary: string;
  requiredSkills: string[];
  accommodationCategories: AccommodationCategory[];
  accommodationsOffered: string[];
  accommodationDetails: EmployerAccommodationDetails;
  applicationDeadline?: string;
  postedAtIso: string;
  isDemoData: boolean;
}

export interface JobApplicationDraft {
  jobId: string;
  applicantName: string;
  contactValue: string;
  relevantExperience: string;
  shareAccommodationRequest: boolean;
  accommodationRequestNote: string;
  explicitConsentToShare: boolean;
  resumeFileId?: string | null;
}

export interface ApiCapabilities {
  mode: 'mock' | 'real';
  serverDraftsEnabled: boolean;
  smsResumeEnabled: boolean;
  backendReachable: boolean;
  message: string;
}

export interface SubmissionReceipt {
  id: string;
  submittedAtIso: string;
  mode: 'mock' | 'real';
  persistedToServer: boolean;
  notice: string;
}

export interface ThemeConfig {
  id: string;
  organizationName: string;
  logoText: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  defaultLanguage: ActiveLanguage;
  introText?: string;
}

export interface ValidatedTheme extends ThemeConfig {
  effectivePrimary: string;
  effectivePrimaryText: string;
  effectiveSecondary: string;
  effectiveSecondaryText: string;
  primaryAdjusted: boolean;
  secondaryAdjusted: boolean;
  primaryContrastRatio: number;
  secondaryContrastRatio: number;
  warnings: string[];
}

export type GatewayEventName =
  | 'gateway:onboarding-started'
  | 'gateway:step-changed'
  | 'gateway:draft-saved'
  | 'gateway:onboarding-submitted'
  | 'gateway:support-requested'
  | 'gateway:job-applied'
  | 'gateway:error'
  // ADDED: Track 1 db-signup compatible events
  | 'db-signup:step'
  | 'db-signup:done'
  | 'db-signup:support';

export interface GatewayEventPayloadMap {
  'gateway:onboarding-started': {
    tenantKey: string;
    language: SupportedLanguage;
    timestamp: string;
  };
  'gateway:step-changed': {
    flow: 'onboarding' | 'job_application' | 'json_form';
    stepId: string;
    stepIndex: number;
    totalSteps: number;
  };
  'gateway:draft-saved': {
    storage: SaveStorageStatus;
    sensitiveExcluded: boolean;
    timestamp: string;
  };
  'gateway:onboarding-submitted': {
    submissionId: string;
    mode: 'mock' | 'real';
    registrationMode: 'self' | 'partner_assisted';
    identityRoute: IdentityRoute | '';
    // Private support preferences and identity numbers are NEVER included by default
    supportRequestedFlag: boolean;
  };
  'gateway:support-requested': {
    hasSupportRequest: boolean;
    // Only included when learner explicitly consents to share with host
    consentedCategories?: SupportPreference[];
  };
  'gateway:job-applied': {
    jobId: string;
    applicationId: string;
    mode: 'mock' | 'real';
    sharedAccommodationConsent: boolean;
  };
  'gateway:error': {
    code: string;
    message: string;
    recoverable: boolean;
  };
  // ADDED: Track 1 db-signup event payloads
  'db-signup:step': {
    step: number;
    of: number;
  };
  'db-signup:done': {
    submissionId: string;
    mode: 'mock' | 'real' | 'edit';
    profile: {
      id?: string;
      fullName: string;
      contactMethod: string;
      idRoute: string;
      registrationMode: 'self' | 'partner_assisted';
    };
  };
  'db-signup:support': {
    hasSupportRequest: boolean;
  };
}

export type LocalizedText = {
  en: string;
  am: string;
  om: string;
};

export type AdminRole = 'platform_admin' | 'org_admin';
export type UserRole = 'learner' | 'employer' | 'coordinator';

export interface AdminAccountSummary {
  id: string;
  username: string;
  role: AdminRole;
  organizationId: string | null;
  mustChangeCredentials: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface UserAccountSummary {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string | null;
  createdAt: string;
}

export type OrganizationType =
  | 'university'
  | 'ngo'
  | 'company'
  | 'employer'
  | 'training_institution'
  | 'career_platform';

export interface OrganizationBranding {
  primaryColor: string;
  secondaryColor: string;
  logoText: string;
  introText: string;
  defaultLanguage: SupportedLanguage;
}

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  type: OrganizationType;
  branding: OrganizationBranding;
  onboardingConfig: {
    allowAnonymousOnboarding: boolean;
    requireConsentRecord: boolean;
    defaultFormId?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export type FormQuestionType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'yes_no'
  | 'file'
  | 'address'
  | 'consent';

export interface FormQuestionOption {
  value: string;
  label: LocalizedText;
  description?: LocalizedText;
}

export interface FormConditionalRule {
  dependsOnKey: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy';
  value?: string;
}

export interface FormQuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  allowedMimeTypes?: string[];
  maxFileSizeBytes?: number;
}

export interface FormBuilderQuestion {
  id: string;
  sectionId: string;
  fieldKey: string;
  sortOrder: number;
  questionType: FormQuestionType;
  label: LocalizedText;
  helpText: LocalizedText;
  whyWeAsk: LocalizedText;
  placeholder: LocalizedText;
  required: boolean;
  sensitive: boolean;
  options: FormQuestionOption[];
  validation: FormQuestionValidation;
  conditionalLogic: FormConditionalRule | null;
}

export interface FormBuilderSection {
  id: string;
  sortOrder: number;
  title: LocalizedText;
  description: LocalizedText;
}

export type FormStatus = 'draft' | 'published' | 'archived';
export type FormCategory = 'onboarding' | 'career' | 'feedback' | 'custom';

export interface FormBuilderForm {
  id: string;
  organizationId: string;
  slug: string;
  type: FormCategory;
  status: FormStatus;
  isTemplate: boolean;
  activeVersionId: string | null;
  title: LocalizedText;
  description: LocalizedText;
  submitLabel: LocalizedText;
  doneMessage: LocalizedText;
  branding: OrganizationBranding;
  sections: FormBuilderSection[];
  questions: FormBuilderQuestion[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormVersionRecord {
  id: string;
  formId: string;
  organizationId: string;
  versionNumber: number;
  status: 'published' | 'archived';
  publishedBy: string;
  publishedAt: string;
  schemaSnapshot: {
    id: string;
    organizationId: string;
    slug: string;
    type: FormCategory;
    title: LocalizedText;
    description: LocalizedText;
    submitLabel: LocalizedText;
    doneMessage: LocalizedText;
    branding: OrganizationBranding;
    sections: FormBuilderSection[];
    questions: FormBuilderQuestion[];
  };
}

export interface FormSubmissionRecord {
  id: string;
  organizationId: string;
  formId: string;
  formVersionId: string;
  userId: string | null;
  status: 'submitted' | 'reviewed' | 'archived';
  answers: Record<string, unknown>;
  submittedAt: string;
}

export interface UploadedFileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  organizationId: string | null;
  createdAt: string;
}

export interface JobApplicationRecord {
  id: string;
  jobId: string;
  jobTitle?: string;
  organization?: string;
  organizationId: string;
  applicantName: string;
  contactValue: string;
  relevantExperience: string;
  shareAccommodationRequest: boolean;
  accommodationRequestNote: string;
  explicitConsentToShare: boolean;
  resumeFileId: string | null;
  status: 'submitted' | 'in_review' | 'shortlisted' | 'archived';
  submittedAt: string;
  updatedAt: string;
}

export interface PrivateSupportRecord {
  id: string;
  learnerId: string;
  organizationId: string;
  supportPreferences: SupportPreference[];
  supportNotes: string;
  consentToShareWithEmployer: boolean;
  updatedAt: string;
}

export interface DashboardAnalyticsSummary {
  organizationCount: number;
  learnerCount: number;
  onboardingSessionCount: number;
  completedRegistrationCount: number;
  formCount: number;
  publishedFormCount: number;
  formSubmissionCount: number;
  jobCount: number;
  applicationCount: number;
  privateSupportRequestCount: number;
  feedbackCount: number;
}

