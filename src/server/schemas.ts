import { z } from "zod";
export { loginSchema, updateProfileSchema, createEmployeeSchema, provisionEmployeeAccountSchema, resetEmployeePasswordSchema, abandonCheckSchema } from "@/lib/form-validation";

export const createCheckSchema = z.object({ idempotencyKey: z.uuid() });
export const listProfileChangesQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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
