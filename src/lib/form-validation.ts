import { z } from "zod";

/** 생년월일의 오늘 기준은 서버와 브라우저 모두 한국 시간으로 맞춘다. */
export function todayInSeoul(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const personName = (label: string) => z.string().trim().transform((value) => value.normalize("NFC")).pipe(
  z.string().min(1, `${label}을 입력해 주세요.`).max(40, `${label}은 40자 이내로 입력해 주세요.`)
    .regex(/^[가-힣A-Za-z]+(?:[ '’-][가-힣A-Za-z]+)*$/, `${label}은 한글·영문으로 입력해 주세요. 글자 사이에는 공백·하이픈·아포스트로피를 사용할 수 있습니다.`),
);
const birthDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "실제 존재하는 생년월일을 YYYY-MM-DD 형식으로 입력해 주세요.")
  .refine((value) => value <= todayInSeoul(), "생년월일은 오늘 이후 날짜일 수 없습니다.");
const newLoginId = z.string().trim().min(3, "아이디는 3자 이상 입력해 주세요.")
  .max(80, "아이디는 80자 이내로 입력해 주세요.")
  .regex(/^[^\s\p{C}]+$/u, "아이디에는 공백이나 제어문자를 사용할 수 없습니다.");
const newPassword = z.string().min(10, "비밀번호는 10자 이상 입력해 주세요.")
  .max(200, "비밀번호는 200자 이내로 입력해 주세요.")
  .refine((value) => value.trim().length > 0, "공백만으로 비밀번호를 만들 수 없습니다.");

// 로그인은 기존 계정·시드 계정의 비밀번호를 그대로 허용한다.
export const loginSchema = z.object({
  loginId: z.string().trim().min(1, "아이디를 입력해 주세요.").max(80, "아이디는 80자 이내로 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요.").max(200, "비밀번호는 200자 이내로 입력해 주세요."),
});
export const updateProfileSchema = z.object({
  familyName: personName("성").optional(),
  givenName: personName("이름").optional(),
  dateOfBirth: birthDate.nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), { message: "수정할 필드가 없습니다." });
export const createEmployeeSchema = z.object({
  familyName: personName("성"), givenName: personName("이름"), dateOfBirth: birthDate.nullable(),
  loginId: newLoginId, initialPassword: newPassword,
});
export const provisionEmployeeAccountSchema = z.object({ loginId: newLoginId, initialPassword: newPassword });
export const resetEmployeePasswordSchema = z.object({ temporaryPassword: newPassword });
export const abandonCheckSchema = z.object({
  reason: z.string().trim().min(10, "확인 근거를 10자 이상 입력해 주세요.").max(500, "확인 근거는 500자 이내로 입력해 주세요."),
});
