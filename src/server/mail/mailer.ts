import "server-only";

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Plain-text email. Text only on purpose: nothing user-supplied can be rendered as HTML. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Port for sending email (docs/ARCHITECTURE.md §9). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface StoredMail extends MailMessage {
  id: string;
  from: string;
  createdAt: string;
}

/**
 * Development/test transport: each message becomes a JSON file in the outbox directory, where a
 * developer (or an automated test) can open the verification or reset link. Nothing leaves the machine.
 * Files are written to a temp name and renamed, so a reader never sees a half-written message.
 */
export class FileOutboxMailer implements Mailer {
  constructor(
    private readonly outboxDir: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.outboxDir, { recursive: true });
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const stored: StoredMail = { id, from: this.from, createdAt: new Date().toISOString(), ...message };
    const finalPath = path.join(this.outboxDir, `${id}.json`);
    const tempPath = `${finalPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, finalPath);
  }
}
