import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { getMyProfile, updateEmployeeProfile } from "@/server/employees";
import { AppError, assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { updateProfileSchema } from "@/server/schemas";

export async function GET() {
  try {
    return NextResponse.json(await getMyProfile(await requireUser()));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireUser();
    if (!session.employee) {
      throw new AppError(403, "EMPLOYEE_PROFILE_REQUIRED", "직원 프로필이 없습니다.");
    }
    const input = await parseJson(request, updateProfileSchema);
    return NextResponse.json(await updateEmployeeProfile(session, session.employee.employeeId, input));
  } catch (error) {
    return routeError(error);
  }
}
