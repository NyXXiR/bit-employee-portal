"use client";

import { useEffect } from "react";
import { RotateCcwIcon } from "lucide-react";

import { HomeLinkButton, StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

/*
 * 렌더 도중 발생한 예외를 받는 경계.
 *
 * 서버 도메인 계층은 AppError로 상태 코드를 실어 보내지만, 프로덕션 빌드에서는
 * Next가 서버 오류 메시지를 클라이언트로 넘기지 않는다(digest만 남는다).
 * 그러므로 여기서 error.message를 신뢰해 분기하지 않는다. 사번이 없는 경우처럼
 * 예상 가능한 상황은 페이지에서 notFound()로 먼저 처리하고,
 * 이 화면은 정말 예상하지 못한 것만 받는다.
 */
export default function AppErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled render error", error);
  }, [error]);

  return (
    <StatusScreen
      code="ERROR"
      title="요청을 처리하지 못했습니다"
      description="일시적인 문제일 수 있습니다. 다시 시도해도 같은 화면이 나오면 인사 담당자에게 알려 주세요."
      detail={error.digest ? `오류 코드 ${error.digest}` : undefined}
      actions={
        <>
          <Button onClick={retry}>
            <RotateCcwIcon />
            다시 시도
          </Button>
          <HomeLinkButton />
        </>
      }
    />
  );
}
