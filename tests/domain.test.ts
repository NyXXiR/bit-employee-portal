import test from "node:test";
import assert from "node:assert/strict";
import { activeSlotFor, classifyCreateFailure, compareBackgroundCheckSubject, externalIdentityMatches, externalRetryAfterSeconds, idempotencyDecision, isFinalCheckStatus, retryAfterSeconds, toDomainCheckStatus, toExternalBackgroundCheckRequest } from "../src/domain/background-check";
import { mayEditEmployee, mayRequestBackgroundCheck, profileChanges, terminationDecision } from "../src/domain/employee";

test("employee may edit only their own profile while an admin may edit any profile",()=>{
  assert.equal(mayEditEmployee({role:"EMPLOYEE",employeeId:"EMP-001"},"EMP-001"),true);
  assert.equal(mayEditEmployee({role:"EMPLOYEE",employeeId:"EMP-001"},"EMP-002"),false);
  assert.equal(mayEditEmployee({role:"ADMIN",employeeId:null},"EMP-002"),true);
});

test("background check eligibility requires an active employee and date of birth",()=>{
  assert.deepEqual(mayRequestBackgroundCheck("ACTIVE",new Date("1990-01-01")),{allowed:true});
  assert.deepEqual(mayRequestBackgroundCheck("ACTIVE",null),{allowed:false,reason:"PROFILE_INCOMPLETE"});
  assert.deepEqual(mayRequestBackgroundCheck("TERMINATED",new Date("1990-01-01")),{allowed:false,reason:"EMPLOYEE_TERMINATED"});
});

test("profile change set contains only changed fields",()=>{
  assert.deepEqual(profileChanges({familyName:"김",givenName:"민준",dateOfBirth:null},{familyName:"김",dateOfBirth:"1990-03-15"}),[{field:"dateOfBirth",beforeValue:null,afterValue:"1990-03-15"}]);
});

test("termination command is naturally idempotent",()=>{
  assert.equal(terminationDecision("ACTIVE"),"TERMINATE");
  assert.equal(terminationDecision("TERMINATED"),"ALREADY_TERMINATED");
});

test("background check state determines the unique active slot",()=>{
  assert.equal(toDomainCheckStatus("pending"),"PENDING");
  assert.equal(activeSlotFor("REQUESTING"),"ACTIVE");
  assert.equal(activeSlotFor("UNKNOWN"),"ACTIVE");
  assert.equal(activeSlotFor("CLEAR"),null);
  assert.equal(isFinalCheckStatus("FLAGGED"),true);
});

test("4xx is definitive while 5xx remains ambiguous",()=>{
  assert.deepEqual(classifyCreateFailure(400),{status:"FAILED",code:"HTTP_400"});
  assert.deepEqual(classifyCreateFailure(503),{status:"UNKNOWN",code:"HTTP_503"});
});

test("idempotency key cannot identify a different employee command",()=>{
  assert.equal(idempotencyDecision("EMP-001","EMP-001"),"REPLAY");
  assert.equal(idempotencyDecision("EMP-001","EMP-002"),"KEY_REUSED_FOR_DIFFERENT_COMMAND");
});

test("external result identity must match the local command", () => {
  assert.equal(externalIdentityMatches({employeeId:"EMP-001"},{checkId:"CHK-1",employeeId:"EMP-001"}),true);
  assert.equal(externalIdentityMatches({employeeId:"EMP-001"},{checkId:"CHK-1",employeeId:"EMP-002"}),false);
  assert.equal(externalIdentityMatches({checkId:"CHK-1",employeeId:"EMP-001"},{checkId:"CHK-2",employeeId:"EMP-001"}),false);
});

test("Korean family and given names map explicitly to the external contract", () => {
  assert.deepEqual(
    toExternalBackgroundCheckRequest({employeeId:"EMP-003",familyName:"남궁",givenName:"서준",dateOfBirth:"1988-07-21"}),
    {employeeId:"EMP-003",firstName:"서준",lastName:"남궁",dateOfBirth:"1988-07-21"},
  );
});

test("Retry-After prefers a valid response header and falls back to the body", () => {
  assert.equal(retryAfterSeconds("30", 45), 30);
  assert.equal(retryAfterSeconds(null, 45), 45);
  assert.equal(retryAfterSeconds("invalid", "20"), 20);
  assert.equal(retryAfterSeconds("-1", null), undefined);
});

test("external 503 retryAfter is read from the observed JSON body when the header is absent", () => {
  const observedBody = {
    error: "Service Unavailable",
    message: "The service is currently overloaded.",
    retryAfter: 30,
    statusCode: 503,
  };

  assert.equal(externalRetryAfterSeconds(null, observedBody), 30);
  assert.equal(externalRetryAfterSeconds("45", observedBody), 45);
  assert.equal(externalRetryAfterSeconds(null, { statusCode: 503 }), undefined);
});

test("profile changes never rewrite a check snapshot and are reported from one domain rule", () => {
  const requested = {familyName:"남궁",givenName:"서준",dateOfBirth:"1988-07-21"};

  assert.deepEqual(compareBackgroundCheckSubject(requested, requested), {
    matchesCurrentProfile:true,
    changedFields:[],
  });
  assert.deepEqual(
    compareBackgroundCheckSubject(requested, {familyName:"남궁",givenName:"서준",dateOfBirth:"1988-07-22"}),
    {matchesCurrentProfile:false,changedFields:["dateOfBirth"]},
  );
  assert.deepEqual(
    compareBackgroundCheckSubject(requested, {familyName:"남",givenName:"궁서준",dateOfBirth:null}),
    {matchesCurrentProfile:false,changedFields:["familyName","givenName","dateOfBirth"]},
  );
});
