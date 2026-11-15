import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createDatabase, bootstrapInitialAdmin, AppDatabase } from '../server/db/database.ts';
import { createServerApp } from '../server/createApp.ts';

let db: AppDatabase;
let server: http.Server;
let baseUrl = '';
let tmpUploadDir = '';

function extractCookies(setCookieHeaders: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const pair = header.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      jar[name] = val;
    }
  }
  return jar;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function apiFetch(
  route: string,
  options: RequestInit & { jar?: Record<string, string> } = {}
): Promise<{ status: number; headers: Headers; body: any; rawText: string }> {
  const headers = new Headers(options.headers || {});
  if (options.jar && Object.keys(options.jar).length > 0) {
    headers.set('cookie', cookieHeader(options.jar));
  }
  if (options.body && typeof options.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers,
  });

  if (options.jar && typeof res.headers.getSetCookie === 'function') {
    const updated = extractCookies(res.headers.getSetCookie());
    Object.assign(options.jar, updated);
  }

  const rawText = await res.text();
  let body: any = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = rawText;
  }
  return { status: res.status, headers: res.headers, body, rawText };
}

before(async () => {
  tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'savanna-test-uploads-'));
  process.env.FORM_BUILDER_ADMIN_USERNAME = 'bootstrap_admin';
  process.env.FORM_BUILDER_INITIAL_PASSWORD = 'InitPassword!2026';

  db = createDatabase(':memory:');
  const { app } = createServerApp({ db, uploadDir: tmpUploadDir });
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  db.close();
  fs.rmSync(tmpUploadDir, { recursive: true, force: true });
});

test('1. Initial admin bootstrap runs once and never overwrites existing platform_admin', () => {
  const secondRun = bootstrapInitialAdmin(db, {
    FORM_BUILDER_ADMIN_USERNAME: 'different_admin',
    FORM_BUILDER_INITIAL_PASSWORD: 'AnotherPassword!999',
  });
  assert.equal(secondRun, false);

  const countRow = db
    .prepare("SELECT COUNT(*) AS cnt FROM admin_accounts WHERE role = 'platform_admin'")
    .get() as { cnt: number };
  assert.equal(countRow.cnt, 1);

  const adminRow = db
    .prepare("SELECT username, password_hash, must_change_credentials FROM admin_accounts WHERE role = 'platform_admin'")
    .get() as { username: string; password_hash: string; must_change_credentials: number };
  assert.equal(adminRow.username, 'bootstrap_admin');
  assert.equal(adminRow.must_change_credentials, 1);
  assert.ok(adminRow.password_hash.startsWith('scrypt$'));
  assert.notEqual(adminRow.password_hash, 'InitPassword!2026');
});

test('2. Unauthenticated admin access returns 401 and blocks Form Builder APIs', async () => {
  const formsRes = await apiFetch('/api/v1/admin/forms');
  assert.equal(formsRes.status, 401);

  const meRes = await apiFetch('/api/v1/admin/auth/me');
  assert.equal(meRes.status, 401);
});

const adminJar: Record<string, string> = {};

test('3. Mandatory first-login flow blocks Form Builder until initial credentials are changed and rotates session', async () => {
  const badLogin = await apiFetch('/api/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'bootstrap_admin', password: 'WrongPassword1!' }),
  });
  assert.equal(badLogin.status, 401);

  const loginRes = await apiFetch('/api/v1/admin/auth/login', {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({ username: 'bootstrap_admin', password: 'InitPassword!2026' }),
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.authenticated, true);
  assert.equal(loginRes.body.admin.mustChangeCredentials, true);
  assert.ok(adminJar.gw_admin_sid);

  const setCookieRaw = loginRes.headers.getSetCookie().join('; ');
  assert.ok(setCookieRaw.toLowerCase().includes('httponly'));

  const blockedForms = await apiFetch('/api/v1/admin/forms', { jar: adminJar });
  assert.equal(blockedForms.status, 403);
  assert.equal(blockedForms.body.code, 'CREDENTIAL_CHANGE_REQUIRED');

  const oldCookieSnapshot = { ...adminJar };

  const setupRes = await apiFetch('/api/v1/admin/auth/first-login-setup', {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({
      currentUsername: 'bootstrap_admin',
      newUsername: 'savanna_lead_admin',
      currentPassword: 'InitPassword!2026',
      newPassword: 'RotatedStrong!2026',
      confirmNewPassword: 'RotatedStrong!2026',
    }),
  });
  assert.equal(setupRes.status, 200);
  assert.equal(setupRes.body.admin.username, 'savanna_lead_admin');
  assert.equal(setupRes.body.admin.mustChangeCredentials, false);
  assert.notEqual(adminJar.gw_admin_sid, oldCookieSnapshot.gw_admin_sid);

  // Old session cookie must be invalidated after credential rotation
  const staleRes = await apiFetch('/api/v1/admin/forms', { jar: oldCookieSnapshot });
  assert.equal(staleRes.status, 401);

  // New session cookie accesses Form Builder successfully
  const allowedRes = await apiFetch('/api/v1/admin/forms', { jar: adminJar });
  assert.equal(allowedRes.status, 200);
  assert.ok(Array.isArray(allowedRes.body));

  // Initial password is no longer accepted
  const staleLogin = await apiFetch('/api/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'savanna_lead_admin', password: 'InitPassword!2026' }),
  });
  assert.equal(staleLogin.status, 401);
});

const learnerJar: Record<string, string> = {};
const employerJar: Record<string, string> = {};
const secondLearnerJar: Record<string, string> = {};

test('4. Public registration cannot grant admin privileges and ordinary users are blocked from admin routes', async () => {
  const regLearner = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    jar: learnerJar,
    body: JSON.stringify({
      username: 'hana_learner',
      email: 'hana@example.org',
      fullName: 'Hana Alemu',
      password: 'LearnerPass!2026',
      role: 'platform_admin', // attempt privilege escalation
    }),
  });
  assert.equal(regLearner.status, 201);
  assert.equal(regLearner.body.user.role, 'learner');

  const blockedAdmin = await apiFetch('/api/v1/admin/forms', { jar: learnerJar });
  assert.equal(blockedAdmin.status, 401);

  const regEmployer = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    jar: employerJar,
    body: JSON.stringify({
      username: 'selam_employer',
      email: 'hr@selam.example.org',
      fullName: 'Selam HR Team',
      password: 'EmployerPass!2026',
      role: 'employer',
    }),
  });
  assert.equal(regEmployer.status, 201);
  assert.equal(regEmployer.body.user.role, 'employer');

  const regLearner2 = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    jar: secondLearnerJar,
    body: JSON.stringify({
      username: 'dawit_learner',
      email: 'dawit@example.org',
      fullName: 'Dawit Tadesse',
      password: 'LearnerPass!2026',
      role: 'learner',
    }),
  });
  assert.equal(regLearner2.status, 201);
});

let createdFormId = '';
let orgBId = '';

test('5. Dynamic Form Builder CRUD (all 12 question types + conditional logic), publishing, public submission & tenant isolation', async () => {
  // Create a second organization
  const orgRes = await apiFetch('/api/v1/admin/organizations', {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({
      name: 'Hawassa Tech Academy',
      slug: 'hawassa-tech',
      type: 'training_partner',
    }),
  });
  assert.equal(orgRes.status, 201);
  orgBId = orgRes.body.id;

  // Create org_admin scoped to org-alx-ethiopia
  const orgAdminRes = await apiFetch('/api/v1/admin/org-admins', {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({
      username: 'alx_manager',
      password: 'OrgManager!2026',
      organizationId: 'org-alx-ethiopia',
    }),
  });
  assert.equal(orgAdminRes.status, 201);

  // Create comprehensive form in org-alx-ethiopia with all 12 question types
  const sectionId = 'sec-main';
  const createFormRes = await apiFetch('/api/v1/admin/forms', {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({
      organizationId: 'org-alx-ethiopia',
      slug: 'cohort-2026-intake',
      type: 'onboarding',
      title: { en: 'Cohort 2026 Intake', am: 'የ2026 ምዝገባ', om: 'Galmee 2026' },
      description: { en: 'Complete onboarding form', am: 'የምዝገባ ቅጽ', om: 'Unka galmee' },
      submitLabel: { en: 'Submit Intake', am: 'ላክ', om: 'Ergi' },
      doneMessage: { en: 'Thank you!', am: 'እናመሰግናለን!', om: 'Galatoomi!' },
      sections: [
        {
          id: sectionId,
          sortOrder: 0,
          title: { en: 'Candidate Details', am: 'ዝርዝር', om: 'Odeeffannoo' },
          description: { en: '', am: '', om: '' },
        },
      ],
      questions: [
        { id: 'q1', sectionId, fieldKey: 'full_name', sortOrder: 0, questionType: 'text', label: { en: 'Full name', am: 'ሙሉ ስም', om: 'Maqaa' }, required: true, options: [], config: {} },
        { id: 'q2', sectionId, fieldKey: 'email_addr', sortOrder: 1, questionType: 'email', label: { en: 'Email', am: 'ኢሜይል', om: 'Imeelii' }, required: true, options: [], config: {} },
        { id: 'q3', sectionId, fieldKey: 'phone_num', sortOrder: 2, questionType: 'phone', label: { en: 'Phone', am: 'ስልክ', om: 'Bilbila' }, required: false, options: [], config: {} },
        { id: 'q4', sectionId, fieldKey: 'age_years', sortOrder: 3, questionType: 'number', label: { en: 'Years experience', am: 'ልምድ', om: 'Muuxannoo' }, required: false, options: [], config: { min: 0, max: 50 } },
        { id: 'q5', sectionId, fieldKey: 'start_date', sortOrder: 4, questionType: 'date', label: { en: 'Available date', am: 'ቀን', om: 'Guyyaa' }, required: false, options: [], config: {} },
        { id: 'q6', sectionId, fieldKey: 'track', sortOrder: 5, questionType: 'dropdown', label: { en: 'Track', am: 'ዘርፍ', om: 'Damee' }, required: true, options: [{ value: 'se', label: { en: 'Software Eng', am: 'ሶፍትዌር', om: 'Sooftiweerii' } }], config: {} },
        { id: 'q7', sectionId, fieldKey: 'mode', sortOrder: 6, questionType: 'radio', label: { en: 'Study mode', am: 'ሁኔታ', om: 'Haala' }, required: false, options: [{ value: 'remote', label: { en: 'Remote', am: 'ርቀት', om: 'Fagoo' } }], config: {} },
        { id: 'q8', sectionId, fieldKey: 'tools', sortOrder: 7, questionType: 'checkbox', label: { en: 'Assistive tools', am: 'መሳሪያዎች', om: 'Meeshaalee' }, required: false, options: [{ value: 'captions', label: { en: 'Captions', am: 'ጽሑፍ', om: 'Barreeffama' } }], config: {} },
        { id: 'q9', sectionId, fieldKey: 'need_laptop', sortOrder: 8, questionType: 'yes_no', label: { en: 'Need hub laptop?', am: 'ላፕቶፕ?', om: 'Laaptooppii?' }, required: false, options: [], config: {} },
        {
          id: 'q10',
          sectionId,
          fieldKey: 'laptop_reason',
          sortOrder: 9,
          questionType: 'text',
          label: { en: 'Laptop preference', am: 'ዝርዝር', om: 'Filannoo' },
          required: true,
          options: [],
          conditionalLogic: {
            dependsOnKey: 'need_laptop',
            operator: 'equals',
            value: 'yes',
          },
          config: {},
        },
        { id: 'q11', sectionId, fieldKey: 'portfolio', sortOrder: 10, questionType: 'file', label: { en: 'CV File', am: 'ፋይል', om: 'Faayila' }, required: false, options: [], config: {} },
        { id: 'q12', sectionId, fieldKey: 'home_addr', sortOrder: 11, questionType: 'address', label: { en: 'City / Sub-city', am: 'አድራሻ', om: 'Teessoo' }, required: false, options: [], config: {} },
        { id: 'q13', sectionId, fieldKey: 'privacy_ok', sortOrder: 12, questionType: 'consent', label: { en: 'I consent to intake processing', am: 'እስማማለሁ', om: 'Walii galeera' }, required: true, options: [], config: {} },
      ],
    }),
  });
  assert.equal(createFormRes.status, 201);
  createdFormId = createFormRes.body.id;
  assert.equal(createFormRes.body.questions.length, 13);

  // Publish form
  const publishRes = await apiFetch(`/api/v1/admin/forms/${createdFormId}/publish`, {
    method: 'POST',
    jar: adminJar,
    body: JSON.stringify({}),
  });
  assert.equal(publishRes.status, 200);
  assert.equal(publishRes.body.version.versionNumber, 1);

  // Validation rejects missing required fields
  const invalidSubmit = await apiFetch(`/api/v1/public/forms/${createdFormId}/submissions`, {
    method: 'POST',
    body: JSON.stringify({ language: 'en', answers: { full_name: 'Abel' } }),
  });
  assert.equal(invalidSubmit.status, 400);

  // Conditional required field `laptop_reason` is skipped when `need_laptop === 'no'`
  const validSubmit = await apiFetch(`/api/v1/public/forms/${createdFormId}/submissions`, {
    method: 'POST',
    body: JSON.stringify({
      language: 'am',
      answers: {
        full_name: 'Mekdes Tesfaye',
        email_addr: 'mekdes@example.org',
        track: 'se',
        need_laptop: 'no',
        privacy_ok: true,
        home_addr: { city: 'Addis Ababa', subCity: 'Bole' },
      },
    }),
  });
  assert.equal(validSubmit.status, 201);

  // Tenant isolation check: log in as alx_manager and confirm access to org-alx-ethiopia only
  const orgAdminJar: Record<string, string> = {};
  const oaLogin = await apiFetch('/api/v1/admin/auth/login', {
    method: 'POST',
    jar: orgAdminJar,
    body: JSON.stringify({ username: 'alx_manager', password: 'OrgManager!2026' }),
  });
  assert.equal(oaLogin.status, 200);
  // First login forced for newly created org admin too!
  const oaSetup = await apiFetch('/api/v1/admin/auth/first-login-setup', {
    method: 'POST',
    jar: orgAdminJar,
    body: JSON.stringify({
      currentUsername: 'alx_manager',
      newUsername: 'alx_manager_active',
      currentPassword: 'OrgManager!2026',
      newPassword: 'AlxManagerStrong!2026',
      confirmNewPassword: 'AlxManagerStrong!2026',
    }),
  });
  assert.equal(oaSetup.status, 200);

  const crossOrgCreate = await apiFetch('/api/v1/admin/forms', {
    method: 'POST',
    jar: orgAdminJar,
    body: JSON.stringify({
      organizationId: orgBId,
      slug: 'unauthorized-form',
      title: { en: 'Blocked' },
    }),
  });
  assert.equal(crossOrgCreate.status, 403);
});

let createdLearnerId = '';

test('6. Onboarding persistence, masked ID reference, private accommodation segregation, export & delete', async () => {
  const sessionSave = await apiFetch('/api/v1/onboarding/sessions', {
    method: 'POST',
    body: JSON.stringify({
      tenantKey: 'ALX_ETHIOPIA',
      language: 'om',
      currentStep: 2,
      isSharedDevice: false,
      registrationMode: 'self',
      draft: { fullName: 'Bontu Gemechu' },
    }),
  });
  assert.equal(sessionSave.status, 200);
  assert.ok(sessionSave.body.id);

  const submitRes = await apiFetch('/api/v1/onboarding/submissions', {
    method: 'POST',
    jar: learnerJar,
    body: JSON.stringify({
      tenantKey: 'ALX_ETHIOPIA',
      language: 'en',
      registrationMode: 'self',
      isSharedDevice: false,
      fullName: 'Hana Alemu',
      contactMethod: 'phone',
      contactValue: '+251911223344',
      identityRoute: 'fayda_id',
      identityReferenceNumber: 'FAYDA-9988776655',
      supportPreferences: ['captions_transcripts', 'quiet_space'],
      supportNotes: 'Please keep captioning available privately.',
    }),
  });
  assert.equal(submitRes.status, 201);
  createdLearnerId = submitRes.body.id;
  assert.equal(submitRes.body.persistedToServer, true);

  // Admin can inspect private support queue
  const privateSupport = await apiFetch('/api/v1/admin/private-support', { jar: adminJar });
  assert.equal(privateSupport.status, 200);
  assert.ok(privateSupport.body.some((item: any) => item.learnerId === createdLearnerId));

  // Verify learner export masks ID reference number (no plaintext raw ID)
  const learnerExport = await apiFetch(`/api/v1/learners/${createdLearnerId}/export`, { jar: learnerJar });
  assert.equal(learnerExport.status, 200);
  assert.notEqual(learnerExport.body.identityReferenceMasked, 'FAYDA-9988776655');
  assert.ok(String(learnerExport.body.identityReferenceMasked).startsWith('masked:'));
});

let createdJobId = '';

test('7. Employer safeguards block medical-proof wording and enforce explicit consent for candidate accommodation sharing', async () => {
  const blockedJob = await apiFetch('/api/v1/jobs', {
    method: 'POST',
    jar: employerJar,
    body: JSON.stringify({
      title: 'Helpdesk Agent',
      organization: 'Selam Partners',
      location: 'Addis Ababa',
      isRemote: true,
      employmentType: 'Full-time',
      descriptionSummary: 'Support users remotely.',
      requiredSkills: ['Communication'],
      accommodationCategories: ['remote_flexible'],
      accommodationsOffered: ['Remote schedule'],
      accommodationDetails: {
        interviewAccommodations: 'Must bring a medical certificate and diagnosis.',
      },
    }),
  });
  assert.equal(blockedJob.status, 400);
  assert.equal(blockedJob.body.code, 'SAFEGUARD_VIOLATION');

  const validJob = await apiFetch('/api/v1/jobs', {
    method: 'POST',
    jar: employerJar,
    body: JSON.stringify({
      title: 'Accessible Web QA Tester',
      organization: 'Selam Partners',
      location: 'Addis Ababa',
      isRemote: true,
      employmentType: 'Full-time',
      descriptionSummary: 'Test web interfaces with screen readers.',
      requiredSkills: ['WCAG', 'NVDA'],
      accommodationCategories: ['assistive_tech', 'remote_flexible'],
      accommodationsOffered: ['Screen reader tested', 'Async interviews'],
      accommodationDetails: {
        workEnvironmentAccessibility: 'Remote work-from-home with async chat.',
        remoteOrFlexibleArrangements: 'Flexible 4-day or 5-day schedules.',
        assistiveTechnologyAvailable: 'NVDA and JAWS compatible test suites.',
        communicationOptions: 'Written Slack or voice call.',
        interviewAccommodations: 'Questions sent 24 hours ahead in plain text.',
        applicationProcessAccommodations: 'Voice input and large text supported.',
        additionalSupportOffered: 'Assigned peer buddy.',
      },
    }),
  });
  assert.equal(validJob.status, 201);
  createdJobId = validJob.body.id;

  // Trying to share notes without explicit consent fails
  const unconsentedShare = await apiFetch(`/api/v1/jobs/${createdJobId}/applications`, {
    method: 'POST',
    jar: learnerJar,
    body: JSON.stringify({
      applicantName: 'Hana Alemu',
      contactValue: '+251911223344',
      shareAccommodationRequest: true,
      explicitConsentToShare: false,
      accommodationRequestNote: 'Need written questions',
    }),
  });
  assert.equal(unconsentedShare.status, 400);

  // Consented application succeeds
  const validApply = await apiFetch(`/api/v1/jobs/${createdJobId}/applications`, {
    method: 'POST',
    jar: learnerJar,
    body: JSON.stringify({
      applicantName: 'Hana Alemu',
      contactValue: '+251911223344',
      shareAccommodationRequest: true,
      explicitConsentToShare: true,
      accommodationRequestNote: 'Please provide interview questions in writing beforehand.',
    }),
  });
  assert.equal(validApply.status, 201);

  // Employer reviews applications and updates status
  const empApps = await apiFetch('/api/v1/employer/applications', { jar: employerJar });
  assert.equal(empApps.status, 200);
  const hanaApp = empApps.body.find((a: any) => a.jobId === createdJobId);
  assert.ok(hanaApp);
  assert.equal(hanaApp.accommodationRequestNote, 'Please provide interview questions in writing beforehand.');

  const statusUpdate = await apiFetch(`/api/v1/employer/applications/${hanaApp.id}/status`, {
    method: 'PATCH',
    jar: employerJar,
    body: JSON.stringify({ status: 'shortlisted' }),
  });
  assert.equal(statusUpdate.status, 200);
  assert.equal(statusUpdate.body.status, 'shortlisted');
});

test('8. Protected file uploads verify magic bytes and enforce ownership authorization on download', async () => {
  // Invalid magic bytes disguised as .pdf
  const badForm = new FormData();
  badForm.append('file', new Blob(['MZ_NOT_A_PDF'], { type: 'application/pdf' }), 'fake.pdf');
  const badRes = await fetch(`${baseUrl}/api/v1/files`, {
    method: 'POST',
    headers: { cookie: cookieHeader(learnerJar) },
    body: badForm,
  });
  assert.equal(badRes.status, 400);

  // Valid PDF magic bytes
  const goodForm = new FormData();
  goodForm.append('file', new Blob(['%PDF-1.4\n%SavannaTest\n'], { type: 'application/pdf' }), 'hana-cv.pdf');
  const goodRes = await fetch(`${baseUrl}/api/v1/files`, {
    method: 'POST',
    headers: { cookie: cookieHeader(learnerJar) },
    body: goodForm,
  });
  assert.equal(goodRes.status, 201);
  const uploaded = (await goodRes.json()) as { id: string; originalName: string };
  assert.equal(uploaded.originalName, 'hana-cv.pdf');

  // Unauthenticated download blocked
  const anonDl = await apiFetch(`/api/v1/files/${uploaded.id}/download`);
  assert.equal(anonDl.status, 401);

  // Different learner download blocked
  const otherDl = await apiFetch(`/api/v1/files/${uploaded.id}/download`, { jar: secondLearnerJar });
  assert.equal(otherDl.status, 403);

  // Owner download allowed
  const ownerDl = await apiFetch(`/api/v1/files/${uploaded.id}/download`, { jar: learnerJar });
  assert.equal(ownerDl.status, 200);
  assert.ok(ownerDl.rawText.includes('%PDF-1.4'));

  // Delete learner record cleans up
  const delLearner = await apiFetch(`/api/v1/learners/${createdLearnerId}`, {
    method: 'DELETE',
    jar: learnerJar,
  });
  assert.equal(delLearner.status, 200);
});
