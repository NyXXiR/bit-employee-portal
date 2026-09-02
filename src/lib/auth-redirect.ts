import { getSessionResolution } from "@/server/auth";

/** 로그인 화면이 배너로 설명할 수 있는 사유. */
export type LoginReason = "expired" | "revoked" | "terminated";

/*
 * 세션이 없을 때 어디로 보낼지 정한다.
 *
 * 유효하지 않은 토큰은 공격자가 임의로 보낸 값일 수 있으므로 구체적인 정보를
 * 노출하지 않는다. 서버가 확인한 만료, 폐기, 퇴사 상태만 안내한다.
 */
export async function loginRedirectPath(): Promise<string> {
  const resolution = await getSessionResolution();
  if (resolution.authenticated) return "/";
  if (resolution.reason === "EXPIRED") return "/login?reason=expired";
  if (resolution.reason === "REVOKED") return "/login?reason=revoked";
  if (resolution.reason === "EMPLOYEE_TERMINATED") return "/login?reason=terminated";
  return "/login";
}
