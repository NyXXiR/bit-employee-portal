import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function requiredSeedValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to create the seed accounts`);
  return value;
}

function requiredSeedPassword(name: string): string {
  const value = requiredSeedValue(name);
  if (value.length < 10 || value === "replace-me" || value.startsWith("change-")) {
    throw new Error(`${name} must be a non-placeholder password with at least 10 characters`);
  }
  return value;
}

const employees = [
  ["EMP-001", "김", "민준", "1990-03-15"],
  ["EMP-002", "김", "민준", "1994-11-02"],
  ["EMP-003", "남궁", "서준", "1988-07-21"],
  ["EMP-004", "황보", "라온", "1995-02-09"],
  ["EMP-005", "김", "솔", "1992-12-30"],
  ["EMP-006", "선우", "진", "1991-05-05"],
  ["EMP-007", "이", "서연", null],
  ["EMP-008", "박", "민준", "1993-08-17"],
  ["EMP-009", "최", "지우", "1996-04-03"],
  ["EMP-010", "정", "하윤", "1989-10-11"],
] as const;

async function ensureSeedUser(input: {
  loginId: string;
  passwordEnvName: "SEED_ADMIN_PASSWORD" | "SEED_EMPLOYEE_PASSWORD";
  role: "ADMIN" | "EMPLOYEE";
  employeeRecordId: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { loginId: input.loginId } });
  if (existing) {
    if (existing.role !== input.role || existing.employeeId !== input.employeeRecordId) {
      throw new Error(
        `Seed user ${input.loginId} already exists with a different role or employee link`,
      );
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      loginId: input.loginId,
      passwordHash: await hash(requiredSeedPassword(input.passwordEnvName), 12),
      role: input.role,
      employeeId: input.employeeRecordId,
    },
  });
}

async function main() {
  for (const [employeeId, familyName, givenName, dateOfBirth] of employees) {
    await prisma.employee.upsert({
      where: { employeeId },
      update: {},
      create: {
        employeeId,
        familyName,
        givenName,
        dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null,
      },
    });
  }

  const adminLoginId = requiredSeedValue("SEED_ADMIN_LOGIN_ID");
  const employeeLoginId = requiredSeedValue("SEED_EMPLOYEE_LOGIN_ID");
  const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeId: "EMP-001" } });

  await ensureSeedUser({
    loginId: adminLoginId,
    passwordEnvName: "SEED_ADMIN_PASSWORD",
    role: "ADMIN",
    employeeRecordId: null,
  });
  await ensureSeedUser({
    loginId: employeeLoginId,
    passwordEnvName: "SEED_EMPLOYEE_PASSWORD",
    role: "EMPLOYEE",
    employeeRecordId: employee.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
