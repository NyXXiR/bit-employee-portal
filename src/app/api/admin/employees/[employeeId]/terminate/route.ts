import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { terminateEmployee } from "@/server/employees";
import { assertSameOrigin, routeError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const { employeeId } = await context.params;
    return NextResponse.json(await terminateEmployee(session, employeeId));
  } catch (error) {
    return routeError(error);
  }
}
