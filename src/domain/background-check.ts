export type DomainCheckStatus = "REQUESTING"|"PENDING"|"CLEAR"|"FLAGGED"|"FAILED"|"UNKNOWN";
export type ExternalCheckStatus = "pending"|"clear"|"flagged";
export type BackgroundCheckSubjectField = "familyName" | "givenName" | "dateOfBirth";

export type BackgroundCheckSubject = {
  familyName: string;
  givenName: string;
  dateOfBirth: string | null;
};

export type BackgroundCheckSubjectComparison = {
  matchesCurrentProfile: boolean;
  changedFields: BackgroundCheckSubjectField[];
};

export const ACTIVE_CHECK_SLOT = "ACTIVE";

export function toDomainCheckStatus(status:ExternalCheckStatus):DomainCheckStatus {
  return status.toUpperCase() as DomainCheckStatus;
}

export function isFinalCheckStatus(status:DomainCheckStatus):boolean {
  return status === "CLEAR" || status === "FLAGGED" || status === "FAILED";
}

export function activeSlotFor(status:DomainCheckStatus):string|null {
  return isFinalCheckStatus(status) ? null : ACTIVE_CHECK_SLOT;
}

export function classifyCreateFailure(httpStatus:number):{status:DomainCheckStatus;code:string} {
  if (httpStatus >= 400 && httpStatus < 500) return {status:"FAILED",code:`HTTP_${httpStatus}`};
  return {status:"UNKNOWN",code:`HTTP_${httpStatus}`};
}

export function idempotencyDecision(existingEmployeeId:string,targetEmployeeId:string) {
  return existingEmployeeId === targetEmployeeId ? "REPLAY" as const : "KEY_REUSED_FOR_DIFFERENT_COMMAND" as const;
}

export function externalIdentityMatches(
  expected: { checkId?: string | null; employeeId: string },
  actual: { checkId: string; employeeId: string },
): boolean {
  return (
    (expected.checkId === undefined || expected.checkId === null || expected.checkId === actual.checkId) &&
    expected.employeeId === actual.employeeId
  );
}

export function toExternalBackgroundCheckRequest(input: {
  employeeId: string;
  familyName: string;
  givenName: string;
  dateOfBirth: string;
}) {
  return {
    employeeId: input.employeeId,
    firstName: input.givenName,
    lastName: input.familyName,
    dateOfBirth: input.dateOfBirth,
  };
}

export function retryAfterSeconds(
  headerValue: string | null,
  bodyValue: unknown,
): number | undefined {
  const candidates = [headerValue, bodyValue];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

/**
 * 검사 요청 당시의 대상과 현재 직원 프로필을 비교한다.
 *
 * 프로필 변경은 과거 검사 스냅샷을 수정하거나 자동 재검사를 만들지 않는다.
 * 이 결과는 관리자에게 두 정보가 달라졌다는 판단 근거만 제공한다.
 */
export function compareBackgroundCheckSubject(
  requested: BackgroundCheckSubject,
  current: BackgroundCheckSubject,
): BackgroundCheckSubjectComparison {
  const changedFields: BackgroundCheckSubjectField[] = [];
  if (requested.familyName !== current.familyName) changedFields.push("familyName");
  if (requested.givenName !== current.givenName) changedFields.push("givenName");
  if (requested.dateOfBirth !== current.dateOfBirth) changedFields.push("dateOfBirth");

  return {
    matchesCurrentProfile: changedFields.length === 0,
    changedFields,
  };
}
