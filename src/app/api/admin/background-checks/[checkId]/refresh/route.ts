import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { refreshBackgroundCheck } from "@/server/background-checks";
import { assertSameOrigin, routeError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ checkId: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { checkId } = await context.params;
    return NextResponse.json(await refreshBackgroundCheck(checkId));
  } catch (error) {
    return routeError(error);
  }
}
