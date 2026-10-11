import { createHash } from "node:crypto";

/**
 * Deterministic UUIDs for seed rows (RFC 4122 version 5 format, SHA-1 of a namespace + key).
 * The same key always yields the same id, so re-running a seed updates rows instead of duplicating them.
 */
const NAMESPACE = "coogcrave-seed-v1";

export function seedId(key: string): string {
  const bytes = createHash("sha1").update(`${NAMESPACE}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
