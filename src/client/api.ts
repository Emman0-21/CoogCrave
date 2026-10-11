/**
 * Browser-side JSON client for /api/auth and /api/v1. Normalizes the two error shapes the app returns
 * (our envelope { error: { code, message } } and Better Auth's { code, message }) into one.
 */

export interface ApiError {
  code: string;
  message: string;
  /** Seconds to wait, from Retry-After on 429 responses. */
  retryAfterSeconds?: number;
}

export type ApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export const NETWORK_ERROR: ApiError = {
  code: "NETWORK_ERROR",
  message: "Couldn't reach CoogCrave. Check your connection and try again.",
};

export async function requestJson<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (response.ok) return { ok: true, status: response.status, data: payload as T };

  const raw = (payload ?? {}) as { error?: Partial<ApiError>; code?: string; message?: string };
  const source = raw.error ?? raw;
  const retryAfter = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    status: response.status,
    error: {
      code: source.code ?? `HTTP_${response.status}`,
      message: source.message ?? "Something went wrong. Try again in a moment.",
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    },
  };
}

/** "Try again in 3 minutes." from a Retry-After value. */
export function retryAfterText(seconds: number | undefined): string {
  if (!seconds) return "Wait a moment and try again.";
  if (seconds < 90) return `Try again in ${seconds} seconds.`;
  return `Try again in ${Math.ceil(seconds / 60)} minutes.`;
}
