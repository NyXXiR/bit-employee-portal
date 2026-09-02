import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { createEmployee, listEmployees } from "@/server/employees";
import { AppError, assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { createEmployeeSchema, listEmployeesQuerySchema } from "@/server/schemas";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    // 화면과 달리 API 호출자에게는 잘못된 조건을 알려 준다. 사람이 주소창에
    // 오타를 낸 것과 프로그램이 잘못된 요청을 보낸 것은 다루는 방식이 다르다.
    const parsed = listEmployeesQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      throw new AppError(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "조회 조건을 확인해 주세요.");
    }

    const { filter, q, page, pageSize } = parsed.data;
    return NextResponse.json(await listEmployees({ filter, query: q, page, pageSize }));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdmin();
    const input = await parseJson(request, createEmployeeSchema);
    return NextResponse.json(await createEmployee(session, input), { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
