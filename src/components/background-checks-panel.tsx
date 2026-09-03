"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldPlusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AbandonCheckDialog } from "@/components/abandon-check-dialog";
import { CheckStatusBadge } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { retryAfterSeconds } from "@/domain/background-check";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CHECK_POLL_POLICY,
  isRetryablePollStatus,
  pollDelayMs,
} from "@/lib/polling";

export type CheckView = {
  id: string;
  checkId: string | null;
  employeeId: string;
  requestedName: string;
  dateOfBirth: string | null;
  status: string;
  estimatedCompletionSeconds: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

const OPEN_STATUSES = ["REQUESTING", "PENDING", "UNKNOWN"];
const RESULT_STATUSES = ["CLEAR", "FLAGGED"];

type TransientCheckResult = {
  criminalRecord: boolean | null;
  educationVerified: boolean | null;
  employmentVerified: boolean | null;
  creditScore: string | null;
};

export function BackgroundChecksPanel({
  employeeId,
  profileComplete,
  active,
  checks,
}: {
  employeeId: string;
  profileComplete: boolean;
  active: boolean;
  checks: CheckView[];
}) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);

  const hasOpen = checks.some((check) => OPEN_STATUSES.includes(check.status));
  const canRequest = !requesting && !hasOpen && profileComplete && active;

  async function requestCheck() {
    setRequesting(true);
    try {
      const response = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeId)}/background-checks`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          // 멱등성 키는 클라이언트에서 만든다. 같은 클릭이 재전송되어도
          // 서버가 같은 요청으로 인식해 중복 검사를 만들지 않는다.
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) toast.error(body?.message ?? "검사를 요청하지 못했습니다.");
      else {
        toast.success("Background Check를 요청했습니다.");
        router.refresh();
      }
    } catch {
      // 생성 POST는 응답 유실 시 실제 생성 여부를 모르므로 자동 재요청하지 않는다.
      toast.error("외부 검사 요청 결과를 확인하지 못했습니다. 잠시 후 상태를 확인해 주세요.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background Check</CardTitle>
        <CardDescription>결과는 관리자에게만 표시됩니다.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={requestCheck} disabled={!canRequest}>
            {requesting ? <Loader2Icon className="animate-spin" /> : <ShieldPlusIcon />}
            {hasOpen ? "진행 중" : "검사 요청"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        {!profileComplete && active ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>생년월일이 필요합니다</AlertTitle>
            <AlertDescription>
              직원 정보를 먼저 보완해야 검사를 요청할 수 있습니다.
            </AlertDescription>
          </Alert>
        ) : null}

        {checks.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheckIcon />
              </EmptyMedia>
              <EmptyTitle>검사 이력이 없습니다</EmptyTitle>
              <EmptyDescription>
                아직 이 직원에 대해 요청된 Background Check가 없습니다.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-4">
            {checks.map((check, index) => (
              <li key={check.id} className="grid gap-3">
                {index > 0 ? <Separator /> : null}
                <CheckItem check={check} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CheckItem({ check }: { check: CheckView }) {
  const hasResult = RESULT_STATUSES.includes(check.status);
  const isOpen = OPEN_STATUSES.includes(check.status);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{formatDateTime(check.createdAt)}</span>
        <CheckStatusBadge status={check.status} />
      </div>

      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Row label="외부 검사 ID">
          <span className="font-mono text-xs">{check.checkId ?? "미확정"}</span>
        </Row>
        {/*
         * 요청 시점의 이름과 생년월일 스냅샷을 그대로 보여준다.
         * 이후 프로필이 수정되어도 이 검사가 무엇으로 조회되었는지 남아야 한다.
         */}
        <Row label="요청 정보">
          {check.requestedName}
          {check.dateOfBirth ? ` · ${formatDate(check.dateOfBirth)}` : ""}
        </Row>

        {check.failureMessage ? <Row label="안내">{check.failureMessage}</Row> : null}
      </dl>

      {hasResult && check.checkId ? <TransientResultDisclosure check={check} /> : null}

      {/*
       * key를 검사 id로 두어, 다른 검사로 바뀌면 시도 횟수가 자연히 0부터 다시 센다.
       * 이펙트 안에서 상태를 되돌리는 것보다 마운트 경계로 처리하는 편이 명확하다.
       */}
      {isOpen ? <CheckProgress key={check.id} check={check} /> : null}
    </div>
  );
}

/**
 * 완료 결과는 사용자가 명시적으로 요청한 동안에만 컴포넌트 메모리에 둔다.
 * 닫거나 페이지를 벗어나면 버리고, 다시 볼 때 외부 API를 새로 조회한다.
 */
function TransientResultDisclosure({ check }: { check: CheckView }) {
  const [result, setResult] = useState<TransientCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/background-checks/${check.id}/refresh`, {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.message ?? "검사 결과를 조회하지 못했습니다.");
        return;
      }
      if (!body?.result) {
        toast.error("외부 서비스에서 완료된 상세 결과를 받지 못했습니다.");
        return;
      }
      setResult(body.result);
    } catch {
      toast.error("외부 검사 결과를 조회하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
        <p className="text-xs text-muted-foreground">
          상세 결과는 로컬에 저장하지 않으며 열람할 때 외부 서비스에서 조회합니다.
        </p>
        <Button variant="outline" size="xs" disabled={loading} onClick={reveal}>
          {loading ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
          {loading ? "조회 중…" : "결과 보기"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">외부 서비스에서 방금 조회한 결과</p>
        <Button variant="ghost" size="xs" onClick={() => setResult(null)}>
          <EyeOffIcon />
          결과 닫기
        </Button>
      </div>
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Row label="범죄 기록">{booleanResult(result.criminalRecord, "확인됨", "없음")}</Row>
        <Row label="학력 검증">{booleanResult(result.educationVerified, "완료", "미확인")}</Row>
        <Row label="경력 검증">{booleanResult(result.employmentVerified, "완료", "미확인")}</Row>
        <Row label="신용 등급">{result.creditScore ?? "미확인"}</Row>
      </dl>
    </div>
  );
}

function booleanResult(value: boolean | null, yes: string, no: string) {
  if (value === null) return "미확인";
  return value ? yes : no;
}

/**
 * 진행 중인 검사 하나의 재조회를 담당한다.
 * 자동 조회의 현재 상태와 멈춘 이유를 화면에 그대로 드러내는 것이 목적이다.
 */
function CheckProgress({ check }: { check: CheckView }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [auto, setAuto] = useState(true);
  const [polling, setPolling] = useState(false);
  const [serverRetryAfterSeconds, setServerRetryAfterSeconds] = useState<number | null>(null);
  const [stoppedMessage, setStoppedMessage] = useState<string | null>(null);

  // 외부 검사 ID가 없으면 조회할 대상 자체가 없다. 재요청으로만 회복된다.
  const pollable = check.checkId !== null && check.status !== "UNKNOWN";
  /*
   * 서버가 종료를 허용하는 상태와 같게 맞춘다(UNKNOWN, REQUESTING).
   * 자동 조회가 돌고 있는 동안에는 감춰 둔다 — 곧 스스로 풀릴 수 있는 것을
   * 사람이 실패로 확정하게 만들 이유가 없다.
   */
  const abandonable = check.status === "UNKNOWN" || check.status === "REQUESTING";
  const exhausted = attempt >= CHECK_POLL_POLICY.maxAttempts;
  const unreachable = consecutiveErrors >= CHECK_POLL_POLICY.maxConsecutiveErrors;
  const autoEnabled = pollable && auto && !exhausted && !unreachable && !stoppedMessage;
  const shouldSchedule = autoEnabled && !polling;

  async function poll() {
    setPolling(true);
    let ok = false;
    let retryable = true;
    let nextRetryAfter: number | null = null;
    let errorMessage = "결과를 조회하지 못했습니다.";
    try {
      const response = await fetch(`/api/admin/background-checks/${check.id}/refresh`, {
        method: "POST",
      });
      ok = response.ok;
      if (!ok) {
        const body = await response.json().catch(() => null);
        retryable = isRetryablePollStatus(response.status);
        errorMessage = body?.message ?? errorMessage;
        if (response.status === 503) {
          nextRetryAfter = retryAfterSeconds(
            response.headers.get("retry-after"),
            body?.retryAfter,
          ) ?? null;
        }
        // 자동 조회 중에는 토스트를 띄우지 않는다. 실패가 반복되면 화면의
        // 상태 문구가 대신 알리고, 임계값에 닿으면 스스로 멈춘다.
        if (!auto || !retryable) toast.error(errorMessage);
      }
    } catch {
      ok = false;
      retryable = true;
    }
    setServerRetryAfterSeconds(nextRetryAfter);
    setAttempt((n) => n + 1);
    setConsecutiveErrors((n) => (ok || !retryable ? 0 : n + 1));
    setStoppedMessage(ok || retryable ? null : errorMessage);
    if (!ok && !retryable) setAuto(false);
    setPolling(false);
    if (ok) router.refresh();
  }

  useEffect(() => {
    if (!shouldSchedule) return;
    const timer = setTimeout(
      poll,
      pollDelayMs(
        attempt,
        check.estimatedCompletionSeconds,
        serverRetryAfterSeconds,
        consecutiveErrors,
      ),
    );
    return () => clearTimeout(timer);
    // poll은 매 렌더 새로 만들어지지만 타이머는 아래 값이 바뀔 때만 다시 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shouldSchedule,
    attempt,
    check.id,
    check.estimatedCompletionSeconds,
    serverRetryAfterSeconds,
    consecutiveErrors,
    polling,
  ]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {autoEnabled ? (
          <>
            <Loader2Icon className="size-3.5 animate-spin" />
            자동 조회 중 · {attempt}/{CHECK_POLL_POLICY.maxAttempts}회
          </>
        ) : check.status === "UNKNOWN" ? (
          // 이전 문구는 "다시 요청해 주세요"였는데, 이 검사가 활성 자리를 잡고
          // 있어서 실제로는 다시 요청할 수 없었다. 할 수 없는 일을 안내하지 않는다.
          <>외부 응답을 받지 못해 검사 생성 여부를 확인할 수 없습니다 · 종료해야 새 검사를 요청할 수 있습니다</>
        ) : !pollable ? (
          <>외부 검사 ID를 아직 받지 못했습니다</>
        ) : stoppedMessage ? (
          <>{stoppedMessage} · 자동 재시도 대상이 아니므로 중지</>
        ) : unreachable ? (
          <>외부 API 응답을 받지 못했습니다 · 연속 {consecutiveErrors}회 실패로 중지</>
        ) : exhausted ? (
          <>{CHECK_POLL_POLICY.maxAttempts}회 조회했지만 아직 진행 중입니다</>
        ) : (
          <>자동 조회가 꺼져 있습니다</>
        )}
      </span>

      {/* Swagger가 폴링 주기의 근거로 지목한 값. 화면에서도 근거가 보이게 둔다. */}
      {check.estimatedCompletionSeconds && attempt === 0 ? (
        <span className="text-muted-foreground">
          예상 완료 약 {check.estimatedCompletionSeconds}초
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-1.5">
        {abandonable && !autoEnabled ? (
          <AbandonCheckDialog checkId={check.id} externalCheckId={check.checkId} />
        ) : null}

        {pollable ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                if (autoEnabled) {
                  setAuto(false);
                  return;
                }
                if (exhausted || unreachable || stoppedMessage) {
                  setAttempt(0);
                  setConsecutiveErrors(0);
                  setServerRetryAfterSeconds(null);
                  setStoppedMessage(null);
                }
                setAuto(true);
              }}
            >
              {autoEnabled ? <PauseIcon /> : <PlayIcon />}
              {autoEnabled ? "중지" : "자동 조회"}
            </Button>

            <Button variant="outline" size="xs" disabled={polling} onClick={poll}>
              {polling ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              지금 조회
            </Button>
          </>
        ) : null}
      </span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
