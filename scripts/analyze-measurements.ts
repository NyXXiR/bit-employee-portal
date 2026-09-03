/*
 * measurements/<runId>/raw.ndjson 을 MEASUREMENTS.md 에 옮길 수치로 요약한다.
 *
 * 비율에는 Wilson 점수 구간(95%)을 붙인다. 표본이 작으면 구간이 넓어지므로
 * "이 수치를 근거로 삼아도 되는가"가 표에서 바로 보인다.
 * 사용: npx tsx scripts/analyze-measurements.ts measurements/<runId>
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type Observation = {
  phase: string;
  operation: string;
  concurrency: number;
  batchIndex: number | null;
  indexInBatch: number | null;
  startedAt: string;
  latencyMs: number;
  status: number | null;
  retryAfter: string | null;
  headers: Record<string, string> | null;
  body: unknown;
  error: string | null;
};

const target = process.argv[2] ?? (() => {
  const dirs = readdirSync(path.join(process.cwd(), "measurements")).filter((name) => name.startsWith("20")).sort();
  return path.join("measurements", dirs[dirs.length - 1]);
})();

const rows: Observation[] = readFileSync(path.join(target, "raw.ndjson"), "utf8")
  .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function percentile(values: number[], percent: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)]);
}

/** 95% Wilson 점수 구간. 0건 관측이면 하한 0, 상한이 rule of three 와 거의 같아진다. */
function wilson(successes: number, total: number) {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.959964;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return { low: round(Math.max(0, (center - spread) / denominator) * 100, 2), high: round(Math.min(1, (center + spread) / denominator) * 100, 2) };
}

const statusKey = (row: Observation) => row.status !== null ? String(row.status) : "network_error:" + (row.error ? row.error.split(":")[0] : "unknown");

function latencyTable(label: string, subset: Observation[]) {
  const values = subset.map((row) => row.latencyMs);
  console.log("\n### " + label + "  (n=" + subset.length + ")");
  if (!subset.length) return;
  console.log("  p50=" + percentile(values, 50) + "ms  p95=" + percentile(values, 95) + "ms  p99=" + percentile(values, 99) +
    "ms  max=" + round(Math.max(...values)) + "ms  min=" + round(Math.min(...values)) + "ms");
  if (subset.length < 100) console.log("  ! n<100 이므로 p99 는 최댓값과 같다. 추정치가 아니라 관측 상한으로만 읽어야 한다.");
}

function statusTable(label: string, subset: Observation[]) {
  console.log("\n### " + label + " 상태코드 분포  (n=" + subset.length + ")");
  const keys = [...new Set(subset.map(statusKey))].sort();
  for (const key of keys) {
    const count = subset.filter((row) => statusKey(row) === key).length;
    const ci = wilson(count, subset.length);
    console.log("  " + key.padEnd(22) + String(count).padStart(5) + "  " + round((count / subset.length) * 100, 2).toFixed(2).padStart(6) + "%  95%CI [" + ci.low + "%, " + ci.high + "%]");
  }
}

console.log("=".repeat(72));
console.log("MEASUREMENT ANALYSIS  " + target);
console.log("총 관측 " + rows.length + "건");
console.log("=".repeat(72));

// 1. 단일 요청 GET 지연 --------------------------------------------------
const latency = rows.filter((row) => row.phase === "latency");
latencyTable("GET /background-checks/{checkId} 전체", latency);
latencyTable("GET 200 응답만", latency.filter((row) => row.status === 200));
latencyTable("GET 오류 응답만", latency.filter((row) => row.status !== null && row.status !== 200));
statusTable("GET /background-checks/{checkId}", latency);

// 배치 첫 요청이 느린가(웜업 효과)
latencyTable("배치 첫 요청", latency.filter((row) => row.indexInBatch === 0));
latencyTable("배치 나머지", latency.filter((row) => row.indexInBatch !== 0));

// 2. 동시성 --------------------------------------------------------------
console.log("\n" + "=".repeat(72));
console.log("동시 요청 수별 거동");
const levels = [...new Set(rows.filter((row) => row.phase === "concurrency").map((row) => row.concurrency))].sort((a, b) => a - b);
for (const level of levels) {
  const subset = rows.filter((row) => row.phase === "concurrency" && row.concurrency === level);
  const values = subset.map((row) => row.latencyMs);
  const errors = subset.filter((row) => row.status !== 200).length;
  const ci = wilson(errors, subset.length);
  console.log("  동시 " + String(level).padStart(2) + "  n=" + String(subset.length).padStart(4) +
    "  p50=" + String(percentile(values, 50)).padStart(8) + "  p95=" + String(percentile(values, 95)).padStart(8) +
    "  p99=" + String(percentile(values, 99)).padStart(8) + "  max=" + String(round(Math.max(...values))).padStart(9) +
    "  오류 " + round((errors / subset.length) * 100, 2) + "% [" + ci.low + ", " + ci.high + "]");
}

// 3. 같은 employeeId 반복 POST -------------------------------------------
console.log("\n" + "=".repeat(72));
console.log("같은 employeeId 로 POST 반복");
const dupPosts = rows.filter((row) => row.phase === "duplicate" && row.operation.startsWith("POST"));
const dupIds = dupPosts.map((row) => (row.body as { checkId?: string } | null)?.checkId).filter(Boolean);
console.log("  POST " + dupPosts.length + "회 -> 서로 다른 checkId " + new Set(dupIds).size + "개 (중복 제거 없음)");
for (const row of dupPosts) {
  const body = row.body as { checkId?: string; status?: string; estimatedCompletionSeconds?: number } | null;
  console.log("  " + row.operation.padEnd(8) + " " + row.status + "  status=" + body?.status +
    "  est=" + (body?.estimatedCompletionSeconds ?? "(없음)") + "  " + body?.checkId);
}

// 4. pending -> 최종 -----------------------------------------------------
console.log("\n" + "=".repeat(72));
// summary.json 은 수집이 끝까지 갔을 때만 생긴다. 중단된 수집도 분석할 수 있어야 하므로
// pending 결과는 raw.ndjson 에서 직접 복원한다. POST 시각과 최종 상태를 처음 관측한 폴링 시각의 차.
type PendingRow = { checkId: string; postStatus: string | null; finalStatus: string | null; observedMs: number | null; serverMs: number | null };
const pendingPosts = rows.filter((row) => row.phase === "pending" && row.operation.startsWith("POST") && row.status === 201);
const pendingPolls = rows.filter((row) => row.phase === "pending" && row.operation === "GET poll" && row.status === 200);
const pending: PendingRow[] = pendingPosts.map((post) => {
  const body = post.body as { checkId?: string; status?: string } | null;
  const checkId = body?.checkId ?? "";
  const postedAt = new Date(post.startedAt).getTime() + post.latencyMs;
  const mine = pendingPolls.filter((poll) => (poll.body as { checkId?: string } | null)?.checkId === checkId);
  const settled = mine.find((poll) => {
    const status = (poll.body as { status?: string } | null)?.status;
    return status === "clear" || status === "flagged";
  });
  const settledBody = settled?.body as { status?: string; createdAt?: string; completedAt?: string } | null;
  const immediate = body?.status === "clear" || body?.status === "flagged";
  const serverMs = settledBody?.createdAt && settledBody?.completedAt
    ? new Date(settledBody.completedAt).getTime() - new Date(settledBody.createdAt).getTime()
    : null;
  return {
    checkId,
    postStatus: body?.status ?? null,
    finalStatus: immediate ? (body?.status ?? null) : (settledBody?.status ?? null),
    observedMs: immediate ? 0 : (settled ? new Date(settled.startedAt).getTime() + settled.latencyMs - postedAt : null),
    serverMs,
  };
});
console.log("pending -> 최종 상태  (n=" + pending.length + ")");
if (pending.length) {
  const immediate = pending.filter((row) => row.postStatus !== "pending").length;
  const resolved = pending.filter((row) => row.finalStatus);
  const unresolved = pending.filter((row) => !row.finalStatus);
  const observed = resolved.map((row) => row.observedMs ?? 0);
  const server = resolved.map((row) => row.serverMs).filter((value): value is number => value !== null);
  const ciImmediate = wilson(immediate, pending.length);
  console.log("  POST 즉시 최종상태: " + immediate + "/" + pending.length + " (" + round((immediate / pending.length) * 100, 1) + "% 95%CI [" + ciImmediate.low + ", " + ciImmediate.high + "])");
  console.log("  제한시간 내 미완료: " + unresolved.length + "/" + pending.length);
  console.log("  클라이언트 관측(ms): p50=" + percentile(observed, 50) + " p95=" + percentile(observed, 95) + " max=" + (observed.length ? round(Math.max(...observed)) : "-"));
  console.log("  서버 completedAt-createdAt(ms): n=" + server.length + " p50=" + percentile(server, 50) + " p95=" + percentile(server, 95) + " max=" + (server.length ? round(Math.max(...server)) : "-"));
  const finals: Record<string, number> = {};
  pending.forEach((row) => { const key = String(row.finalStatus ?? "미완료"); finals[key] = (finals[key] ?? 0) + 1; });
  console.log("  최종 상태 분포: " + JSON.stringify(finals));
  console.log("  정렬된 관측값(ms): " + observed.slice().sort((a, b) => a - b).join(", "));
}

// 5. 폴링 GET 지연/상태 ---------------------------------------------------
const polls = rows.filter((row) => row.phase === "pending" && row.operation === "GET poll");
latencyTable("폴링 중 GET (동시 40 부하)", polls);
statusTable("폴링 중 GET", polls);

// 6. 503 이 Retry-After 를 주는가 -----------------------------------------
console.log("\n" + "=".repeat(72));
const unavailable = rows.filter((row) => row.status === 503);
const withRetryAfter = unavailable.filter((row) => row.retryAfter !== null);
console.log("503 응답 " + unavailable.length + "건 중 Retry-After 헤더가 있는 것: " + withRetryAfter.length + "건");
const withBodyRetry = unavailable.filter((row) => row.body && typeof row.body === "object" && "retryAfter" in (row.body as object));
console.log("503 응답 중 본문에 retryAfter 필드가 있는 것: " + withBodyRetry.length + "건");
// 503 은 두 출처가 섞인다. Lambda 가 낸 것은 본문에 retryAfter 를 싣고,
// API Gateway 가 낸 것은 {"message":"Service Unavailable"} 뿐이라 대기값을 알려주지 않는다.
const lambda503 = unavailable.filter((row) => row.body && typeof row.body === "object" && "retryAfter" in (row.body as object));
const gateway503 = unavailable.filter((row) => !(row.body && typeof row.body === "object" && "retryAfter" in (row.body as object)));
console.log("  503 출처 구분: 본문 retryAfter 있음 " + lambda503.length + "건 / 없음 " + gateway503.length + "건");
if (lambda503.length) {
  const values = lambda503.map((row) => Number((row.body as { retryAfter: unknown }).retryAfter)).filter((v) => Number.isFinite(v));
  console.log("  본문 retryAfter 값 분포: " + JSON.stringify(Object.fromEntries([...new Set(values)].sort((a, b) => a - b).map((v) => [v, values.filter((x) => x === v).length]))));
  console.log("  Lambda 503 지연 p50=" + percentile(lambda503.map((r) => r.latencyMs), 50) + "ms  예시본문=" + JSON.stringify(lambda503[0].body));
}
if (gateway503.length) {
  console.log("  Gateway 503 지연 p50=" + percentile(gateway503.map((r) => r.latencyMs), 50) + "ms  예시본문=" + JSON.stringify(gateway503[0].body));
  console.log("  Gateway 503 헤더 예시=" + JSON.stringify(gateway503[0].headers));
}
// 30초 벽: 게이트웨이 통합 타임아웃에 걸린 응답이 얼마나 되는가.
const wall = rows.filter((row) => row.phase === "latency" && row.latencyMs >= 29_000);
console.log("  지연 29초 이상 응답: " + wall.length + "건 / latency 표본 " + latency.length + "건 (" + round((wall.length / Math.max(1, latency.length)) * 100, 2) + "%)");
console.log("  그 중 상태코드: " + JSON.stringify(Object.fromEntries([...new Set(wall.map(statusKey))].map((k) => [k, wall.filter((r) => statusKey(r) === k).length]))));
const serverError = rows.filter((row) => row.status === 500);
console.log("500 응답 " + serverError.length + "건, 본문 예시: " + JSON.stringify(serverError[0]?.body));

// 7. estimatedCompletionSeconds 존재 여부 ---------------------------------
const creates = rows.filter((row) => row.status === 201);
const withEstimate = creates.filter((row) => row.body && typeof row.body === "object" && "estimatedCompletionSeconds" in (row.body as object));
console.log("\nPOST 201 " + creates.length + "건 중 estimatedCompletionSeconds 를 실은 응답: " + withEstimate.length + "건");

// 8. 명세 대조 프로브 -----------------------------------------------------
console.log("\n" + "=".repeat(72));
console.log("명세 대조 프로브");
for (const row of rows.filter((r) => r.phase === "contract")) {
  console.log("  " + row.operation.padEnd(30) + " -> " + row.status + "  " + JSON.stringify(row.body).slice(0, 110));
}

// 9. 정책 근거 계산 -------------------------------------------------------
console.log("\n" + "=".repeat(72));
console.log("정책 산출 근거");
const successRows = latency.filter((row) => row.status === 200);
const errorRate = latency.length ? latency.filter((row) => row.status !== 200).length / latency.length : 0;
console.log("  GET 200 응답 p99 = " + percentile(successRows.map((r) => r.latencyMs), 99) + "ms, max = " + (successRows.length ? round(Math.max(...successRows.map((r) => r.latencyMs))) : "-") + "ms");
console.log("  GET 오류율 p = " + round(errorRate * 100, 2) + "%");
for (let attempts = 1; attempts <= 5; attempts += 1) {
  console.log("    시도 " + attempts + "회 모두 실패할 확률 = " + (Math.pow(errorRate, attempts) * 100).toPrecision(3) + "%  (성공확률 " + round((1 - Math.pow(errorRate, attempts)) * 100, 4) + "%)");
}
