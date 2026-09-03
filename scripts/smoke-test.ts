import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
const testLoginId = "smoke-test-employee";
const testPassword = "Smoke-test-password-2026!";
const provisionEmployeeId = "SMOKE-ACCOUNT-FIXTURE";
const provisionLoginId = "smoke-provisioned-employee";
const provisionPassword = "Smoke-provision-password-2026!";
const resetPassword = "Smoke-reset-password-2026!";
const requiredSeedEmployeeIds = Array.from({length:10},(_,index)=>`EMP-${String(index+1).padStart(3,"0")}`);

function assert(condition:unknown, message:string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(path:string, init:RequestInit={}, cookie?:string) {
  const headers = new Headers(init.headers);
  headers.set("origin",baseUrl);
  if (cookie) headers.set("cookie",cookie);
  const response = await fetch(`${baseUrl}${path}`,{...init,headers});
  const body = await response.json().catch(()=>null);
  return {response,body,cookie:response.headers.get("set-cookie")?.split(";",1)[0]};
}

async function login(loginId:string,password:string) {
  const result = await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId,password})});
  assert(result.response.status === 200,`Login failed for ${loginId}: ${result.response.status}`);
  assert(result.cookie,"Login did not return a session cookie");
  return result.cookie;
}

async function cleanup() {
  const user = await db.user.findUnique({where:{loginId:testLoginId},include:{employee:true}});
  const provisionEmployee = await db.employee.findUnique({
    where:{employeeId:provisionEmployeeId},
    include:{user:true},
  });
  for (const target of [user?.employee ? {employee:user.employee,user} : null, provisionEmployee ? {employee:provisionEmployee,user:provisionEmployee.user} : null]) {
    if (!target) continue;
    await db.$transaction(async (tx)=>{
      await tx.auditLog.deleteMany({where:{targetId:target.employee.employeeId}});
      await tx.backgroundCheck.deleteMany({where:{employeeRecordId:target.employee.id}});
      await tx.profileChange.deleteMany({where:{employeeRecordId:target.employee.id}});
      if (target.user) await tx.user.delete({where:{id:target.user.id}});
      await tx.employee.delete({where:{id:target.employee.id}});
    });
  }
}

async function main() {
  await cleanup();
  const adminLogin = process.env.SEED_ADMIN_LOGIN_ID ?? "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-admin-password";
  const employeeLogin = process.env.SEED_EMPLOYEE_LOGIN_ID ?? "employee";
  const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD ?? "change-employee-password";
  const adminCookie = await login(adminLogin,adminPassword);
  const employeeCookie = await login(employeeLogin,employeePassword);

  const list = await request("/api/admin/employees",{},adminCookie);
  assert(list.response.status === 200,"Admin could not list employees");
  assert(list.body?.summary?.total >= 10,"Employee total is smaller than the required seed set");
  const nameSortedList = await request("/api/admin/employees?sort=name&dir=asc&pageSize=100",{},adminCookie);
  const nameCollator = new Intl.Collator("ko-KR");
  const returnedNames = nameSortedList.body?.employees?.map((employee:{fullName:string})=>employee.fullName) ?? [];
  assert(
    nameSortedList.response.status === 200 &&
      nameSortedList.body?.sort === "name" &&
      nameSortedList.body?.direction === "asc" &&
      JSON.stringify(returnedNames) === JSON.stringify(returnedNames.toSorted(nameCollator.compare)),
    "Admin API did not sort by the displayed fullName in Korean order",
  );
  const seedEmployeeCount = await db.employee.count({where:{employeeId:{in:requiredSeedEmployeeIds}}});
  assert(seedEmployeeCount === 10,"One or more required seed employees are missing");

  const denied = await request("/api/admin/employees",{},employeeCookie);
  assert(denied.response.status === 403,"Employee accessed an admin endpoint");

  const ownProfile = await request("/api/portal/profile",{},employeeCookie);
  assert(ownProfile.response.status === 200 && ownProfile.body?.employeeId === "EMP-001","Employee could not read own profile");

  await db.employee.create({
    data:{
      employeeId:provisionEmployeeId,
      familyName:"계정",
      givenName:"미발급",
      dateOfBirth:new Date("1998-02-03T00:00:00.000Z"),
    },
  });
  const beforeProvision = await request(`/api/admin/employees/${provisionEmployeeId}`,{},adminCookie);
  assert(beforeProvision.response.status === 200 && beforeProvision.body?.loginId === null,"Accountless employee was not exposed as unprovisioned");
  const provision = await request(`/api/admin/employees/${provisionEmployeeId}/account`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:provisionLoginId,initialPassword:provisionPassword})},adminCookie);
  assert(provision.response.status === 201 && provision.body?.loginId === provisionLoginId,"Admin could not provision an employee account");
  const provisionedList = await request(`/api/admin/employees?q=${encodeURIComponent(provisionLoginId)}`,{},adminCookie);
  assert(provisionedList.response.status === 200 && provisionedList.body?.employees?.some((employee:{employeeId:string;loginId:string|null})=>employee.employeeId === provisionEmployeeId && employee.loginId === provisionLoginId),"Employee list did not expose or search the provisioned login ID");
  const provisionedCookie = await login(provisionLoginId,provisionPassword);
  const provisionedProfile = await request("/api/portal/profile",{},provisionedCookie);
  assert(provisionedProfile.response.status === 200 && provisionedProfile.body?.employeeId === provisionEmployeeId,"Provisioned employee could not log in");
  const reset = await request(`/api/admin/employees/${provisionEmployeeId}/account/reset-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({temporaryPassword:resetPassword})},adminCookie);
  assert(reset.response.status === 200 && reset.body?.sessionsRevoked >= 1,"Admin could not reset an employee password and revoke sessions");
  const resetAudit = await db.auditLog.findFirst({
    where:{action:"EMPLOYEE_PASSWORD_RESET",targetId:provisionEmployeeId},
  });
  assert(resetAudit !== null,"Password reset was not recorded in the audit log");
  const resetRevokedSession = await request("/api/portal/profile",{},provisionedCookie);
  assert(resetRevokedSession.response.status === 401 && resetRevokedSession.body?.code === "SESSION_REVOKED","Password reset did not revoke an existing employee session");
  const oldPasswordLogin = await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:provisionLoginId,password:provisionPassword})});
  assert(oldPasswordLogin.response.status === 401,"The previous password still worked after reset");
  const resetCookie = await login(provisionLoginId,resetPassword);
  const resetProfile = await request("/api/portal/profile",{},resetCookie);
  assert(resetProfile.response.status === 200 && resetProfile.body?.employeeId === provisionEmployeeId,"The temporary password could not be used to log in");
  const employeeResetDenied = await request(`/api/admin/employees/${provisionEmployeeId}/account/reset-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({temporaryPassword:"Smoke-forbidden-reset-2026!"})},employeeCookie);
  assert(employeeResetDenied.response.status === 403,"Employee could reset another employee password");
  const provisionReplay = await request(`/api/admin/employees/${provisionEmployeeId}/account`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:"smoke-second-account",initialPassword:provisionPassword})},adminCookie);
  assert(provisionReplay.response.status === 409 && provisionReplay.body?.code === "ACCOUNT_ALREADY_EXISTS","A second account could be provisioned for one employee");
  const employeeProvisionDenied = await request(`/api/admin/employees/${provisionEmployeeId}/account`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:"smoke-forbidden-account",initialPassword:provisionPassword})},employeeCookie);
  assert(employeeProvisionDenied.response.status === 403,"Employee could provision another employee account");

  const create = await request("/api/admin/employees",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({familyName:"테스트",givenName:"직원",dateOfBirth:"1999-01-01",loginId:testLoginId,initialPassword:testPassword})},adminCookie);
  assert(create.response.status === 201,`Admin employee creation failed: ${create.response.status}`);
  const testEmployeeId = create.body?.employeeId;
  assert(typeof testEmployeeId === "string" && /^EMP-\d{3,}$/.test(testEmployeeId),"Server did not issue a valid employee ID");
  assert(create.body?.loginId === testLoginId,"Employee creation response omitted the login ID");
  const createdDetail = await request(`/api/admin/employees/${testEmployeeId}`,{},adminCookie);
  assert(createdDetail.response.status === 200 && createdDetail.body?.loginId === testLoginId,"Admin employee detail omitted the login ID");
  const temporaryCookie = await login(testLoginId,testPassword);

  const updateProfile = await request("/api/portal/profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({familyName:"테스트",givenName:"직원수정",dateOfBirth:"1999-01-01"})},temporaryCookie);
  assert(updateProfile.response.status === 200 && updateProfile.body?.fullName === "테스트직원수정","Employee profile update failed");
  const temporaryUser = await db.user.findUniqueOrThrow({where:{loginId:testLoginId}});

  const expiredCookie = await login(testLoginId,testPassword);
  const expiringSession = await db.session.findFirstOrThrow({where:{userId:temporaryUser.id,revokedAt:null},orderBy:{createdAt:"desc"}});
  await db.session.update({where:{id:expiringSession.id},data:{expiresAt:new Date(Date.now()-1000)}});
  const expired = await request("/api/portal/profile",{},expiredCookie);
  assert(expired.response.status === 401 && expired.body?.code === "SESSION_EXPIRED","Expired session reason was not distinguished");

  const revokedCookie = await login(testLoginId,testPassword);
  const revokingSession = await db.session.findFirstOrThrow({where:{userId:temporaryUser.id,revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
  await db.session.update({where:{id:revokingSession.id},data:{revokedAt:new Date()}});
  const explicitlyRevoked = await request("/api/portal/profile",{},revokedCookie);
  assert(explicitlyRevoked.response.status === 401 && explicitlyRevoked.body?.code === "SESSION_REVOKED","Revoked session reason was not distinguished");

  const changes = await request(`/api/admin/employees/${testEmployeeId}/changes`,{},adminCookie);
  assert(changes.response.status === 200 && changes.body?.some((change:{field:string})=>change.field === "givenName"),"Profile change audit was not recorded");

  const employeeCheckDenied = await request(`/api/admin/employees/${testEmployeeId}/background-checks`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})},employeeCookie);
  assert(employeeCheckDenied.response.status === 403,"Employee could request a Background Check");

  const crossOrigin = await fetch(`${baseUrl}/api/admin/employees`,{method:"POST",headers:{origin:"https://evil.example","content-type":"application/json",cookie:adminCookie},body:"{}"});
  assert(crossOrigin.status === 403,"Cross-origin mutation was not rejected");

  const [testEmployee,adminUser] = await Promise.all([db.employee.findUniqueOrThrow({where:{employeeId:testEmployeeId}}),db.user.findUniqueOrThrow({where:{loginId:adminLogin}})]);
  const idempotencyKey = crypto.randomUUID();
  await db.backgroundCheck.create({data:{employeeRecordId:testEmployee.id,requestedByUserId:adminUser.id,idempotencyKey,activeSlot:"ACTIVE",status:"PENDING",externalCheckId:`CHK-SMOKE-${crypto.randomUUID()}`,familyNameSnapshot:testEmployee.familyName,givenNameSnapshot:testEmployee.givenName,dateOfBirthSnapshot:testEmployee.dateOfBirth!}});
  const replay = await request(`/api/admin/employees/${testEmployeeId}/background-checks`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey})},adminCookie);
  assert(replay.response.status === 200 && replay.body?.replayed === true,"Same idempotency key did not replay the existing command");
  const activeConflict = await request(`/api/admin/employees/${testEmployeeId}/background-checks`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})},adminCookie);
  assert(activeConflict.response.status === 409 && activeConflict.body?.code === "ACTIVE_CHECK_EXISTS","A second active check was not rejected");
  const keyReused = await request("/api/admin/employees/EMP-001/background-checks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey})},adminCookie);
  assert(keyReused.response.status === 409 && keyReused.body?.code === "IDEMPOTENCY_KEY_REUSED","Cross-command idempotency key reuse was not rejected");
  const pendingCheck = await db.backgroundCheck.findUniqueOrThrow({where:{idempotencyKey}});
  const postCheckProfileUpdate = await request(`/api/admin/employees/${testEmployeeId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({givenName:"검사후수정"})},adminCookie);
  assert(postCheckProfileUpdate.response.status === 200,"Profile could not be updated after a check request");
  const checkHistory = await request(`/api/admin/employees/${testEmployeeId}/background-checks`,{},adminCookie);
  const comparedCheck = checkHistory.body?.find((check:{id:string})=>check.id === pendingCheck.id);
  assert(comparedCheck?.profileComparison?.matchesCurrentProfile === false && comparedCheck.profileComparison.changedFields.includes("givenName"),"Check snapshot and current profile difference was not reported");
  const persistedSnapshot = await db.backgroundCheck.findUniqueOrThrow({where:{id:pendingCheck.id}});
  assert(persistedSnapshot.givenNameSnapshot === "직원수정","Profile update rewrote the historical check snapshot");
  const pendingAbandon = await request(`/api/admin/background-checks/${pendingCheck.id}/abandon`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"외부 서비스 이력 확인 후 종료합니다."})},adminCookie);
  assert(pendingAbandon.response.status === 409 && pendingAbandon.body?.code === "CHECK_NOT_UNCERTAIN","A pending check could be abandoned");
  await db.backgroundCheck.update({where:{id:pendingCheck.id},data:{status:"UNKNOWN"}});
  const abandon = await request(`/api/admin/background-checks/${pendingCheck.id}/abandon`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"외부 서비스 이력 확인 후 종료합니다."})},adminCookie);
  assert(abandon.response.status === 200 && abandon.body?.status === "FAILED","An uncertain check could not be closed by an admin");

  const terminate = await request(`/api/admin/employees/${testEmployeeId}/terminate`,{method:"POST"},adminCookie);
  assert(terminate.response.status === 200 && terminate.body?.status === "TERMINATED","Termination failed");
  const terminateReplay = await request(`/api/admin/employees/${testEmployeeId}/terminate`,{method:"POST"},adminCookie);
  assert(terminateReplay.response.status === 200,"Repeated termination was not idempotent");
  const revoked = await request("/api/portal/profile",{},temporaryCookie);
  assert(revoked.response.status === 403 && revoked.body?.code === "EMPLOYEE_TERMINATED","Terminated session reason was not distinguished");
  const relogin = await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({loginId:testLoginId,password:testPassword})});
  assert(relogin.response.status === 403,"Terminated employee could log in again");

  const incompleteCheck = await request("/api/admin/employees/EMP-007/background-checks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idempotencyKey:crypto.randomUUID()})},adminCookie);
  assert(incompleteCheck.response.status === 409 && incompleteCheck.body?.code === "PROFILE_INCOMPLETE","Missing date of birth did not block Background Check");

  console.log(JSON.stringify({requiredSeedEmployees:10,fullNameKoreanSort:true,employeeAdminAccess:403,ownProfile:200,accountlessEmployeeVisible:true,accountProvisioned:201,loginIdVisibleAndSearchable:true,provisionedEmployeeLogin:200,passwordReset:200,passwordResetAudited:true,passwordResetRevokedSession:401,oldPasswordBlocked:401,temporaryPasswordLogin:200,employeePasswordResetAccess:403,duplicateProvisionBlocked:409,employeeProvisionAccess:403,employeeCreated:201,loginIdReturned:true,loginIdVisibleToAdmin:true,profileUpdated:200,expiredSession:401,explicitlyRevokedSession:401,profileChangeAudited:200,employeeBackgroundCheckAccess:403,crossOriginMutation:403,idempotentReplay:200,activeCheckConflict:409,crossCommandKeyReuse:409,checkSnapshotPreserved:true,profileDifferenceReported:true,pendingAbandonBlocked:409,uncertainCheckAbandoned:200,terminationReplay:200,terminatedSession:403,terminatedRelogin:403,incompleteBackgroundCheck:409},null,2));
}

main().finally(async()=>{ await cleanup(); await db.$disconnect(); });
