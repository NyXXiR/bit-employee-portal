import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { provisionEmployeeAccount } from "@/server/employees";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { provisionEmployeeAccountSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const { employeeId } = await context.params;
    const input = await parseJson(request, provisionEmployeeAccountSchema);
    return NextResponse.json(
      await provisionEmployeeAccount(session, employeeId, input),
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
