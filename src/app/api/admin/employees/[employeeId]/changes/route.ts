import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { listProfileChanges } from "@/server/employees";
import { AppError, routeError } from "@/server/errors";
import { listProfileChangesQuerySchema } from "@/server/schemas";

export async function GET(request:Request,context:{params:Promise<{employeeId:string}>}) {
  try {
    await requireAdmin();
    const {employeeId} = await context.params;
    const url = new URL(request.url);
    const parsed = listProfileChangesQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "조회 조건을 확인해 주세요.");
    }
    return NextResponse.json(await listProfileChanges(employeeId, parsed.data));
  } catch (error) {
    return routeError(error);
  }
}
