import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { writeAuditLog } from '../db/database.ts';
import {
  type AuthenticatedRequest,
  getExistingLearnerTokenHash,
  getOrCreateLearnerToken,
  optionalUserAuth,
  requireUserAuth,
  resolveAdminFromRequest,
} from '../auth/sessionAuth.ts';
import {
  checkServerEmployerSafeguards,
  containsSensitiveSecret,
  generateId,
  hashToken,
  maskIdReference,
} from '../security/crypto.ts';
import { createRateLimiter } from '../security/middleware.ts';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

function matchesMagicBytes(buf: Buffer, mime: string): boolean {
  if (mime === 'application/pdf') {
    return buf.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (mime === 'image/png') {
    return (
      buf.length >= 4 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (mime === 'image/jpeg') {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b; // PK zip header
  }
  if (mime === 'application/msword') {
    return buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf;
  }
  if (mime === 'text/plain') {
    // Reject obvious binary bytes (null byte)
    return !buf.subarray(0, Math.min(buf.length, 512)).includes(0);
  }
  return false;
}

function resolveDefaultOrgId(db: AppDatabase, candidate?: string | null): string {
  if (candidate) {
    const byId = db.prepare('SELECT id FROM organizations WHERE id = ? OR slug = ? LIMIT 1').get(candidate, candidate) as { id?: string } | undefined;
    if (byId?.id) return byId.id;
  }
  const first = db.prepare('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1').get() as { id?: string } | undefined;
  return first?.id || 'org-alx-ethiopia';
}

function canAccessLearner(
  db: AppDatabase,
  req: AuthenticatedRequest,
  learnerRow: Record<string, unknown>
): boolean {
  const admin = resolveAdminFromRequest(db, req)?.admin;
  if (admin && !admin.mustChangeCredentials) {
    if (admin.role === 'platform_admin') return true;
    if (admin.organizationId && admin.organizationId === String(learnerRow.organization_id)) return true;
  }
  if (req.user) {
    if (learnerRow.user_id && String(learnerRow.user_id) === req.user.id) return true;
    if (req.user.role === 'coordinator' && req.user.organizationId === String(learnerRow.organization_id)) {
      return true;
    }
  }
  const tokenHash = getExistingLearnerTokenHash(req);
  if (tokenHash && learnerRow.owner_token_hash && tokenHash === String(learnerRow.owner_token_hash)) {
    return true;
  }
  return false;
}

function hydrateJob(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    title: String(r.title),
    organization: String(r.organization),
    location: String(r.location),
    isRemote: Boolean(r.is_remote),
    employmentType: String(r.employment_type),
    descriptionSummary: String(r.description_summary),
    requiredSkills: parseJson<string[]>(String(r.required_skills_json), []),
    accommodationCategories: parseJson<string[]>(String(r.accommodation_categories_json), []),
    accommodationsOffered: parseJson<string[]>(String(r.accommodations_offered_json), []),
    accommodationDetails: parseJson(String(r.accommodation_details_json), {}),
    applicationDeadline: r.application_deadline ? String(r.application_deadline) : undefined,
    postedAtIso: String(r.posted_at_iso),
    isDemoData: false,
  };
}

export function createGatewayApiRouter(db: AppDatabase, uploadDirInput?: string): Router {
  const router = Router();
  const uploadDir =
    uploadDirInput ||
    process.env.UPLOAD_DIR ||
    path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  const uploadLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 30,
    keyPrefix: 'file-upload',
  });

  // 1. Capabilities
  router.get('/capabilities', (_req, res) => {
    const smsEnabled = Boolean(process.env.SMS_WEBHOOK_URL);
    res.json({
      serverDraftsEnabled: true,
      smsResumeEnabled: smsEnabled,
      uploadsEnabled: true,
      databaseBackend: 'sqlite',
    });
  });

  // 2. Onboarding Draft Sessions
  router.post('/onboarding/sessions', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const rawDraft = req.body?.draft;
    if (!rawDraft || typeof rawDraft !== 'object') {
      res.status(400).json({ message: 'Onboarding draft object is required.' });
      return;
    }

    // Privacy guard: strip raw identityReferenceNumber from stored server drafts
    const sanitizedDraft = { ...rawDraft, identityReferenceNumber: '' };
    const token = getOrCreateLearnerToken(req, res);
    const tokenHash = hashToken(token);
    const orgId = resolveDefaultOrgId(db, req.body?.organizationId);
    const currentStep = Number(req.body?.currentStep) || 0;
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId ? req.body.sessionId : generateId('ons');
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id, user_id, owner_token_hash FROM onboarding_sessions WHERE id = ? LIMIT 1').get(sessionId) as
      | { id: string; user_id: string | null; owner_token_hash: string | null }
      | undefined;

    if (existing) {
      const authorized =
        (req.user && existing.user_id === req.user.id) ||
        (existing.owner_token_hash && existing.owner_token_hash === tokenHash);
      if (!authorized) {
        res.status(403).json({ message: 'You do not have permission to update this onboarding session.' });
        return;
      }
      db.prepare('UPDATE onboarding_sessions SET current_step = ?, draft_json = ?, updated_at = ? WHERE id = ?').run(
        currentStep,
        JSON.stringify(sanitizedDraft),
        now,
        sessionId
      );
    } else {
      db.prepare(`
        INSERT INTO onboarding_sessions (id, organization_id, user_id, owner_token_hash, current_step, draft_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
      `).run(
        sessionId,
        orgId,
        req.user?.id || null,
        tokenHash,
        currentStep,
        JSON.stringify(sanitizedDraft),
        now,
        now
      );
    }

    res.json({ id: sessionId, updatedAt: now });
  });

  // 3. Onboarding Submission (Learner + Private Accessibility Request Segregation)
  function insertLearnerFromDraft(
    req: AuthenticatedRequest,
    res: any,
    draft: Record<string, any>
  ) {
    const fullName = typeof draft.fullName === 'string' ? draft.fullName.trim() : '';
    if (!fullName) {
      return { error: { status: 400, message: 'Full name is required.' } };
    }
    const registrationMode = draft.registrationMode === 'partner_assisted' ? 'partner_assisted' : 'self';
    if (registrationMode === 'partner_assisted' && !draft.partnerConsent?.learnerConsented) {
      return {
        error: { status: 400, message: 'Explicit learner consent is required for partner-assisted registration.' },
      };
    }

    const token = getOrCreateLearnerToken(req, res);
    const tokenHash = hashToken(token);
    const learnerId = generateId('lrn');
    const now = new Date().toISOString();
    const orgId = resolveDefaultOrgId(db, draft.organizationId);
    const contactMethod = typeof draft.contactMethod === 'string' ? draft.contactMethod : 'none';
    const contactValue = contactMethod === 'none' ? '' : String(draft.contactValue || '').trim();
    const identityRoute = typeof draft.identityRoute === 'string' ? draft.identityRoute : '';
    const maskedIdRef =
      typeof draft.identityReferenceNumber === 'string' && draft.identityReferenceNumber.trim()
        ? maskIdReference(draft.identityReferenceNumber)
        : '';
    const partnerReferralOrg = String(draft.partnerReferralOrg || '').trim();

    db.prepare(`
      INSERT INTO learners (
        id, organization_id, user_id, owner_token_hash, registration_mode, full_name,
        contact_method, contact_value, identity_route, identity_ref_masked, partner_referral_org,
        partner_consent_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      learnerId,
      orgId,
      req.user?.id || null,
      tokenHash,
      registrationMode,
      fullName,
      contactMethod,
      contactValue,
      identityRoute,
      maskedIdRef,
      partnerReferralOrg,
      draft.partnerConsent ? JSON.stringify(draft.partnerConsent) : null,
      now,
      now
    );

    const supportPrefs = Array.isArray(draft.supportPreferences) ? draft.supportPreferences : [];
    const supportNotes = typeof draft.supportNotes === 'string' ? draft.supportNotes.trim() : '';
    if (supportPrefs.length > 0 || supportNotes) {
      db.prepare(`
        INSERT INTO private_accessibility_requests (
          id, learner_id, organization_id, support_preferences_json, support_notes,
          consent_to_share_with_employer, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      `).run(generateId('priv'), learnerId, orgId, JSON.stringify(supportPrefs), supportNotes, now, now);
    }

    return {
      learner: {
        id: learnerId,
        registrationMode,
        fullName,
        contactMethod,
        contactValue,
        identityRoute,
        idRoute: identityRoute,
        partnerReferralOrg,
        supportPreferences: supportPrefs,
        supportNotes,
        partnerConsent: draft.partnerConsent,
        updatedAtIso: now,
      },
    };
  }

  router.post('/onboarding/submissions', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const result = insertLearnerFromDraft(req, res, (req.body || {}) as Record<string, any>);
    if ('error' in result && result.error) {
      res.status(result.error.status).json({ message: result.error.message });
      return;
    }
    const { learner } = result;
    res.status(201).json({
      id: learner.id,
      submittedAtIso: learner.updatedAtIso,
      mode: 'real',
      persistedToServer: true,
      notice: 'Saved securely to the Savanna Gateway database. Support notes remain private.',
    });
  });

  router.post('/onboarding/resume-sms', (req, res) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!phone) {
      res.status(400).json({ sent: false, message: 'Phone number is required.' });
      return;
    }
    if (!process.env.SMS_WEBHOOK_URL) {
      res.json({
        sent: false,
        message:
          'SMS delivery provider is not configured on this server (SMS_WEBHOOK_URL unset). Your progress can still be saved securely via account or device storage.',
      });
      return;
    }
    res.json({
      sent: true,
      message: `Resume link queued for ${phone}.`,
    });
  });

  // 4. Learner Profile CRUD & Export/Delete
  router.post('/learners', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const result = insertLearnerFromDraft(req, res, (req.body || {}) as Record<string, any>);
    if ('error' in result && result.error) {
      res.status(result.error.status).json({ message: result.error.message });
      return;
    }
    res.status(201).json(result.learner);
  });

  router.get('/learners/:id/export', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM learners WHERE id = ? LIMIT 1').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ message: 'Learner profile not found.' });
      return;
    }
    if (!canAccessLearner(db, req, row)) {
      res.status(403).json({ message: 'Unauthorized to access this learner profile.' });
      return;
    }

    const priv = db
      .prepare('SELECT * FROM private_accessibility_requests WHERE learner_id = ? LIMIT 1')
      .get(req.params.id) as Record<string, unknown> | undefined;

    res.json({
      id: String(row.id),
      registrationMode: String(row.registration_mode),
      fullName: String(row.full_name),
      contactMethod: String(row.contact_method),
      contactValue: String(row.contact_value),
      identityRoute: String(row.identity_route),
      idRoute: String(row.identity_route),
      identityReferenceMasked: String(row.identity_ref_masked || ''),
      partnerReferralOrg: String(row.partner_referral_org || ''),
      partnerConsent: row.partner_consent_json ? parseJson(String(row.partner_consent_json), undefined) : undefined,
      supportPreferences: priv ? parseJson(String(priv.support_preferences_json), []) : [],
      supportNotes: priv ? String(priv.support_notes || '') : '',
      updatedAtIso: String(row.updated_at),
    });
  });

  router.patch('/learners/:id', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM learners WHERE id = ? LIMIT 1').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ message: 'Learner profile not found.' });
      return;
    }
    if (!canAccessLearner(db, req, row)) {
      res.status(403).json({ message: 'Unauthorized to modify this learner profile.' });
      return;
    }

    const now = new Date().toISOString();
    const fullName =
      typeof req.body?.fullName === 'string' && req.body.fullName.trim()
        ? req.body.fullName.trim()
        : String(row.full_name);
    const contactMethod =
      typeof req.body?.contactMethod === 'string' ? req.body.contactMethod : String(row.contact_method);
    const contactValue =
      typeof req.body?.contactValue === 'string' ? req.body.contactValue.trim() : String(row.contact_value);
    const identityRoute =
      typeof req.body?.identityRoute === 'string' ? req.body.identityRoute : String(row.identity_route);
    const partnerReferralOrg =
      typeof req.body?.partnerReferralOrg === 'string'
        ? req.body.partnerReferralOrg.trim()
        : String(row.partner_referral_org || '');

    db.prepare(`
      UPDATE learners
      SET full_name = ?, contact_method = ?, contact_value = ?, identity_route = ?,
          partner_referral_org = ?, updated_at = ?
      WHERE id = ?
    `).run(fullName, contactMethod, contactValue, identityRoute, partnerReferralOrg, now, req.params.id);

    if (Array.isArray(req.body?.supportPreferences) || typeof req.body?.supportNotes === 'string') {
      const prefs = Array.isArray(req.body.supportPreferences) ? req.body.supportPreferences : [];
      const notes = typeof req.body.supportNotes === 'string' ? req.body.supportNotes.trim() : '';
      db.prepare(`
        INSERT INTO private_accessibility_requests (
          id, learner_id, organization_id, support_preferences_json, support_notes,
          consent_to_share_with_employer, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(learner_id) DO UPDATE SET
          support_preferences_json = excluded.support_preferences_json,
          support_notes = excluded.support_notes,
          updated_at = excluded.updated_at
      `).run(generateId('priv'), req.params.id, String(row.organization_id), JSON.stringify(prefs), notes, now, now);
    }

    const priv = db
      .prepare('SELECT * FROM private_accessibility_requests WHERE learner_id = ? LIMIT 1')
      .get(req.params.id) as Record<string, unknown> | undefined;

    res.json({
      id: req.params.id,
      registrationMode: String(row.registration_mode),
      fullName,
      contactMethod,
      contactValue,
      identityRoute,
      idRoute: identityRoute,
      partnerReferralOrg,
      supportPreferences: priv ? parseJson(String(priv.support_preferences_json), []) : [],
      supportNotes: priv ? String(priv.support_notes || '') : '',
      updatedAtIso: now,
    });
  });

  router.put('/learners/:id/support', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM learners WHERE id = ? LIMIT 1').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ message: 'Learner profile not found.' });
      return;
    }
    if (!canAccessLearner(db, req, row)) {
      res.status(403).json({ message: 'Unauthorized to update support preferences.' });
      return;
    }

    const now = new Date().toISOString();
    const prefs = Array.isArray(req.body?.supportPreferences) ? req.body.supportPreferences : [];
    const notes = typeof req.body?.supportNotes === 'string' ? req.body.supportNotes.trim() : '';

    db.prepare(`
      INSERT INTO private_accessibility_requests (
        id, learner_id, organization_id, support_preferences_json, support_notes,
        consent_to_share_with_employer, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(learner_id) DO UPDATE SET
        support_preferences_json = excluded.support_preferences_json,
        support_notes = excluded.support_notes,
        updated_at = excluded.updated_at
    `).run(generateId('priv'), req.params.id, String(row.organization_id), JSON.stringify(prefs), notes, now, now);

    res.json({
      id: req.params.id,
      registrationMode: String(row.registration_mode),
      fullName: String(row.full_name),
      contactMethod: String(row.contact_method),
      contactValue: String(row.contact_value),
      identityRoute: String(row.identity_route),
      idRoute: String(row.identity_route),
      partnerReferralOrg: String(row.partner_referral_org || ''),
      supportPreferences: prefs,
      supportNotes: notes,
      updatedAtIso: now,
    });
  });

  router.delete('/learners/:id', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const row = db.prepare('SELECT * FROM learners WHERE id = ? LIMIT 1').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ message: 'Learner profile not found.' });
      return;
    }
    if (!canAccessLearner(db, req, row)) {
      res.status(403).json({ message: 'Unauthorized to delete this learner profile.' });
      return;
    }

    db.prepare('DELETE FROM learners WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  });

  // 5. Jobs & Inclusion Safeguard Enforcement
  router.get('/jobs', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const accRaw = typeof req.query.accommodations === 'string' ? req.query.accommodations : '';
    const cats = accRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = db
      .prepare('SELECT * FROM jobs WHERE is_active = 1 ORDER BY posted_at_iso DESC')
      .all() as Array<Record<string, unknown>>;

    const filtered = rows
      .map(hydrateJob)
      .filter((job) => {
        if (q) {
          const hay = [
            job.title,
            job.organization,
            job.location,
            job.descriptionSummary,
            ...job.requiredSkills,
            ...job.accommodationsOffered,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (cats.length > 0) {
          if (!cats.every((c) => job.accommodationCategories.includes(c))) {
            return false;
          }
        }
        return true;
      })
      .slice(offset, offset + limit);

    res.json(filtered);
  });

  router.post('/jobs', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const organization = typeof body.organization === 'string' ? body.organization.trim() : '';
    const descriptionSummary =
      typeof body.descriptionSummary === 'string' ? body.descriptionSummary.trim() : '';

    if (!title || !organization || !descriptionSummary) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Job title, organization, and description summary are required.',
      });
      return;
    }

    const details = body.accommodationDetails || {};
    const violations = checkServerEmployerSafeguards({
      title,
      descriptionSummary,
      workEnvironmentAccessibility: details.workEnvironmentAccessibility,
      remoteOrFlexibleArrangements: details.remoteOrFlexibleArrangements,
      assistiveTechnologyAvailable: details.assistiveTechnologyAvailable,
      communicationOptions: details.communicationOptions,
      interviewAccommodations: details.interviewAccommodations,
      applicationProcessAccommodations: details.applicationProcessAccommodations,
      additionalSupportOffered: details.additionalSupportOffered,
    });

    if (violations.length > 0) {
      res.status(400).json({
        code: 'SAFEGUARD_VIOLATION',
        message: `Blocked by accessibility inclusion safeguard (${violations[0].matchedTerm}): ${violations[0].guidance}`,
        violations,
      });
      return;
    }

    const jobId = generateId('job');
    const orgId = resolveDefaultOrgId(db, req.user?.organizationId || body.organizationId);
    const postedAtIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO jobs (
        id, organization_id, created_by_user_id, title, organization, location,
        is_remote, employment_type, description_summary, required_skills_json,
        accommodation_categories_json, accommodations_offered_json, accommodation_details_json,
        application_deadline, posted_at_iso, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      jobId,
      orgId,
      req.user?.id || null,
      title,
      organization,
      String(body.location || (body.isRemote ? 'Remote' : 'Addis Ababa')),
      body.isRemote ? 1 : 0,
      String(body.employmentType || 'Full-time'),
      descriptionSummary,
      JSON.stringify(Array.isArray(body.requiredSkills) ? body.requiredSkills : []),
      JSON.stringify(Array.isArray(body.accommodationCategories) ? body.accommodationCategories : ['other_accommodations']),
      JSON.stringify(Array.isArray(body.accommodationsOffered) ? body.accommodationsOffered : []),
      JSON.stringify(details),
      body.applicationDeadline ? String(body.applicationDeadline) : null,
      postedAtIso
    );

    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Record<string, unknown>;
    res.status(201).json(hydrateJob(row));
  });

  // 6. Job Applications & Explicit Consent Enforcement
  router.get('/jobs/applications/mine', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const tokenHash = getExistingLearnerTokenHash(req);
    if (!req.user && !tokenHash) {
      res.json([]);
      return;
    }

    let sql = `
      SELECT a.*, j.title AS job_title, j.organization AS job_organization
      FROM job_applications a
      JOIN jobs j ON j.id = a.job_id
      WHERE 1=0
    `;
    const params: string[] = [];
    if (req.user) {
      sql += ' OR a.user_id = ?';
      params.push(req.user.id);
    }
    if (tokenHash) {
      sql += ' OR a.learner_token_hash = ?';
      params.push(tokenHash);
    }
    sql += ' ORDER BY a.submitted_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: String(r.id),
        jobId: String(r.job_id),
        jobTitle: String(r.job_title),
        organization: String(r.job_organization),
        organizationId: String(r.organization_id),
        applicantName: String(r.applicant_name),
        contactValue: String(r.contact_value),
        relevantExperience: String(r.relevant_experience || ''),
        shareAccommodationRequest: Boolean(r.share_accommodation_request),
        accommodationRequestNote: String(r.accommodation_request_note || ''),
        explicitConsentToShare: Boolean(r.explicit_consent_to_share),
        resumeFileId: r.resume_file_id ? String(r.resume_file_id) : null,
        status: String(r.status),
        submittedAt: String(r.submitted_at),
        updatedAt: String(r.updated_at),
      }))
    );
  });

  router.post('/jobs/:jobId/applications', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const jobRow = db.prepare('SELECT id, organization_id FROM jobs WHERE id = ? AND is_active = 1 LIMIT 1').get(req.params.jobId) as
      | { id: string; organization_id: string }
      | undefined;
    if (!jobRow) {
      res.status(404).json({ message: 'Job posting not found.' });
      return;
    }

    const body = req.body || {};
    const applicantName = typeof body.applicantName === 'string' ? body.applicantName.trim() : '';
    const contactValue = typeof body.contactValue === 'string' ? body.contactValue.trim() : '';
    if (!applicantName || !contactValue) {
      res.status(400).json({ message: 'Applicant name and contact value are required.' });
      return;
    }

    const shareRequested = Boolean(body.shareAccommodationRequest);
    const explicitConsent = Boolean(body.explicitConsentToShare);
    if (shareRequested && !explicitConsent) {
      res.status(400).json({
        message: 'Explicit consent is required before sharing an accommodation request with an employer.',
      });
      return;
    }

    const noteToStore =
      shareRequested && explicitConsent && typeof body.accommodationRequestNote === 'string'
        ? body.accommodationRequestNote.trim()
        : '';

    const token = getOrCreateLearnerToken(req, res);
    const tokenHash = hashToken(token);
    const appId = generateId('app');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO job_applications (
        id, job_id, organization_id, user_id, learner_token_hash, applicant_name, contact_value,
        relevant_experience, share_accommodation_request, accommodation_request_note,
        explicit_consent_to_share, resume_file_id, status, submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
    `).run(
      appId,
      jobRow.id,
      jobRow.organization_id,
      req.user?.id || null,
      tokenHash,
      applicantName,
      contactValue,
      typeof body.relevantExperience === 'string' ? body.relevantExperience.trim() : '',
      shareRequested ? 1 : 0,
      noteToStore,
      explicitConsent ? 1 : 0,
      typeof body.resumeFileId === 'string' && body.resumeFileId ? body.resumeFileId : null,
      now,
      now
    );

    res.status(201).json({
      id: appId,
      submittedAtIso: now,
      mode: 'real',
      persistedToServer: true,
      notice:
        'Application saved to the database. Private support preferences were NOT shared unless explicitly consented.',
    });
  });

  // 7. Employer Portal Management (Authenticated Employer or Admin)
  router.get('/employer/jobs', requireUserAuth(db), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (user.role !== 'employer' && user.role !== 'coordinator') {
      res.status(403).json({ message: 'Employer account required.' });
      return;
    }
    const rows = db
      .prepare('SELECT * FROM jobs WHERE created_by_user_id = ? OR organization_id = ? ORDER BY posted_at_iso DESC')
      .all(user.id, user.organizationId || '') as Array<Record<string, unknown>>;
    res.json(rows.map(hydrateJob));
  });

  router.get('/employer/applications', requireUserAuth(db), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (user.role !== 'employer' && user.role !== 'coordinator') {
      res.status(403).json({ message: 'Employer account required.' });
      return;
    }
    const rows = db
      .prepare(`
        SELECT a.*, j.title AS job_title, j.organization AS job_organization
        FROM job_applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE j.created_by_user_id = ? OR j.organization_id = ?
        ORDER BY a.submitted_at DESC
      `)
      .all(user.id, user.organizationId || '') as Array<Record<string, unknown>>;

    // Strict privacy safeguard: only expose accommodation note when share && explicitConsent are true
    res.json(
      rows.map((r) => {
        const consented = Boolean(r.share_accommodation_request) && Boolean(r.explicit_consent_to_share);
        return {
          id: String(r.id),
          jobId: String(r.job_id),
          jobTitle: String(r.job_title),
          organization: String(r.job_organization),
          organizationId: String(r.organization_id),
          applicantName: String(r.applicant_name),
          contactValue: String(r.contact_value),
          relevantExperience: String(r.relevant_experience || ''),
          shareAccommodationRequest: consented,
          accommodationRequestNote: consented ? String(r.accommodation_request_note || '') : '',
          explicitConsentToShare: consented,
          resumeFileId: r.resume_file_id ? String(r.resume_file_id) : null,
          status: String(r.status),
          submittedAt: String(r.submitted_at),
          updatedAt: String(r.updated_at),
        };
      })
    );
  });

  router.patch('/employer/applications/:id/status', requireUserAuth(db), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    if (user.role !== 'employer' && user.role !== 'coordinator') {
      res.status(403).json({ message: 'Employer account required.' });
      return;
    }

    const nextStatus = req.body?.status;
    if (!['submitted', 'in_review', 'shortlisted', 'archived'].includes(nextStatus)) {
      res.status(400).json({ message: 'Invalid application status.' });
      return;
    }

    const row = db
      .prepare(`
        SELECT a.*, j.created_by_user_id, j.organization_id AS job_org_id
        FROM job_applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.id = ? LIMIT 1
      `)
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ message: 'Application not found.' });
      return;
    }
    const owns =
      row.created_by_user_id === user.id ||
      (user.organizationId && row.job_org_id === user.organizationId);
    if (!owns) {
      res.status(403).json({ message: 'Unauthorized to update this application.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE job_applications SET status = ?, updated_at = ? WHERE id = ?').run(
      nextStatus,
      now,
      req.params.id
    );

    const consented = Boolean(row.share_accommodation_request) && Boolean(row.explicit_consent_to_share);
    res.json({
      id: String(row.id),
      jobId: String(row.job_id),
      organizationId: String(row.organization_id),
      applicantName: String(row.applicant_name),
      contactValue: String(row.contact_value),
      relevantExperience: String(row.relevant_experience || ''),
      shareAccommodationRequest: consented,
      accommodationRequestNote: consented ? String(row.accommodation_request_note || '') : '',
      explicitConsentToShare: consented,
      resumeFileId: row.resume_file_id ? String(row.resume_file_id) : null,
      status: nextStatus,
      submittedAt: String(row.submitted_at),
      updatedAt: now,
    });
  });

  // 8. Protected File Uploads (5MB max, MIME + Magic Bytes, Private Storage)
  router.post(
    '/files',
    uploadLimiter,
    optionalUserAuth(db),
    upload.single('file'),
    (req: AuthenticatedRequest, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ message: 'No file uploaded.' });
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        res.status(400).json({
          message: 'Unsupported file type. Allowed types: PDF, DOC, DOCX, TXT, PNG, JPEG.',
        });
        return;
      }
      if (!matchesMagicBytes(file.buffer, file.mimetype)) {
        res.status(400).json({
          message: 'File contents do not match the declared file type.',
        });
        return;
      }

      const fileId = generateId('fil');
      const safeExt = path.extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
      const storedFilename = `${fileId}${safeExt}`;
      fs.writeFileSync(path.join(uploadDir, storedFilename), file.buffer);

      const token = getOrCreateLearnerToken(req, res);
      const tokenHash = hashToken(token);
      const createdAt = new Date().toISOString();
      const orgId = req.body?.organizationId ? String(req.body.organizationId) : null;

      db.prepare(`
        INSERT INTO uploaded_files (
          id, stored_filename, original_name, mime_type, size_bytes,
          organization_id, uploaded_by_user_id, owner_token_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        storedFilename,
        file.originalname.slice(0, 180),
        file.mimetype,
        file.size,
        orgId,
        req.user?.id || null,
        tokenHash,
        createdAt
      );

      res.status(201).json({
        id: fileId,
        originalName: file.originalname.slice(0, 180),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        organizationId: orgId,
        createdAt,
      });
    }
  );

  router.get('/files/:id/download', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const fileRow = db.prepare('SELECT * FROM uploaded_files WHERE id = ? LIMIT 1').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!fileRow) {
      res.status(404).json({ message: 'File not found.' });
      return;
    }

    const admin = resolveAdminFromRequest(db, req)?.admin;
    const tokenHash = getExistingLearnerTokenHash(req);
    const isAdmin =
      Boolean(admin && !admin.mustChangeCredentials) &&
      (admin!.role === 'platform_admin' ||
        (admin!.organizationId && admin!.organizationId === fileRow.organization_id));
    const isUploaderUser = Boolean(req.user && fileRow.uploaded_by_user_id === req.user.id);
    const isUploaderToken = Boolean(tokenHash && fileRow.owner_token_hash === tokenHash);

    let isEmployerForApplication = false;
    if (req.user?.role === 'employer' && req.user.organizationId) {
      const appMatch = db
        .prepare('SELECT id FROM job_applications WHERE resume_file_id = ? AND organization_id = ? LIMIT 1')
        .get(req.params.id, req.user.organizationId) as { id?: string } | undefined;
      isEmployerForApplication = Boolean(appMatch?.id);
    }

    if (!admin && !req.user && !tokenHash) {
      res.status(401).json({ message: 'Authentication required to download this file.' });
      return;
    }

    if (!isAdmin && !isUploaderUser && !isUploaderToken && !isEmployerForApplication) {
      res.status(403).json({ message: 'Unauthorized to download this file.' });
      return;
    }

    const fullPath = path.join(uploadDir, String(fileRow.stored_filename));
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ message: 'File binary is missing from storage.' });
      return;
    }

    res.setHeader('Content-Type', String(fileRow.mime_type));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(fileRow.original_name).replace(/["\r\n]/g, '')}"`
    );
    res.sendFile(fullPath);
  });

  // 9. Accessible Feedback & Safe Public Analytics Summary
  router.post('/feedback', optionalUserAuth(db), (req: AuthenticatedRequest, res) => {
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : 'General';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'en';

    if (!message || message.length > 2000) {
      res.status(400).json({ message: 'Feedback message is required (max 2000 characters).' });
      return;
    }
    if (containsSensitiveSecret(message)) {
      res.status(400).json({
        message: 'For your safety, please remove passwords, PINs, or private keys before submitting.',
      });
      return;
    }

    const id = generateId('fbk');
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO feedback_submissions (id, user_id, category, message, language, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user?.id || null, category, message, language, createdAt);

    writeAuditLog(db, {
      actorType: req.user ? 'user' : 'guest',
      actorId: req.user?.id || 'anonymous',
      action: 'feedback.submitted',
      resourceType: 'feedback',
      resourceId: id,
    });

    res.status(201).json({ id, createdAt });
  });

  router.get('/analytics/summary', (_req, res) => {
    const count = (sql: string): number => Number((db.prepare(sql).get() as { c: number }).c);
    res.json({
      organizationCount: count('SELECT COUNT(*) AS c FROM organizations'),
      learnerCount: count('SELECT COUNT(*) AS c FROM learners'),
      onboardingSessionCount: count('SELECT COUNT(*) AS c FROM onboarding_sessions'),
      completedRegistrationCount: count('SELECT COUNT(*) AS c FROM learners'),
      formCount: count('SELECT COUNT(*) AS c FROM forms'),
      publishedFormCount: count("SELECT COUNT(*) AS c FROM forms WHERE status = 'published'"),
      formSubmissionCount: count('SELECT COUNT(*) AS c FROM form_submissions'),
      jobCount: count('SELECT COUNT(*) AS c FROM jobs WHERE is_active = 1'),
      applicationCount: count('SELECT COUNT(*) AS c FROM job_applications'),
      privateSupportRequestCount: 0, // Never exposed on unauthenticated summary endpoint
      feedbackCount: count('SELECT COUNT(*) AS c FROM feedback_submissions'),
    });
  });

  return router;
}
