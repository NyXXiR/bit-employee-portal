"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  // 퇴사한 직원의 정보는 읽기 전용이다. 서버에서도 동일하게 거부하며,
  // 여기서의 disabled는 권한 통제가 아니라 잘못된 시도를 줄이는 보조 수단이다.
  const readOnly = employee.status !== "ACTIVE";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const dateOfBirth = String(form.get("dateOfBirth") ?? "");
    const endpoint = admin
      ? `/api/admin/employees/${encodeURIComponent(employee.employeeId)}`
      : "/api/portal/profile";
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        familyName: form.get("familyName"),
        givenName: form.get("givenName"),
        dateOfBirth: dateOfBirth || (admin ? null : undefined),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? "수정하지 못했습니다.");
    } else {
      toast.success("직원 정보를 저장했습니다.");
      router.refresh();
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="familyName" label="성" required hint="복성은 두 글자 그대로 입력합니다.">
          <Input
            id="familyName"
            name="familyName"
            defaultValue={employee.familyName}
            required
            disabled={readOnly}
          />
        </FormField>

        <FormField id="givenName" label="이름" required>
          <Input
            id="givenName"
            name="givenName"
            defaultValue={employee.givenName}
            required
            disabled={readOnly}
          />
        </FormField>

        <FormField
          id="dateOfBirth"
          label="생년월일"
          required={!admin}
          hint="Background Check 요청에 반드시 필요합니다."
        >
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={employee.dateOfBirth ?? ""}
            required={!admin}
            disabled={readOnly}
          />
        </FormField>

        <FormField id="employeeId" label="사번" hint="사번은 변경할 수 없습니다.">
          <Input id="employeeId" value={employee.employeeId} disabled className="font-mono" />
        </FormField>

        {admin ? (
          <FormField id="accountLoginId" label="로그인 아이디" hint="직원에게 전달할 계정 아이디입니다.">
            <Input
              id="accountLoginId"
              value={employee.loginId ?? "계정 미발급"}
              disabled
              className="font-mono"
            />
          </FormField>
        ) : null}
      </div>

      <FormError message={error} />

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
