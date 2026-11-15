import { type FunctionDeclaration, Type } from '@google/genai';

/**
 * Gemini Function Declarations connecting the AI Voice Assistant and Gemini Live
 * directly to real Savanna & ALX Accessibility Gateway controls and backend APIs.
 */
export const WEBSITE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'navigate_to_page',
    description:
      'Navigate the user immediately to a real section of the website (or go back to the previous page). Always call this when the user wants to open a section.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        page: {
          type: Type.STRING,
          enum: ['home', 'onboarding', 'profile', 'career', 'learning', 'dashboard', 'employer', 'back'],
          description: 'Destination page module or "back" for previous page.',
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'get_current_page_information',
    description:
      'Inspect the user’s current page, active form step, entered field values, visible jobs, and available actions.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'update_accessibility_settings',
    description:
      'Update live UI accessibility settings such as Dark/Light mode, Easy Read mode, UI Language (en, am, om), or automatic page orientation speech.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        colorMode: {
          type: Type.STRING,
          enum: ['light', 'dark'],
          description: 'Switch between light mode and dark mode.',
        },
        easyRead: {
          type: Type.BOOLEAN,
          description: 'Turn Easy Read plain-language spacing mode on or off.',
        },
        language: {
          type: Type.STRING,
          enum: ['en', 'am', 'om'],
          description: 'Switch UI and voice language cleanly to en, am, or om.',
        },
        autoOrientationSpeech: {
          type: Type.BOOLEAN,
          description: 'Enable or disable automatic spoken orientation announcements on navigation.',
        },
      },
    },
  },
  {
    name: 'start_registration',
    description:
      'Open the actual Learner Registration wizard and start (or resume) registration step-by-step.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          enum: ['self', 'partner_assisted'],
          description: 'Whether learner registers independently ("self") or via a partner ("partner_assisted").',
        },
      },
    },
  },
  {
    name: 'get_registration_status',
    description:
      'Read the current registration step, question wording, whether the step is optional, entered non-sensitive answers, and any validation error.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'update_registration_answer',
    description:
      'Enter or correct one or more real fields on the active registration form, validate them using the platform rules, and optionally advance to the next step.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        isSharedDevice: {
          type: Type.BOOLEAN,
          description: 'True if using a shared phone/public PC (never save locally); false if personal device.',
        },
        registrationMode: {
          type: Type.STRING,
          enum: ['self', 'partner_assisted'],
        },
        fullName: {
          type: Type.STRING,
          description: 'Learner full name.',
        },
        contactMethod: {
          type: Type.STRING,
          enum: ['phone', 'email', 'partner_contact', 'none'],
          description: 'Preferred way to contact learner (or "none" to skip sharing contact).',
        },
        contactValue: {
          type: Type.STRING,
          description: 'Phone number (09..., 07..., +251...), email address, or partner contact desk.',
        },
        identityRoute: {
          type: Type.STRING,
          enum: ['national_id', 'refugee_id', 'other_document', 'no_documents', 'partner_referral'],
          description: 'Chosen flexible identity route. Kebele ID is optional.',
        },
        partnerReferralOrg: {
          type: Type.STRING,
          description: 'Optional partner organization name when identityRoute is partner_referral.',
        },
        supportPreferences: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: [
              'help_completing',
              'communication_assistance',
              'alternative_materials',
              'flexible_scheduling',
              'other_support',
              'discuss_privately',
            ],
          },
          description: 'Private accessibility/learning support options (optional; never shared with employers).',
        },
        supportNotes: {
          type: Type.STRING,
          description: 'Optional plain-language note about what access support helps the learner.',
        },
        partnerOrganizationName: {
          type: Type.STRING,
          description: 'Partner organization name for partner-assisted registration.',
        },
        partnerRepresentativeName: {
          type: Type.STRING,
          description: 'Partner representative full name for partner-assisted registration.',
        },
        learnerConsented: {
          type: Type.BOOLEAN,
          description: 'True once learner explicitly consents in partner-assisted mode.',
        },
        advanceToNextStep: {
          type: Type.BOOLEAN,
          description: 'If true, validates current step and advances to the next step or review summary when valid.',
        },
      },
    },
  },
  {
    name: 'control_registration_flow',
    description:
      'Move between registration steps (next, back, skip optional step, open review summary, jump to specific step for edits, or cancel/restart).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['next', 'back', 'skip', 'review', 'cancel', 'restart', 'goto_step'],
        },
        stepId: {
          type: Type.STRING,
          enum: ['device-privacy', 'full-name', 'contact', 'identity-route', 'private-support', 'partner-consent'],
          description: 'Target step when action is "goto_step".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'submit_registration',
    description:
      'Submit the completed registration form to the real backend/mock adapter. MUST only be called with confirmed=true AFTER reading the summary and receiving explicit user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Must be true only after the learner explicitly confirms submitting their registration.',
        },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'search_jobs',
    description:
      'Search and filter real inclusive jobs in the Career Gateway by keywords and/or workplace accommodation categories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keywords (job title, location, remote, skills, organization).',
        },
        categories: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: [
              'remote_flexible',
              'flexible_hours',
              'screen_reader_tools',
              'accessible_workplace',
              'assistive_tech',
              'communication_support',
              'other_accommodations',
            ],
          },
          description: 'Workplace accommodation filters to apply.',
        },
        clearFilters: {
          type: Type.BOOLEAN,
          description: 'If true, clears active job search filters before searching.',
        },
        navigateToCareers: {
          type: Type.BOOLEAN,
          description: 'If true (default), switches view to the Accessible Jobs page so the user sees live filtered results.',
        },
      },
    },
  },
  {
    name: 'get_job_details',
    description:
      'Get full details, required skills, and workplace/interview accommodations for a real job posting by ID, 1-based result number, or title.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobIdentifier: {
          type: Type.STRING,
          description: 'Job ID (e.g. demo-job-1), 1-based list number ("1"), or partial title.',
        },
      },
      required: ['jobIdentifier'],
    },
  },
  {
    name: 'start_job_application',
    description:
      'Open the real accessible job application form for a selected job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobIdentifier: {
          type: Type.STRING,
          description: 'Job ID, 1-based list number, or partial title.',
        },
      },
      required: ['jobIdentifier'],
    },
  },
  {
    name: 'update_job_application_answer',
    description:
      'Enter or update fields on the active job application form and optionally advance to the next step.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        applicantName: { type: Type.STRING },
        contactValue: { type: Type.STRING },
        relevantExperience: { type: Type.STRING },
        shareAccommodationRequest: { type: Type.BOOLEAN },
        accommodationRequestNote: { type: Type.STRING },
        explicitConsentToShare: { type: Type.BOOLEAN },
        advanceToNextStep: { type: Type.BOOLEAN },
      },
    },
  },
  {
    name: 'control_job_application_flow',
    description:
      'Move between job application steps (next, back, skip, review, cancel back to jobs list).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['next', 'back', 'skip', 'review', 'cancel'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'submit_job_application',
    description:
      'Submit the job application after the applicant reviews and explicitly confirms.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Must be true only after explicit user confirmation.',
        },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'get_user_profile',
    description:
      'Retrieve the learner’s saved profile details (non-sensitive fields) and optionally open My Profile.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        openProfilePage: {
          type: Type.BOOLEAN,
          description: 'If true, navigates to My Profile.',
        },
      },
    },
  },
  {
    name: 'update_user_profile',
    description:
      'Update saved learner profile fields (name, contact method/value, identity route, support preferences/notes). Requires confirmed=true.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING },
        contactMethod: {
          type: Type.STRING,
          enum: ['phone', 'email', 'partner_contact', 'none'],
        },
        contactValue: { type: Type.STRING },
        identityRoute: {
          type: Type.STRING,
          enum: ['national_id', 'refugee_id', 'other_document', 'no_documents', 'partner_referral'],
        },
        supportNotes: { type: Type.STRING },
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Must be true after user confirms updating their saved profile.',
        },
      },
    },
  },
  {
    name: 'delete_user_profile',
    description:
      'Permanently delete the learner’s saved profile and local device draft. Strictly requires confirmed=true.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Must be true only after asking and receiving explicit user confirmation to permanently delete.',
        },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'get_learning_resources',
    description:
      'Browse, filter, or search real ALX and assistive-technology learning resources and optionally open the Learning Resources page.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: ['all', 'se', 'data', 'ai', 'a11y'],
          description: 'Filter track: all, se (Software Engineering), data (Data Science), ai (AI Essentials), a11y (Assistive Tech).',
        },
        query: {
          type: Type.STRING,
          description: 'Optional keyword search across course titles, summaries, and outcomes.',
        },
        navigateToLearning: {
          type: Type.BOOLEAN,
          description: 'If true, navigates to the Learning Resources page.',
        },
      },
    },
  },
];
