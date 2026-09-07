import test from "node:test";
import assert from "node:assert/strict";
import { databaseUrlFromEnv, bootstrap } from "../scripts/bootstrap.mjs";

test("Docker DB credentials are URL-encoded; existing DB URL remains unchanged", () => {
  const password = "local:p@ss/word#?";
  const url = new URL(databaseUrlFromEnv({ DATABASE_HOST: "db", POSTGRES_USER: "portal", POSTGRES_PASSWORD: password, POSTGRES_DB: "employee_portal" }));
  assert.equal(url.hostname, "db");
  assert.equal(decodeURIComponent(url.password), password);
  assert.equal(url.pathname, "/employee_portal");
  const existing = "postgresql://user:pass@existing:5432/app?schema=review";
  assert.equal(databaseUrlFromEnv({ DATABASE_URL: existing }), existing);
  assert.throws(() => databaseUrlFromEnv({}), /DATABASE_URL/);
});

test("startup applies migrations and seed before starting the application", async () => {
  const calls: string[][] = [];
  await bootstrap({ start: true, run: async (_command: string, args: string[]) => { calls.push(args); } });
  assert.ok(calls[0].includes("generate"));
  assert.deepEqual(calls[1].slice(-2), ["migrate", "deploy"]);
  assert.ok(calls[2].includes("prisma/seed.ts"));
  assert.ok(calls[3].includes("start"));
});

test("migration failure stops setup before seed and app startup", async () => {
  const calls: string[][] = [];
  await assert.rejects(bootstrap({ start: true, run: async (_command: string, args: string[]) => {
    calls.push(args);
    if (args.includes("migrate")) throw new Error("migration failed");
  } }), /migration failed/);
  assert.equal(calls.length, 2);
});

test("seed failure prevents starting an application without initial accounts", async () => {
  const calls: string[][] = [];
  await assert.rejects(bootstrap({ start: true, run: async (_command: string, args: string[]) => {
    calls.push(args);
    if (args.includes("prisma/seed.ts")) throw new Error("seed failed");
  } }), /seed failed/);
  assert.equal(calls.length, 3);
});
