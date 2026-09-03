/*
 * Background Check 폴링·재시도 정책. 모든 상수는 MEASUREMENTS.md 의 실측에서 나왔다.
 *
 * [폴링 주기]
 * 동시성 1 실측(n=40)에서 POST 응답의 62.5%가 이미 최종 상태였다. 그 경우 폴링을
 * 시작하지 않는다. pending을 거친 15건의 완료 시각은 4.6 / 6.2 / 8.3 / 9.2 / 12.1 /
 * 12.3 / 14.7 / 15.3 / 16.0 / 30.1 / 38.8 / 39.9 / 43.5 / 47.1 / 53.8초였다.
 * 최단이 4.6초이므로 첫 조회는 4초 뒤에 한다 — 그 전에 물어봐야 pending만 돌아온다.
 * 이후 5초 간격이면 완료 발견 지연 상한이 5초다. 조회 1회당 실패율이 62.7%라
 * 실질 성공 조회는 2~3주기에 한 번꼴이므로 이보다 벌리면 발견 지연이 실질 15초까지 늘어난다.
 *
 * 종료 180초는 이 표본이 아니라 동시성 5 고정 실측(pending 시작 n=409)에서 가져왔다.
 * 그쪽은 120초 내 93.64%, 180초 내 97.80%를 관측했다. n=40으로는 꼬리를 신뢰할 수 없어
 * 표본이 10배인 쪽을 택했다. 측정 조건이 다르다는 점은 MEASUREMENTS.md 4절에 적어 두었다.
 *
 * [재시도]
 * 지수 백오프를 쓰지 않는다. n=1,000 인접쌍 분석에서
 * P(실패|직전 실패)=62.6%, P(실패|직전 성공)=62.7%, 전체 실패율 62.7%로 세 값이 일치했다.
 * 오류가 서로 독립이므로 기다린다고 성공 확률이 오르지 않는다. 백오프는 장애가
 * 지속되거나 몰려 온다는 전제 위에 서는데, 이 API는 그 전제를 만족하지 않는다.
 * 500ms 간격은 회복을 기다리는 값이 아니라 두드리는 속도를 제한하는 값이다.
 *
 * 시도 4회는 타임아웃 1초에서의 1회 성공확률 25.3%로부터 나왔다. 누적 68.9%,
 * 최악 벽시계 5.5초(4×1초 + 3×0.5초). 10회로 늘려도 94.6%에 그치고 15초가 걸리므로,
 * 그 구간은 자동 재시도 대신 실패를 노출하고 관리자가 다시 누르게 한다(2회 클릭 누적 90.3%).
 *
 * 이 스케줄을 그대로 100회 돌려 검증했다(MEASUREMENTS.md 7-1절):
 * 1회 성공률 25.0% [20.23, 30.47], 4회 누적 68.0% [58.34, 76.33]로 예측이 둘 다 맞았다.
 * 성공까지 벽시계는 예측 2,680ms보다 빠른 평균 1,252.8ms였다 — 4회에서 끊으면 성공이
 * 앞쪽 시도에 몰리기 때문이다(성공 회차의 평균 시도 2.12회). retryBudgetMs는 그 100회에서
 * 한 번도 발동하지 않았다(최대 벽시계 4,598.7ms). 최악의 경우를 막는 안전장치로만 남아 있다.
 *
 * [Retry-After 를 따르지 않는 이유]
 * Swagger 는 "Clients should honour this value instead of using a fixed backoff" 라고
 * 적었으나, 503 응답 395건 중 Retry-After 헤더가 있는 것은 0건이었다. 본문의
 * retryAfter 필드는 239건에 있었고 값이 전부 상수 30이다. 나머지 156건은 게이트웨이가
 * 낸 503(`{"message":"Service Unavailable"}`)이라 대기값 자체가 없다.
 * 오류가 독립이므로 30초 뒤의 성공 확률과 0.5초 뒤의 성공 확률이 같다. 30초를 기다리면
 * 관리자 화면이 30초 멈추는 비용만 남는다. 값은 로그·표시용으로만 남기고 일정에는 반영하지 않는다.
 */
export const CHECK_POLL_POLICY = {
  /** pending 인 검사의 첫 재조회까지 기다릴 시간. 관측된 최단 완료 4.6초보다 앞선다. */
  firstDelayMs: 4_000,
  /** 첫 조회 이후의 재조회 간격. 완료 발견 지연 상한이 이 값이다. */
  intervalMs: 5_000,
  /** 생성 시각부터 이 시간이 지나면 자동 조회를 끝내고 수동 재조회 대상으로 넘긴다. */
  maxPollingDurationMs: 180_000,
  /** 재시도 가능한 실패 뒤의 대기. 오류가 독립이므로 증가시키지 않는다. */
  errorRetryDelaysMs: [500, 500, 500],
  /** 최초 1회 + 재시도 3회. */
  maxAttempts: 4,
  /** 시도 횟수와 별개인 벽시계 상한. 게이트웨이 503 은 매번 타임아웃 전액을 태울 수 있다. */
  retryBudgetMs: 5_500,
} as const;

/**
 * 내부 refresh API가 재시도 가능한 장애로 정규화해 전달하는 상태코드다.
 * 입력 오류·권한 오류·대상 없음·응답 계약 위반은 같은 요청을 반복해도 회복되지 않는다.
 *
 * 500 을 "대상 없음"으로 해석하지 않는 것이 중요하다. 실측에서 없는 checkId 조회가
 * 어떤 실행에서는 500, 다른 실행에서는 명세대로 404 를 반환했다. 주입된 500 이
 * 진짜 404 를 가리므로, 확정 신호로 쓸 수 있는 것은 404 뿐이다.
 */
export function isRetryablePollStatus(status: number): boolean {
  return status === 500 || status === 503;
}

/** 재시도를 더 할 수 있는지. 횟수와 벽시계 예산 중 먼저 닿는 쪽에서 멈춘다. */
export function shouldRetry(attempt: number, elapsedSinceFirstAttemptMs: number): boolean {
  return attempt < CHECK_POLL_POLICY.maxAttempts && elapsedSinceFirstAttemptMs < CHECK_POLL_POLICY.retryBudgetMs;
}

/**
 * 다음 조회까지 기다릴 시간을 구한다.
 *
 * retryAfterSeconds 는 받아 두되 일정에는 쓰지 않는다(위 주석 참조). 호출부가
 * 값을 표시하거나 로그로 남길 수 있도록 인자는 유지한다.
 */
export function pollDelayMs(
  elapsedMs: number,
  retryAttempt = 0,
): number {
  if (retryAttempt > 0) {
    const index = Math.min(retryAttempt - 1, CHECK_POLL_POLICY.errorRetryDelaysMs.length - 1);
    return CHECK_POLL_POLICY.errorRetryDelaysMs[index];
  }
  return elapsedMs === 0 ? CHECK_POLL_POLICY.firstDelayMs : CHECK_POLL_POLICY.intervalMs;
}
