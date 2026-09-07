"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormValidation } from "@/components/use-form-validation";
import { updateProfileSchema, todayInSeoul } from "@/lib/form-validation";

export type EmployeeView = {
  employeeId: string;
  loginId?: string | null;
  familyName: string;
  givenName: string;
  fullName: string;
  dateOfBirth: string | null;
  profileComplete: boolean;
  status: "ACTIVE" | "TERMINATED";
  terminatedAt: string | null;
};

export function ProfileForm({
  employee,
  admin = false,
}: {
  employee: EmployeeView;
  admin?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const validation = useFormValidation(updateProfileSchema);

  // 퇴사한 직원의 정보는 읽기 전용이다. 서버에서도 동일하게 거부하며,
  // 여기서의 disabled는 권한 통제가 아니라 잘못된 시도를 줄이는 보조 수단이다.
  const readOnly = employee.status !== "ACTIVE";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const dateOfBirth = String(form.get("dateOfBirth") ?? "");
    const input = validation.validate({
      familyName: form.get("familyName"), givenName: form.get("givenName"),
      dateOfBirth: dateOfBirth || (admin ? null : undefined),
    }, event.currentTarget);
    if (!input) return;
    setPending(true);
    const endpoint = admin
      ? `/api/admin/employees/${encodeURIComponent(employee.employeeId)}`
      : "/api/portal/profile";
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? "수정하지 못했습니다.");
      } else {
        toast.success("직원 정보를 저장했습니다.");
        router.refresh();
      }
    } catch { setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setPending(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {/*
        * 사번과 로그인 아이디는 바꿀 수 없는 값이다. 비활성 입력 상자로 두면
        * "지금은 못 고치지만 고칠 수 있는 값"처럼 보이는 데다, 브라우저가 선택을
        * 막아 직원에게 전달할 아이디를 복사할 수도 없다. 읽는 값이므로 목록으로 적는다.
        */}
      <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-4 gap-y-1.5 border-b pb-4 text-sm">
        <dt className="text-muted-foreground">사번</dt>
        <dd className="font-mono">{employee.employeeId}</dd>
        {admin ? (
          <>
            <dt className="text-muted-foreground">로그인 아이디</dt>
            <dd className={employee.loginId ? "font-mono" : "text-muted-foreground"}>
              {employee.loginId ?? "계정 미발급"}
            </dd>
          </>
        ) : null}
      </dl>

      {/*
        * items-start가 없으면 그리드 항목이 줄 높이만큼 늘어나, 힌트가 있는 칸과
        * 없는 칸의 입력 상자가 서로 다른 높이에 놓인다.
        */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField id="familyName" label="성" required hint="복성은 두 글자 그대로 입력합니다." error={validation.errors.familyName}>
          <Input
            id="familyName"
            name="familyName"
            maxLength={40}
            {...validation.fieldProps("familyName")}
            defaultValue={employee.familyName}
            required
            disabled={readOnly}
          />
        </FormField>

        <FormField id="givenName" label="이름" required error={validation.errors.givenName}>
          <Input
            id="givenName"
            name="givenName"
            maxLength={40}
            {...validation.fieldProps("givenName")}
            defaultValue={employee.givenName}
            required
            disabled={readOnly}
          />
        </FormField>

        <FormField
          id="dateOfBirth"
          label="생년월일"
          error={validation.errors.dateOfBirth}
          required={!admin}
          hint="Background Check 요청에 반드시 필요합니다."
        >
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            min="0001-01-01"
            max={todayInSeoul()}
            {...validation.fieldProps("dateOfBirth")}
            defaultValue={employee.dateOfBirth ?? ""}
            required={!admin}
            disabled={readOnly}
          />
        </FormField>
      </div>

      <FormError message={error || validation.errors._form} />

      {readOnly ? null : (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {pending ? "저장 중…" : "변경사항 저장"}
          </Button>
        </div>
      )}
    </form>
  );
}
