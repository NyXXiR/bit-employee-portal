import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { formatDateOnly } from "@/server/dates";
import { AppError } from "@/server/errors";
import type { SessionContext } from "@/server/auth";
import { activeSlotFor, ACTIVE_CHECK_SLOT, classifyCreateFailure, compareBackgroundCheckSubject, externalIdentityMatches, externalRetryAfterSeconds, idempotencyDecision, toDomainCheckStatus, toExternalBackgroundCheckRequest } from "@/domain/background-check";
import { mayRequestBackgroundCheck } from "@/domain/employee";
import { CHECK_POLL_POLICY, isRetryablePollStatus, nextPollAtMs } from "@/lib/polling";

const createdSchema = z.object({
  checkId: z.string().min(1),
  employeeId: z.string().min(1),
  status: z.enum(["pending", "clear", "flagged"]),
  createdAt: z.iso.datetime({ offset: true }),
  estimatedCompletionSeconds: z.number().int().optional(),
  message: z.string().optional(),
});

const resultSchema = z.object({
  checkId: z.string().min(1),
  employeeId: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  status: z.enum(["pending", "clear", "flagged"]),
  criminalRecord: z.boolean().nullable().optional(),
  educationVerified: z.boolean().nullable().optional(),
  employmentVerified: z.boolean().nullable().optional(),
  creditScore: z.enum(["excellent", "good", "fair", "poor"]).nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

type ExternalResult = z.infer<typeof resultSchema>;

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function checkDto(check: Awaited<ReturnType<typeof findCheck>>) {
  if (!check) throw new AppError(404, "BACKGROUND_CHECK_NOT_FOUND", "검사 기록을 찾을 수 없습니다.");
  const requestedDateOfBirth = formatDateOnly(check.dateOfBirthSnapshot);
  const profileComparison = compareBackgroundCheckSubject(
    {
      familyName: check.familyNameSnapshot,
      givenName: check.givenNameSnapshot,
      dateOfBirth: requestedDateOfBirth,
    },
    {
      familyName: check.employee.familyName,
      givenName: check.employee.givenName,
      dateOfBirth: formatDateOnly(check.employee.dateOfBirth),
    },
  );
  return {
    id: check.id,
    checkId: check.externalCheckId,
    employeeId: check.employee.employeeId,
    requestedName: `${check.familyNameSnapshot}${check.givenNameSnapshot}`,
    dateOfBirth: requestedDateOfBirth,
    profileComparison,
    nextPollAt: check.nextPollAt?.toISOString() ?? null,
    pollingStartedAt: (check.externalCreatedAt ?? check.createdAt).toISOString(),
    pollingStoppedStatus: check.pollingStoppedStatus,
    status: check.status,
    estimatedCompletionSeconds: check.estimatedSeconds,
    failureCode: check.failureCode,
    failureMessage: check.failureMessage,
    createdAt: check.createdAt.toISOString(),
    completedAt: check.externalCompletedAt?.toISOString() ?? null,
  };
}

/** 외부 응답에서 그 요청에만 실어 보낼 상세 결과. DB 모델에는 대응 컬럼이 없다. */
function transientResultDto(result: ExternalResult) {
  if (result.status !== "clear" && result.status !== "flagged") return null;
  return {
    criminalRecord: result.criminalRecord ?? null,
    educationVerified: result.educationVerified ?? null,
    employmentVerified: result.employmentVerified ?? null,
    creditScore: result.creditScore ?? null,
  };
}

function findCheck(id: string) {
  return db.backgroundCheck.findUnique({ where: { id }, include: { employee: true } });
}

async function persistExternalResult(
  check: NonNullable<Awaited<ReturnType<typeof findCheck>>>,
  result: ExternalResult,
  refreshToken: string,
  nextPollAt: Date,
) {
  const status = toDomainCheckStatus(result.status);
  const completedAt = safeDate(result.completedAt);
  const saved = await db.backgroundCheck.updateMany({
    where: { id: check.id, status: check.status, refreshToken },
    data: {
      externalCheckId: result.checkId,
      status,
      activeSlot: activeSlotFor(status),
      externalCreatedAt: check.externalCreatedAt ?? safeDate(result.createdAt),
      externalCompletedAt: completedAt,
      failureCode: null,
      failureMessage: null,
      nextPollAt,
      pollingStoppedStatus: null,
      refreshToken: null,
      refreshLeaseUntil: null,
    },
  });
  if (saved.count !== 1) throw new AppError(409, "CHECK_STATE_CHANGED", "검사 상태가 이미 변경되었습니다.");
  return db.backgroundCheck.findUniqueOrThrow({ where: { id: check.id }, include: { employee: true } });
}

async function settleInitialRequest(
  id: string,
  data: Prisma.BackgroundCheckUpdateManyMutationInput,
) {
  await db.backgroundCheck.updateMany({ where: { id, status: "REQUESTING" }, data });
  return db.backgroundCheck.findUniqueOrThrow({ where: { id }, include: { employee: true } });
}

export async function listBackgroundChecks(employeeId: string, limit = 5) {
  const employee = await db.employee.findUnique({ where: { employeeId } });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
  const take = Math.min(Math.max(limit, 1), 20);
  const [total, checks] = await db.$transaction([
    db.backgroundCheck.count({ where: { employeeRecordId: employee.id } }),
    db.backgroundCheck.findMany({
      where: { employeeRecordId: employee.id },
      include: { employee: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
  ]);
  return { checks: checks.map(checkDto), total };
}

export async function requestBackgroundCheck(
  session: SessionContext,
  employeeId: string,
  idempotencyKey: string,
) {
  const existing = await db.backgroundCheck.findUnique({
    where: { idempotencyKey },
    include: { employee: true },
  });
  if (existing) {
    if (idempotencyDecision(existing.employee.employeeId,employeeId) === "KEY_REUSED_FOR_DIFFERENT_COMMAND") {
      throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "같은 멱등 키를 다른 직원 요청에 사용할 수 없습니다.");
    }
    return { check: checkDto(existing), replayed: true };
  }

  let localCheck;
  try {
    localCheck = await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { employeeId } });
      if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "직원을 찾을 수 없습니다.");
      const eligibility = mayRequestBackgroundCheck(employee.status,employee.dateOfBirth);
      if (!eligibility.allowed) {
        if (eligibility.reason === "EMPLOYEE_TERMINATED") throw new AppError(409,"EMPLOYEE_TERMINATED","퇴사 직원은 검사를 요청할 수 없습니다.");
        throw new AppError(409,"PROFILE_INCOMPLETE","생년월일을 입력한 후 검사를 요청해 주세요.");
      }

      const created = await tx.backgroundCheck.create({
        data: {
          employeeRecordId: employee.id,
          requestedByUserId: session.userId,
          idempotencyKey,
          activeSlot: ACTIVE_CHECK_SLOT,
          familyNameSnapshot: employee.familyName,
          givenNameSnapshot: employee.givenName,
          dateOfBirthSnapshot: employee.dateOfBirth!,
        },
        include: { employee: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "BACKGROUND_CHECK_REQUESTED",
          targetType: "Employee",
          targetId: employee.employeeId,
          metadata: { localCheckId: created.id },
        },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await db.backgroundCheck.findUnique({
        where: { idempotencyKey },
        include: { employee: true },
      });
      if (replay) return { check: checkDto(replay), replayed: true };
      throw new AppError(409, "ACTIVE_CHECK_EXISTS", "이미 진행 중인 검사가 있습니다.");
    }
    throw error;
  }

  try {
    const response = await fetch(`${env.backgroundCheckApiUrl}/background-checks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toExternalBackgroundCheckRequest({
        employeeId,
        familyName: localCheck.familyNameSnapshot,
        givenName: localCheck.givenNameSnapshot,
        dateOfBirth: formatDateOnly(localCheck.dateOfBirthSnapshot)!,
      })),
      signal: AbortSignal.timeout(env.backgroundCheckPostTimeoutMs),
      cache: "no-store",
    });

    const body: unknown = await response.json().catch(() => null);
    if (response.status !== 201) {
      const failure = classifyCreateFailure(response.status);
      const updated = await settleInitialRequest(localCheck.id, {
          status: failure.status,
          activeSlot: activeSlotFor(failure.status),
          failureCode: failure.code,
          failureMessage: "외부 검사 요청이 정상적으로 접수되지 않았습니다.",
      });
      return { check: checkDto(updated), replayed: false };
    }

    const parsed = createdSchema.safeParse(body);
    if (!parsed.success) {
      const updated = await settleInitialRequest(localCheck.id, {
          status: "UNKNOWN",
          failureCode: "INVALID_EXTERNAL_RESPONSE",
          failureMessage: "외부 API 응답 형식이 명세와 다릅니다.",
      });
      return { check: checkDto(updated), replayed: false };
    }

    if (!externalIdentityMatches({ employeeId }, parsed.data)) {
      const updated = await settleInitialRequest(localCheck.id, {
        status: "UNKNOWN",
        activeSlot: ACTIVE_CHECK_SLOT,
        failureCode: "EXTERNAL_IDENTITY_MISMATCH",
        failureMessage: "외부 API 응답의 검사 대상이 요청과 일치하지 않습니다.",
      });
      return { check: checkDto(updated), replayed: false };
    }

    const status = toDomainCheckStatus(parsed.data.status);
    const updated = await settleInitialRequest(localCheck.id, {
        externalCheckId: parsed.data.checkId,
        status,
        activeSlot: activeSlotFor(status),
        externalCreatedAt: safeDate(parsed.data.createdAt),
        nextPollAt: new Date(new Date(parsed.data.createdAt).getTime() + CHECK_POLL_POLICY.firstDelayMs),
        estimatedSeconds: parsed.data.estimatedCompletionSeconds,
    });
    return { check: checkDto(updated), replayed: false };
  } catch (error) {
    const updated = await settleInitialRequest(localCheck.id, {
        status: "UNKNOWN",
        activeSlot: ACTIVE_CHECK_SLOT,
        failureCode: error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR",
        failureMessage: "외부 요청 결과를 확정할 수 없어 자동 재요청하지 않습니다.",
    });
    return { check: checkDto(updated), replayed: false };
  }
}

export async function refreshBackgroundCheck(localCheckId: string, mode: "automatic" | "manual" = "manual") {
  const check = await findCheck(localCheckId);
  if (!check) throw new AppError(404, "BACKGROUND_CHECK_NOT_FOUND", "검사 기록을 찾을 수 없습니다.");
  if (check.status === "FAILED") return { ...checkDto(check), result: null };
  if (!check.externalCheckId) {
    throw new AppError(409, "CHECK_RESULT_UNKNOWN", "외부 검사 ID가 없어 자동 조회할 수 없습니다.");
  }

  const now = Date.now();
  const startedAt = (check.externalCreatedAt ?? check.createdAt).getTime();
  if (mode === "automatic") {
    if (now >= startedAt + CHECK_POLL_POLICY.maxPollingDurationMs) {
      throw new AppError(409, "AUTOMATIC_POLLING_ENDED", "자동 조회 시간이 끝났습니다. 같은 검사 ID로 수동 조회할 수 있습니다.");
    }
    if (check.pollingStoppedStatus !== null) {
      throw new AppError(check.pollingStoppedStatus, check.failureCode ?? "POLLING_STOPPED", check.failureMessage ?? "자동 조회가 중지되었습니다.");
    }
  }
  const firstPollAt = startedAt + CHECK_POLL_POLICY.firstDelayMs;
  const waitUntil = Math.max(firstPollAt, check.nextPollAt?.getTime() ?? 0);
  if (now < waitUntil) {
    throw new AppError(503, "CHECK_POLL_WAIT", "다음 조회 가능 시각까지 기다려 주세요.", Math.ceil((waitUntil - now) / 1000));
  }
  if (check.refreshLeaseUntil && now < check.refreshLeaseUntil.getTime()) {
    throw new AppError(503, "CHECK_POLL_WAIT", "다른 조회가 진행 중입니다.", 2);
  }

  // DB의 조건부 갱신으로 탭·프로세스 사이에서도 한 요청만 외부 GET을 실행한다.
  // 만료 가능한 예약과 토큰은 중단된 프로세스의 예약 복구 및 늦은 응답의 덮어쓰기를 막는다.
  const refreshToken = randomUUID();
  const refreshLeaseUntil = new Date(now + Math.max(30_000, env.backgroundCheckGetTimeoutMs + 5_000));
  const reserved = await db.backgroundCheck.updateMany({
    where: {
      id: check.id, status: check.status,
      ...(mode === "automatic" ? { pollingStoppedStatus: null } : {}),
      AND: [
        { OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date(now) } }] },
        { OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lte: new Date(now) } }] },
      ],
    },
    data: { refreshToken, refreshLeaseUntil },
  });
  if (reserved.count !== 1) {
    const current = await findCheck(check.id);
    const dueAt = current?.nextPollAt?.getTime() ?? 0;
    throw new AppError(503, "CHECK_POLL_WAIT", "다른 조회가 진행 중이거나 대기 중입니다.", Math.max(2, Math.ceil((dueAt - Date.now()) / 1000)));
  }

  let advice: number | undefined;
  try {
    const response = await fetch(
      `${env.backgroundCheckApiUrl}/background-checks/${encodeURIComponent(check.externalCheckId)}`,
      { signal: AbortSignal.timeout(env.backgroundCheckGetTimeoutMs), cache: "no-store" },
    );
    advice = externalRetryAfterSeconds(response.headers.get("retry-after"), null);
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      advice = externalRetryAfterSeconds(response.headers.get("retry-after"), errorBody);
      throw new AppError(
        response.status >= 500 ? 503 : response.status,
        "BACKGROUND_CHECK_UNAVAILABLE",
        "외부 검사 결과를 조회하지 못했습니다.",
        advice,
      );
    }
    const body: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return null;
      throw error;
    });
    advice = externalRetryAfterSeconds(response.headers.get("retry-after"), body);
    const parsed = resultSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(502, "INVALID_EXTERNAL_RESPONSE", "외부 API 응답 형식이 명세와 다릅니다.");
    }
    if (!externalIdentityMatches(
      { checkId: check.externalCheckId, employeeId: check.employee.employeeId },
      parsed.data,
    )) {
      throw new AppError(502, "EXTERNAL_IDENTITY_MISMATCH", "외부 API 응답의 검사 대상이 요청과 일치하지 않습니다.");
    }
    const persisted = await persistExternalResult(check, parsed.data, refreshToken, new Date(nextPollAtMs(Date.now(), advice)));
    return { ...checkDto(persisted), result: transientResultDto(parsed.data) };
  } catch (error) {
    const failure = error instanceof AppError ? error : new AppError(503, "BACKGROUND_CHECK_UNAVAILABLE", "외부 검사 결과를 조회하지 못했습니다.");
    const retryable = isRetryablePollStatus(failure.statusCode);
    const nextPollAt = new Date(nextPollAtMs(Date.now(), advice));
    await db.backgroundCheck.updateMany({
      where: { id: check.id, refreshToken },
      data: {
        nextPollAt, refreshToken: null, refreshLeaseUntil: null,
        pollingStoppedStatus: retryable ? null : failure.statusCode,
        failureCode: failure.code, failureMessage: failure.message,
      },
    });
    // 조회 장애는 PENDING을 FAILED로 바꾸거나 활성 자리를 비우지 않는다.
    throw new AppError(failure.statusCode, failure.code, failure.message, Math.max(2, advice ?? 0));
  }
}

export async function abandonUncertainBackgroundCheck(session:SessionContext,localCheckId:string,reason:string) {
  return db.$transaction(async(tx)=>{
    const check = await tx.backgroundCheck.findUnique({where:{id:localCheckId},include:{employee:true}});
    if (!check) throw new AppError(404,"BACKGROUND_CHECK_NOT_FOUND","검사 기록을 찾을 수 없습니다.");
    if (check.status === "FAILED" && check.failureCode === "ABANDONED_BY_ADMIN") return checkDto(check);
    if (check.status !== "UNKNOWN" && check.status !== "REQUESTING") {
      throw new AppError(409,"CHECK_NOT_UNCERTAIN","불확실 상태의 검사만 관리자가 종료할 수 있습니다.");
    }
    const updated = await tx.backgroundCheck.updateMany({
      where:{id:localCheckId,status:{in:["UNKNOWN","REQUESTING"]},activeSlot:ACTIVE_CHECK_SLOT},
      data:{status:"FAILED",activeSlot:null,failureCode:"ABANDONED_BY_ADMIN",failureMessage:reason},
    });
    if (updated.count !== 1) throw new AppError(409,"CHECK_STATE_CHANGED","검사 상태가 이미 변경되었습니다.");
    await tx.auditLog.create({data:{actorUserId:session.userId,action:"BACKGROUND_CHECK_ABANDONED",targetType:"BackgroundCheck",targetId:localCheckId,metadata:{employeeId:check.employee.employeeId,reason}}});
    return checkDto(await tx.backgroundCheck.findUniqueOrThrow({where:{id:localCheckId},include:{employee:true}}));
  });
}
