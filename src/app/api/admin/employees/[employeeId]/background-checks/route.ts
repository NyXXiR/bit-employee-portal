import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { listBackgroundChecks, requestBackgroundCheck } from "@/server/background-checks";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { createCheckSchema } from "@/server/schemas";

type Context = { params: Promise<{ employeeId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    const { employeeId } = await context.params;
    return NextResponse.json(await listBackgroundChecks(employeeId));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const { employeeId } = await context.params;
    const { idempotencyKey } = await parseJson(request, createCheckSchema);
    const result = await requestBackgroundCheck(session, employeeId, idempotencyKey);
    return NextResponse.json(result, { status: result.replayed ? 200 : 202 });
  } catch (error) {
    return routeError(error);
  }
}
