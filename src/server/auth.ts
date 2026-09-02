import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import type { EmployeeStatus, Role } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

export const SESSION_COOKIE = "employee_portal_session";

export interface SessionContext {
  sessionId: string;
  userId: string;
  loginId: string;
  role: Role;
  employee: null | {
    id: string;
    employeeId: string;
    status: EmployeeStatus;
  };
}

export type SessionRejectionReason =
  | "MISSING"
  | "INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "EMPLOYEE_TERMINATED";

export type SessionResolution =
  | { authenticated: true; session: SessionContext }
  | { authenticated: false; reason: SessionRejectionReason };

function hashToken(token: string): string {
  return createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
    priority: "high" as const,
  };
}

export async function authenticate(loginId: string, password: string) {
  const user = await db.user.findUnique({
    where: { loginId },
    include: { employee: true },
  });

  if (!user || !(await compare(password, user.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  if (user.role === "EMPLOYEE" && user.employee?.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_TERMINATED", "퇴사 처리된 계정은 접근할 수 없습니다.");
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000);
  await db.$transaction([
    db.session.create({
      data: { tokenHash: hashToken(rawToken), userId: user.id, expiresAt },
    }),
    db.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "LOGIN_SUCCEEDED",
        targetType: "User",
        targetId: user.id,
      },
    }),
  ]);

  return { rawToken, expiresAt, role: user.role };
}

async function readSessionResolution(): Promise<SessionResolution> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { authenticated: false, reason: "MISSING" };

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { employee: true } } },
  });
  if (!session) return { authenticated: false, reason: "INVALID" };

  const employee = session.user.employee;
  if (session.user.role === "EMPLOYEE" && employee?.status !== "ACTIVE") {
    return { authenticated: false, reason: "EMPLOYEE_TERMINATED" };
  }
  if (session.revokedAt) return { authenticated: false, reason: "REVOKED" };
  if (session.expiresAt <= new Date()) return { authenticated: false, reason: "EXPIRED" };

  return {
    authenticated: true,
    session: {
      sessionId: session.id,
      userId: session.user.id,
      loginId: session.user.loginId,
      role: session.user.role,
      employee: employee
        ? { id: employee.id, employeeId: employee.employeeId, status: employee.status }
        : null,
    },
  };
}

export const getSessionResolution = cache(readSessionResolution);

export async function getCurrentSession(): Promise<SessionContext | null> {
  const resolution = await getSessionResolution();
  return resolution.authenticated ? resolution.session : null;
}

export async function requireUser(): Promise<SessionContext> {
  const resolution = await getSessionResolution();
  if (resolution.authenticated) return resolution.session;

  if (resolution.reason === "EMPLOYEE_TERMINATED") {
    throw new AppError(403, "EMPLOYEE_TERMINATED", "퇴사 처리된 계정은 접근할 수 없습니다.");
  }
  if (resolution.reason === "EXPIRED") {
    throw new AppError(401, "SESSION_EXPIRED", "로그인 세션이 만료되었습니다.");
  }
  if (resolution.reason === "REVOKED") {
    throw new AppError(401, "SESSION_REVOKED", "로그인 세션의 접근 권한이 회수되었습니다.");
  }
  throw new AppError(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.");
}

export async function requireAdmin(): Promise<SessionContext> {
  const session = await requireUser();
  if (session.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "관리자 권한이 필요합니다.");
  }
  return session;
}

export async function revokeCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({where:{tokenHash}});
  if (!session || session.revokedAt) return;
  const now = new Date();
  await db.$transaction([
    db.session.update({where:{id:session.id},data:{revokedAt:now}}),
    db.auditLog.create({data:{actorUserId:session.userId,action:"LOGOUT",targetType:"User",targetId:session.userId}}),
  ]);
}
