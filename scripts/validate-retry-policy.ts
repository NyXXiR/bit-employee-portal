/*
 * MEASUREMENTS.md 7절이 정한 정책을 실제로 돌려 예측과 대조한다.
 *
 * 예측(n=1,000 지연 실측에서 유도):
 *   - 타임아웃 1초에서 1회 시도 성공확률 25.3%
 *   - 4회 누적 68.9%  (1 - 0.747^4)
 *   - 성공까지 기대 벽시계 약 2.68초
 *
 * 이 스크립트는 그 예측을 검증할 뿐 새 정책을 만들지 않는다.
 * GET만 사용하므로 외부에 쓰기가 발생하지 않는다.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { CHECK_POLL_POLICY, isRetryablePollStatus, shouldRetry } from "../src/lib/polling";

const baseUrl = (process.env.BACKGROUND_CHECK_API_URL ?? "https://54capvm12g.execute-api.ap-northeast-2.amazonaws.com").replace(/\/$/, "");
const checkId = process.env.VALIDATE_CHECK_ID ?? "CHK-512dae6e-a2c4-4511-85c3-5302d155070f";
const trials = Number(process.env.VALIDATE_TRIALS ?? 100);
const getTimeoutMs = Number(process.env.BACKGROUND_CHECK_GET_TIMEOUT_MS ?? 1_000);
const gapBetweenTrialsMs = Number(process.env.VALIDATE_TRIAL_GAP_MS ?? 200);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(process.cwd(), "measurements", "validate-" + runId);
const rawPath = path.join(outputDir, "trials.ndjson");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Attempt = { attempt: number; latencyMs: number; status: number | null; error: string | null };
type Trial = { trial: number; succeeded: boolean; attemptsUsed: number; wallClockMs: number; stopReason: string; attempts: Attempt[] };

/** polling.ts 의 상수를 그대로 써서 한 번의 조회를 정책대로 시도한다. */
async function runTrial(trial: number): Promise<Trial> {
  const attempts: Attempt[] = [];
  const started = performance.now();
  let attempt = 0;
  let stopReason = "budget_exhausted";

  for (;;) {
    attempt += 1;
    const attemptStarted = performance.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(baseUrl + "/background-checks/" + encodeURIComponent(checkId), {
        signal: AbortSignal.timeout(getTimeoutMs),
        cache: "no-store",
      });
      status = response.status;
      await response.arrayBuffer();
    } catch (caught) {
      error = caught instanceof Error ? caught.name : String(caught);
    }
    attempts.push({ attempt, latencyMs: Number((performance.now() - attemptStarted).toFixed(2)), status, error });

    if (status === 200) {
      stopReason = "success";
      break;
    }
    // 400·404 는 반복해도 회복되지 않는다. 500 을 대상 없음으로 해석하지 않는 것이 핵심.
    if (status !== null && !isRetryablePollStatus(status)) {
      stopReason = "non_retryable_" + status;
      break;
    }
    const elapsed = performance.now() - started;
    if (!shouldRetry(attempt, elapsed)) {
      stopReason = attempt >= CHECK_POLL_POLICY.maxAttempts ? "max_attempts" : "budget_exhausted";
      break;
    }
    await sleep(CHECK_POLL_POLICY.errorRetryDelaysMs[Math.min(attempt - 1, CHECK_POLL_POLICY.errorRetryDelaysMs.length - 1)]);
  }

  return {
    trial,
    succeeded: stopReason === "success",
    attemptsUsed: attempt,
    wallClockMs: Number((performance.now() - started).toFixed(2)),
    stopReason,
    attempts,
  };
}

function percentile(values: number[], percent: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)].toFixed(1));
}

function wilson(successes: number, total: number) {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.959964;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return {
    low: Number((Math.max(0, (centre - spread) / denominator) * 100).toFixed(2)),
    high: Number((Math.min(1, (centre + spread) / denominator) * 100).toFixed(2)),
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(rawPath, "");
  console.log("정책 검증 시작: " + trials + "회, 타임아웃 " + getTimeoutMs + "ms, 최대 " + CHECK_POLL_POLICY.maxAttempts + "회 시도, 간격 " + CHECK_POLL_POLICY.errorRetryDelaysMs[0] + "ms");

  const results: Trial[] = [];
  for (let trial = 1; trial <= trials; trial += 1) {
    const result = await runTrial(trial);
    results.push(result);
    await appendFile(rawPath, JSON.stringify(result) + "\n");
    if (trial % 20 === 0) {
      const so_far = results.filter((row) => row.succeeded).length;
      console.log("  " + trial + "/" + trials + " 완료 · 누적 성공률 " + ((so_far / trial) * 100).toFixed(1) + "%");
    }
    await sleep(gapBetweenTrialsMs);
  }

  const allAttempts = results.flatMap((row) => row.attempts);
  const perAttemptSuccess = allAttempts.filter((row) => row.status === 200).length;
  const succeeded = results.filter((row) => row.succeeded).length;
  const wall = results.map((row) => row.wallClockMs);
  const successWall = results.filter((row) => row.succeeded).map((row) => row.wallClockMs);

  const cumulative = Array.from({ length: CHECK_POLL_POLICY.maxAttempts }, (_, index) => {
    const within = results.filter((row) => row.succeeded && row.attemptsUsed <= index + 1).length;
    return { attempts: index + 1, successes: within, rate: Number(((within / results.length) * 100).toFixed(1)), ci: wilson(within, results.length) };
  });

  const stopReasons: Record<string, number> = {};
  results.forEach((row) => { stopReasons[row.stopReason] = (stopReasons[row.stopReason] ?? 0) + 1; });

  const attemptCi = wilson(perAttemptSuccess, allAttempts.length);
  const trialCi = wilson(succeeded, results.length);

  const summary = {
    runId,
    measuredAt: new Date().toISOString(),
    policy: {
      getTimeoutMs,
      maxAttempts: CHECK_POLL_POLICY.maxAttempts,
      errorRetryDelaysMs: [...CHECK_POLL_POLICY.errorRetryDelaysMs],
      retryBudgetMs: CHECK_POLL_POLICY.retryBudgetMs,
    },
    prediction: { perAttemptSuccessPercent: 25.3, cumulativeAfterMaxAttemptsPercent: 68.9, expectedWallClockMs: 2680 },
    observed: {
      trials: results.length,
      perAttempt: { n: allAttempts.length, successes: perAttemptSuccess, percent: Number(((perAttemptSuccess / allAttempts.length) * 100).toFixed(2)), ci: attemptCi },
      overall: { successes: succeeded, percent: Number(((succeeded / results.length) * 100).toFixed(2)), ci: trialCi },
      cumulative,
      wallClockMs: { p50: percentile(wall, 50), p95: percentile(wall, 95), max: Math.max(...wall), mean: Number((wall.reduce((a, b) => a + b, 0) / wall.length).toFixed(1)) },
      successWallClockMs: { n: successWall.length, p50: percentile(successWall, 50), p95: percentile(successWall, 95), mean: successWall.length ? Number((successWall.reduce((a, b) => a + b, 0) / successWall.length).toFixed(1)) : null },
      stopReasons,
    },
  };

  await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n" + "=".repeat(64));
  console.log("예측 대 실측");
  console.log("=".repeat(64));
  console.log("  1회 시도 성공률   예측 25.3%  ->  실측 " + summary.observed.perAttempt.percent + "%  95%CI [" + attemptCi.low + ", " + attemptCi.high + "]  (n=" + allAttempts.length + ")");
  console.log("  4회 누적 성공률   예측 68.9%  ->  실측 " + summary.observed.overall.percent + "%  95%CI [" + trialCi.low + ", " + trialCi.high + "]  (n=" + results.length + ")");
  console.log("  성공까지 벽시계   예측 2,680ms ->  실측 평균 " + summary.observed.successWallClockMs.mean + "ms  p50 " + summary.observed.successWallClockMs.p50 + "ms  p95 " + summary.observed.successWallClockMs.p95 + "ms");
  console.log("\n  시도 횟수별 누적 성공률");
  cumulative.forEach((row) => console.log("    " + row.attempts + "회 이내: " + row.rate + "%  95%CI [" + row.ci.low + ", " + row.ci.high + "]"));
  console.log("\n  중단 사유: " + JSON.stringify(stopReasons));
  console.log("  전체 벽시계 p50 " + summary.observed.wallClockMs.p50 + "ms · p95 " + summary.observed.wallClockMs.p95 + "ms · max " + summary.observed.wallClockMs.max + "ms");
  console.log("\n저장: " + outputDir);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
