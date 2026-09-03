import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BackgroundChecksPanel } from "@/components/background-checks-panel";
import { PageHeader } from "@/components/page-header";
import { ProfileChanges } from "@/components/profile-changes";
import { ProfileForm } from "@/components/profile-form";
import { ProvisionEmployeeAccountDialog } from "@/components/provision-employee-account-form";
import { ResetEmployeePasswordDialog } from "@/components/reset-employee-password-dialog";
import { EmploymentBadge } from "@/components/status";
import { TerminateButton } from "@/components/terminate-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginRedirectPath } from "@/lib/auth-redirect";
import { formatDateTime } from "@/lib/format";
import { getCurrentSession } from "@/server/auth";
import { listBackgroundChecks } from "@/server/background-checks";
import { getEmployee, listProfileChanges } from "@/server/employees";
import { AppError } from "@/server/errors";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect(await loginRedirectPath());
  if (session.role !== "ADMIN") redirect("/portal");

  const { employeeId } = await params;

  /*
   * 없는 사번은 예상 가능한 입력이다. 주소창을 직접 고치면 바로 여기로 온다.
   * 도메인 계층의 404를 그대로 흘려보내면 일반 오류 화면이 뜨므로,
   * 이 세그먼트의 not-found.tsx로 넘겨 목록으로 되돌아갈 길을 준다.
   */
  const employee = await getEmployee(employeeId).catch((error: unknown) => {
    if (error instanceof AppError && error.statusCode === 404) notFound();
    throw error;
  });

  const [checkPage, changePage] = await Promise.all([
    listBackgroundChecks(employeeId, 5),
    listProfileChanges(employeeId, { limit: 5 }),
  ]);

  const terminatedAt = formatDateTime(employee.terminatedAt);

  return (
    <AppShell role="ADMIN" loginId={session.loginId}>
      <PageHeader
        breadcrumb={
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            직원 목록
          </Link>
        }
        title={employee.fullName}
        description={<span className="font-mono">{employee.employeeId}</span>}
        actions={
          employee.status === "ACTIVE" ? (
            <TerminateButton
              employeeId={employee.employeeId}
              fullName={employee.fullName}
            />
          ) : (
            <EmploymentBadge status={employee.status} />
          )
        }
      />

      {/* 경고는 탭 바깥에 둔다. 어느 탭을 보고 있든 알아야 하는 사실이다. */}
      {employee.status !== "ACTIVE" ? (
        <Alert className="mb-6">
          <TriangleAlertIcon />
          <AlertTitle>퇴사 처리된 직원입니다</AlertTitle>
          <AlertDescription>
            {terminatedAt ? `${terminatedAt}에 퇴사 처리되었습니다. ` : ""}
            기록은 보존되지만 정보 수정과 신규 검사 요청은 불가능합니다.
          </AlertDescription>
        </Alert>
      ) : !employee.profileComplete ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon />
          <AlertTitle>프로필 보완이 필요합니다</AlertTitle>
          <AlertDescription>
            생년월일을 대신 입력하면 Background Check를 진행할 수 있습니다.
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
       * 세 덩어리를 나란히 놓으면 어느 것도 제 폭을 못 갖는다. 탭으로 나누고
       * 전환은 클라이언트에서 처리한다 — 서버 왕복 없이 즉시 바뀌고,
       * 관리자가 한 직원을 보며 정보와 검사를 오갈 때 기다릴 이유가 없다.
       */}
      <Tabs defaultValue="profile">
        <TabsList variant="line">
          <TabsTrigger value="profile">정보</TabsTrigger>
          <TabsTrigger value="checks">
            Background Check
            {checkPage.total > 0 ? <Count n={checkPage.total} /> : null}
          </TabsTrigger>
          <TabsTrigger value="history">
            변경 이력
            {changePage.total > 0 ? <Count n={changePage.total} /> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>직원 정보</CardTitle>
              <CardDescription>변경 내역은 이력 탭과 감사 기록에 남습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm employee={employee} admin />
              {employee.status === "ACTIVE" && employee.loginId === null ? (
                <ProvisionEmployeeAccountDialog
                  employeeId={employee.employeeId}
                  fullName={employee.fullName}
                />
              ) : employee.status === "ACTIVE" && employee.loginId ? (
                <ResetEmployeePasswordDialog
                  employeeId={employee.employeeId}
                  fullName={employee.fullName}
                  loginId={employee.loginId}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checks" className="pt-6">
          <BackgroundChecksPanel
            employeeId={employee.employeeId}
            profileComplete={employee.profileComplete}
            active={employee.status === "ACTIVE"}
            checks={checkPage.checks}
            total={checkPage.total}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-6">
          <ProfileChanges employeeId={employee.employeeId} initialPage={changePage} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Count({ n }: { n: number }) {
  return (
    <Badge variant="secondary" className="ml-1 tabular-nums">
      {n}
    </Badge>
  );
}
