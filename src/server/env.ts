import "server-only";

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
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
  get sessionTtlHours() {
    return numberEnv("SESSION_TTL_HOURS", 8);
  },
  get backgroundCheckApiUrl() {
    return (
      process.env.BACKGROUND_CHECK_API_URL ??
      "https://54capvm12g.execute-api.ap-northeast-2.amazonaws.com"
    ).replace(/\/$/, "");
  },
  /*
   * 외부 API 타임아웃은 GET과 POST를 나눈다. 장애 주입이 GET에만 걸려 있어
   * 두 동작의 지연 분포가 완전히 다르기 때문이다(MEASUREMENTS.md 1·2절).
   *
   * GET 1초: 성공 응답의 빠른 무리가 590ms에서 끝나고 다음 성공값이 1,810ms다.
   * 1초를 5초로 늘려도 성공률은 25.3% -> 25.4%(+0.1%p)뿐이고, 그 너머를 잡으려면
   * 게이트웨이가 끊는 30초까지 기다려야 한다. 짧게 끊고 재시도하는 편이
   * 기대 벽시계로 5배 빠르다(2.7초 vs 14.5초).
   */
  get backgroundCheckGetTimeoutMs() {
    return numberEnv("BACKGROUND_CHECK_GET_TIMEOUT_MS", 1_000);
  },
  /*
   * POST 3초: 관측 n=46이 전부 201이고 max가 97.7ms였다. max의 30배 여유다.
   * 짧게 잡을 이유가 없다 — 서버가 employeeId 중복을 제거하지 않으므로
   * 성급히 끊으면 검사가 중복 생성될 위험만 커진다(MEASUREMENTS.md 3절).
   */
  get backgroundCheckPostTimeoutMs() {
    return numberEnv("BACKGROUND_CHECK_POST_TIMEOUT_MS", 3_000);
  },
  get appOrigin() {
    return process.env.APP_ORIGIN ?? "http://localhost:3000";
  },
};
