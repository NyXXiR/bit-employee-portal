import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getEmployee, updateEmployeeProfile } from "@/server/employees";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { updateProfileSchema } from "@/server/schemas";

type Context = { params: Promise<{ employeeId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    const { employeeId } = await context.params;
    return NextResponse.json(await getEmployee(employeeId));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const { employeeId } = await context.params;
    const input = await parseJson(request, updateProfileSchema);
    return NextResponse.json(await updateEmployeeProfile(session, employeeId, input));
  } catch (error) {
    return routeError(error);
  }
}
