"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleSlashIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** 서버의 abandonCheckSchema와 같은 값. 제출 전에 화면에서 먼저 알린다. */
const MIN_REASON = 10;
const MAX_REASON = 500;

/*
 * 불확실한 검사를 관리자가 종료한다.
 *
 * 외부 API가 5xx를 돌려주면 검사가 실제로 만들어졌는지 알 수 없는 UNKNOWN 상태가
 * 된다. 이 상태의 검사는 직원별 활성 검사 자리를 계속 차지하므로, 종료하지 않으면
 * 그 직원에게 새 검사를 요청할 수 없다.
 *
 * 자동으로 정리하지 않는 이유는 외부에 검사가 남아 있을 수 있어서다. 무엇을 근거로
 * 없는 것으로 판단했는지 사람이 적어야 하고, 그 근거가 감사 기록에 남는다.
 */
export function AbandonCheckDialog({
  checkId,
  externalCheckId,
  onAbandoned,
}: {
  checkId: string;
  externalCheckId: string | null;
  onAbandoned?: (check: {
    id: string;
    status: string;
    failureCode: string | null;
    failureMessage: string | null;
  }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const tooShort = reason.trim().length < MIN_REASON;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = await fetch(`/api/admin/background-checks/${checkId}/abandon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const body = await response.json().catch(() => null);
    setPending(false);

    if (!response.ok) {
      setError(body?.message ?? "검사를 종료하지 못했습니다.");
      return;
    }

    setOpen(false);
    setReason("");
    toast.success("검사를 종료했습니다. 이제 새 검사를 요청할 수 있습니다.");
    if (onAbandoned) onAbandoned(body);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs">
          <CircleSlashIcon />
          검사 종료
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>불확실한 검사를 종료할까요?</DialogTitle>
            <DialogDescription>
              이 검사는 외부 응답을 받지 못해 실제로 생성되었는지 확인되지 않았습니다. 종료하면
              실패로 기록되고 활성 검사 자리가 풀려 새 검사를 요청할 수 있습니다. 외부에 검사가
              남아 있을 수 있으므로 판단 근거를 남깁니다.
            </DialogDescription>
          </DialogHeader>

          {externalCheckId ? (
            <p className="text-sm text-muted-foreground">
              외부 검사 ID <span className="font-mono text-xs">{externalCheckId}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              외부 검사 ID를 받지 못한 요청입니다.
            </p>
          )}

          <FormField
            id="abandonReason"
            label="종료 근거"
            required
            hint={`${MIN_REASON}자 이상 · 감사 기록에 그대로 남습니다`}
          >
            <Textarea
              id="abandonReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REASON}
              rows={3}
              required
              placeholder="예: 외부 API에서 해당 employeeId의 검사 이력을 조회했으나 기록이 없음을 확인함"
            />
          </FormField>

          <FormError message={error} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button type="submit" variant="destructive-solid" disabled={pending || tooShort}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {pending ? "종료 중…" : "검사 종료"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
