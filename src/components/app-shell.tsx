import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";

/*
 * 애플리케이션 셸.
 *
 * 사이드바 대신 상단 바를 쓴다. 이 포털의 인증된 화면은 관리자 2개, 직원 1개로
 * 모두 최상위이며, 계층이 없는 3개 화면에 사이드바를 두면 빈 공간만 늘어난다.
 * 화면이 늘어나 그룹이 생기면 그때 사이드바로 옮기는 것이 맞다.
 */
export function AppShell({
  role,
  loginId,
  children,
}: {
  role: "ADMIN" | "EMPLOYEE";
  loginId: string;
  children: React.ReactNode;
}) {
  const home = role === "ADMIN" ? "/admin" : "/portal";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href={home} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground"
              >
                B
              </span>
              <span className="font-heading truncate text-sm font-semibold tracking-tight">
                BIT People
              </span>
            </Link>
            <Separator orientation="vertical" className="hidden !h-4 sm:block" />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {role === "ADMIN" ? "직원 관리" : "내 정보"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu loginId={loginId} role={role} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
