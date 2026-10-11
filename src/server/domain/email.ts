/** Lowercased, trimmed email. Better Auth stores emails the same way. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The part after the last "@", lowercased; null when there isn't one. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/**
 * True when the email's domain is an allowed domain or a subdomain of one (PRD AUTH-2).
 * "uh.edu" allows "cougarnet.uh.edu" but never look-alikes such as "evil-uh.edu" or "uh.edu.example".
 * An allowed domain proves control of an inbox, not current enrollment.
 */
export function isAllowedEmailDomain(email: string, allowedDomains: readonly string[]): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((allowed) => {
    const a = allowed.toLowerCase();
    return domain === a || domain.endsWith(`.${a}`);
  });
}
