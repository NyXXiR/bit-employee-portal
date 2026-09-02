import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { abandonUncertainBackgroundCheck } from "@/server/background-checks";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { abandonCheckSchema } from "@/server/schemas";

export async function POST(request:Request,context:{params:Promise<{checkId:string}>}) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const {checkId} = await context.params;
    const {reason} = await parseJson(request,abandonCheckSchema);
    return NextResponse.json(await abandonUncertainBackgroundCheck(session,checkId,reason));
  } catch (error) {
    return routeError(error);
  }
}
