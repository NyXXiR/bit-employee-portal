import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { listProfileChanges } from "@/server/employees";
import { routeError } from "@/server/errors";

export async function GET(_request:Request,context:{params:Promise<{employeeId:string}>}) {
  try {
    await requireAdmin();
    const {employeeId} = await context.params;
    return NextResponse.json(await listProfileChanges(employeeId));
  } catch (error) {
    return routeError(error);
  }
}
