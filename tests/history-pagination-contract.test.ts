import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { listBackgroundChecks } from "../src/server/background-checks";
import { listProfileChanges } from "../src/server/employees";

const db = new PrismaClient();
const employeeId = "EMP-997";

async function cleanup() {
  const employee = await db.employee.findUnique({ where: { employeeId } });
  if (!employee) return;
  await db.profileChange.deleteMany({ where: { employeeRecordId: employee.id } });
  await db.backgroundCheck.deleteMany({ where: { employeeRecordId: employee.id } });
  await db.employee.delete({ where: { id: employee.id } });
}

test("history previews are bounded and profile changes continue by cursor", async () => {
  await cleanup();
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const employee = await db.employee.create({
    data: {
      employeeId,
      familyName: "이력",
      givenName: "페이지",
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    },
  });

  const baseTime = Date.now() - 60_000;
  await db.profileChange.createMany({
    data: Array.from({ length: 27 }, (_, index) => ({
      employeeRecordId: employee.id,
      actorUserId: admin.id,
      field: "givenName",
      beforeValue: `이전-${index}`,
      afterValue: `이후-${index}`,
      createdAt: new Date(baseTime + index * 1_000),
    })),
  });
  await db.backgroundCheck.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      employeeRecordId: employee.id,
      requestedByUserId: admin.id,
      idempotencyKey: crypto.randomUUID(),
      externalCheckId: `CHK-HISTORY-${crypto.randomUUID()}`,
      status: "CLEAR" as const,
      familyNameSnapshot: employee.familyName,
      givenNameSnapshot: employee.givenName,
      dateOfBirthSnapshot: employee.dateOfBirth!,
      createdAt: new Date(baseTime + index * 1_000),
    })),
  });

  const preview = await listProfileChanges(employeeId, { limit: 5 });
  assert.equal(preview.total, 27);
  assert.equal(preview.changes.length, 5);
  assert.ok(preview.nextCursor);

  const second = await listProfileChanges(employeeId, {
    limit: 20,
    cursor: preview.nextCursor!,
  });
  const third = await listProfileChanges(employeeId, {
    limit: 20,
    cursor: second.nextCursor!,
  });
  assert.equal(second.changes.length, 20);
  assert.equal(third.changes.length, 2);
  assert.equal(third.nextCursor, null);
  assert.equal(
    new Set(
      [...preview.changes, ...second.changes, ...third.changes].map((row) => row.id),
    ).size,
    27,
  );

  const checks = await listBackgroundChecks(employeeId, 5);
  assert.equal(checks.total, 7);
  assert.equal(checks.checks.length, 5);
});

test.after(async () => {
  await cleanup();
  await db.$disconnect();
});
