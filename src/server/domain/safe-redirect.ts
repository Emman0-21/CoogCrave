/**
 * Returns `candidate` only if it is a same-site relative path, otherwise `fallback`
 * (docs/THREAT_MODEL.md T-18, open redirect). Used for ?next= after sign-in.
 *
 * Rejects absolute URLs ("https://evil.example"), protocol-relative ("//evil.example"),
 * backslash tricks ("/\\evil.example", which browsers treat as "//"), and control characters.
 */
export function safeNextPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate || candidate.length > 512) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  try {
    // Resolve against a dummy origin: anything that escapes it isn't a plain path.
    const url = new URL(candidate, "https://coogcrave.invalid");
    if (url.origin !== "https://coogcrave.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
