"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestJson, retryAfterText } from "@/client/api";
import { Button, buttonClasses } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  type ForgotPasswordForm as ForgotValues,
  forgotPasswordFormSchema,
  type ResetPasswordForm as ResetValues,
  resetPasswordFormSchema,
} from "@/shared/schemas/auth";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotPasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    const result = await requestJson("/api/auth/request-password-reset", {
      body: { email, redirectTo: "/reset-password" },
    });
    if (result.ok) setSentTo(email.trim().toLowerCase());
    else if (result.error.code === "RATE_LIMITED")
      setFormError(
        `Too many reset requests for this address. ${retryAfterText(result.error.retryAfterSeconds)}`,
      );
    else setFormError(result.error.message);
  });

  if (sentTo) {
    return (
      <Notice tone="success">
        <p>
          If there&apos;s an account for <strong className="break-all">{sentTo}</strong>, a reset link is on
          its way. It works once, for 1 hour.
        </p>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Notice tone="error">{formError}</Notice>}
      <TextField
        id="email"
        label="UH email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    const result = await requestJson("/api/auth/reset-password", { body: { token, newPassword: password } });
    if (result.ok) {
      setDone(true);
      return;
    }
    if (result.error.code.startsWith("PASSWORD_"))
      setError("password", { message: result.error.message }, { shouldFocus: true });
    else if (result.error.code === "INVALID_TOKEN")
      setFormError("This reset link has expired or was already used. Request a new one.");
    else setFormError(result.error.message);
  });

  if (done) {
    return (
      <div className="space-y-5">
        <Notice tone="success">Password saved. You&apos;ve been signed out everywhere else.</Notice>
        <Link href="/sign-in" className={buttonClasses("primary", "w-full")}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <Notice tone="error">
          {formError}{" "}
          <Link href="/forgot-password" className="font-bold underline underline-offset-4">
            Request a new link
          </Link>
        </Notice>
      )}
      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters. A few unrelated words together work well."
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
