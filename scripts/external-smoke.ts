const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_ORIGIN ?? "http://localhost:3000";

async function jsonRequest(path:string,init:RequestInit={},cookie?:string) {
  const headers = new Headers(init.headers);
  headers.set("origin",baseUrl);
  if (cookie) headers.set("cookie",cookie);
  const response = await fetch(`${baseUrl}${path}`,{...init,headers});
  return {response,body:await response.json().catch(()=>null),cookie:response.headers.get("set-cookie")?.split(";",1)[0]};
}

async function main() {
const login = await jsonRequest("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:process.env.SEED_ADMIN_LOGIN_ID,password:process.env.SEED_ADMIN_PASSWORD})});
if (!login.response.ok || !login.cookie) throw new Error(`Admin login failed: ${login.response.status}`);

const create = await jsonRequest("/api/admin/employees/EMP-001/background-checks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})},login.cookie);
if (!create.response.ok) throw new Error(`Background Check request failed: ${create.response.status} ${JSON.stringify(create.body)}`);

let check = create.body.check;
console.log(JSON.stringify({step:"created",httpStatus:create.response.status,check},null,2));
const deadline = Date.now()+180_000;
while (check.status === "PENDING" && Date.now()<deadline) {
  await new Promise((resolve)=>setTimeout(resolve,Math.max(1000,Math.min(5000,(check.estimatedCompletionSeconds ?? 2)*1000))));
  const refreshed = await jsonRequest(`/api/admin/background-checks/${check.id}/refresh`,{method:"POST"},login.cookie);
  if (!refreshed.response.ok) throw new Error(`Refresh failed: ${refreshed.response.status} ${JSON.stringify(refreshed.body)}`);
  check = refreshed.body;
  console.log(JSON.stringify({step:"refreshed",httpStatus:refreshed.response.status,status:check.status,completedAt:check.completedAt},null,2));
}
if (check.status === "PENDING") throw new Error("Background Check did not reach a final state within 180 seconds");
if (check.status === "UNKNOWN") throw new Error(`Background Check outcome is uncertain: ${check.failureCode}`);
console.log(JSON.stringify({finalStatus:check.status,checkId:check.checkId,completedAt:check.completedAt},null,2));
}

void main();
