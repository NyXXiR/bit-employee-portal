import Link from "next/link";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

/** 상세 화면 전용. 목록으로 되돌리는 것이 처음으로 가는 것보다 낫다. */
export default function EmployeeNotFound() {
  return (
    <StatusScreen
      code="404"
      title="직원을 찾을 수 없습니다"
      description="사번이 잘못되었거나 삭제된 기록입니다. 퇴사 처리된 직원은 목록에 그대로 남아 있습니다."
      actions={
        <Button asChild>
          <Link href="/admin">직원 목록으로</Link>
        </Button>
      }
    />
  );
}
