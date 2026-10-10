import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openPool, resetDatabase } from "../support/db";

/**
 * Least-privilege database roles (ARCHITECTURE §12, THREAT_MODEL T-28): the running app can read and
 * write rows but can never change the schema. Table-level grants (append-only audit_events) are
 * verified when those tables exist in Phase 3.
 */
describe("database roles", () => {
  let app: Pool;
  let migrator: Pool;

  beforeAll(async () => {
    app = openPool("app");
    migrator = openPool("migrator");
    await migrator.query("drop table if exists role_probe");
  });

  afterAll(async () => {
    await migrator.query("drop table if exists role_probe");
    await Promise.all([app.end(), migrator.end()]);
  });

  it("connects the app as the app role, not a superuser", async () => {
    const { rows } = await app.query<{ user: string; superuser: string }>(
      "select current_user as user, current_setting('is_superuser') as superuser",
    );
    expect(rows[0]).toEqual({ user: "coogcrave_app", superuser: "off" });
  });

  it("forbids the app role from creating tables", async () => {
    await expect(app.query("create table role_probe (id int)")).rejects.toThrow(/permission denied/);
  });

  it("lets the migrator create tables that the app can then use for DML but not DDL", async () => {
    await migrator.query("create table role_probe (id int primary key, note text)");

    await app.query("insert into role_probe (id, note) values (1, 'a')");
    await app.query("update role_probe set note = 'b' where id = 1");
    const { rows } = await app.query<{ note: string }>("select note from role_probe where id = 1");
    expect(rows[0]?.note).toBe("b");
    await app.query("delete from role_probe where id = 1");

    await expect(app.query("alter table role_probe add column extra int")).rejects.toThrow(/must be owner/);
    await expect(app.query("drop table role_probe")).rejects.toThrow(/must be owner/);
    await expect(app.query("truncate role_probe")).rejects.toThrow(/permission denied/);
  });

  it("resetDatabase empties application tables", async () => {
    await migrator.query("insert into role_probe (id, note) values (2, 'x') on conflict do nothing");
    await resetDatabase();
    const { rows } = await migrator.query<{ count: string }>("select count(*) from role_probe");
    expect(rows[0]?.count).toBe("0");
  });
});
