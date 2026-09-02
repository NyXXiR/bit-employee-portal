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
  get backgroundCheckTimeoutMs() {
    return numberEnv("BACKGROUND_CHECK_TIMEOUT_MS", 5000);
  },
  get backgroundCheckRetentionDays() {
    return numberEnv("BACKGROUND_CHECK_RETENTION_DAYS", 90);
  },
  get appOrigin() {
    return process.env.APP_ORIGIN ?? "http://localhost:3000";
  },
};
