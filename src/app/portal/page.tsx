import { redirect } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/profile-form";
import { EmploymentBadge } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginRedirectPath } from "@/lib/auth-redirect";
import { getCurrentSession } from "@/server/auth";
import { getMyProfile } from "@/server/employees";

export default async function PortalPage() {
  const session = await getCurrentSession();
  if (!session) redirect(await loginRedirectPath());
  if (session.role !== "EMPLOYEE") redirect("/admin");

  const employee = await getMyProfile(session);

  return (
    <AppShell role="EMPLOYEE" loginId={session.loginId}>
      <PageHeader
        title="내 정보"
        description="개인 인적사항을 확인하고 최신 상태로 유지해 주세요."
        actions={<EmploymentBadge status={employee.status} />}
      />

      {!employee.profileComplete ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon />
          <AlertTitle>생년월일 확인이 필요합니다</AlertTitle>
          <AlertDescription>
            정보를 보완해야 인사 담당자가 Background Check를 진행할 수 있습니다.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 직원 화면에는 Background Check 결과를 노출하지 않는다. */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>개인 인적사항</CardTitle>
          <CardDescription>{employee.fullName} · {employee.employeeId}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm employee={employee} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
