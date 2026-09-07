import test from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema, createEmployeeSchema, loginSchema, provisionEmployeeAccountSchema, resetEmployeePasswordSchema, abandonCheckSchema } from "../src/server/schemas";

test("Korean and English names allow internal name separators but reject non-name input", () => {
  for (const value of ["남궁", "황보", "솔", "진", " 김 ", "김".normalize("NFD"), "Kim", "Mary Jane", "Anne-Marie", "O'Connor", "O’Neill", "김 John", "김 민"]) {
    const result = updateProfileSchema.safeParse({ familyName: value, givenName: value });
    assert.ok(result.success, value);
    assert.ok(createEmployeeSchema.safeParse({ familyName: value, givenName: value, dateOfBirth: null, loginId: "new-user", initialPassword: "test-password" }).success, value);
    if (result.success) assert.equal(result.data.familyName, value.trim().normalize("NFC"));
  }
  for (const value of ["123", "김123", "John2", "!!!", "ㄱ", "김ㄱ", "-Kim", "Kim-", "O''Neil", "Mary\tJane", "", "   ", "김".repeat(41)]) {
    assert.equal(updateProfileSchema.safeParse({ familyName: value }).success, false, value);
    assert.equal(createEmployeeSchema.safeParse({ familyName: "김", givenName: value, dateOfBirth: null, loginId: "new-user", initialPassword: "test-password" }).success, false, value);
  }
});

test("birth dates validate calendar days and reject future dates on every profile entry path", () => {
  for (const value of ["2024-02-29", "1990-03-15", null]) {
    assert.ok(updateProfileSchema.safeParse({ dateOfBirth: value }).success);
  }
  for (const value of ["2023-02-29", "2024-04-31", "0000-01-01", "2999-01-01", "2020-1-1", ""]) {
    assert.equal(updateProfileSchema.safeParse({ dateOfBirth: value }).success, false, value);
    assert.equal(createEmployeeSchema.safeParse({ familyName: "김", givenName: "솔", dateOfBirth: value, loginId: "new-user", initialPassword: "test-password" }).success, false, value);
  }
});

test("account and reason validation handles whitespace, length and existing seed login passwords", () => {
  assert.ok(loginSchema.safeParse({ loginId: "admin", password: "12321" }).success);
  assert.ok(loginSchema.safeParse({ loginId: "employee", password: "1232123" }).success);
  for (const loginId of [" ", "ab", "ab cd", "ab\u0000cd", "a".repeat(81)]) {
    assert.equal(provisionEmployeeAccountSchema.safeParse({ loginId, initialPassword: "test-password" }).success, false);
  }
  for (const password of ["123456789", "          ", "a".repeat(201)]) {
    assert.equal(resetEmployeePasswordSchema.safeParse({ temporaryPassword: password }).success, false);
  }
  assert.ok(resetEmployeePasswordSchema.safeParse({ temporaryPassword: " test-password " }).success);
  assert.equal(abandonCheckSchema.safeParse({ reason: "          " }).success, false);
  assert.equal(abandonCheckSchema.safeParse({ reason: "가".repeat(501) }).success, false);
});
