export type DomainRole = "ADMIN" | "EMPLOYEE";
export type DomainEmployeeStatus = "ACTIVE" | "TERMINATED";

export type EmployeeActor = {
  role: DomainRole;
  employeeId: string | null;
};

export function mayEditEmployee(actor:EmployeeActor,targetEmployeeId:string):boolean {
  return actor.role === "ADMIN" || actor.employeeId === targetEmployeeId;
}

export function profileIsComplete(dateOfBirth:Date|null):boolean {
  return dateOfBirth !== null;
}

export function mayRequestBackgroundCheck(status:DomainEmployeeStatus,dateOfBirth:Date|null) {
  if (status !== "ACTIVE") return {allowed:false as const,reason:"EMPLOYEE_TERMINATED" as const};
  if (!profileIsComplete(dateOfBirth)) return {allowed:false as const,reason:"PROFILE_INCOMPLETE" as const};
  return {allowed:true as const};
}

export function terminationDecision(status:DomainEmployeeStatus) {
  return status === "TERMINATED" ? "ALREADY_TERMINATED" as const : "TERMINATE" as const;
}

export type ProfileValue = string|null;
export type ProfileSnapshot = {familyName:string;givenName:string;dateOfBirth:string|null};
export type ProfilePatch = {familyName?:string;givenName?:string;dateOfBirth?:string|null};

export function profileChanges(current:ProfileSnapshot,patch:ProfilePatch) {
  const changes:Array<{field:keyof ProfileSnapshot;beforeValue:ProfileValue;afterValue:ProfileValue}> = [];
  for (const field of ["familyName","givenName","dateOfBirth"] as const) {
    if (patch[field] !== undefined && current[field] !== patch[field]) {
      changes.push({field,beforeValue:current[field],afterValue:patch[field] ?? null});
    }
  }
  return changes;
}
