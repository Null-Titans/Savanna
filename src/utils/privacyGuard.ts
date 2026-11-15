export type SensitiveCategory = 'password' | 'pin' | 'token' | 'financial';

export interface SensitiveDetectionResult {
  isSensitive: boolean;
  category?: SensitiveCategory;
}

const PASSWORD_PATTERN =
  /\b(password|passphrase|passcode|pwd|secret\s*phrase)\b\s*(is|=|:)?\s*\S+|የይለፍ\s*ቃል/i;
const PIN_OTP_PATTERN =
  /\b(pin|otp|one[- ]time\s*(?:code|password)|cvv|cvc|security\s*code|atm\s*pin)\b\s*(is|=|:|#)?\s*\d{3,8}/i;
const TOKEN_PATTERN =
  /\b(bearer\s+[a-z0-9\-._~+/]+=*|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|AIza[0-9A-Za-z\-_]{20,}|sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*(?:is|=|:)\s*\S+)\b/i;
const FINANCIAL_PATTERN =
  /(?:\b(?:credit\s*card|debit\s*card|card\s*number|bank\s*account|account\s*number|iban|routing\s*number|swift)\b.{0,24}\d{4,}|\b(?:\d[ -]*?){13,19}\b)/i;

export function detectSensitiveInput(rawText: string): SensitiveDetectionResult {
  const text = rawText.trim();
  if (!text) return { isSensitive: false };

  if (TOKEN_PATTERN.test(text)) {
    return { isSensitive: true, category: 'token' };
  }
  if (PASSWORD_PATTERN.test(text)) {
    return { isSensitive: true, category: 'password' };
  }
  if (PIN_OTP_PATTERN.test(text)) {
    return { isSensitive: true, category: 'pin' };
  }
  if (FINANCIAL_PATTERN.test(text)) {
    return { isSensitive: true, category: 'financial' };
  }
  return { isSensitive: false };
}

export function getSensitiveRefusalMessage(lang: 'en' | 'am' | 'om'): string {
  if (lang === 'am') {
    return 'እባክዎ ይህን መረጃ ወዲያውኑ ያጽዱ። ለደህንነትዎ ሲባል የይለፍ ቃላትን፣ ፒን ቁጥሮችን፣ የደህንነት ቶከኖችን ወይም የባንክና የፋይናንስ መረጃዎችን አንቀበልም፣ አናስቀምጥም እንዲሁም አናስተናግድም። የላኩት መረጃ ችላ ተብሏል እና አልተቀመጠም።'; // needs native review
  }
  if (lang === 'om') {
    return "Maaloo odeeffannoo kana battalumatti haqaa. Nageenya keessaniif jecha jecha darbii (password), lakkoofsa PIN, tookanii nageenyaa, ykn odeeffannoo faayinaansii hin fudhannu, hin kuufnu, akkasumas hin hojjechiifnu. Ergaan sun tuffatameera; hin kuufamne."; // needs native review
  }
  return 'Please clear that sensitive text right away. For your safety and privacy, I cannot accept, store, display, or process passwords, PINs, security tokens, or financial details. Your entry was ignored and was not saved or sent.';
}

const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
]);

const SENSITIVE_NAME_REGEX =
  /(password|passcode|passphrase|pin|otp|token|secret|cvv|cvc|card|iban|account|routing)/i;

/**
 * Determines whether an input/textarea should be masked from AI scrapers or context extractors.
 */
export function isSensitiveFormElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.getAttribute('data-sensitive') === 'true' || el.getAttribute('data-ai-masked') === 'true') {
    return true;
  }
  if (el instanceof HTMLInputElement) {
    if (el.type.toLowerCase() === 'password') return true;
    const acTokens = (el.getAttribute('autocomplete') || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (acTokens.some((t) => SENSITIVE_AUTOCOMPLETE_TOKENS.has(t))) return true;
    const hint = `${el.name || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''}`;
    if (SENSITIVE_NAME_REGEX.test(hint)) return true;
  }
  return false;
}

/**
 * Applies client-side DOM masking attributes onto password and sensitive form controls
 * so chat context scrapers or DOM serializers cannot inspect raw secret values.
 */
export function maskSensitiveDomInputs(root?: ParentNode | null): number {
  if (typeof document === 'undefined') return 0;
  const targetRoot: ParentNode = root || document;
  const fields = targetRoot.querySelectorAll('input, textarea');
  let maskedCount = 0;

  fields.forEach((field) => {
    if (!isSensitiveFormElement(field)) return;
    field.setAttribute('data-ai-masked', 'true');
    field.setAttribute('data-sensitive', 'true');
    field.setAttribute('data-lpignore', 'true');
    if (field instanceof HTMLInputElement && field.type.toLowerCase() === 'password') {
      if (!field.getAttribute('autocomplete')) {
        field.setAttribute('autocomplete', 'new-password');
      }
    }
    maskedCount += 1;
  });

  return maskedCount;
}

/**
 * Extracts sanitized plain text from a DOM container for assistant context while
 * guaranteeing password/PIN/token/financial inputs remain masked and unreadable.
 */
export function extractSafeDomSummary(root?: ParentNode | null, maxLength = 800): string {
  if (typeof document === 'undefined') return '';
  const targetRoot: ParentNode = root || document.body;
  if (!targetRoot) return '';

  maskSensitiveDomInputs(targetRoot);

  const collected: string[] = [];
  const headings = targetRoot.querySelectorAll('h1, h2, [aria-current="page"]');
  headings.forEach((node) => {
    if (isSensitiveFormElement(node)) return;
    const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    if (detectSensitiveInput(raw).isSensitive) {
      collected.push('[MASKED_SENSITIVE_CONTENT]');
    } else {
      collected.push(raw);
    }
  });

  const combined = Array.from(new Set(collected)).join(' | ').trim();
  return combined.slice(0, maxLength);
}
