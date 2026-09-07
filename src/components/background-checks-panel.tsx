"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  automaticPollDelayMs,
  nextPollAtMs,
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
  nextPollAt: string | null;
  pollingStartedAt: string;
  pollingStoppedStatus: number | null;
  profileComparison: { matchesCurrentProfile: boolean; changedFields: string[] };
};

const OPEN_STATUSES = ["REQUESTING", "PENDING", "UNKNOWN"];
const RESULT_STATUSES = ["CLEAR", "FLAGGED"];

type TransientCheckResult = {
  criminalRecord: boolean | null;
  educationVerified: boolean | null;
  employmentVerified: boolean | null;
  creditScore: string | null;
};

type ClientCheckView = CheckView & {
  result: TransientCheckResult | null;
  lifecycleActive: boolean;
};

type RefreshResponse = Partial<CheckView> & {
  status?: string;
  result?: TransientCheckResult | null;
  message?: string;
  retryAfter?: unknown;
};

function clientCheck(check: CheckView, newlyRequested = false): ClientCheckView {
  return {
    ...check,
    result: null,
    lifecycleActive:
      OPEN_STATUSES.includes(check.status) ||
      (newlyRequested && RESULT_STATUSES.includes(check.status) && check.checkId !== null),
  };
}

export function BackgroundChecksPanel({
  employeeId,
  profileComplete,
  active,
  checks,
  total,
}: {
  employeeId: string;
  profileComplete: boolean;
  active: boolean;
  checks: CheckView[];
  total: number;
}) {
  const [requesting, setRequesting] = useState(false);
  const requestInFlight = useRef(false);
  const [historyTotal, setHistoryTotal] = useState(total);
  const [currentChecks, setCurrentChecks] = useState<ClientCheckView[]>(() =>
    checks.map((check) => clientCheck(check)),
  );
  const [previousChecks, setPreviousChecks] = useState(checks);
  if (previousChecks !== checks) {
    setPreviousChecks(checks);
    // 프로필 수정 후 서버 props가 갱신되어도 현재 화면에서 받은 상세 결과는 유지한다.
    setCurrentChecks((current) => current.map((check) => {
      const updated = checks.find((item) => item.id === check.id);
      return updated ? { ...check, profileComparison: updated.profileComparison } : check;
    }));
  }

  const hasOpen = currentChecks.some((check) => OPEN_STATUSES.includes(check.status));
  const canRequest = !requesting && !hasOpen && profileComplete && active;

  function upsertCheck(next: ClientCheckView) {
    setCurrentChecks((current) => {
      const found = current.some((check) => check.id === next.id);
      return found
        ? current.map((check) => (check.id === next.id ? next : check))
        : [next, ...current].slice(0, 5);
    });
  }

  async function reloadLocalChecks() {
    const response = await fetch(
      `/api/admin/employees/${encodeURIComponent(employeeId)}/background-checks`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) return;
    const body = (await response.json().catch(() => null)) as {
      checks?: unknown;
      total?: unknown;
    } | null;
    if (!body || !Array.isArray(body.checks) || typeof body.total !== "number") return;
    setCurrentChecks(body.checks.map((check: CheckView) => clientCheck(check)));
    setHistoryTotal(body.total);
  }

  async function requestCheck() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
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
        const next = clientCheck(body.check as CheckView, true);
        if (!body.replayed) setHistoryTotal((count) => count + 1);
        upsertCheck(next);
        if (next.status === "UNKNOWN" || next.status === "FAILED") {
          toast.warning(next.failureMessage ?? "검사 요청 결과를 확정하지 못했습니다.");
        } else {
          toast.success("Background Check를 요청했습니다.");
        }
      }
    } catch {
      // 생성 POST는 응답 유실 시 실제 생성 여부를 모르므로 자동 재요청하지 않는다.
      toast.error("외부 검사 요청 결과를 확인하지 못했습니다. 잠시 후 상태를 확인해 주세요.");
      await reloadLocalChecks();
    } finally {
      requestInFlight.current = false;
      setRequesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background Check</CardTitle>
        <CardDescription>
          결과는 관리자에게만 표시됩니다. 최근 {Math.min(historyTotal, 5)}건
          {historyTotal > 5 ? ` · 전체 ${historyTotal}건` : ""}
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={requestCheck} disabled={!canRequest}>
            {requesting ? <Loader2Icon className="animate-spin" /> : <ShieldPlusIcon />}
            {hasOpen ? "진행 중" : "새 검사 실행"}
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

        {currentChecks.length === 0 ? (
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
            {currentChecks.map((check, index) => (
              <li key={check.id} className="grid gap-3">
                {index > 0 ? <Separator /> : null}
                <CheckItem check={check} onChange={upsertCheck} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CheckItem({
  check,
  onChange,
}: {
  check: ClientCheckView;
  onChange: (check: ClientCheckView) => void;
}) {
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

      {!check.profileComparison.matchesCurrentProfile ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>현재 직원 정보와 다른 검사입니다</AlertTitle>
          <AlertDescription>
            변경 항목: {check.profileComparison.changedFields.map((field) => ({ familyName: "성", givenName: "이름", dateOfBirth: "생년월일" })[field] ?? field).join(", ")}.
            이 검사는 위 요청 당시 정보 기준입니다.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasResult && check.result ? (
        <TransientResultDisclosure result={check.result} />
      ) : hasResult ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          상세 결과는 보관하지 않습니다. 이 검사에서는 완료 상태만 확인할 수 있습니다.
        </p>
      ) : null}

      {/*
       * key를 검사 id로 두어, 다른 검사로 바뀌면 시도 횟수가 자연히 0부터 다시 센다.
       * 이펙트 안에서 상태를 되돌리는 것보다 마운트 경계로 처리하는 편이 명확하다.
       */}
      {check.lifecycleActive || isOpen ? (
        <CheckProgress key={check.id} check={check} onChange={onChange} />
      ) : null}
    </div>
  );
}

/**
 * 완료 결과는 현재 화면 메모리에만 둔다. 열기·닫기는 표시만 전환한다.
 * 페이지 이탈·새로고침 이후에는 완료 상태만 남고 상세 결과를 재조회하지 않는다.
 */
function TransientResultDisclosure({ result }: { result: TransientCheckResult }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
        <p className="text-xs text-muted-foreground">
          검사 진행 중 받은 상세 결과입니다. 화면을 벗어나면 보관하지 않습니다.
        </p>
        <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
          <EyeIcon />
          결과 보기
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">외부 서비스에서 방금 조회한 결과</p>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
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
function CheckProgress({ check, onChange }: {
  check: ClientCheckView;
  onChange: (check: ClientCheckView) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [auto, setAuto] = useState(true);
  const [polling, setPolling] = useState(false);
  // SSR와 첫 브라우저 렌더는 같은 준비 상태로 시작하고, 마운트 후 시간을 표시한다.
  const [now, setNow] = useState<number | null>(null);
  const [localNextAt, setLocalNextAt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [stopped, setStopped] = useState(check.pollingStoppedStatus !== null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const startedAt = new Date(check.pollingStartedAt).getTime();
  const deadlineAt = startedAt + CHECK_POLL_POLICY.maxPollingDurationMs;
  const dueAt = Math.max(startedAt + CHECK_POLL_POLICY.firstDelayMs,
    check.nextPollAt ? new Date(check.nextPollAt).getTime() : 0, localNextAt);
  const deadlineReached = now !== null && now >= deadlineAt;
  const remainingSeconds = now === null ? 0 : Math.max(0, Math.ceil((dueAt - now) / 1000));
  const pollable = check.checkId !== null && check.status !== "UNKNOWN";
  const abandonable = check.status === "UNKNOWN" || check.status === "REQUESTING";
  const autoEnabled = now !== null && pollable && auto && !deadlineReached && !stopped;

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      requestController.current?.abort();
    };
  }, []);

  const poll = useCallback(async (mode: "automatic" | "manual") => {
    const requestAt = Date.now();
    if (inFlight.current || requestAt < dueAt || !pollable) return;
    if (mode === "automatic" && (requestAt >= deadlineAt || stopped)) return;
    inFlight.current = true;
    setPolling(true);
    const controller = new AbortController();
    requestController.current = controller;
    let nextAt = nextPollAtMs(requestAt);
    try {
      const response = await fetch(`/api/admin/background-checks/${check.id}/refresh`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }), signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!mounted.current) return;
      nextAt = nextPollAtMs(Date.now(), retryAfterSeconds(response.headers.get("retry-after"), body?.retryAfter));
      if (!response.ok) {
        const retryable = isRetryablePollStatus(response.status);
        setStopped(!retryable);
        setMessage(body?.message ?? "결과를 조회하지 못했습니다.");
        if (!retryable) setAuto(false);
      } else if (!body || typeof body.status !== "string" || body.id !== check.id) {
        setStopped(true);
        setAuto(false);
        setMessage("조회 응답 형식을 확인할 수 없어 자동 조회를 중지했습니다.");
      } else {
        setStopped(false);
        setMessage(null);
        onChange({ ...check, ...body, status: body.status,
          result: body.result ?? check.result, lifecycleActive: OPEN_STATUSES.includes(body.status) });
      }
    } catch {
      if (mounted.current) {
        nextAt = nextPollAtMs(Date.now());
        setMessage("조회 응답을 받지 못했습니다. 같은 검사 ID로 다시 조회합니다.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setLocalNextAt(nextAt);
        setNow(Date.now());
        setAttempt((count) => count + 1);
        setPolling(false);
      }
    }
  }, [check, deadlineAt, dueAt, onChange, pollable, stopped]);

  useEffect(() => {
    if (!autoEnabled || polling) return;
    const delay = automaticPollDelayMs(Date.now(), startedAt, dueAt);
    if (delay === null) return;
    // 절대 시각으로 예약하므로 렌더·중지/재개가 대기시간을 초기화하지 않는다.
    const timer = setTimeout(() => void poll("automatic"), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [autoEnabled, polling, startedAt, dueAt, poll]);

  return (
    <div className="grid gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground" aria-live="polite">
        {now === null ? (
          <>조회 상태를 확인하고 있습니다</>
        ) : check.status === "UNKNOWN" ? (
          <>검사 생성 여부를 확인할 수 없습니다 · 사유를 남겨 종료한 뒤 새 검사를 실행할 수 있습니다</>
        ) : !pollable ? (
          <>외부 검사 ID를 아직 받지 못했습니다</>
        ) : stopped ? (
          <>{message ?? check.failureMessage ?? "응답을 확인해 주세요."} · 자동 조회 중지</>
        ) : deadlineReached ? (
          <>3분의 자동 조회가 끝났습니다 · 검사 실패를 뜻하지 않으며 같은 ID로 수동 조회할 수 있습니다</>
        ) : autoEnabled ? (
          <><Loader2Icon className="size-3.5 animate-spin" />자동 조회 중 · 이 화면에서 {attempt}회 조회</>
        ) : (
          <>자동 조회가 꺼져 있습니다</>
        )}
      </span>
      {message && !stopped ? <p className="text-muted-foreground">{message}</p> : null}
      {pollable && remainingSeconds > 0 && !polling ? (
        <p className="text-muted-foreground">다음 조회까지 {remainingSeconds}초 대기 · 서버 권고 대기시간을 포함합니다</p>
      ) : null}
      {check.estimatedCompletionSeconds && attempt === 0 ? (
        <span className="text-muted-foreground">예상 완료 약 {check.estimatedCompletionSeconds}초</span>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5">
        {abandonable && !autoEnabled ? (
          <AbandonCheckDialog checkId={check.id} externalCheckId={check.checkId}
            onAbandoned={(updated) => onChange({ ...check, ...updated, result: null, lifecycleActive: false })} />
        ) : null}
        {pollable ? <>
          {!deadlineReached && !stopped ? (
            <Button variant="ghost" size="xs" onClick={() => setAuto((enabled) => !enabled)}>
              {autoEnabled ? <PauseIcon /> : <PlayIcon />}{autoEnabled ? "중지" : "자동 조회"}
            </Button>
          ) : null}
          <Button variant="outline" size="xs" disabled={now === null || polling || remainingSeconds > 0} onClick={() => void poll("manual")}>
            {polling ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}같은 검사 조회
          </Button>
        </> : null}
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
