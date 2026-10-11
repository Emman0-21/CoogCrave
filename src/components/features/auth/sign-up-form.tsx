"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestJson, retryAfterText } from "@/client/api";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { type SignUpForm as SignUpValues, signUpFormSchema } from "@/shared/schemas/auth";

const FIELD_ERRORS: Record<string, keyof SignUpValues> = {
  EMAIL_DOMAIN_NOT_ALLOWED: "email",
  INVALID_EMAIL: "email",
  PASSWORD_TOO_WEAK: "password",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
  INVALID_NAME: "name",
};

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await requestJson("/api/auth/sign-up/email", {
      body: { ...values, callbackURL: "/sign-in?verified=1" },
    });
    if (result.ok) {
      // The same answer comes back whether or not the email already had an account.
      router.push(`/check-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`);
      return;
    }
    const field = FIELD_ERRORS[result.error.code];
    if (field) setError(field, { message: result.error.message }, { shouldFocus: true });
    else if (result.error.code === "RATE_LIMITED")
      setFormError(`Too many sign-ups from this network. ${retryAfterText(result.error.retryAfterSeconds)}`);
    else setFormError(result.error.message);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Notice tone="error">{formError}</Notice>}
      <TextField
        id="name"
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />
      <TextField
        id="email"
        label="UH email"
        type="email"
        autoComplete="email"
        inputMode="email"
        hint="Your @uh.edu or @cougarnet.uh.edu address."
        error={errors.email?.message}
        {...register("email")}
      />
      <PasswordField
        id="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 10 characters. A few unrelated words together work well."
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
