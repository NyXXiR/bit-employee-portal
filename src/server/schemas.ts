import { z } from "zod";

const name = z.string().trim().min(1).max(40);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식이어야 합니다.");

export const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const updateProfileSchema = z
  .object({
    familyName: name.optional(),
    givenName: name.optional(),
    dateOfBirth: dateOnly.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "수정할 필드가 없습니다.",
  });

export const createEmployeeSchema = z.object({
  familyName: name,
  givenName: name,
  dateOfBirth: dateOnly.nullable(),
  loginId: z.string().trim().min(3).max(80),
  initialPassword: z.string().min(10).max(200),
});

export const provisionEmployeeAccountSchema = z.object({
  loginId: z.string().trim().min(3).max(80),
  initialPassword: z.string().min(10).max(200),
});

export const createCheckSchema = z.object({
  idempotencyKey: z.uuid(),
});

export const abandonCheckSchema = z.object({
  reason:z.string().trim().min(10,"확인 근거를 10자 이상 입력해 주세요.").max(500),
});

/**
 * 직원 목록 조회 조건. 관리자 화면과 GET /api/admin/employees가 같은 규칙을 쓴다.
 * 빈 문자열은 "조건 없음"과 같으므로 undefined로 접는다.
 */
export const listEmployeesQuerySchema = z.object({
  filter: z.enum(["active", "incomplete"]).optional(),
  sort: z.enum(["employeeId", "name", "dateOfBirth", "status"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  q: z.string().trim().max(80).optional().transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
