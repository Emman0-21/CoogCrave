import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { createLogger, REDACTED } from "@/server/logger";

function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, logger: createLogger({ level: "info" }, stream) };
}

describe("logger redaction (THREAT_MODEL T-27)", () => {
  it("redacts sensitive keys at the top level and nested up to three levels", () => {
    const { lines, logger } = captureLogs();
    logger.info(
      {
        password: "hunter2",
        user: { email: "student@cougarnet.uh.edu", name: "Alex" },
        req: { headers: { cookie: "session=abc", authorization: "Bearer xyz" } },
        order: { delivery: { deliveryInstructions: "Room 214, knock twice" } },
        body: { token: "verify-123" },
      },
      "event",
    );
    const line = lines[0]!;
    const serialized = JSON.stringify(line);
    for (const secret of [
      "hunter2",
      "student@cougarnet",
      "session=abc",
      "Bearer xyz",
      "Room 214",
      "verify-123",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(line.password).toBe(REDACTED);
    expect((line.user as Record<string, unknown>).name).toBe("Alex");
  });

  it("keeps non-sensitive context and emits structured JSON with level labels", () => {
    const { lines, logger } = captureLogs();
    logger.child({ requestId: "req_abc12345" }).warn({ route: "/api/health", status: 503 }, "degraded");
    expect(lines[0]).toMatchObject({
      level: "warn",
      service: "coogcrave",
      requestId: "req_abc12345",
      route: "/api/health",
      status: 503,
      msg: "degraded",
    });
    expect(typeof lines[0]!.time).toBe("string");
  });
});
