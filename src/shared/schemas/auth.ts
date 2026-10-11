import { z } from "zod";

/**
 * Client-side shapes for the auth forms. They give instant feedback only; the server re-validates
 * everything, including password strength and the email-domain allowlist.
 */

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .pipe(z.email("Enter a valid email address."));

export const signUpFormSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters."),
  email,
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters."),
});
export type SignUpForm = z.infer<typeof signUpFormSchema>;

export const signInFormSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});
export type SignInForm = z.infer<typeof signInFormSchema>;

export const forgotPasswordFormSchema = z.object({ email });
export type ForgotPasswordForm = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters."),
});
export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;
