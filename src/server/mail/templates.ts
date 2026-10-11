import type { MailMessage } from "./mailer";

/**
 * Account emails. Plain text, short, and explicit about what to do if the recipient didn't ask.
 * Names are interpolated as text only; mail clients don't render plain text as markup.
 */

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : "there";
}

export function verificationEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: "Verify your CoogCrave email",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "Confirm this is your email address to finish creating your CoogCrave account:",
      url,
      "",
      "The link works for 24 hours. If you didn't sign up, you can ignore this email.",
      "",
      "CoogCrave is an independent student project, not affiliated with the University of Houston.",
    ].join("\n"),
  };
}

export function passwordResetEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: "Reset your CoogCrave password",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "Someone asked to reset the password for this CoogCrave account. To choose a new password, open:",
      url,
      "",
      "The link works once, for 1 hour. If you didn't ask, ignore this email; your password won't change.",
    ].join("\n"),
  };
}

/**
 * Sent when someone tries to register an email that already has an account. Sign-up itself returns
 * the same response either way (no account enumeration); the real owner learns about it here.
 */
export function existingAccountEmail(
  to: string,
  name: string,
  signInUrl: string,
  resetUrl: string,
): MailMessage {
  return {
    to,
    subject: "Someone tried to sign up with your email",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "Someone just tried to create a CoogCrave account with this email address, but you already have one.",
      `If it was you, sign in here: ${signInUrl}`,
      `Forgot your password? Reset it here: ${resetUrl}`,
      "",
      "If it wasn't you, no action is needed. Your account hasn't changed.",
    ].join("\n"),
  };
}

export function passwordChangedEmail(to: string, name: string, resetUrl: string): MailMessage {
  return {
    to,
    subject: "Your CoogCrave password was changed",
    text: [
      `Hi ${firstName(name)},`,
      "",
      "The password for your CoogCrave account was just changed, and you've been signed out on other devices.",
      `If this wasn't you, reset your password right away: ${resetUrl}`,
    ].join("\n"),
  };
}
