import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateId, hashPassword } from '../security/crypto.ts';

export type AppDatabase = DatabaseSync;

export function createDatabase(dbPathInput?: string): AppDatabase {
  const resolvedPath =
    dbPathInput ||
    process.env.DATABASE_PATH ||
    path.resolve(process.cwd(), 'data', 'savanna.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initializeSchema(db);
  seedDefaults(db);
  bootstrapInitialAdmin(db);

  return db;
}

function initializeSchema(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      branding_json TEXT NOT NULL,
      onboarding_config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('platform_admin', 'org_admin')),
      organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      must_change_credentials INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('learner', 'employer', 'coordinator')),
      organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      principal_type TEXT NOT NULL CHECK (principal_type IN ('admin', 'user')),
      principal_id TEXT NOT NULL,
      role TEXT NOT NULL,
      organization_id TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_principal ON sessions(principal_type, principal_id);

    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
      is_template INTEGER NOT NULL DEFAULT 0,
      active_version_id TEXT,
      title_json TEXT NOT NULL,
      description_json TEXT NOT NULL,
      submit_label_json TEXT NOT NULL,
      done_message_json TEXT NOT NULL,
      branding_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id, slug)
    );

    CREATE TABLE IF NOT EXISTS form_sections (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      title_json TEXT NOT NULL,
      description_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_questions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      question_type TEXT NOT NULL,
      label_json TEXT NOT NULL,
      help_text_json TEXT NOT NULL,
      why_we_ask_json TEXT NOT NULL,
      placeholder_json TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      sensitive INTEGER NOT NULL DEFAULT 0,
      options_json TEXT NOT NULL,
      validation_json TEXT NOT NULL,
      conditional_logic_json TEXT
    );

    CREATE TABLE IF NOT EXISTS form_versions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('published', 'archived')),
      schema_snapshot_json TEXT NOT NULL,
      published_by TEXT NOT NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      form_version_id TEXT NOT NULL REFERENCES form_versions(id),
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      answers_json TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learners (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      owner_token_hash TEXT,
      registration_mode TEXT NOT NULL,
      full_name TEXT NOT NULL,
      contact_method TEXT NOT NULL,
      contact_value TEXT NOT NULL,
      identity_route TEXT NOT NULL,
      identity_ref_masked TEXT NOT NULL DEFAULT '',
      partner_referral_org TEXT NOT NULL DEFAULT '',
      partner_consent_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS private_accessibility_requests (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL UNIQUE REFERENCES learners(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      support_preferences_json TEXT NOT NULL,
      support_notes TEXT NOT NULL DEFAULT '',
      consent_to_share_with_employer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onboarding_sessions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      owner_token_hash TEXT,
      current_step INTEGER NOT NULL DEFAULT 0,
      draft_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      organization TEXT NOT NULL,
      location TEXT NOT NULL,
      is_remote INTEGER NOT NULL DEFAULT 0,
      employment_type TEXT NOT NULL,
      description_summary TEXT NOT NULL,
      required_skills_json TEXT NOT NULL,
      accommodation_categories_json TEXT NOT NULL,
      accommodations_offered_json TEXT NOT NULL,
      accommodation_details_json TEXT NOT NULL,
      application_deadline TEXT,
      posted_at_iso TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      stored_filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      organization_id TEXT,
      uploaded_by_user_id TEXT,
      owner_token_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      learner_token_hash TEXT,
      applicant_name TEXT NOT NULL,
      contact_value TEXT NOT NULL,
      relevant_experience TEXT NOT NULL DEFAULT '',
      share_accommodation_request INTEGER NOT NULL DEFAULT 0,
      accommodation_request_note TEXT NOT NULL DEFAULT '',
      explicit_consent_to_share INTEGER NOT NULL DEFAULT 0,
      resume_file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      organization_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seedDefaults(db: AppDatabase): void {
  const now = new Date().toISOString();
  const orgCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM organizations').get() as { cnt: number };

  if (orgCountRow.cnt === 0) {
    const insertOrg = db.prepare(`
      INSERT INTO organizations (id, slug, name, type, branding_json, onboarding_config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOrg.run(
      'org-alx-ethiopia',
      'savanna-demo-tenant',
      'Savanna Gateway — ALX Ethiopia Hub',
      'training_institution',
      JSON.stringify({
        primaryColor: '#0F1E36',
        secondaryColor: '#1E3A5F',
        logoText: 'Savanna Gateway',
        introText: 'Dignified, screen-reader-first onboarding and accessible career gateway.',
        defaultLanguage: 'en',
      }),
      JSON.stringify({
        allowAnonymousOnboarding: true,
        requireConsentRecord: true,
        defaultFormId: 'form-alx-intake-v1',
      }),
      now,
      now
    );

    insertOrg.run(
      'org-selam-partners',
      'selam-tech-partners',
      'Selam Inclusive Employers Network',
      'employer',
      JSON.stringify({
        primaryColor: '#1E3A5F',
        secondaryColor: '#0F766E',
        logoText: 'Selam Partners',
        introText: 'Accessible career readiness and inclusive employer onboarding.',
        defaultLanguage: 'en',
      }),
      JSON.stringify({
        allowAnonymousOnboarding: true,
        requireConsentRecord: true,
        defaultFormId: null,
      }),
      now,
      now
    );
  }

  const jobCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM jobs').get() as { cnt: number };
  if (jobCountRow.cnt === 0) {
    const seedJobs = [
      {
        id: 'job-eth-101',
        organization_id: 'org-alx-ethiopia',
        title: 'Digital Customer Support Specialist',
        organization: 'Abay Inclusive Tech (Addis Hub Partner)',
        location: 'Addis Ababa (Hybrid)',
        is_remote: 1,
        employment_type: 'Full-time',
        description_summary:
          'Help learners and small businesses answer questions by text chat and email in Amharic and English. Full screen-reader setup and quiet workspace provided.',
        required_skills: ['Customer empathy', 'Written Amharic or English', 'Basic computer use'],
        accommodation_categories: ['screen_reader_tools', 'remote_flexible', 'communication_support'],
        accommodations_offered: [
          'Screen-reader ready CRM (NVDA & JAWS tested)',
          'Flexible shift hours and 3 days remote work per week',
          'Written chat workflows — voice calls are optional',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Step-free Addis Ababa hub office with elevator and accessible washrooms.',
          remoteOrFlexibleArrangements: 'Remote work 3 days/week after initial 2-week paid orientation.',
          assistiveTechnologyAvailable: 'NVDA, JAWS license, high-contrast displays, and captions on team calls.',
          communicationOptions: 'Text chat and written task briefs always available alongside verbal check-ins.',
          interviewAccommodations: 'Questions shared 24 hours in advance; extra time or written answers welcome.',
          applicationProcessAccommodations: 'Accessible short form without timed tests or mandatory video upload.',
          additionalSupportOffered: 'Dedicated onboarding buddy during first 60 days.',
        },
        application_deadline: '2026-09-30',
        posted_at_iso: '2026-04-01T09:00:00.000Z',
      },
      {
        id: 'job-eth-102',
        organization_id: 'org-alx-ethiopia',
        title: 'Junior QA & Accessibility Tester',
        organization: 'Savanna Civic Digital Lab',
        location: 'Remote (Ethiopia / Africa)',
        is_remote: 1,
        employment_type: 'Apprenticeship',
        description_summary:
          'Test mobile web pages using keyboard navigation, screen readers, and plain-language checklists. Training paid from day one.',
        required_skills: ['Attention to detail', 'Curiosity about mobile web', 'Written notes'],
        accommodation_categories: ['screen_reader_tools', 'remote_flexible', 'assistive_tech', 'flexible_hours'],
        accommodations_offered: [
          '100% remote with mobile data stipend',
          'Paid 4-week accessible assistive-tech onboarding',
          'Self-paced daily schedule with async check-ins',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Fully remote role; coworking allowance at accessible hub if preferred.',
          remoteOrFlexibleArrangements: 'Flexible 6-hour core learning and testing blocks.',
          assistiveTechnologyAvailable: 'Screen reader, magnification software, speech-to-text toolkit allowance.',
          communicationOptions: 'Async written feedback, live captions, Amharic/English/Afaan Oromo team support.',
          interviewAccommodations: 'Practical conversation instead of coding whiteboard pressure.',
          applicationProcessAccommodations: 'Apply via voice input or short text; partner referral accepted.',
          additionalSupportOffered: 'Mentorship toward international accessibility testing certification.',
        },
        application_deadline: '2026-10-15',
        posted_at_iso: '2026-04-05T10:30:00.000Z',
      },
      {
        id: 'job-eth-103',
        organization_id: 'org-selam-partners',
        title: 'Community Learning Hub Coordinator Assistant',
        organization: 'Biruh Education Access Network',
        location: 'Adama / Oromia Region',
        is_remote: 0,
        employment_type: 'Part-time',
        description_summary:
          'Welcome learners at the Adama resource hub, help set up study stations, and share plain-language program updates in Afaan Oromo and Amharic.',
        required_skills: ['Afaan Oromo & Amharic', 'Welcoming communication', 'Scheduling'],
        accommodation_categories: ['accessible_workplace', 'communication_support', 'flexible_hours'],
        accommodations_offered: [
          'Ground-floor step-free learning hub with wide corridors',
          'Sign-language interpreter booking budget for events',
          'Predictable morning or afternoon shifts',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Ground floor, tactile signage, low-glare lighting, quiet break room.',
          remoteOrFlexibleArrangements: 'Choice of morning (08:30–12:30) or afternoon (13:30–17:30) shifts.',
          assistiveTechnologyAvailable: 'Audio induction loop at welcome desk; large-print schedules.',
          communicationOptions: 'In-person, SMS, sign language support on request.',
          interviewAccommodations: 'In-person step-free hub meeting or phone interview.',
          applicationProcessAccommodations: 'Partner-assisted submissions welcomed.',
          additionalSupportOffered: 'Transport stipend provided.',
        },
        application_deadline: '2026-08-25',
        posted_at_iso: '2026-04-08T08:00:00.000Z',
      },
      {
        id: 'job-eth-104',
        organization_id: 'org-selam-partners',
        title: 'Data Entry & Captioning Associate',
        organization: 'Horn Media & Learning Studio',
        location: 'Remote or Addis Ababa',
        is_remote: 1,
        employment_type: 'Contract',
        description_summary:
          'Review educational video transcripts and add clear captions in English and Amharic so training stays accessible to deaf and hard-of-hearing learners.',
        required_skills: ['Careful listening or reading', 'Typing in Amharic or English'],
        accommodation_categories: ['remote_flexible', 'flexible_hours', 'assistive_tech'],
        accommodations_offered: [
          'Output-based weekly milestones — work at your best hours',
          'Custom ergonomic keyboard & speech-to-text support',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Quiet home or accessible Bole studio desk.',
          remoteOrFlexibleArrangements: 'Async deadlines with zero surprise evening calls.',
          assistiveTechnologyAvailable: 'Caption editor keyboard shortcuts, high-contrast UI.',
          communicationOptions: 'Email and structured task cards.',
          interviewAccommodations: 'Short 15-minute sample caption task with unlimited time.',
          applicationProcessAccommodations: 'No formal diploma or Kebele ID required at application stage.',
          additionalSupportOffered: 'Paid training week.',
        },
        application_deadline: '2026-09-10',
        posted_at_iso: '2026-04-10T11:15:00.000Z',
      },
      {
        id: 'job-eth-105',
        organization_id: 'org-alx-ethiopia',
        title: 'Accessible Mobile App Support Fellow',
        organization: 'Kefeta Youth Skills Initiative',
        location: 'Bahir Dar / Remote Hybrid',
        is_remote: 1,
        employment_type: 'Fellowship',
        description_summary:
          'Guide fellow trainees through first-time sign-up and assistive tools on Android phones.',
        required_skills: ['Patience teaching peers', 'Android TalkBack familiarity helpful'],
        accommodation_categories: ['communication_support', 'assistive_tech', 'remote_flexible'],
        accommodations_offered: [
          'Android test phone provided with TalkBack pre-configured',
          'Co-facilitator support for large group orientations',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Accessible ground-floor training room with adjustable desks.',
          remoteOrFlexibleArrangements: 'Remote check-ins 4 days/week, 1 hub day.',
          assistiveTechnologyAvailable: 'Android accessibility suite + Braille/audio study notes.',
          communicationOptions: 'Visual slides + plain-language handouts + voice notes.',
          interviewAccommodations: 'Bring a support person if you wish.',
          applicationProcessAccommodations: 'Single-page accessible form.',
          additionalSupportOffered: 'Stipend + reference letter.',
        },
        application_deadline: '2026-09-18',
        posted_at_iso: '2026-04-11T14:00:00.000Z',
      },
      {
        id: 'job-eth-106',
        organization_id: 'org-selam-partners',
        title: 'Administrative & Finance Operations Trainee',
        organization: 'Dashen Inclusive Logistics Partner',
        location: 'Addis Ababa (Bole Step-Free Office)',
        is_remote: 0,
        employment_type: 'Full-time',
        description_summary:
          'Organize digital invoices, vendor contacts, and weekly schedules with step-by-step templates and structured mentorship.',
        required_skills: ['Organized habits', 'Basic spreadsheet comfort', 'Reliability'],
        accommodation_categories: ['accessible_workplace', 'flexible_hours', 'other_accommodations'],
        accommodations_offered: [
          'Wheelchair-accessible office, ramp, and reserved transport drop-off',
          'Clear written checklists & unhurried training pace',
        ],
        accommodation_details: {
          workEnvironmentAccessibility: 'Ramp access, elevator, adjustable-height desks.',
          remoteOrFlexibleArrangements: 'Flexible start window (08:00–09:30) to avoid peak transit.',
          assistiveTechnologyAvailable: 'High-contrast monitor filters & screen magnifier.',
          communicationOptions: 'Written agendas shared before meetings.',
          interviewAccommodations: 'Wheelchair-accessible ground floor room or online chat option.',
          applicationProcessAccommodations: 'Simple step-by-step application.',
          additionalSupportOffered: 'Paid health & transport allowance.',
        },
        application_deadline: '2026-10-01',
        posted_at_iso: '2026-04-12T07:45:00.000Z',
      },
    ];

    const insertJob = db.prepare(`
      INSERT INTO jobs (
        id, organization_id, created_by_user_id, title, organization, location,
        is_remote, employment_type, description_summary, required_skills_json,
        accommodation_categories_json, accommodations_offered_json, accommodation_details_json,
        application_deadline, posted_at_iso, is_active
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const j of seedJobs) {
      insertJob.run(
        j.id,
        j.organization_id,
        j.title,
        j.organization,
        j.location,
        j.is_remote,
        j.employment_type,
        j.description_summary,
        JSON.stringify(j.required_skills),
        JSON.stringify(j.accommodation_categories),
        JSON.stringify(j.accommodations_offered),
        JSON.stringify(j.accommodation_details),
        j.application_deadline,
        j.posted_at_iso
      );
    }
  }

  const formCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM forms').get() as { cnt: number };
  if (formCountRow.cnt === 0) {
    const formId = 'form-alx-intake-v1';
    const secId = 'sec-alx-intake-1';
    const versionId = 'ver-alx-intake-1';
    const branding = {
      primaryColor: '#0F1E36',
      secondaryColor: '#1E3A5F',
      logoText: 'Savanna Gateway',
      introText: 'Accessible onboarding form',
      defaultLanguage: 'en',
    };
    const title = {
      en: 'Accessible Learner Intake',
      am: 'ተደራሽ የተማሪ መመዝገቢያ ቅጽ',
      om: 'Unka Galmee Barataa Dhaqqabamaa',
    };
    const description = {
      en: 'Complete your training intake in English, Amharic, or Afaan Oromoo.',
      am: 'ምዝገባዎን በእንግሊዝኛ፣ በአማርኛ ወይም በአፋን ኦሮሞ ያጠናቅቁ።',
      om: 'Galmee keessan Afaan Ingilizii, Amaariffaa, ykn Afaan Oromootiin guutaa.',
    };
    const submitLabel = { en: 'Submit Intake', am: 'ምዝገባውን አስገባ', om: 'Galmee Ergi' };
    const doneMessage = {
      en: 'Thank you! Your accessible learner intake has been recorded.',
      am: 'እናመሰግናለን! ምዝገባዎ ተመዝግቧል።',
      om: 'Galatoomaa! Galmeen keessan galmaaʼeera.',
    };
    const sections = [
      {
        id: secId,
        sortOrder: 0,
        title: { en: 'Contact & Preferences', am: 'መገናኛ እና ምርጫዎች', om: 'Quunnamtii fi Filannoo' },
        description: { en: 'Essential intake questions.', am: 'መሰረታዊ የመመዝገቢያ ጥያቄዎች።', om: 'Gaaffilee buʼuuraa.' },
      },
    ];
    const questions = [
      {
        id: 'q-alx-1',
        sectionId: secId,
        fieldKey: 'full_name',
        sortOrder: 0,
        questionType: 'text',
        label: { en: 'Full name', am: 'ሙሉ ስም', om: 'Maqaa guutuu' },
        helpText: { en: 'Name you prefer us to use.', am: 'መጠራት የሚፈልጉት ስም።', om: 'Maqaa waamamuu barbaaddan.' },
        whyWeAsk: { en: 'To personalize learning support.', am: 'የመማሪያ ድጋፍን ለማዘጋጀት።', om: 'Deeggarsa barumsaa qopheessuuf.' },
        placeholder: { en: 'Full name', am: 'ሙሉ ስም', om: 'Maqaa guutuu' },
        required: true,
        sensitive: false,
        options: [],
        validation: { minLength: 2, maxLength: 120 },
        conditionalLogic: null,
      },
      {
        id: 'q-alx-2',
        sectionId: secId,
        fieldKey: 'contact_email',
        sortOrder: 1,
        questionType: 'email',
        label: { en: 'Email address', am: 'ኢሜይል አድራሻ', om: 'Teessoo imeelii' },
        helpText: { en: 'Optional email contact.', am: 'አማራጭ ኢሜይል።', om: 'Imeelii filannoo.' },
        whyWeAsk: { en: 'To send accessible course materials.', am: 'ተደራሽ ቁሳቁሶችን ለመላክ።', om: 'Meeshaalee barumsaa erguuf.' },
        placeholder: { en: 'name@example.com', am: 'name@example.com', om: 'name@example.com' },
        required: false,
        sensitive: false,
        options: [],
        validation: {},
        conditionalLogic: null,
      },
    ];

    db.prepare(`
      INSERT INTO forms (
        id, organization_id, slug, type, status, is_template, active_version_id,
        title_json, description_json, submit_label_json, done_message_json, branding_json,
        created_by, created_at, updated_at
      ) VALUES (?, 'org-alx-ethiopia', 'accessible-intake', 'onboarding', 'published', 0, ?, ?, ?, ?, ?, ?, 'system', ?, ?)
    `).run(
      formId,
      versionId,
      JSON.stringify(title),
      JSON.stringify(description),
      JSON.stringify(submitLabel),
      JSON.stringify(doneMessage),
      JSON.stringify(branding),
      now,
      now
    );

    db.prepare(`
      INSERT INTO form_sections (id, form_id, sort_order, title_json, description_json)
      VALUES (?, ?, 0, ?, ?)
    `).run(secId, formId, JSON.stringify(sections[0].title), JSON.stringify(sections[0].description));

    const insertQ = db.prepare(`
      INSERT INTO form_questions (
        id, form_id, section_id, field_key, sort_order, question_type,
        label_json, help_text_json, why_we_ask_json, placeholder_json,
        required, sensitive, options_json, validation_json, conditional_logic_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of questions) {
      insertQ.run(
        q.id,
        formId,
        q.sectionId,
        q.fieldKey,
        q.sortOrder,
        q.questionType,
        JSON.stringify(q.label),
        JSON.stringify(q.helpText),
        JSON.stringify(q.whyWeAsk),
        JSON.stringify(q.placeholder),
        q.required ? 1 : 0,
        q.sensitive ? 1 : 0,
        JSON.stringify(q.options),
        JSON.stringify(q.validation),
        null
      );
    }

    const snapshot = {
      id: formId,
      organizationId: 'org-alx-ethiopia',
      slug: 'accessible-intake',
      type: 'onboarding',
      title,
      description,
      submitLabel,
      doneMessage,
      branding,
      sections,
      questions,
    };

    db.prepare(`
      INSERT INTO form_versions (id, form_id, organization_id, version_number, status, schema_snapshot_json, published_by, published_at)
      VALUES (?, ?, 'org-alx-ethiopia', 1, 'published', ?, 'system', ?)
    `).run(versionId, formId, JSON.stringify(snapshot), now);
  }
}

export function bootstrapInitialAdmin(
  db: AppDatabase,
  env: Record<string, string | undefined> = process.env
): boolean {
  const existing = db
    .prepare("SELECT id FROM admin_accounts WHERE role = 'platform_admin' LIMIT 1")
    .get() as { id?: string } | undefined;

  if (existing?.id) {
    return false;
  }

  const username = (env.FORM_BUILDER_ADMIN_USERNAME || '').trim();
  const initialPassword = env.FORM_BUILDER_INITIAL_PASSWORD || '';

  if (!username || !initialPassword) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[security] FORM_BUILDER_ADMIN_USERNAME / FORM_BUILDER_INITIAL_PASSWORD not set; initial Form Builder platform_admin was not provisioned.'
      );
    }
    return false;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO admin_accounts (
      id, username, password_hash, role, organization_id, must_change_credentials, created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, 'platform_admin', NULL, 1, ?, ?, NULL)
  `).run(generateId('adm'), username, hashPassword(initialPassword), now, now);

  return true;
}

export function writeAuditLog(
  db: AppDatabase,
  entry: {
    actorType: string;
    actorId: string;
    organizationId?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }
): void {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_type, actor_id, organization_id, action, resource_type, resource_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('aud'),
    entry.actorType,
    entry.actorId,
    entry.organizationId ?? null,
    entry.action,
    entry.resourceType,
    entry.resourceId,
    JSON.stringify(entry.metadata || {}),
    new Date().toISOString()
  );
}
