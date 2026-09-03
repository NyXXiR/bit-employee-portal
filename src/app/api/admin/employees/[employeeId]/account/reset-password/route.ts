import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth";
import { resetEmployeePassword } from "@/server/employees";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { resetEmployeePasswordSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const { employeeId } = await context.params;
    const input = await parseJson(request, resetEmployeePasswordSchema);
    return NextResponse.json(await resetEmployeePassword(session, employeeId, input));
  } catch (error) {
    return routeError(error);
  }
}
