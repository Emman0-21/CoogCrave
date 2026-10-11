"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { LocationResponse, MeResponse } from "@/shared/schemas/profile";

const formSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(60, "Use at most 60 characters.")
    .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), "Use letters, numbers, and punctuation only."),
  defaultLocationId: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

export function ProfileForm({
  displayName,
  defaultLocationId,
  locations,
}: {
  displayName: string | null;
  defaultLocationId: string | null;
  locations: LocationResponse[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: displayName ?? "", defaultLocationId: defaultLocationId ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null);
    const result = await requestJson<MeResponse>("/api/v1/me", {
      method: "PATCH",
      body: { displayName: values.displayName || null, defaultLocationId: values.defaultLocationId || null },
    });
    if (result.ok) {
      const saved = result.data.profile;
      reset({ displayName: saved.displayName ?? "", defaultLocationId: saved.defaultLocationId ?? "" });
      setStatus({ tone: "success", text: "Changes saved." });
      router.refresh();
      return;
    }
    if (result.error.code === "INVALID_LOCATION") {
      setError("defaultLocationId", { message: result.error.message }, { shouldFocus: true });
    } else {
      setStatus({ tone: "error", text: result.error.message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <TextField
        id="displayName"
        label="Name couriers see"
        autoComplete="nickname"
        hint="Leave blank to use your first name."
        error={errors.displayName?.message}
        {...register("displayName")}
      />
      <SelectField
        id="defaultLocationId"
        label="Usual drop-off building"
        hint="We'll pick it for you at checkout. You can change it on any order."
        error={errors.defaultLocationId?.message}
        {...register("defaultLocationId")}
      >
        <option value="">No usual building</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </SelectField>
      <Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
