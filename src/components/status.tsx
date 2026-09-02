import {
  CircleCheckIcon,
  CircleHelpIcon,
  ClockIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

/*
 * 상태 표현을 한 파일로 모은다.
 *
 * 재직 상태와 Background Check 상태는 관리자 목록, 상세, 직원 포털 세 화면에
 * 모두 나타난다. 각 화면에서 따로 색을 고르면 같은 상태가 다른 색으로 보이는
 * 사고가 나므로, 상태 -> (라벨, variant, 아이콘) 매핑을 여기서만 결정한다.
 */

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/*
 * 재직은 기본 상태다. 목록 열 전체에 배지가 깔리면 그 색이 표보다 먼저 읽히므로
 * 평범한 글자로 두고, 주의가 필요한 퇴사에만 배지를 단다.
 */
export function EmploymentBadge({ status }: { status: "ACTIVE" | "TERMINATED" }) {
  return status === "ACTIVE" ? (
    <span className="text-muted-foreground">재직</span>
  ) : (
    <Badge variant="destructive">퇴사</Badge>
  );
}

/*
 * 생년월일 누락은 오류가 아니라 "보완이 필요한 상태"이므로 경고색을 쓴다.
 *
 * 완료는 기본 상태다. 재직 상태와 같은 규칙을 적용해 배지를 걷어냈다 —
 * 열 명 중 아홉 줄에 초록 배지가 깔리면 정작 눈에 띄어야 할 한 줄이 묻힌다.
 */
export function ProfileCompletenessBadge({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="text-muted-foreground">완료</span>
  ) : (
    <Badge variant="warning">
      <TriangleAlertIcon />
      확인 필요
    </Badge>
  );
}

const CHECK_STATUS: Record<
  string,
  { label: string; variant: BadgeVariant; Icon: typeof CircleCheckIcon }
> = {
  REQUESTING: { label: "요청 중", variant: "info", Icon: Loader2Icon },
  PENDING: { label: "진행 중", variant: "info", Icon: ClockIcon },
  CLEAR: { label: "이상 없음", variant: "success", Icon: CircleCheckIcon },
  FLAGGED: { label: "추가 검토", variant: "warning", Icon: TriangleAlertIcon },
  FAILED: { label: "실패", variant: "destructive", Icon: OctagonXIcon },
  UNKNOWN: { label: "확인 필요", variant: "warning", Icon: CircleHelpIcon },
};

export function checkStatusLabel(status: string) {
  return CHECK_STATUS[status]?.label ?? status;
}

export function CheckStatusBadge({ status }: { status: string }) {
  const entry = CHECK_STATUS[status];
  if (!entry) return <Badge variant="outline">{status}</Badge>;
  const { label, variant, Icon } = entry;
  return (
    <Badge variant={variant}>
      <Icon className={status === "REQUESTING" ? "animate-spin" : undefined} />
      {label}
    </Badge>
  );
}
