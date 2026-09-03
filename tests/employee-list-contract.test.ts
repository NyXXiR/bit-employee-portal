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

test("name sort follows the displayed fullName in Korean order", async () => {
  const fixtureIds = ["SORT-NAME-PREFIX-A", "SORT-NAME-PREFIX-B"];
  await db.employee.createMany({
    data: [
      { employeeId: fixtureIds[0], familyName: "남", givenName: "하" },
      { employeeId: fixtureIds[1], familyName: "남궁", givenName: "가" },
    ],
  });

  try {
    const ascending = await listEmployees({ query: "남", sort: "name", direction: "asc", pageSize: 100 });
    const descending = await listEmployees({ query: "남", sort: "name", direction: "desc", pageSize: 100 });
    const collator = new Intl.Collator("ko-KR");
    const expectedAscending = ascending.employees
      .map((employee) => employee.fullName)
      .toSorted((left, right) => collator.compare(left, right));
    const expectedDescending = ascending.employees
      .map((employee) => employee.fullName)
      .toSorted((left, right) => collator.compare(right, left));

    assert.deepEqual(ascending.employees.map((employee) => employee.fullName), expectedAscending);
    assert.deepEqual(descending.employees.map((employee) => employee.fullName), expectedDescending);
    assert(
      ascending.employees.findIndex((employee) => employee.employeeId === fixtureIds[1]) <
        ascending.employees.findIndex((employee) => employee.employeeId === fixtureIds[0]),
      "fullName ordering must compare 남궁가 before 남하",
    );
  } finally {
    await db.employee.deleteMany({ where: { employeeId: { in: fixtureIds } } });
  }
});

test.after(async()=>db.$disconnect());
