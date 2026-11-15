import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { writeAuditLog } from '../db/database.ts';
import {
  ADMIN_COOKIE_NAME,
  type AuthenticatedRequest,
  createSession,
  requireAdminAuth,
  requireCompletedCredentials,
  revokePrincipalSessions,
  revokeSessionByToken,
} from '../auth/sessionAuth.ts';
import {
  hashPassword,
  isStrongAdminPassword,
  verifyPassword,
} from '../security/crypto.ts';
import {
  clearAuthCookie,
  createRateLimiter,
  setAuthCookie,
} from '../security/middleware.ts';

interface AdminAccountRow {
  id: string;
  username: string;
  password_hash: string;
  role: 'platform_admin' | 'org_admin';
  organization_id: string | null;
  must_change_credentials: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

function toSummary(row: AdminAccountRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    organizationId: row.organization_id,
    mustChangeCredentials: Boolean(row.must_change_credentials),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export function createAdminAuthRouter(db: AppDatabase): Router {
  const router = Router();
  const loginLimiter = createRateLimiter({
    windowMs: 60_000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
    keyPrefix: 'admin-login',
  });

  router.post('/login', loginLimiter, (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({
        code: 'MISSING_CREDENTIALS',
        message: 'Username and password are required.',
      });
      return;
    }

    const row = db
      .prepare('SELECT * FROM admin_accounts WHERE username = ? LIMIT 1')
      .get(username) as AdminAccountRow | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid administrator username or password.',
      });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE admin_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      row.id
    );
    row.last_login_at = now;
    row.updated_at = now;

    const { token, ttlSeconds } = createSession(db, {
      principalType: 'admin',
      principalId: row.id,
      role: row.role,
      organizationId: row.organization_id,
    });

    setAuthCookie(req, res, ADMIN_COOKIE_NAME, token, ttlSeconds);
    writeAuditLog(db, {
      actorType: 'admin',
      actorId: row.id,
      organizationId: row.organization_id,
      action: 'admin.login',
      resourceType: 'admin_account',
      resourceId: row.id,
      metadata: { mustChangeCredentials: Boolean(row.must_change_credentials) },
    });

    res.json({
      authenticated: true,
      admin: toSummary(row),
    });
  });

  router.get('/me', requireAdminAuth(db), (req: AuthenticatedRequest, res) => {
    res.json({
      authenticated: true,
      admin: req.admin,
    });
  });

  router.post('/first-login-setup', requireAdminAuth(db), (req: AuthenticatedRequest, res) => {
    const admin = req.admin!;
    const currentUsername =
      typeof req.body?.currentUsername === 'string' ? req.body.currentUsername.trim() : '';
    const newUsername =
      typeof req.body?.newUsername === 'string' ? req.body.newUsername.trim() : '';
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword =
      typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirmNewPassword =
      typeof req.body?.confirmNewPassword === 'string' ? req.body.confirmNewPassword : '';

    if (!currentUsername || !newUsername || !currentPassword || !newPassword) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Current username, new username, current password, and new password are required.',
      });
      return;
    }
    if (newUsername.length < 3) {
      res.status(400).json({
        code: 'INVALID_USERNAME',
        message: 'New username must be at least 3 characters.',
      });
      return;
    }
    if (!isStrongAdminPassword(newPassword)) {
      res.status(400).json({
        code: 'WEAK_PASSWORD',
        message:
          'New password must be at least 10 characters and include uppercase, lowercase, a number, and a symbol.',
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      res.status(400).json({
        code: 'PASSWORD_MISMATCH',
        message: 'New password and confirmation do not match.',
      });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({
        code: 'SAME_PASSWORD',
        message: 'New password must differ from the initial password.',
      });
      return;
    }

    const row = db
      .prepare('SELECT * FROM admin_accounts WHERE id = ? LIMIT 1')
      .get(admin.id) as AdminAccountRow | undefined;

    if (!row || row.username !== currentUsername || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({
        code: 'INVALID_CURRENT_CREDENTIALS',
        message: 'Current username or password could not be verified.',
      });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM admin_accounts WHERE username = ? AND id != ? LIMIT 1')
      .get(newUsername, admin.id) as { id?: string } | undefined;
    if (duplicate?.id) {
      res.status(409).json({
        code: 'USERNAME_TAKEN',
        message: 'That administrator username is already in use.',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextHash = hashPassword(newPassword);

    db.prepare(`
      UPDATE admin_accounts
      SET username = ?, password_hash = ?, must_change_credentials = 0, updated_at = ?
      WHERE id = ?
    `).run(newUsername, nextHash, now, admin.id);

    // Rotate sessions: revoke all previous sessions for this admin and create a fresh session
    revokePrincipalSessions(db, 'admin', admin.id);
    const { token, ttlSeconds } = createSession(db, {
      principalType: 'admin',
      principalId: admin.id,
      role: row.role,
      organizationId: row.organization_id,
    });
    setAuthCookie(req, res, ADMIN_COOKIE_NAME, token, ttlSeconds);

    const updated = db
      .prepare('SELECT * FROM admin_accounts WHERE id = ? LIMIT 1')
      .get(admin.id) as unknown as AdminAccountRow;

    writeAuditLog(db, {
      actorType: 'admin',
      actorId: admin.id,
      organizationId: row.organization_id,
      action: 'admin.first_login_credential_change',
      resourceType: 'admin_account',
      resourceId: admin.id,
    });

    res.json({
      authenticated: true,
      admin: toSummary(updated),
      message: 'Administrator credentials updated and session rotated.',
    });
  });

  router.put(
    '/credentials',
    requireAdminAuth(db),
    requireCompletedCredentials(),
    (req: AuthenticatedRequest, res) => {
      const admin = req.admin!;
      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newUsername =
        typeof req.body?.newUsername === 'string' ? req.body.newUsername.trim() : admin.username;
      const newPassword =
        typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      const confirmNewPassword =
        typeof req.body?.confirmNewPassword === 'string' ? req.body.confirmNewPassword : '';

      if (!currentPassword) {
        res.status(400).json({
          code: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Current password is required to update administrator credentials.',
        });
        return;
      }

      if (newUsername.length < 3) {
        res.status(400).json({
          code: 'INVALID_USERNAME',
          message: 'Username must be at least 3 characters.',
        });
        return;
      }

      const row = db
        .prepare('SELECT * FROM admin_accounts WHERE id = ? LIMIT 1')
        .get(admin.id) as AdminAccountRow | undefined;

      if (!row || !verifyPassword(currentPassword, row.password_hash)) {
        res.status(401).json({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect.',
        });
        return;
      }

      let nextHash = row.password_hash;
      if (newPassword) {
        if (!isStrongAdminPassword(newPassword)) {
          res.status(400).json({
            code: 'WEAK_PASSWORD',
            message:
              'New password must be at least 10 characters and include uppercase, lowercase, a number, and a symbol.',
          });
          return;
        }
        if (newPassword !== confirmNewPassword) {
          res.status(400).json({
            code: 'PASSWORD_MISMATCH',
            message: 'New password and confirmation do not match.',
          });
          return;
        }
        nextHash = hashPassword(newPassword);
      }

      const duplicate = db
        .prepare('SELECT id FROM admin_accounts WHERE username = ? AND id != ? LIMIT 1')
        .get(newUsername, admin.id) as { id?: string } | undefined;
      if (duplicate?.id) {
        res.status(409).json({
          code: 'USERNAME_TAKEN',
          message: 'That administrator username is already in use.',
        });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE admin_accounts
        SET username = ?, password_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(newUsername, nextHash, now, admin.id);

      revokePrincipalSessions(db, 'admin', admin.id);
      const { token, ttlSeconds } = createSession(db, {
        principalType: 'admin',
        principalId: admin.id,
        role: row.role,
        organizationId: row.organization_id,
      });
      setAuthCookie(req, res, ADMIN_COOKIE_NAME, token, ttlSeconds);

      const updated = db
        .prepare('SELECT * FROM admin_accounts WHERE id = ? LIMIT 1')
        .get(admin.id) as unknown as AdminAccountRow;

      writeAuditLog(db, {
        actorType: 'admin',
        actorId: admin.id,
        organizationId: row.organization_id,
        action: 'admin.credentials_updated',
        resourceType: 'admin_account',
        resourceId: admin.id,
      });

      res.json({
        authenticated: true,
        admin: toSummary(updated),
        message: 'Administrator credentials updated and session rotated.',
      });
    }
  );

  router.post('/logout', (req: AuthenticatedRequest, res) => {
    const rawCookieHeader = req.headers.cookie || '';
    const match = rawCookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
    if (match?.[1]) {
      try {
        revokeSessionByToken(db, decodeURIComponent(match[1]));
      } catch {
        // ignore malformed cookie
      }
    }
    clearAuthCookie(req, res, ADMIN_COOKIE_NAME);
    res.json({ loggedOut: true });
  });

  return router;
}
