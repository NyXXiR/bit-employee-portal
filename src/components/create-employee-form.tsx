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
import { useFormValidation } from "@/components/use-form-validation";
import { createEmployeeSchema, todayInSeoul } from "@/lib/form-validation";

export function CreateEmployeeForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const validation = useFormValidation(createEmployeeSchema);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const target = event.currentTarget;
    const form = new FormData(target);
    const date = String(form.get("dateOfBirth") ?? "");
    const input = validation.validate({
      familyName: form.get("familyName"), givenName: form.get("givenName"), dateOfBirth: date || null,
      loginId: form.get("loginId"), initialPassword: form.get("initialPassword"),
    }, target);
    if (!input) return;
    setPending(true);
    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
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
    } catch { setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setPending(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {/*
        * items-start가 없으면 그리드 항목이 줄 높이만큼 늘어나, 힌트가 있는 칸과
        * 없는 칸의 입력 상자가 서로 다른 높이에 놓인다.
        *
        * 순서는 "사람 먼저, 계정 나중"이다. 성과 이름은 반드시 같은 줄에 둔다 —
        * 한 사람의 이름을 두 줄에 나눠 입력하게 만들 이유가 없다.
        */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField id="newFamilyName" label="성" required hint="복성은 두 글자 그대로 입력합니다." error={validation.errors.familyName}>
          <Input id="newFamilyName" name="familyName" maxLength={40} {...validation.fieldProps("familyName", "newFamilyName")} required />
        </FormField>

        <FormField id="newGivenName" label="이름" required error={validation.errors.givenName}>
          <Input id="newGivenName" name="givenName" maxLength={40} {...validation.fieldProps("givenName", "newGivenName")} required />
        </FormField>

        <FormField
          id="newDateOfBirth"
          label="생년월일"
          error={validation.errors.dateOfBirth}
          hint="비워 두면 직원이 직접 보완할 수 있습니다."
        >
          <Input id="newDateOfBirth" name="dateOfBirth" type="date" min="0001-01-01" max={todayInSeoul()} {...validation.fieldProps("dateOfBirth", "newDateOfBirth")} />
        </FormField>

        <FormField id="newLoginId" label="로그인 아이디" required hint="3~80자 · 공백 제외" error={validation.errors.loginId}>
          <Input id="newLoginId" name="loginId" minLength={3} maxLength={80} {...validation.fieldProps("loginId", "newLoginId")} required autoComplete="off" />
        </FormField>

        {/* 힌트가 길어 한 줄에 담기지 않으므로 폭 전체를 쓴다. */}
        <FormField
          id="newPassword"
          label="초기 비밀번호"
          error={validation.errors.initialPassword}
          required
          hint="10자 이상 · 직원에게 그대로 전달되므로 눈으로 확인해 주세요"
          className="sm:col-span-2"
        >
          <PasswordInput
            id="newPassword"
            name="initialPassword"
            minLength={10}
            maxLength={200}
            {...validation.fieldProps("initialPassword", "newPassword")}
            autoComplete="new-password"
            required
          />
        </FormField>
      </div>

      <FormError message={error || validation.errors._form} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          {pending ? "생성 중…" : "직원 계정 생성"}
        </Button>
      </div>
    </form>
  );
}
