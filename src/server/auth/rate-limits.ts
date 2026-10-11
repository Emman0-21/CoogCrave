import type { RateLimitRule } from "@/server/rate-limit/rate-limiter";

/**
 * Rate limits for /api/auth (THREAT_MODEL T-14, API_SPEC §1). Per-IP limits slow down a single source;
 * per-email limits protect one account from a distributed attack and stop email flooding.
 *
 * Per-IP numbers are generous on purpose: many students share a few campus Wi-Fi NAT addresses.
 * Limits throttle; they never lock an account.
 */
export const AUTH_RATE_RULES = {
  signInIp: { name: "auth.sign_in.ip", limit: 30, windowSeconds: 60 },
  signInEmail: { name: "auth.sign_in.email", limit: 10, windowSeconds: 15 * 60 },
  signUpIp: { name: "auth.sign_up.ip", limit: 20, windowSeconds: 60 * 60 },
  // Sign-up to an existing address emails its owner; this caps that mail, whether or not the account exists.
  signUpEmail: { name: "auth.sign_up.email", limit: 5, windowSeconds: 60 * 60 },
  resetRequestIp: { name: "auth.reset_request.ip", limit: 20, windowSeconds: 60 * 60 },
  resetRequestEmail: { name: "auth.reset_request.email", limit: 3, windowSeconds: 60 * 60 },
  verifyResendIp: { name: "auth.verify_resend.ip", limit: 20, windowSeconds: 60 * 60 },
  verifyResendEmail: { name: "auth.verify_resend.email", limit: 3, windowSeconds: 60 * 60 },
  resetPasswordIp: { name: "auth.reset_password.ip", limit: 10, windowSeconds: 15 * 60 },
  changePasswordIp: { name: "auth.change_password.ip", limit: 10, windowSeconds: 15 * 60 },
  otherIp: { name: "auth.other.ip", limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export interface RateCheck {
  rule: RateLimitRule;
  subject: string;
}

/**
 * Which limits apply to a request. `authPath` is the path below /api/auth; `body` is the parsed JSON body
 * (or {}), used only to read the email for per-email limits.
 */
export function authRateChecks(method: string, authPath: string, body: unknown, ip: string): RateCheck[] {
  const email =
    body && typeof body === "object" && typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email
      : null;
  const byEmail = (rule: RateLimitRule): RateCheck[] => (email ? [{ rule, subject: email }] : []);
  const byIp = (rule: RateLimitRule): RateCheck => ({ rule, subject: ip });

  if (method === "POST") {
    switch (authPath) {
      case "/sign-in/email":
        return [byIp(AUTH_RATE_RULES.signInIp), ...byEmail(AUTH_RATE_RULES.signInEmail)];
      case "/sign-up/email":
        return [byIp(AUTH_RATE_RULES.signUpIp), ...byEmail(AUTH_RATE_RULES.signUpEmail)];
      case "/request-password-reset":
        return [byIp(AUTH_RATE_RULES.resetRequestIp), ...byEmail(AUTH_RATE_RULES.resetRequestEmail)];
      case "/send-verification-email":
        return [byIp(AUTH_RATE_RULES.verifyResendIp), ...byEmail(AUTH_RATE_RULES.verifyResendEmail)];
      case "/reset-password":
        return [byIp(AUTH_RATE_RULES.resetPasswordIp)];
      case "/change-password":
        return [byIp(AUTH_RATE_RULES.changePasswordIp)];
    }
  }
  return [byIp(AUTH_RATE_RULES.otherIp)];
}

/** Path for logs: one-time tokens in the path are replaced, so they never reach log storage. */
export function loggablePath(pathname: string): string {
  return pathname.replace(/(\/reset-password\/)[^/?#]+/, "$1:token");
}
