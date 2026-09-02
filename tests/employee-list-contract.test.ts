import test from "node:test";
import assert from "node:assert/strict";
import { listEmployees } from "../src/server/employees";
import { db } from "../src/server/db";

test("name search crosses the family-name and given-name boundary", async () => {
  const fullName = await listEmployees({query:"남궁서준"});
  const boundary = await listEmployees({query:"궁서"});
  const anotherBoundary = await listEmployees({query:"보라"});

  assert.deepEqual(fullName.employees.map((employee)=>employee.employeeId),["EMP-003"]);
  assert.deepEqual(boundary.employees.map((employee)=>employee.employeeId),["EMP-003"]);
  assert.deepEqual(anotherBoundary.employees.map((employee)=>employee.employeeId),["EMP-004"]);
});

test.after(async()=>db.$disconnect());
