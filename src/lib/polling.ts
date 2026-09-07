/** 화면에서 기다리는 테스트 기능의 정책. 실측 재계산을 참고한 선택이며 최적값의 증명은 아니다. */
export const CHECK_POLL_POLICY = {
  firstDelayMs: 4_000,
  intervalMs: 2_000,
  maxPollingDurationMs: 180_000,
} as const;

export function isRetryablePollStatus(status: number): boolean {
  return status === 500 || status === 503;
}

/** 응답을 모두 받은 뒤 기본 간격과 서버 권고 중 더 긴 시간을 기다린다. */
export function nextPollAtMs(responseAtMs: number, advisedSeconds = 0): number {
  return responseAtMs + Math.max(CHECK_POLL_POLICY.intervalMs, advisedSeconds * 1000);
}

/** 자동 조회의 다음 시작까지 남은 시간. 수동 조회에는 180초 종료 조건을 적용하지 않는다. */
export function automaticPollDelayMs(nowMs: number, createdAtMs: number, nextPollAt: number | null): number | null {
  const dueAt = Math.max(nowMs, createdAtMs + CHECK_POLL_POLICY.firstDelayMs, nextPollAt ?? 0);
  if (dueAt >= createdAtMs + CHECK_POLL_POLICY.maxPollingDurationMs) return null;
  return dueAt - nowMs;
}
