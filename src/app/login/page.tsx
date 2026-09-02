import { redirect } from "next/navigation";
import { InfoIcon } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSession } from "@/server/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getCurrentSession();
  if (session) redirect(session.role === "ADMIN" ? "/admin" : "/portal");

  const { reason } = await searchParams;
  const sessionNotice =
    reason === "terminated"
      ? {
          title: "퇴사 처리된 계정입니다",
          description: "퇴사 처리로 시스템 접근 권한이 종료되었습니다. 필요한 경우 인사 담당자에게 문의해 주세요.",
        }
      : reason === "revoked"
        ? {
            title: "로그인 세션이 회수되었습니다",
            description: "보안을 위해 현재 세션이 종료되었습니다. 다시 로그인해 주세요.",
          }
        : reason === "expired"
          ? {
              title: "로그인 세션이 만료되었습니다",
              description: "계속 사용하려면 다시 로그인해 주세요.",
            }
          : null;

  return (
    // 배경 장식을 두지 않는다. 이 화면이 특별해 보일 이유가 없다.
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground"
          >
            B
          </span>
          <h1 className="font-heading text-base font-semibold tracking-tight">사내 직원 포털</h1>
        </div>

        {/*
         * 접근이 차단되어 되돌아온 경우에 사유를 알린다. 이것이 없으면 퇴사 처리
         * 직후 튕겨나온 직원에게는 평범한 로그인 폼만 보여, 차단이 동작한 것인지
         * 그냥 로그아웃된 것인지 구분할 수 없다.
         */}
        {sessionNotice ? (
          <Alert className="mb-4">
            <InfoIcon />
            <AlertTitle>{sessionNotice.title}</AlertTitle>
            <AlertDescription>{sessionNotice.description}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>지급받은 사내 계정으로 로그인해 주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="mt-5 text-xs text-muted-foreground">
          계정 문제는 인사 담당자에게 문의해 주세요.
        </p>
      </div>
    </main>
  );
}
