import "server-only";

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

export const env = {
  get sessionSecret() {
    const value = process.env.SESSION_SECRET;
    if (!value || value.length < 32 || (process.env.NODE_ENV === "production" && value.includes("replace-with"))) {
      throw new Error("SESSION_SECRET must contain at least 32 characters");
    }
    return value;
  },
  get sessionTtlHours() { return numberEnv("SESSION_TTL_HOURS", 8); },
  get backgroundCheckApiUrl() {
    return (process.env.BACKGROUND_CHECK_API_URL ?? "https://54capvm12g.execute-api.ap-northeast-2.amazonaws.com").replace(/\/$/, "");
  },
  // GET은 느린 응답을 중도 종료하고 같은 ID를 다음 주기에 조회하는 정책이다.
  get backgroundCheckGetTimeoutMs() { return numberEnv("BACKGROUND_CHECK_GET_TIMEOUT_MS", 1_000); },
  // POST 별도 표본 1,051건의 최대 1.919초를 포함하도록 선택. 응답 불확실 시 자동 재생성하지 않는다.
  get backgroundCheckPostTimeoutMs() { return numberEnv("BACKGROUND_CHECK_POST_TIMEOUT_MS", 2_000); },
  get appOrigin() { return process.env.APP_ORIGIN ?? "http://localhost:3000"; },
};
