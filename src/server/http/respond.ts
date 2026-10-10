/** JSON response with the defaults every API response needs: correct content type, never cached by intermediaries. */
export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}
