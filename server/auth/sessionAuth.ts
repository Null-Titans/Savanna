import type { NextFunction, Request, Response } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { generateSessionToken, hashToken } from '../security/crypto.ts';
import { clearAuthCookie, parseCookies, setAuthCookie } from '../security/middleware.ts';

export const ADMIN_COOKIE_NAME = 'gw_admin_sid';
export const USER_COOKIE_NAME = 'gw_user_sid';
export const LEARNER_TOKEN_COOKIE = 'gw_learner_token';

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const USER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  role: 'platform_admin' | 'org_admin';
  organizationId: string | null;
  mustChangeCredentials: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'learner' | 'employer' | 'coordinator';
  organizationId: string | null;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: AuthenticatedAdmin;
  adminSessionToken?: string;
  user?: AuthenticatedUser;
  userSessionToken?: string;
}

export function createSession(
  db: AppDatabase,
  params: {
    principalType: 'admin' | 'user';
    principalId: string;
    role: string;
    organizationId: string | null;
    ttlSeconds?: number;
  }
): { token: string; expiresAt: string; ttlSeconds: number } {
  const ttlSeconds =
    params.ttlSeconds ??
    (params.principalType === 'admin' ? ADMIN_SESSION_TTL_SECONDS : USER_SESSION_TTL_SECONDS);
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, token_hash, principal_type, principal_id, role, organization_id, expires_at, revoked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    `ses-${tokenHash.slice(0, 16)}-${Date.now()}`,
    tokenHash,
    params.principalType,
    params.principalId,
    params.role,
    params.organizationId,
    expiresAt,
    now.toISOString()
  );

  return { token, expiresAt, ttlSeconds };
}

export function revokeSessionByToken(db: AppDatabase, token: string | undefined): void {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(
    new Date().toISOString(),
    tokenHash
  );
}

export function revokePrincipalSessions(
  db: AppDatabase,
  principalType: 'admin' | 'user',
  principalId: string
): void {
  db.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE principal_type = ? AND principal_id = ? AND revoked_at IS NULL'
  ).run(new Date().toISOString(), principalType, principalId);
}

export function resolveAdminFromRequest(
  db: AppDatabase,
  req: Request
): { admin: AuthenticatedAdmin; token: string } | null {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = db
    .prepare(`
      SELECT
        a.id, a.username, a.role, a.organization_id, a.must_change_credentials,
        a.created_at, a.updated_at, a.last_login_at,
        s.expires_at, s.revoked_at
      FROM sessions s
      JOIN admin_accounts a ON a.id = s.principal_id
      WHERE s.token_hash = ? AND s.principal_type = 'admin'
      LIMIT 1
    `)
    .get(tokenHash) as
    | {
        id: string;
        username: string;
        role: 'platform_admin' | 'org_admin';
        organization_id: string | null;
        must_change_credentials: number;
        created_at: string;
        updated_at: string;
        last_login_at: string | null;
        expires_at: string;
        revoked_at: string | null;
      }
    | undefined;

  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    token,
    admin: {
      id: row.id,
      username: row.username,
      role: row.role,
      organizationId: row.organization_id,
      mustChangeCredentials: Boolean(row.must_change_credentials),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
    },
  };
}

export function resolveUserFromRequest(
  db: AppDatabase,
  req: Request
): { user: AuthenticatedUser; token: string } | null {
  const cookies = parseCookies(req);
  const token = cookies[USER_COOKIE_NAME];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = db
    .prepare(`
      SELECT
        u.id, u.username, u.email, u.full_name, u.role, u.organization_id, u.created_at,
        s.expires_at, s.revoked_at
      FROM sessions s
      JOIN users u ON u.id = s.principal_id
      WHERE s.token_hash = ? AND s.principal_type = 'user'
      LIMIT 1
    `)
    .get(tokenHash) as
    | {
        id: string;
        username: string;
        email: string;
        full_name: string;
        role: 'learner' | 'employer' | 'coordinator';
        organization_id: string | null;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
      }
    | undefined;

  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      organizationId: row.organization_id,
      createdAt: row.created_at,
    },
  };
}

export function requireAdminAuth(db: AppDatabase) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const resolved = resolveAdminFromRequest(db, req);
    if (!resolved) {
      clearAuthCookie(req, res, ADMIN_COOKIE_NAME);
      res.status(401).json({
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Administrator authentication is required to access Form Builder.',
      });
      return;
    }
    req.admin = resolved.admin;
    req.adminSessionToken = resolved.token;
    next();
  };
}

export function requireCompletedCredentials() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Administrator authentication is required.',
      });
      return;
    }
    if (req.admin.mustChangeCredentials) {
      res.status(403).json({
        code: 'CREDENTIAL_CHANGE_REQUIRED',
        message:
          'You must replace the initial administrator username and password before accessing Form Builder.',
      });
      return;
    }
    next();
  };
}

export function requirePlatformAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.admin || req.admin.role !== 'platform_admin') {
    res.status(403).json({
      code: 'PLATFORM_ADMIN_REQUIRED',
      message: 'This action is restricted to platform administrators.',
    });
    return;
  }
  next();
}

export function optionalUserAuth(db: AppDatabase) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const resolved = resolveUserFromRequest(db, req);
    if (resolved) {
      req.user = resolved.user;
      req.userSessionToken = resolved.token;
    }
    next();
  };
}

export function requireUserAuth(db: AppDatabase) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const resolved = resolveUserFromRequest(db, req);
    if (!resolved) {
      res.status(401).json({
        code: 'USER_AUTH_REQUIRED',
        message: 'Please sign in to access your account.',
      });
      return;
    }
    req.user = resolved.user;
    req.userSessionToken = resolved.token;
    next();
  };
}

export function getOrCreateLearnerToken(req: Request, res: Response): string {
  const cookies = parseCookies(req);
  const existing = cookies[LEARNER_TOKEN_COOKIE];
  if (existing && existing.length >= 24) {
    return existing;
  }
  const fresh = generateSessionToken();
  setAuthCookie(req, res, LEARNER_TOKEN_COOKIE, fresh, 60 * 60 * 24 * 30);
  return fresh;
}

export function getExistingLearnerTokenHash(req: Request): string | null {
  const cookies = parseCookies(req);
  const existing = cookies[LEARNER_TOKEN_COOKIE];
  if (!existing || existing.length < 24) return null;
  return hashToken(existing);
}
