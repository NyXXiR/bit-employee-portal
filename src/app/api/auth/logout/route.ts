import { NextResponse } from "next/server";
import { revokeCurrentSession, SESSION_COOKIE } from "@/server/auth";
import { assertSameOrigin, routeError } from "@/server/errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeCurrentSession();
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return routeError(error);
  }
}
