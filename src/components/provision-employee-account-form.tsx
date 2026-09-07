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
import { useFormValidation } from "@/components/use-form-validation";
import { provisionEmployeeAccountSchema } from "@/lib/form-validation";

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
  const validation = useFormValidation(provisionEmployeeAccountSchema);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const input = validation.validate({ loginId: form.get("loginId"), initialPassword: form.get("initialPassword") }, event.currentTarget);
    if (!input) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}/account`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
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
        if (!nextOpen) { setError(""); validation.clear(); }
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
            <FormField id="provisionLoginId" label="로그인 아이디" required hint="3~80자 · 공백 제외" error={validation.errors.loginId}>
              <Input
                id="provisionLoginId"
                name="loginId"
                {...validation.fieldProps("loginId", "provisionLoginId")}
                minLength={3}
                maxLength={80}
                autoComplete="off"
                required
              />
            </FormField>
            <FormField
              id="provisionPassword"
              label="초기 비밀번호"
              error={validation.errors.initialPassword}
              required
              hint="10자 이상"
            >
              <PasswordInput
                id="provisionPassword"
                name="initialPassword"
                {...validation.fieldProps("initialPassword", "provisionPassword")}
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
