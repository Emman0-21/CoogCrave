import "server-only";

import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";

/**
 * Password rules (PRD AUTH-1, NIST SP 800-63B style): length 10–128 and a strength estimate that rejects
 * common, breached-style, and personal passwords. No arbitrary composition rules ("one symbol").
 *
 * zxcvbn scores 0–4 by estimated guesses; 3 means "safely unguessable" (roughly 10^10 guesses).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const MIN_STRENGTH_SCORE = 3;

let estimator: ZxcvbnFactory | undefined;

function getEstimator(): ZxcvbnFactory {
  // Built lazily: the dictionaries are large and only needed on sign-up and password reset.
  estimator ??= new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...en.dictionary },
    graphs: common.adjacencyGraphs,
    translations: en.translations,
  });
  return estimator;
}

export type PasswordCheck = { ok: true } | { ok: false; message: string };

/**
 * True when the password's letters, ignoring digits, symbols, and case, are nothing but the person's own
 * name or email words in any order ("Alex.Rivera.07", "rivera_alex_2026"). zxcvbn scores the pieces
 * separately and can rate these as strong, but anyone who knows the person's name can guess them.
 */
export function isBuiltFromPersonalWords(password: string, userInputs: string[]): boolean {
  const letters = password.toLowerCase().replace(/[^a-z]/g, "");
  const words = [
    ...new Set(
      userInputs.flatMap((input) => input.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 2),
    ),
  ];
  if (letters.length === 0 || words.length === 0) return false;

  // Word-break check: can `letters` be split entirely into personal words?
  const reachable = new Array<boolean>(letters.length + 1).fill(false);
  reachable[0] = true;
  for (let end = 1; end <= letters.length; end++) {
    reachable[end] = words.some(
      (w) => end >= w.length && reachable[end - w.length] && letters.endsWith(w, end),
    );
  }
  return reachable[letters.length]!;
}

/**
 * @param userInputs personal words to penalize (name, email local part), so "alexrivera2026" fails.
 */
export function checkPassword(password: string, userInputs: string[] = []): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Use at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  if (isBuiltFromPersonalWords(password, userInputs)) {
    return { ok: false, message: "Don't build your password from your name or email address." };
  }

  // Each personal input as words, joined ("alexrivera"), and whole, so name-based passwords fail.
  const inputs = [
    ...userInputs.flatMap((input) => {
      const lower = input.toLowerCase();
      const words = lower.split(/[\s@._-]+/);
      return [lower, words.join(""), ...words];
    }),
    "coogcrave",
    "cougars",
  ].filter((word) => word.length >= 3);
  const result = getEstimator().check(password, inputs);
  if (result.score >= MIN_STRENGTH_SCORE) return { ok: true };

  const hint = result.feedback.warning ?? result.feedback.suggestions[0];
  const base = "This password is too easy to guess. A few unrelated words together work well.";
  return { ok: false, message: hint ? `${base} (${hint.replace(/\.$/, "")}.)` : base };
}
