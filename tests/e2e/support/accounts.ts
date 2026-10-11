import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { type APIRequestContext, expect, type Page } from "@playwright/test";

export const DEMO = {
  customer: "customer@demo.coogcrave.test",
  courier: "courier@demo.coogcrave.test",
  admin: "admin@demo.coogcrave.test",
  password: process.env.SEED_DEMO_PASSWORD ?? "",
};

/** Passes the strength policy and contains nothing personal. */
export const NEW_PASSWORD = "violet-harbor-cactus-91";

let counter = 0;
export function uniqueStudentEmail(label: string): string {
  return `e2e.${label}.${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}@cougarnet.uh.edu`;
}

interface StoredMail {
  id: string;
  to: string;
  subject: string;
  text: string;
}

/**
 * Waits for the newest email to `to` with the given subject in the app's file outbox
 * (the server and the tests run on the same machine) and returns the first link in it.
 */
export async function linkFromLatestEmail(to: string, subject: string): Promise<string> {
  const outbox = path.resolve(process.env.MAIL_OUTBOX_DIR ?? ".data/mail");
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(outbox).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
        const mails = await Promise.all(
          files.map(async (f) => JSON.parse(await readFile(path.join(outbox, f), "utf8")) as StoredMail),
        );
        const match = mails
          .filter((m) => m.to === to.toLowerCase() && m.subject === subject)
          .sort((a, b) => a.id.localeCompare(b.id))
          .at(-1);
        link = match?.text.match(/https?:\/\/\S+/)?.[0];
        return link;
      },
      { message: `waiting for "${subject}" email to ${to}`, timeout: 10_000 },
    )
    .toBeTruthy();
  return link!;
}

export async function signInThroughForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("UH email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A new, confirmed student account made through the real API and emailed link (not through the UI). */
export async function createConfirmedStudent(
  request: APIRequestContext,
  baseURL: string,
  label: string,
): Promise<string> {
  const email = uniqueStudentEmail(label);
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { name: "Riley Nguyen", email, password: NEW_PASSWORD, callbackURL: "/sign-in?verified=1" },
    headers: { origin: baseURL },
  });
  expect(signUp.ok()).toBe(true);
  const verify = await request.get(await linkFromLatestEmail(email, "Verify your CoogCrave email"));
  expect(verify.ok()).toBe(true);
  return email;
}
