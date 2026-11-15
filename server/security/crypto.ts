import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, hexDigest] = parts;
  if (!salt || !hexDigest) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hexDigest, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function isStrongAdminPassword(pw: string): boolean {
  return (
    pw.length >= 10 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function maskIdReference(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digest = crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 10);
  return `masked:${digest}`;
}

export interface EmployerSafeguardViolation {
  field: string;
  matchedTerm: string;
  guidance: string;
}

const DISALLOWED_PATTERNS: Array<{ regex: RegExp; guidance: string }> = [
  {
    regex: /\b(medical\s+(certificate|proof|report|record|clearance)|doctor['’]?s?\s+note|physician\s+note|hospital\s+letter)\b/i,
    guidance: 'Do not request medical certificates, doctor notes, or clinical proof.',
  },
  {
    regex: /\b(disability\s+(certificate|proof|card|id|diagnosis)|proof\s+of\s+disability|impairment\s+percentage|iq\s+test|mental\s+health\s+history)\b/i,
    guidance: 'Do not ask candidates for disability proof, diagnoses, or impairment scores.',
  },
  {
    regex: /\b(diagnosis|diagnoses|diagnosed|chronic\s+illness|medication\s+list)\b/i,
    guidance: 'Focus on workplace adjustments you offer instead of asking for diagnoses.',
  },
  {
    regex: /\b(must\s+be\s+able-?bodied|physically\s+fit\s+only|no\s+disabilities\s+allowed|normal\s+hearing\s+required)\b/i,
    guidance: 'Describe concrete job tasks rather than exclusionary physical requirements.',
  },
];

export function checkServerEmployerSafeguards(fields: Record<string, string | undefined>): EmployerSafeguardViolation[] {
  const violations: EmployerSafeguardViolation[] = [];
  for (const [field, raw] of Object.entries(fields)) {
    const value = (raw || '').trim();
    if (!value) continue;
    for (const rule of DISALLOWED_PATTERNS) {
      const m = value.match(rule.regex);
      if (m) {
        violations.push({
          field,
          matchedTerm: m[0],
          guidance: rule.guidance,
        });
      }
    }
  }
  return violations;
}

const SENSITIVE_TEXT_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:AIza[0-9A-Za-z\-_]{30,}|sk-[A-Za-z0-9]{20,})\b/,
  /\b(?:password|passcode|otp\s+code|pin\s+number)\s*[:=]\s*\S+/i,
];

export function containsSensitiveSecret(text: string): boolean {
  return SENSITIVE_TEXT_PATTERNS.some((re) => re.test(text));
}
