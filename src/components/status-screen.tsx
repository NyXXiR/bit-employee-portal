import Link from "next/link";

import { Button } from "@/components/ui/button";

/*
 * 전체 화면을 차지하는 상태 화면. 오류, 대상 없음처럼 앱 셸을 띄울 수 없는
 * 상황에서 쓴다. 세션 정보에 의존하지 않아야 하므로 사용자 메뉴나 내비게이션을
 * 넣지 않고, 로그인 화면과 같은 배경을 써서 같은 앱임을 유지한다.
 */
export function StatusScreen({
  code,
  title,
  description,
  detail,
  actions,
}: {
  code: string;
  title: string;
  description: React.ReactNode;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-sm font-medium text-muted-foreground">{code}</p>
        <h1 className="font-heading mt-3 text-xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <div className="mt-2 text-sm text-muted-foreground text-pretty">{description}</div>

        {detail ? (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-muted-foreground">
            {detail}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      </div>
    </main>
  );
}

/** 상태 화면에서 가장 자주 쓰는 두 동작. */
export function HomeLinkButton({ children = "처음으로" }: { children?: React.ReactNode }) {
  return (
    <Button variant="outline" asChild>
      <Link href="/">{children}</Link>
    </Button>
  );
}
