import "server-only";

import { hash } from "bcryptjs";
import type { Employee, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { formatDateOnly, parseDateOnly } from "@/server/dates";
import { AppError } from "@/server/errors";
import type { SessionContext } from "@/server/auth";
import { mayEditEmployee, profileChanges, profileIsComplete, terminationDecision } from "@/domain/employee";

type EmployeeWithLogin = Employee & { user: { loginId: string } | null };

export function employeeDto(employee: Employee) {
  return {
    employeeId: employee.employeeId,
    familyName: employee.familyName,
    givenName: employee.givenName,
    fullName: `${employee.familyName}${employee.givenName}`,
    dateOfBirth: formatDateOnly(employee.dateOfBirth),
    profileComplete: profileIsComplete(employee.dateOfBirth),
    status: employee.status,
    terminatedAt: employee.terminatedAt?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

function adminEmployeeDto(employee: EmployeeWithLogin) {
  return { ...employeeDto(employee), loginId: employee.user?.loginId ?? null };
}

export async function getMyProfile(session: SessionContext) {
  if (!session.employee) {
    throw new AppError(403, "EMPLOYEE_PROFILE_REQUIRED", "직원 프로필이 없습니다.");
  }
  const employee = await db.employee.findUnique({ where: { id: session.employee.id } });
  if (!employee || employee.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_TERMINATED", "퇴사 처리된 계정은 접근할 수 없습니다.");
  }
  return employeeDto(employee);
}

export type EmployeeListFilter = "active" | "incomplete";

export type EmployeeSortKey = "employeeId" | "name" | "dateOfBirth" | "status";
export type SortDirection = "asc" | "desc";

export type ListEmployeesOptions = {
  filter?: EmployeeListFilter;
  query?: string;
  sort?: EmployeeSortKey;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
};

/**
 * 정렬 기준을 Prisma orderBy로 옮긴다.
 *
 * 어느 기준을 고르든 사번을 마지막에 덧붙인다. 동명이인이나 같은 재직 상태처럼
 * 기준값이 같은 행이 여러 개면 DB가 매번 다른 순서를 줄 수 있고, 그러면 쪽을
 * 넘길 때 어떤 직원은 두 번 나오고 어떤 직원은 아예 보이지 않는다.
 * 사번은 유일하므로 순서를 확정하는 마지막 기준이 된다.
 */
function employeeOrderBy(
  sort: EmployeeSortKey = "employeeId",
  direction: SortDirection = "asc",
): Prisma.EmployeeOrderByWithRelationInput[] {
  const tiebreaker: Prisma.EmployeeOrderByWithRelationInput = { employeeId: "asc" };

  switch (sort) {
    case "name":
      // 표시 이름은 성과 이름을 이어 붙인 값이므로 두 컬럼을 차례로 본다.
      return [{ familyName: direction }, { givenName: direction }, tiebreaker];
    case "dateOfBirth":
      // 생년월일이 없는 직원은 어느 방향으로 정렬하든 뒤로 보낸다.
      // 값이 없는 행이 맨 앞을 차지하면 읽는 흐름이 끊긴다.
      return [{ dateOfBirth: { sort: direction, nulls: "last" } }, tiebreaker];
    case "status":
      return [{ status: direction }, tiebreaker];
    default:
      return [{ employeeId: direction }];
  }
}

export const DEFAULT_EMPLOYEE_PAGE_SIZE = 10;

/**
 * 목록 조건을 DB 조건으로 옮긴다.
 *
 * 이름 검색이 까다롭다. 성과 이름을 별도 컬럼으로 저장하므로(D-002) 표시 이름
 * "남궁서준"은 어느 컬럼에도 그대로 들어 있지 않다. 그래서 각 컬럼 부분일치에
 * 더해, 붙여 쓴 입력이 성/이름 경계를 지나는 모든 위치를 비교한다.
 * 저장할 때 성을 자동으로 분해하지 않는다는 원칙은 그대로다 — 여기서 잘못
 * 끊어도 검색이 안 걸릴 뿐 데이터가 틀어지지 않는다.
 */
function employeeListWhere({ filter, query }: ListEmployeesOptions): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};

  if (filter === "active") where.status = "ACTIVE";
  // "정보 보완 필요"의 정의는 생년월일이 비어 있다는 것이다.
  if (filter === "incomplete") where.dateOfBirth = null;

  const needle = query?.trim();
  if (!needle) return where;

  const or: Prisma.EmployeeWhereInput[] = [
    { employeeId: { contains: needle, mode: "insensitive" } },
    { familyName: { contains: needle } },
    { givenName: { contains: needle } },
    { user: { is: { loginId: { contains: needle, mode: "insensitive" } } } },
  ];

  for (let cut = 1; cut < needle.length; cut += 1) {
    const familyPart = needle.slice(0, cut);
    const givenPart = needle.slice(cut);
    if (familyPart.length > 40 || givenPart.length > 40) continue;
    or.push({
      AND: [
        { familyName: { endsWith: familyPart } },
        { givenName: { startsWith: givenPart } },
      ],
    });
  }

  where.OR = or;
  return where;
}

/**
 * 직원 목록 한 쪽과, 필터를 적용하지 않은 요약 수치를 함께 돌려준다.
 *
 * 수치와 목록을 한 트랜잭션에 묶는 이유는 둘이 서로 다른 시점을 보지 않게
 * 하기 위해서다. 목록은 조건에 맞는 것만, 요약은 언제나 전체를 센다 —
 * 화면에서 "재직 중 9"를 누르는 순간에도 "전체 10"은 그대로여야 한다.
 *
 * 범위를 벗어난 쪽 번호는 오류가 아니라 마지막 쪽으로 접는다. 주소를 손으로
 * 고쳤거나 보고 있던 쪽의 직원이 모두 걸러진 경우에 빈 화면을 만들지 않는다.
 */
export async function listEmployees(options: ListEmployeesOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_EMPLOYEE_PAGE_SIZE;
  const where = employeeListWhere(options);

  return db.$transaction(async (tx) => {
    const [total, summaryTotal, summaryActive, summaryIncomplete] = await Promise.all([
      tx.employee.count({ where }),
      tx.employee.count(),
      tx.employee.count({ where: { status: "ACTIVE" } }),
      tx.employee.count({ where: { dateOfBirth: null } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(options.page ?? 1, 1), totalPages);

    const employees = await tx.employee.findMany({
      where,
      include: { user: { select: { loginId: true } } },
      orderBy: employeeOrderBy(options.sort, options.direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      employees: employees.map(adminEmployeeDto),
      total,
      page,
      pageSize,
      totalPages,
      sort: options.sort ?? "employeeId",
      direction: options.direction ?? "asc",
      summary: {
        total: summaryTotal,
        active: summaryActive,
        incomplete: summaryIncomplete,
      },
    };
  });
}

export async function getEmployee(employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { employeeId },
    include: { user: { select: { loginId: true } } },
  });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
  return adminEmployeeDto(employee);
}

export async function listProfileChanges(employeeId:string) {
  const employee = await db.employee.findUnique({where:{employeeId}});
  if (!employee) throw new AppError(404,"EMPLOYEE_NOT_FOUND","직원을 찾을 수 없습니다.");
  const changes = await db.profileChange.findMany({
    where:{employeeRecordId:employee.id},
    include:{actor:{select:{loginId:true}}},
    orderBy:{createdAt:"desc"},
    take:100,
  });
  return changes.map((change)=>({id:change.id,field:change.field,beforeValue:change.beforeValue,afterValue:change.afterValue,changedBy:change.actor.loginId,createdAt:change.createdAt.toISOString()}));
}

type ProfileInput = {
  familyName?: string;
  givenName?: string;
  dateOfBirth?: string | null;
};

export async function updateEmployeeProfile(
  session: SessionContext,
  employeeId: string,
  input: ProfileInput,
) {
  if (!mayEditEmployee({role:session.role,employeeId:session.employee?.employeeId ?? null},employeeId)) {
    throw new AppError(403, "FORBIDDEN", "다른 직원의 정보를 수정할 수 없습니다.");
  }
  if (session.role !== "ADMIN" && input.dateOfBirth === null) {
    throw new AppError(400, "DATE_OF_BIRTH_REQUIRED", "생년월일을 비울 수 없습니다.");
  }

  let parsedDate: Date | null | undefined;
  if (input.dateOfBirth !== undefined) {
    try {
      parsedDate = input.dateOfBirth === null ? null : parseDateOnly(input.dateOfBirth);
    } catch (error) {
      throw new AppError(400, "INVALID_DATE_OF_BIRTH", (error as Error).message);
    }
  }

  return db.$transaction(async (tx) => {
    const current = await tx.employee.findUnique({ where: { employeeId } });
    if (!current) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
    if (current.status !== "ACTIVE") {
      throw new AppError(409, "EMPLOYEE_TERMINATED", "퇴사 직원의 정보를 수정할 수 없습니다.");
    }

    const data: Prisma.EmployeeUpdateManyMutationInput = {};
    if (input.familyName !== undefined) {
      data.familyName = input.familyName;
    }
    if (input.givenName !== undefined) {
      data.givenName = input.givenName;
    }
    if (parsedDate !== undefined) {
      data.dateOfBirth = parsedDate;
    }

    const changes = profileChanges(
      {familyName:current.familyName,givenName:current.givenName,dateOfBirth:formatDateOnly(current.dateOfBirth)},
      {familyName:input.familyName,givenName:input.givenName,dateOfBirth:parsedDate === undefined ? undefined : formatDateOnly(parsedDate)},
    );

    if (changes.length === 0) return employeeDto(current);

    const updateResult = await tx.employee.updateMany({
      where: { id: current.id, status: "ACTIVE" },
      data,
    });
    if (updateResult.count !== 1) {
      throw new AppError(409, "EMPLOYEE_STATE_CHANGED", "직원 상태가 변경되어 수정하지 못했습니다.");
    }

    await tx.profileChange.createMany({
      data: changes.map((change) => ({
        employeeRecordId: current.id,
        actorUserId: session.userId,
        ...change,
      })),
    });
    await tx.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "PROFILE_UPDATED",
        targetType: "Employee",
        targetId: current.employeeId,
        metadata: { fields: changes.map((change) => change.field) },
      },
    });
    return employeeDto(await tx.employee.findUniqueOrThrow({ where: { id: current.id } }));
  });
}

type CreateEmployeeInput = {
  familyName: string;
  givenName: string;
  dateOfBirth: string | null;
  loginId: string;
  initialPassword: string;
};

export async function createEmployee(session: SessionContext, input: CreateEmployeeInput) {
  let dateOfBirth: Date | null = null;
  if (input.dateOfBirth) {
    try {
      dateOfBirth = parseDateOnly(input.dateOfBirth);
    } catch (error) {
      throw new AppError(400, "INVALID_DATE_OF_BIRTH", (error as Error).message);
    }
  }
  const passwordHash = await hash(input.initialPassword, 12);

  try {
    const employee = await db.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          familyName: input.familyName,
          givenName: input.givenName,
          dateOfBirth,
        },
      });
      await tx.user.create({
        data: {
          loginId: input.loginId,
          passwordHash,
          role: "EMPLOYEE",
          employeeId: created.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "EMPLOYEE_CREATED",
          targetType: "Employee",
          targetId: created.employeeId,
        },
      });
      return created;
    });
    return { ...employeeDto(employee), loginId: input.loginId };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? "");
      if (target.includes("loginId")) {
        throw new AppError(409, "LOGIN_ID_EXISTS", "로그인 아이디가 이미 존재합니다.");
      }
      throw new AppError(409, "EMPLOYEE_ID_GENERATION_CONFLICT", "사번을 발급하지 못했습니다. 다시 시도해 주세요.");
    }
    throw error;
  }
}

type ProvisionEmployeeAccountInput = {
  loginId: string;
  initialPassword: string;
};

export async function provisionEmployeeAccount(
  session: SessionContext,
  employeeId: string,
  input: ProvisionEmployeeAccountInput,
) {
  const passwordHash = await hash(input.initialPassword, 12);

  try {
    return await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { employeeId },
        include: { user: { select: { loginId: true } } },
      });
      if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
      if (employee.status !== "ACTIVE") {
        throw new AppError(409, "EMPLOYEE_TERMINATED", "퇴사 직원에게 계정을 발급할 수 없습니다.");
      }
      if (employee.user) {
        throw new AppError(409, "ACCOUNT_ALREADY_EXISTS", "이미 로그인 계정이 발급된 직원입니다.");
      }

      await tx.user.create({
        data: {
          loginId: input.loginId,
          passwordHash,
          role: "EMPLOYEE",
          employeeId: employee.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "EMPLOYEE_ACCOUNT_PROVISIONED",
          targetType: "Employee",
          targetId: employee.employeeId,
          metadata: { loginId: input.loginId },
        },
      });

      return { ...employeeDto(employee), loginId: input.loginId };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const target = String((error as { meta?: { target?: unknown } }).meta?.target ?? "");
      if (target.includes("loginId")) {
        throw new AppError(409, "LOGIN_ID_EXISTS", "로그인 아이디가 이미 존재합니다.");
      }
      throw new AppError(409, "ACCOUNT_ALREADY_EXISTS", "이미 로그인 계정이 발급된 직원입니다.");
    }
    throw error;
  }
}

export async function terminateEmployee(session: SessionContext, employeeId: string) {
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { employeeId },
      include: { user: true },
    });
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
    if (terminationDecision(employee.status) === "ALREADY_TERMINATED") return employeeDto(employee);

    const terminatedAt = new Date();
    const result = await tx.employee.updateMany({
      where: { id: employee.id, status: "ACTIVE" },
      data: { status: "TERMINATED", terminatedAt },
    });
    if (result.count !== 1) {
      throw new AppError(409, "EMPLOYEE_STATE_CHANGED", "직원 상태가 이미 변경되었습니다.");
    }
    if (employee.user) {
      await tx.session.updateMany({
        where: { userId: employee.user.id, revokedAt: null },
        data: { revokedAt: terminatedAt },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "EMPLOYEE_TERMINATED",
        targetType: "Employee",
        targetId: employee.employeeId,
      },
    });
    return employeeDto(await tx.employee.findUniqueOrThrow({ where: { id: employee.id } }));
  });
}
