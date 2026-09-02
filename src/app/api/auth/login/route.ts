import { NextResponse } from "next/server";
import { authenticate, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { assertSameOrigin, parseJson, routeError } from "@/server/errors";
import { loginSchema } from "@/server/schemas";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, loginSchema);
    const session = await authenticate(input.loginId, input.password);
    const response = NextResponse.json({ role: session.role });
    response.cookies.set(SESSION_COOKIE, session.rawToken, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return routeError(error);
  }
}
