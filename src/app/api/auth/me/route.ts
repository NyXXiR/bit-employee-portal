import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { routeError } from "@/server/errors";

export async function GET() {
  try {
    const session = await requireUser();
    return NextResponse.json({
      loginId: session.loginId,
      role: session.role,
      employeeId: session.employee?.employeeId ?? null,
    });
  } catch (error) {
    return routeError(error);
  }
}
