import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const employeeId = "EMP-998";

async function cleanup() {
  const employee = await db.employee.findUnique({where:{employeeId}});
  if (!employee) return;
  await db.backgroundCheck.deleteMany({where:{employeeRecordId:employee.id}});
  await db.employee.delete({where:{id:employee.id}});
}

test("database permits only one active check per employee under concurrency",async()=>{
  await cleanup();
  const admin = await db.user.findFirstOrThrow({where:{role:"ADMIN"}});
  const employee = await db.employee.create({data:{employeeId,familyName:"계약",givenName:"검증",dateOfBirth:new Date("1990-01-01T00:00:00.000Z")}});
  const base = {employeeRecordId:employee.id,requestedByUserId:admin.id,activeSlot:"ACTIVE",familyNameSnapshot:employee.familyName,givenNameSnapshot:employee.givenName,dateOfBirthSnapshot:employee.dateOfBirth!};
  const results = await Promise.allSettled([
    db.backgroundCheck.create({data:{...base,idempotencyKey:crypto.randomUUID()}}),
    db.backgroundCheck.create({data:{...base,idempotencyKey:crypto.randomUUID()}}),
  ]);
  assert.equal(results.filter((result)=>result.status === "fulfilled").length,1);
  assert.equal(results.filter((result)=>result.status === "rejected").length,1);
  await cleanup();
});

test("a late external response cannot revive an administratively closed request", async () => {
  await cleanup();
  const admin = await db.user.findFirstOrThrow({where:{role:"ADMIN"}});
  const employee = await db.employee.create({data:{employeeId,familyName:"계약",givenName:"검증",dateOfBirth:new Date("1990-01-01T00:00:00.000Z")}});
  const check = await db.backgroundCheck.create({data:{employeeRecordId:employee.id,requestedByUserId:admin.id,idempotencyKey:crypto.randomUUID(),activeSlot:"ACTIVE",status:"REQUESTING",familyNameSnapshot:employee.familyName,givenNameSnapshot:employee.givenName,dateOfBirthSnapshot:employee.dateOfBirth!}});
  await db.backgroundCheck.update({where:{id:check.id},data:{status:"FAILED",activeSlot:null,failureCode:"ABANDONED_BY_ADMIN"}});

  const staleCompletion = await db.backgroundCheck.updateMany({
    where:{id:check.id,status:"REQUESTING"},
    data:{status:"PENDING",activeSlot:"ACTIVE",externalCheckId:"CHK-LATE"},
  });
  const persisted = await db.backgroundCheck.findUniqueOrThrow({where:{id:check.id}});

  assert.equal(staleCompletion.count,0);
  assert.equal(persisted.status,"FAILED");
  assert.equal(persisted.activeSlot,null);
  await cleanup();
});

test("database issues unique employee IDs under concurrent creation", async () => {
  const created = await Promise.all([
    db.employee.create({data:{familyName:"사번",givenName:"동시성일",dateOfBirth:null}}),
    db.employee.create({data:{familyName:"사번",givenName:"동시성이",dateOfBirth:null}}),
  ]);

  try {
    assert.notEqual(created[0].employeeId, created[1].employeeId);
    assert.match(created[0].employeeId, /^EMP-\d{3,}$/);
    assert.match(created[1].employeeId, /^EMP-\d{3,}$/);
  } finally {
    await db.employee.deleteMany({where:{id:{in:created.map((employee)=>employee.id)}}});
  }
});

test.after(async()=>{await cleanup();await db.$disconnect();});
