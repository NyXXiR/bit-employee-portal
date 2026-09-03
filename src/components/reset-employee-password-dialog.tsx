"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
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

export function ResetEmployeePasswordDialog({
  employeeId,
  fullName,
  loginId,
}: {
  employeeId: string;
  fullName: string;
  loginId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setPending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeId)}/account/reset-password`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ temporaryPassword: form.get("temporaryPassword") }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? "비밀번호를 초기화하지 못했습니다.");
        return;
      }

      target.reset();
      setOpen(false);
      toast.success(
        `${fullName} 비밀번호를 초기화했습니다. 기존 로그인 세션 ${body.sessionsRevoked}개를 종료했습니다.`,
      );
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        if (!nextOpen) setError("");
      }}
    >
      <div className="mt-6 flex items-center justify-between gap-4 border-t pt-6">
        <div>
          <p className="font-medium">로그인 비밀번호 복구</p>
          <p className="mt-1 text-sm text-muted-foreground">
            직원이 비밀번호를 잊은 경우 새 임시 비밀번호를 설정합니다.
          </p>
        </div>
        <DialogTrigger asChild>
          <Button variant="outline">
            <KeyRoundIcon />
            비밀번호 초기화
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{fullName} 비밀번호 초기화</DialogTitle>
            <DialogDescription>
              로그인 아이디는 {loginId}입니다. 새 임시 비밀번호를 설정하면 기존 비밀번호와
              로그인된 모든 세션이 즉시 무효화됩니다.
            </DialogDescription>
          </DialogHeader>

          <FormField
            id="temporaryPassword"
            label="새 임시 비밀번호"
            required
            hint="10자 이상 · 설정 후에는 다시 표시되지 않습니다."
          >
            <PasswordInput
              id="temporaryPassword"
              name="temporaryPassword"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </FormField>

          <FormError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
              {pending ? "초기화 중…" : "비밀번호 초기화"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
