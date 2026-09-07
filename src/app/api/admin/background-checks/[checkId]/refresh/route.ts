import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { refreshBackgroundCheck } from "@/server/background-checks";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";

export async function POST(request: Request, context: { params: Promise<{ checkId: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { checkId } = await context.params;
    const { mode } = await parseJson(request, z.object({ mode: z.enum(["automatic", "manual"]) }));
    const response = NextResponse.json(await refreshBackgroundCheck(checkId, mode));
    // 상세 결과는 요청 순간에만 전달한다. 브라우저나 중간 캐시에 남기지 않는다.
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return routeError(error);
  }
}
