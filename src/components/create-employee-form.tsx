"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateEmployeeForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const target = event.currentTarget;
    const form = new FormData(target);
    const date = String(form.get("dateOfBirth") ?? "");
    const response = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        familyName: form.get("familyName"),
        givenName: form.get("givenName"),
        dateOfBirth: date || null,
        loginId: form.get("loginId"),
        initialPassword: form.get("initialPassword"),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? "직원을 생성하지 못했습니다.");
    } else {
      toast.success(`${body.fullName} 직원 생성 완료 · 로그인 아이디 ${body.loginId}`);
      target.reset();
      router.refresh();
      // 다이얼로그 안에서 쓰일 때는 성공 후 닫는다. 결과는 뒤의 목록에 바로 보인다.
      onCreated?.();
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="newLoginId" label="로그인 아이디" required hint="3자 이상">
          <Input id="newLoginId" name="loginId" minLength={3} required autoComplete="off" />
        </FormField>

        <FormField id="newFamilyName" label="성" required>
          <Input id="newFamilyName" name="familyName" required />
        </FormField>

        <FormField id="newGivenName" label="이름" required>
          <Input id="newGivenName" name="givenName" required />
        </FormField>

        <FormField
          id="newDateOfBirth"
          label="생년월일"
          hint="비워 두면 직원이 직접 보완할 수 있습니다."
        >
          <Input id="newDateOfBirth" name="dateOfBirth" type="date" />
        </FormField>

        <FormField
          id="newPassword"
          label="초기 비밀번호"
          required
          hint="10자 이상 · 직원에게 그대로 전달되므로 눈으로 확인해 주세요"
        >
          <PasswordInput
            id="newPassword"
            name="initialPassword"
            minLength={10}
            autoComplete="new-password"
            required
          />
        </FormField>
      </div>

      <FormError message={error} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          {pending ? "생성 중…" : "직원 계정 생성"}
        </Button>
      </div>
    </form>
  );
}
