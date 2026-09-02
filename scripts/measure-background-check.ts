import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

type Observation = { operation:string; concurrency:number; startedAt:string; latencyMs:number; status:number|null; body:unknown; error:string|null };

const baseUrl = (process.env.BACKGROUND_CHECK_API_URL ?? "https://54capvm12g.execute-api.ap-northeast-2.amazonaws.com").replace(/\/$/, "");
const sample = {
  employeeId: process.env.MEASURE_EMPLOYEE_ID ?? "MEASURE-EMP-001",
  firstName: process.env.MEASURE_FIRST_NAME ?? "테스트",
  lastName: process.env.MEASURE_LAST_NAME ?? "김",
  dateOfBirth: process.env.MEASURE_DATE_OF_BIRTH ?? "1990-01-01",
};
const postRepeats = Number(process.env.MEASURE_POST_REPEATS ?? 5);
const getSamples = Number(process.env.MEASURE_GET_SAMPLES ?? 100);
const requestsPerLevel = Number(process.env.MEASURE_REQUESTS_PER_LEVEL ?? 20);
const concurrencyLevels = (process.env.MEASURE_CONCURRENCY_LEVELS ?? "1,5,10").split(",").map(Number);
const timeoutMs = Number(process.env.MEASURE_TIMEOUT_MS ?? 30000);
const maxPendingMs = Number(process.env.MEASURE_MAX_PENDING_MS ?? 180000);
const pollingMs = Number(process.env.MEASURE_POLLING_MS ?? 1000);
const existingCheckId = process.env.MEASURE_EXISTING_CHECK_ID;
const observations:Observation[] = [];

if (!existingCheckId && process.env.MEASURE_CONFIRM_WRITES !== "YES") {
  throw new Error("This script sends real POST requests. Set MEASURE_CONFIRM_WRITES=YES to continue.");
}

async function observedFetch(operation:string, url:string, init:RequestInit={}, concurrency=1) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  try {
    const response = await fetch(url, { ...init, signal:AbortSignal.timeout(timeoutMs), cache:"no-store" });
    const text = await response.text();
    let body:unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* retain text */ }
    const row = { operation,concurrency,startedAt,latencyMs:Number((performance.now()-started).toFixed(2)),status:response.status,body,error:null };
    observations.push(row);
    return row;
  } catch (error) {
    const row = { operation,concurrency,startedAt,latencyMs:Number((performance.now()-started).toFixed(2)),status:null,body:null,error:error instanceof Error ? error.message : String(error) };
    observations.push(row);
    return row;
  }
}

async function createCheck(index:number) {
  return observedFetch(`POST duplicate ${index+1}`, `${baseUrl}/background-checks`, { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sample) });
}

async function pollToFinal(checkId:string) {
  const started = Date.now();
  while (Date.now()-started < maxPendingMs) {
    const result = await observedFetch("GET poll", `${baseUrl}/background-checks/${encodeURIComponent(checkId)}`);
    const status = result.body && typeof result.body === "object" && "status" in result.body ? String(result.body.status) : null;
    if (status === "clear" || status === "flagged") return Date.now()-started;
    await new Promise((resolve) => setTimeout(resolve,pollingMs));
  }
  return null;
}

async function inBatches(total:number, concurrency:number, task:()=>Promise<unknown>) {
  for (let offset=0; offset<total; offset+=concurrency) {
    await Promise.all(Array.from({length:Math.min(concurrency,total-offset)},task));
  }
}

function percentile(values:number[], percent:number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil((percent/100)*sorted.length)-1)];
}

async function main() {
const posts = [];
if (!existingCheckId) {
  for (let index=0; index<postRepeats; index+=1) posts.push(await createCheck(index));
}
const checkIds = existingCheckId ? [existingCheckId] : posts.map((row) => row.body && typeof row.body === "object" && "checkId" in row.body ? String(row.body.checkId) : null).filter((value):value is string=>Boolean(value));
if (!checkIds.length) throw new Error("No checkId was returned; inspect the recorded POST responses.");

const finalDurations:Record<string,number|null> = {};
if (!existingCheckId) {
  const uniqueIds = [...new Set(checkIds)];
  const durations = await Promise.all(uniqueIds.map((checkId)=>pollToFinal(checkId)));
  uniqueIds.forEach((checkId,index)=>{finalDurations[checkId]=durations[index]});
}

const targetCheckId = checkIds[0];
for (let offset=0; offset<getSamples; offset+=20) {
  await inBatches(Math.min(20,getSamples-offset),1,()=>observedFetch("GET latency",`${baseUrl}/background-checks/${encodeURIComponent(targetCheckId)}`));
  console.log(`GET latency progress: ${Math.min(offset+20,getSamples)}/${getSamples}`);
}
for (const concurrency of concurrencyLevels) {
  await inBatches(requestsPerLevel,concurrency,()=>observedFetch("GET concurrency",`${baseUrl}/background-checks/${encodeURIComponent(targetCheckId)}`,{},concurrency));
}

const latencyRows = observations.filter((row)=>row.operation === "GET latency");
const latencies = latencyRows.map((row)=>row.latencyMs);
const statusDistribution = Object.fromEntries([...new Set(latencyRows.map((row)=>String(row.status ?? "network_error")))].map((status)=>{ const count=latencyRows.filter((row)=>String(row.status ?? "network_error")===status).length; return [status,{count,percentage:Number(((count/latencyRows.length)*100).toFixed(2))}]; }));
const concurrent = Object.fromEntries(concurrencyLevels.map((level)=>{ const rows=observations.filter((row)=>row.operation === "GET concurrency" && row.concurrency === level); const values=rows.map((row)=>row.latencyMs); return [String(level),{n:rows.length,p50:percentile(values,50),p95:percentile(values,95),p99:percentile(values,99),max:values.length?Math.max(...values):null,statuses:Object.fromEntries([...new Set(rows.map((row)=>String(row.status ?? "network_error")))].map((status)=>[status,rows.filter((row)=>String(row.status ?? "network_error")===status).length]))}]; }));
const summary = { measuredAt:new Date().toISOString(),configuration:{sample,postRepeats,getSamples,requestsPerLevel,concurrencyLevels,timeoutMs,maxPendingMs,pollingMs,existingCheckId:existingCheckId ?? null},getLatency:{n:latencies.length,p50:percentile(latencies,50),p95:percentile(latencies,95),p99:percentile(latencies,99),max:Math.max(...latencies),statusDistribution},duplicatePosts:posts.map((row)=>({status:row.status,latencyMs:row.latencyMs,body:row.body,error:row.error})),pendingToFinalMs:finalDurations,concurrency:concurrent};
const timestamp = new Date().toISOString().replace(/[:.]/g,"-");
const outputDir = path.join(process.cwd(),"measurements",timestamp);
await mkdir(outputDir,{recursive:true});
await writeFile(path.join(outputDir,"raw.json"),JSON.stringify(observations,null,2));
await writeFile(path.join(outputDir,"summary.json"),JSON.stringify(summary,null,2));
console.log(`Measurement complete: ${outputDir}`);
console.log(JSON.stringify(summary,null,2));
}

void main().catch((error)=>{console.error(error);process.exitCode=1});
