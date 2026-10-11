import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "vitest";

import type { StoredMail } from "@/server/mail/mailer";

export const APP_URL = "http://localhost:3000";

/** A minimal cookie jar: keeps name=value pairs from Set-Cookie and replays them as a Cookie header. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = /max-age=0/i.test(header) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  jar?: CookieJar;
  ip?: string;
  headers?: Record<string, string>;
}

/** Builds a same-origin browser-like request to the app. */
export function appRequest(pathname: string, options: RequestOptions = {}): Request {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = {
    "x-forwarded-for": options.ip ?? "198.51.100.10",
    ...(method !== "GET" ? { origin: APP_URL } : {}),
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.jar ? { cookie: options.jar.header() } : {}),
    ...options.headers,
  };
  return new Request(`${APP_URL}${pathname}`, {
    method,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
  });
}

export async function bodyOf<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const OUTBOX = path.resolve(process.env.MAIL_OUTBOX_DIR ?? ".data/test-mail");

/** All messages sent to `to`, oldest first. */
export async function mailTo(to: string): Promise<StoredMail[]> {
  let files: string[];
  try {
    files = (await readdir(OUTBOX)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const messages = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(path.join(OUTBOX, f), "utf8")) as StoredMail),
  );
  return messages
    .filter((m) => m.to === to.toLowerCase() || m.to === to)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function latestMailTo(to: string): Promise<StoredMail> {
  const all = await mailTo(to);
  expect(all.length, `expected an email to ${to}`).toBeGreaterThan(0);
  return all.at(-1)!;
}

/** The first URL in an email body. */
export function linkIn(mail: StoredMail): string {
  const match = mail.text.match(/https?:\/\/\S+/);
  expect(match, `no link in email "${mail.subject}"`).not.toBeNull();
  return match![0];
}

/** Turns an absolute app URL into a path + query for appRequest. */
export function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

let emailCounter = 0;
export function uniqueEmail(prefix = "student"): string {
  return `${prefix}.${Date.now().toString(36)}${(emailCounter++).toString(36)}@cougarnet.uh.edu`;
}

/** Passes the strength policy and contains nothing personal. */
export const STRONG_PASSWORD = "violet-harbor-cactus-91";
export const OTHER_STRONG_PASSWORD = "quiet-meadow-lantern-58";
