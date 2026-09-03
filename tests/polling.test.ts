import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_POLL_POLICY,
  isRetryablePollStatus,
  pollDelayMs,
  shouldRetry,
} from "../src/lib/polling";

test("첫 조회는 관측된 최단 완료 4.6초보다 앞선다", () => {
  assert.equal(pollDelayMs(0), 4_000);
  assert.ok(CHECK_POLL_POLICY.firstDelayMs < 4_600);
});

test("첫 조회 이후에는 고정 간격으로 확인한다", () => {
  assert.equal(pollDelayMs(4_000), 5_000);
  assert.equal(pollDelayMs(53_800), 5_000);
  assert.equal(pollDelayMs(179_999), 5_000);
});

test("자동 조회는 180초에 끝난다", () => {
  // n=409 실측의 180초 내 97.80% 관측에서 나온 값이다.
  assert.equal(CHECK_POLL_POLICY.maxPollingDurationMs, 180_000);
});

test("재시도 간격은 증가하지 않는다", () => {
  // 오류가 독립(P(실패|직전 실패)=62.6% ≈ 전체 62.7%)이므로 백오프의 근거가 없다.
  assert.equal(pollDelayMs(0, 1), 500);
  assert.equal(pollDelayMs(0, 2), 500);
  assert.equal(pollDelayMs(0, 3), 500);
  assert.deepEqual([...CHECK_POLL_POLICY.errorRetryDelaysMs], [500, 500, 500]);
});

test("재시도 간격은 경과 시간과 무관하다", () => {
  assert.equal(pollDelayMs(100_000, 1), 500);
});

test("범위를 넘는 재시도 횟수는 마지막 간격을 쓴다", () => {
  assert.equal(pollDelayMs(0, 9), 500);
});

test("시도는 4회에서 멈춘다", () => {
  // 타임아웃 1초에서 1회 성공확률 25.3% -> 4회 누적 68.9%, 최악 5.5초.
  assert.equal(CHECK_POLL_POLICY.maxAttempts, 4);
  assert.equal(shouldRetry(1, 0), true);
  assert.equal(shouldRetry(3, 0), true);
  assert.equal(shouldRetry(4, 0), false);
});

test("벽시계 예산이 시도 횟수보다 먼저 닿으면 멈춘다", () => {
  // 게이트웨이 503은 매번 타임아웃 전액을 태울 수 있어 횟수만으로는 상한이 서지 않는다.
  assert.equal(shouldRetry(1, 5_500), false);
  assert.equal(shouldRetry(1, 5_499), true);
  assert.equal(CHECK_POLL_POLICY.retryBudgetMs, 5_500);
});

test("일시적 서버 장애만 재시도한다", () => {
  assert.equal(isRetryablePollStatus(500), true);
  assert.equal(isRetryablePollStatus(503), true);
  assert.equal(isRetryablePollStatus(400), false);
  assert.equal(isRetryablePollStatus(401), false);
  assert.equal(isRetryablePollStatus(403), false);
  // 404만이 대상 없음의 확정 신호다. 주입된 500이 진짜 404를 가리므로
  // 500을 대상 없음으로 해석하면 안 된다(위 500=true와 대비).
  assert.equal(isRetryablePollStatus(404), false);
  assert.equal(isRetryablePollStatus(409), false);
  assert.equal(isRetryablePollStatus(502), false);
});
