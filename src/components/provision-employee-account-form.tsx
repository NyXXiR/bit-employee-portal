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
import { Input } from "@/components/ui/input";

export function ProvisionEmployeeAccountDialog({
  employeeId,
  fullName,
}: {
  employeeId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}/account`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loginId: form.get("loginId"),
          initialPassword: form.get("initialPassword"),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? "로그인 계정을 발급하지 못했습니다.");
        return;
      }

      setOpen(false);
      toast.success(`${fullName} 계정 발급 완료 · 로그인 아이디 ${body.loginId}`);
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
          <p className="font-medium">로그인 계정이 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            계정을 발급해야 직원 포털에 로그인할 수 있습니다.
          </p>
        </div>
        <DialogTrigger asChild>
          <Button>
            <KeyRoundIcon />
            계정 발급
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{fullName} 로그인 계정 발급</DialogTitle>
            <DialogDescription>
              아이디와 초기 비밀번호를 정해 직원에게 전달하세요. 초기 비밀번호는 발급 후 다시
              표시되지 않습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="provisionLoginId" label="로그인 아이디" required hint="3자 이상">
              <Input
                id="provisionLoginId"
                name="loginId"
                minLength={3}
                maxLength={80}
                autoComplete="off"
                required
              />
            </FormField>
            <FormField
              id="provisionPassword"
              label="초기 비밀번호"
              required
              hint="10자 이상"
            >
              <PasswordInput
                id="provisionPassword"
                name="initialPassword"
                minLength={10}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </FormField>
          </div>

          <FormError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
              {pending ? "발급 중…" : "계정 발급"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
