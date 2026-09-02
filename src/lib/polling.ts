/*
 * Background Check 폴링 정책.
 *
 * ⚠ 아래 숫자는 아직 실측값이 아니다.
 *   과제 [제출물 2] MEASUREMENTS.md에서 p50/p95/p99와 pending → 최종 상태 소요
 *   시간을 측정한 뒤, 이 파일의 값을 그 결과로 교체하고 각 값의 근거를 문서에 적는다.
 *   화면 여러 곳에 흩어 놓지 않고 여기 모아 둔 이유가 그것이다.
 *
 * 첫 조회 간격만은 상수가 아니다. Swagger가 POST 응답의
 * estimatedCompletionSeconds를 두고 "Use this value to determine your polling
 * interval"이라고 명시했으므로, 외부 API가 알려준 값이 있으면 그 값을 우선한다.
 */
export const CHECK_POLL_POLICY = {
  /** 외부 API가 예상 완료 시간을 주지 않았을 때 쓰는 첫 조회 대기 시간. */
  fallbackFirstDelayMs: 5_000,
  /** 첫 조회 이후의 재조회 간격. */
  intervalMs: 3_000,
  /** 자동 조회를 멈추는 총 시도 횟수. 넘으면 수동 버튼으로 넘긴다. */
  maxAttempts: 10,
  /** 연속 실패가 이 횟수에 닿으면 외부 API 장애로 보고 자동 조회를 멈춘다. */
  maxConsecutiveErrors: 3,
} as const;

/**
 * n번째 시도(0부터)까지 기다릴 시간을 구한다.
 * 첫 시도만 외부 API가 알려준 예상 완료 시간을 따른다.
 */
export function pollDelayMs(
  attempt: number,
  estimatedSeconds: number | null,
  retryAfterSeconds: number | null = null,
): number {
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1_000;
  if (attempt > 0) return CHECK_POLL_POLICY.intervalMs;
  return estimatedSeconds && estimatedSeconds > 0
    ? estimatedSeconds * 1_000
    : CHECK_POLL_POLICY.fallbackFirstDelayMs;
}
