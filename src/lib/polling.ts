/*
 * Background Check 폴링 정책.
 *
 * 제출물 2 실측에서 pending 표본 n=7의 p50은 2.883초였고,
 * n=7 중 6건이 6.003초 안에 끝났다. 초기에는 2초마다 확인하되 10초 이후에는
 * 5초 간격으로 늦추고, 최대 관측값 39.190초보다 여유 있는 60초에 자동 조회를 끝낸다.
 *
 * 첫 조회 간격만은 상수가 아니다. Swagger가 POST 응답의
 * estimatedCompletionSeconds를 두고 "Use this value to determine your polling
 * interval"이라고 명시했으므로, 외부 API가 알려준 값이 있으면 그 값을 우선한다.
 * 실측한 성공 POST n=40에서는 이 값이 모두 누락되어 fallback도 필요하다.
 */
export const CHECK_POLL_POLICY = {
  /** 외부 API가 예상 완료 시간을 주지 않았을 때 쓰는 첫 조회 대기 시간. */
  fallbackFirstDelayMs: 2_000,
  /** 초기 구간의 재조회 간격. */
  initialIntervalMs: 2_000,
  /** 이 횟수까지 초기 간격을 사용한다. 5회째 조회가 약 10초 지점이다. */
  initialAttempts: 5,
  /** 초기 구간 이후의 재조회 간격. */
  laterIntervalMs: 5_000,
  /** 2초 간격 5회 + 5초 간격 10회로 약 60초까지 조회한다. */
  maxAttempts: 15,
  /** 500 또는 timeout 뒤의 두 차례 재시도 간격. */
  errorRetryDelaysMs: [1_000, 2_000],
  /** 최초 실패 뒤 재시도 2회를 허용하므로 연속 실패 3회에서 멈춘다. */
  maxConsecutiveErrors: 3,
} as const;

/**
 * 내부 refresh API가 재시도 가능한 장애로 정규화해 전달하는 상태코드다.
 * 입력 오류·권한 오류·대상 없음·응답 계약 위반은 같은 요청을 반복해도 회복되지 않는다.
 */
export function isRetryablePollStatus(status: number): boolean {
  return status === 500 || status === 503;
}

/**
 * n번째 시도(0부터)까지 기다릴 시간을 구한다.
 * 첫 시도만 외부 API가 알려준 예상 완료 시간을 따른다.
 */
export function pollDelayMs(
  attempt: number,
  estimatedSeconds: number | null,
  retryAfterSeconds: number | null = null,
  consecutiveErrors = 0,
): number {
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1_000;
  if (consecutiveErrors > 0) {
    const index = Math.min(
      consecutiveErrors - 1,
      CHECK_POLL_POLICY.errorRetryDelaysMs.length - 1,
    );
    return CHECK_POLL_POLICY.errorRetryDelaysMs[index];
  }
  if (attempt === 0) {
    return estimatedSeconds && estimatedSeconds > 0
      ? estimatedSeconds * 1_000
      : CHECK_POLL_POLICY.fallbackFirstDelayMs;
  }
  return attempt < CHECK_POLL_POLICY.initialAttempts
    ? CHECK_POLL_POLICY.initialIntervalMs
    : CHECK_POLL_POLICY.laterIntervalMs;
}
