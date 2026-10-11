"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";

import { requestJson, retryAfterText } from "@/client/api";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { type SignInForm as SignInValues, signInFormSchema } from "@/shared/schemas/auth";

type Outcome = { tone: "error" | "info"; message: ReactNode } | null;

/** `next` must already be a validated same-site path (the page runs it through safeNextPath). */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setOutcome(null);
    const result = await requestJson("/api/auth/sign-in/email", {
      body: { email: values.email, password: values.password },
    });
    if (result.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    switch (result.error.code) {
      case "INVALID_EMAIL_OR_PASSWORD":
        setOutcome({ tone: "error", message: "That email and password don't match an account." });
        break;
      case "EMAIL_NOT_VERIFIED":
        setOutcome({
          tone: "info",
          message: "Confirm your email first. We just sent a new link to your inbox.",
        });
        break;
      case "ACCOUNT_SUSPENDED":
        setOutcome({
          tone: "error",
          message: "This account is suspended. Contact the CoogCrave team for help.",
        });
        break;
      case "RATE_LIMITED":
        setOutcome({
          tone: "error",
          message: (
            <>
              Too many sign-in attempts. {retryAfterText(result.error.retryAfterSeconds)}{" "}
              <Link href="/forgot-password" className="font-bold underline underline-offset-4">
                Reset your password
              </Link>{" "}
              if you&apos;ve forgotten it.
            </>
          ),
        });
        break;
      default:
        setOutcome({ tone: "error", message: result.error.message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {outcome && <Notice tone={outcome.tone}>{outcome.message}</Notice>}
      <TextField
        id="email"
        label="UH email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <PasswordField
        id="password"
        label="Password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="min-w-36">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/forgot-password" className="text-ink-muted underline underline-offset-4 hover:text-ink">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
