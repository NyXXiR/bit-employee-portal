import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { ZodType } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) throw new AppError(403, "INVALID_ORIGIN", "요청 출처를 확인할 수 없습니다.");

  let originUrl:URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new AppError(403,"INVALID_ORIGIN","허용되지 않은 요청 출처입니다.");
  }
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",",1)[0];
  const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : new URL(request.url).protocol;
  if (originUrl.host !== host || originUrl.protocol !== expectedProtocol) {
    throw new AppError(403, "INVALID_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const headers = error.retryAfter === undefined
      ? undefined
      : { "Retry-After": String(error.retryAfter) };
    return NextResponse.json(
      {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
      },
      { status: error.statusCode, headers },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json(
      { statusCode: 409, code: "RESOURCE_CONFLICT", message: "이미 존재하는 데이터입니다." },
      { status: 409 },
    );
  }

  console.error("Unhandled route error", error);
  return NextResponse.json(
    { statusCode: 500, code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." },
    { status: 500 },
  );
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "올바른 JSON 요청이 아닙니다.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_FAILED", result.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  }
  return result.data;
}
