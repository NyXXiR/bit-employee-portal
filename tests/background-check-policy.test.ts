import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/server/db";
import { refreshBackgroundCheck, requestBackgroundCheck, listBackgroundChecks } from "../src/server/background-checks";
import { AppError } from "../src/server/errors";
import { env } from "../src/server/env";

test("refresh policy persists across callers without storing result details", async (t) => {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const employee = await db.employee.create({ data: { familyName: "정책", givenName: "검증", dateOfBirth: new Date("1990-01-01") } });
  const createdAt = new Date(Date.now() - 10_000);
  const check = await db.backgroundCheck.create({ data: {
    employeeRecordId: employee.id, requestedByUserId: admin.id, idempotencyKey: crypto.randomUUID(),
    externalCheckId: `CHK-${crypto.randomUUID()}`, status: "PENDING", activeSlot: "ACTIVE",
    familyNameSnapshot: employee.familyName, givenNameSnapshot: employee.givenName,
    dateOfBirthSnapshot: employee.dateOfBirth!, createdAt, externalCreatedAt: createdAt,
  } });
  const response = (status = "pending") => Response.json({ checkId: check.externalCheckId,
    employeeId: employee.employeeId, status, createdAt: createdAt.toISOString(), criminalRecord: false });
  const makeDue = () => db.backgroundCheck.update({ where: { id: check.id }, data: { nextPollAt: new Date(0) } });
  let calls = 0;
  const mockedFetch = t.mock.method(globalThis, "fetch", async () => { calls++; return response(); });
  try {
    await t.test("simultaneous callers share one external GET", async (subtest) => {
      // DB 응답이 느려도 2초 대기 경계를 넘지 않도록 정책 시각을 고정한다.
      const now = Date.now();
      subtest.mock.method(Date, "now", () => now);
      const results = await Promise.allSettled([refreshBackgroundCheck(check.id), refreshBackgroundCheck(check.id)]);
      assert.equal(calls, 1);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      await assert.rejects(refreshBackgroundCheck(check.id), (e: AppError) => e.code === "CHECK_POLL_WAIT" && e.retryAfter! >= 1);
      assert.equal(calls, 1);
    });
    await t.test("body advice remains in DB and blocks manual and automatic calls", async () => {
      await makeDue();
      mockedFetch.mock.mockImplementation(async () => { calls++; return Response.json({ retryAfter: 30 }, { status: 503 }); });
      const before = Date.now();
      await assert.rejects(refreshBackgroundCheck(check.id), (e: AppError) => e.retryAfter === 30);
      const stored = await db.backgroundCheck.findUniqueOrThrow({ where: { id: check.id } });
      assert.ok(stored.nextPollAt!.getTime() >= before + 30_000);
      assert.equal(stored.status, "PENDING");
      const count = calls;
      await assert.rejects(refreshBackgroundCheck(check.id));
      await assert.rejects(refreshBackgroundCheck(check.id, "automatic"));
      assert.equal(calls, count);
    });
    await t.test("malformed 200 JSON stops automatic polling even after reload", async () => {
      await makeDue();
      mockedFetch.mock.mockImplementation(async () => { calls++; return new Response("{broken", { status: 200 }); });
      await assert.rejects(refreshBackgroundCheck(check.id), (e: AppError) => e.statusCode === 502);
      await makeDue();
      const count = calls;
      await assert.rejects(refreshBackgroundCheck(check.id, "automatic"), (e: AppError) => e.statusCode === 502);
      assert.equal(calls, count);
      const listed = await listBackgroundChecks(employee.employeeId);
      assert.equal(listed.checks[0].pollingStoppedStatus, 502);
      assert.equal(listed.checks[0].status, "PENDING");
    });
    await t.test("manual retry can recover a contract stop; header advice has priority", async () => {
      await makeDue();
      mockedFetch.mock.mockImplementation(async () => {
        calls++; return Response.json({ retryAfter: 30 }, { status: 503, headers: { "Retry-After": "40" } });
      });
      await assert.rejects(refreshBackgroundCheck(check.id), (e: AppError) => e.retryAfter === 40);
      await makeDue();
      mockedFetch.mock.mockImplementation(async () => { calls++; return response(); });
      const result = await refreshBackgroundCheck(check.id, "manual");
      assert.equal(result.pollingStoppedStatus, null);
    });
    await t.test("404 and mismatched result IDs stop lookup without declaring the check failed", async () => {
      for (const mismatch of [false, true]) {
        await makeDue();
        mockedFetch.mock.mockImplementation(async () => {
          calls++;
          return mismatch ? Response.json({ checkId: "CHK-WRONG", employeeId: employee.employeeId,
            status: "clear", createdAt: createdAt.toISOString() }) : Response.json({}, { status: 404 });
        });
        await assert.rejects(refreshBackgroundCheck(check.id), (e: AppError) => e.statusCode === (mismatch ? 502 : 404));
        const stored = await db.backgroundCheck.findUniqueOrThrow({ where: { id: check.id } });
        assert.equal(stored.status, "PENDING");
        assert.equal(stored.activeSlot, "ACTIVE");
      }
    });
    await t.test("after 180s manual same-ID lookup can complete; profile differences are exposed", async () => {
      await db.backgroundCheck.update({ where: { id: check.id }, data: {
        externalCreatedAt: new Date(Date.now() - 181_000), nextPollAt: new Date(0), pollingStoppedStatus: null,
      } });
      const count = calls;
      await assert.rejects(refreshBackgroundCheck(check.id, "automatic"), (e: AppError) => e.code === "AUTOMATIC_POLLING_ENDED");
      assert.equal(calls, count);
      await db.employee.update({ where: { id: employee.id }, data: { givenName: "변경" } });
      mockedFetch.mock.mockImplementation(async (url) => {
        calls++;
        assert.ok(String(url).endsWith(check.externalCheckId!));
        return response("clear");
      });
      const result = await refreshBackgroundCheck(check.id, "manual");
      assert.equal(result.status, "CLEAR");
      assert.equal(result.result?.criminalRecord, false);
      assert.deepEqual(result.profileComparison.changedFields, ["givenName"]);
      const stored = await db.backgroundCheck.findUniqueOrThrow({ where: { id: check.id } });
      assert.equal(stored.activeSlot, null);
      assert.equal("criminalRecord" in stored, false);
    });
    await t.test("POST uses 2s timeout and an uncertain response never triggers another POST", async () => {
      assert.equal(env.backgroundCheckPostTimeoutMs, 2_000);
      assert.equal(env.backgroundCheckGetTimeoutMs, 1_000);
      const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
      let posts = 0;
      mockedFetch.mock.mockImplementation(async (_url, options) => {
        assert.equal(options?.method, "POST"); posts++;
        throw new DOMException("timeout", "TimeoutError");
      });
      const session = { userId: admin.id, sessionId: "test", role: "ADMIN" as const, loginId: admin.loginId, employee: null };
      const key = crypto.randomUUID();
      const result = await requestBackgroundCheck(session, employee.employeeId, key);
      assert.equal(result.check.status, "UNKNOWN");
      assert.equal(timeout.mock.calls[0].arguments[0], 2_000);
      assert.equal((await requestBackgroundCheck(session, employee.employeeId, key)).replayed, true);
      assert.equal(posts, 1);
      timeout.mock.restore();
    });
  } finally {
    await db.auditLog.deleteMany({ where: { targetId: employee.employeeId } });
    await db.backgroundCheck.deleteMany({ where: { employeeRecordId: employee.id } });
    await db.employee.delete({ where: { id: employee.id } });
  }
});

test.after(() => db.$disconnect());
