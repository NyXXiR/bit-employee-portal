/*
 * 제출물 2(MEASUREMENTS.md) 실측 수집기.
 *
 * 표본 수 근거:
 *  - GET 지연: p99를 nearest-rank로 뽑으므로 n<100이면 p99가 최댓값과 같아진다.
 *    q분위를 안정적으로 보려면 n >= 10/(1-q) 이므로 p95는 200, p99는 1000이 하한이다.
 *  - 상태코드 분포: 오류를 0건 관측했을 때 rule of three(95% 상한 = 3/n)로
 *    "1% 미만"을 말하려면 n>=300이 필요하다. GET 지연 표본을 그대로 재사용한다.
 *  - 지연 표본은 시간에 분산해야 한다. 연속 버스트는 웜 컨테이너 하나의 분포만 잰다.
 *  - pending->최종은 POST(쓰기)를 동반해 비용이 크므로 40건에서 멈춘다.
 *
 * 원본은 관측 즉시 NDJSON으로 append 한다. 중간에 죽어도 앞선 표본이 남아야 한다.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
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
  requestId: string | null;
  headers: Record<string, string> | null;
  body: unknown;
  error: string | null;
};

const baseUrl = (process.env.BACKGROUND_CHECK_API_URL ?? "https://54capvm12g.execute-api.ap-northeast-2.amazonaws.com").replace(/\/$/, "");
// 중단한 수집을 이어 붙일 수 있어야 한다. MEASURE_RUN_ID 로 같은 디렉터리에 append 하고,
// MEASURE_PHASES 로 남은 단계만 다시 돌린다.
const runId = process.env.MEASURE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const phases = new Set((process.env.MEASURE_PHASES ?? "contract,duplicate,pending,latency,concurrency").split(",").map((name) => name.trim()));
const outputDir = path.join(process.cwd(), "measurements", runId);
const rawPath = path.join(outputDir, "raw.ndjson");

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const timeoutMs = num("MEASURE_TIMEOUT_MS", 60_000);
const duplicatePosts = num("MEASURE_DUPLICATE_POSTS", 6);
const pendingSamples = num("MEASURE_PENDING_SAMPLES", 40);
const pendingPollMs = num("MEASURE_PENDING_POLL_MS", 2_000);
const pendingCapMs = num("MEASURE_PENDING_CAP_MS", 240_000);
const latencyBatches = num("MEASURE_LATENCY_BATCHES", 20);
const latencyBatchSize = num("MEASURE_LATENCY_BATCH_SIZE", 50);
const latencyBatchGapMs = num("MEASURE_LATENCY_BATCH_GAP_MS", 90_000);
const perConcurrencyLevel = num("MEASURE_REQUESTS_PER_LEVEL", 100);
const concurrencyLevels = (process.env.MEASURE_CONCURRENCY_LEVELS ?? "1,5,10,20").split(",").map(Number);

if (process.env.MEASURE_CONFIRM_WRITES !== "YES") {
  throw new Error("This script sends real POST requests to an external API. Set MEASURE_CONFIRM_WRITES=YES.");
}

const observations: Observation[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function record(row: Observation) {
  observations.push(row);
  await appendFile(rawPath, JSON.stringify(row) + "\n");
}

async function observedFetch(
  phase: string,
  operation: string,
  url: string,
  init: RequestInit = {},
  meta: { concurrency?: number; batchIndex?: number | null; indexInBatch?: number | null } = {},
) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const base = {
    phase,
    operation,
    concurrency: meta.concurrency ?? 1,
    batchIndex: meta.batchIndex ?? null,
    indexInBatch: meta.indexInBatch ?? null,
    startedAt,
  };
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const text = await response.text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
    const row: Observation = {
      ...base,
      latencyMs: Number((performance.now() - started).toFixed(2)),
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      requestId: response.headers.get("x-amzn-requestid") ?? response.headers.get("apigw-requestid"),
      // 503 이 Retry-After 를 정말 주는지 확인해야 하므로 오류 응답은 헤더를 통째로 남긴다.
      headers: response.status === 200 || response.status === 201 ? null : Object.fromEntries(response.headers.entries()),
      body,
      error: null,
    };
    await record(row);
    return row;
  } catch (error) {
    const row: Observation = {
      ...base,
      latencyMs: Number((performance.now() - started).toFixed(2)),
      status: null,
      retryAfter: null,
      requestId: null,
      headers: null,
      body: null,
      error: error instanceof Error ? error.name + ": " + error.message : String(error),
    };
    await record(row);
    return row;
  }
}

const json = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

const subject = (employeeId: string) => ({ employeeId, firstName: "민준", lastName: "김", dateOfBirth: "1990-03-15" });
const checkIdOf = (row: Observation) =>
  row.body && typeof row.body === "object" && "checkId" in row.body ? String((row.body as { checkId: unknown }).checkId) : null;
const statusOf = (row: Observation) =>
  row.body && typeof row.body === "object" && "status" in row.body ? String((row.body as { status: unknown }).status) : null;

/** 명세에 적힌 응답을 실제로 내는지 확인하는 프로브. 각 1회면 결론이 난다. */
async function phaseContract() {
  await observedFetch("contract", "GET unknown checkId", baseUrl + "/background-checks/CHK-does-not-exist-0000");
  await observedFetch("contract", "POST missing fields", baseUrl + "/background-checks", json({ employeeId: "MEASURE-CONTRACT" }));
  await observedFetch("contract", "POST empty body", baseUrl + "/background-checks", json({}));
  await observedFetch("contract", "GET list without employeeId", baseUrl + "/background-checks");
  await observedFetch("contract", "GET list unknown employeeId", baseUrl + "/background-checks?employeeId=MEASURE-NOBODY-0000");
  await observedFetch("contract", "POST future dateOfBirth", baseUrl + "/background-checks", json({ ...subject("MEASURE-CONTRACT-DOB"), dateOfBirth: "2999-01-01" }));
  await observedFetch("contract", "POST malformed dateOfBirth", baseUrl + "/background-checks", json({ ...subject("MEASURE-CONTRACT-DOB2"), dateOfBirth: "not-a-date" }));
  await observedFetch("contract", "DELETE checkId", baseUrl + "/background-checks/CHK-does-not-exist-0000", { method: "DELETE" });
}

/** 같은 employeeId 로 POST 를 반복하면 어떻게 되는가. */
async function phaseDuplicate() {
  const employeeId = "MEASURE-DUP-" + runId;
  const rows: Observation[] = [];
  for (let index = 0; index < duplicatePosts; index += 1) {
    rows.push(await observedFetch("duplicate", "POST " + (index + 1), baseUrl + "/background-checks", json(subject(employeeId))));
  }
  await observedFetch("duplicate", "GET list after duplicates", baseUrl + "/background-checks?employeeId=" + encodeURIComponent(employeeId));
  return { employeeId, checkIds: rows.map(checkIdOf).filter((value): value is string => Boolean(value)) };
}

/** pending 에서 최종 상태까지 걸리는 시간. 서버가 보고한 값과 클라이언트가 관측한 값을 함께 남긴다. */
async function phasePending() {
  const created: { checkId: string; employeeId: string; postStatus: string | null; postedAt: number }[] = [];
  for (let index = 0; index < pendingSamples; index += 1) {
    const employeeId = "MEASURE-PEND-" + runId + "-" + String(index).padStart(3, "0");
    const row = await observedFetch("pending", "POST " + (index + 1), baseUrl + "/background-checks", json(subject(employeeId)));
    const checkId = checkIdOf(row);
    if (checkId) created.push({ checkId, employeeId, postStatus: statusOf(row), postedAt: Date.now() });
    await sleep(250);
  }

  const results = await Promise.all(created.map(async (entry) => {
    let observedMs: number | null = null;
    let finalStatus: string | null = null;
    let serverCreatedAt: string | null = null;
    let serverCompletedAt: string | null = null;
    if (entry.postStatus === "clear" || entry.postStatus === "flagged") {
      observedMs = 0;
      finalStatus = entry.postStatus;
    }
    while (Date.now() - entry.postedAt < pendingCapMs) {
      const row = await observedFetch("pending", "GET poll", baseUrl + "/background-checks/" + encodeURIComponent(entry.checkId));
      const status = statusOf(row);
      if (row.body && typeof row.body === "object") {
        const body = row.body as Record<string, unknown>;
        if (typeof body.createdAt === "string") serverCreatedAt = body.createdAt;
        if (typeof body.completedAt === "string") serverCompletedAt = body.completedAt;
      }
      if (status === "clear" || status === "flagged") {
        finalStatus = status;
        if (observedMs === null) observedMs = Date.now() - entry.postedAt;
        break;
      }
      await sleep(pendingPollMs);
    }
    const serverMs = serverCreatedAt && serverCompletedAt
      ? new Date(serverCompletedAt).getTime() - new Date(serverCreatedAt).getTime()
      : null;
    return {
      checkId: entry.checkId,
      employeeId: entry.employeeId,
      postStatus: entry.postStatus,
      finalStatus,
      observedMs,
      serverCreatedAt,
      serverCompletedAt,
      serverMs,
    };
  }));
  return results;
}

/** 단일 요청 GET 지연. 배치 사이를 벌려 시간에 분산시킨다. */
async function phaseLatency(checkId: string) {
  for (let batchIndex = 0; batchIndex < latencyBatches; batchIndex += 1) {
    for (let indexInBatch = 0; indexInBatch < latencyBatchSize; indexInBatch += 1) {
      await observedFetch("latency", "GET latency", baseUrl + "/background-checks/" + encodeURIComponent(checkId), {}, { batchIndex, indexInBatch });
    }
    console.log("[latency] batch " + (batchIndex + 1) + "/" + latencyBatches + " done (" + (batchIndex + 1) * latencyBatchSize + " samples)");
    if (batchIndex < latencyBatches - 1) await sleep(latencyBatchGapMs);
  }
}

/** 동시 요청 수를 늘렸을 때 거동 변화가 있는가. */
async function phaseConcurrency(checkId: string) {
  for (const level of concurrencyLevels) {
    for (let offset = 0; offset < perConcurrencyLevel; offset += level) {
      const size = Math.min(level, perConcurrencyLevel - offset);
      await Promise.all(Array.from({ length: size }, () =>
        observedFetch("concurrency", "GET concurrency", baseUrl + "/background-checks/" + encodeURIComponent(checkId), {}, { concurrency: level })));
    }
    console.log("[concurrency] level " + level + " done");
    await sleep(5_000);
  }
}

function percentile(values: number[], percent: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)];
}

function statusKey(row: Observation) {
  if (row.status !== null) return String(row.status);
  return "network_error:" + (row.error ? row.error.split(":")[0] : "unknown");
}

function describe(rows: Observation[]) {
  const values = rows.map((row) => row.latencyMs);
  const keys = [...new Set(rows.map(statusKey))];
  return {
    n: rows.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : null,
    min: values.length ? Math.min(...values) : null,
    mean: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
    statusDistribution: Object.fromEntries(keys.map((key) => {
      const count = rows.filter((row) => statusKey(row) === key).length;
      return [key, { count, percentage: Number(((count / rows.length) * 100).toFixed(3)) }];
    })),
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if (!process.env.MEASURE_RUN_ID) await writeFile(rawPath, "");
  console.log("[run] " + runId + " -> " + outputDir + "  phases=" + [...phases].join(","));

  if (phases.has("contract")) { await phaseContract(); console.log("[contract] done"); }
  const duplicate = phases.has("duplicate") ? await phaseDuplicate() : { employeeId: "", checkIds: [] as string[] };
  if (phases.has("duplicate")) console.log("[duplicate] done");
  const pending = phases.has("pending") ? await phasePending() : [];
  if (phases.has("pending")) console.log("[pending] done");

  const probeCheckId = process.env.MEASURE_PROBE_CHECK_ID ?? duplicate.checkIds[0] ?? pending.find((row) => row.checkId)?.checkId;
  if (!probeCheckId) throw new Error("No checkId available. Pass MEASURE_PROBE_CHECK_ID when skipping the duplicate phase.");
  if (phases.has("latency")) await phaseLatency(probeCheckId);
  if (phases.has("concurrency")) await phaseConcurrency(probeCheckId);

  const byPhase = (phase: string, operation?: string) =>
    observations.filter((row) => row.phase === phase && (!operation || row.operation === operation));

  const summary = {
    runId,
    measuredAt: new Date().toISOString(),
    baseUrl,
    configuration: { timeoutMs, duplicatePosts, pendingSamples, pendingPollMs, pendingCapMs, latencyBatches, latencyBatchSize, latencyBatchGapMs, perConcurrencyLevel, concurrencyLevels },
    contract: byPhase("contract").map((row) => ({ operation: row.operation, status: row.status, latencyMs: row.latencyMs, retryAfter: row.retryAfter, body: row.body, error: row.error })),
    duplicate: {
      employeeId: duplicate.employeeId,
      distinctCheckIds: new Set(duplicate.checkIds).size,
      posts: byPhase("duplicate").map((row) => ({ operation: row.operation, status: row.status, latencyMs: row.latencyMs, body: row.body })),
    },
    pending,
    latency: {
      overall: describe(byPhase("latency")),
      // 500 은 40ms 대에 즉시 돌아오므로 성공 응답만의 분포를 따로 본다. 타임아웃 근거는 이쪽이다.
      successOnly: describe(byPhase("latency").filter((row) => row.status === 200)),
      errorOnly: describe(byPhase("latency").filter((row) => row.status !== null && row.status !== 200)),
      firstOfBatch: describe(byPhase("latency").filter((row) => row.indexInBatch === 0)),
      restOfBatch: describe(byPhase("latency").filter((row) => row.indexInBatch !== 0)),
      perBatch: Array.from({ length: latencyBatches }, (_, index) => ({ batchIndex: index, ...describe(byPhase("latency").filter((row) => row.batchIndex === index)) })),
    },
    postLatency: describe(observations.filter((row) => row.operation.startsWith("POST"))),
    pollLatency: describe(byPhase("pending", "GET poll")),
    concurrency: Object.fromEntries(concurrencyLevels.map((level) => [String(level), describe(byPhase("concurrency").filter((row) => row.concurrency === level))])),
  };

  const summaryName = process.env.MEASURE_RUN_ID ? "summary-resume-" + [...phases].join("-") + ".json" : "summary.json";
  await writeFile(path.join(outputDir, summaryName), JSON.stringify(summary, null, 2));
  console.log("[done] " + outputDir);
}

void main().catch(async (error) => {
  console.error(error);
  await writeFile(path.join(outputDir, "CRASHED.txt"), String(error)).catch(() => {});
  process.exitCode = 1;
});
