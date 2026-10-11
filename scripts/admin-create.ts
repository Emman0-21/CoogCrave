/**
 * pnpm admin:create --email ada@uh.edu --name "Ada Lovelace"
 *
 * Creates a verified administrator, or promotes an existing account. This is the only way to grant the
 * admin role; no API can. The password is read from ADMIN_PASSWORD, or asked for without echoing.
 * Every run is recorded in the audit log.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { runCli } from "./cli";

import { createOrPromoteAdmin } from "@/server/accounts/accounts";
import { closeDb, getDb } from "@/server/db/client";

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("No terminal to ask for a password. Set ADMIN_PASSWORD instead.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Suppress echo while the password is typed.
  const writable = rl as unknown as { _writeToOutput: (text: string) => void };
  let muted = false;
  writable._writeToOutput = (text) => {
    if (!muted) process.stdout.write(text);
  };
  process.stdout.write(question);
  muted = true;
  const answer = await new Promise<string>((resolve) => rl.question("", resolve));
  muted = false;
  process.stdout.write("\n");
  rl.close();
  return answer;
}

await runCli(async () => {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
    strict: true,
  });
  if (!values.email || !values.name) {
    throw new Error('Usage: pnpm admin:create --email <email> --name "<full name>"');
  }
  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Password for the new admin: "));
  const result = await createOrPromoteAdmin(getDb(), { email: values.email, name: values.name, password });
  console.log(
    result.outcome === "created"
      ? `Created admin ${values.email.toLowerCase()} (${result.userId}).`
      : `Promoted existing account ${values.email.toLowerCase()} to admin; its password is unchanged.`,
  );
}, closeDb);
