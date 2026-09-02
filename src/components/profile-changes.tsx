import { HistoryIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

export type ProfileChangeView = {
  id: string;
  field: string;
  beforeValue: string | null;
  afterValue: string | null;
  changedBy: string;
  createdAt: string;
};

const FIELD_LABEL: Record<string, string> = {
  familyName: "성",
  givenName: "이름",
  dateOfBirth: "생년월일",
};

/*
 * 직원 정보 수정 이력.
 *
 * "즉시 반영하되 이력을 남긴다"는 결정을 화면에서 확인할 수 있어야 한다.
 * 기록만 쌓고 볼 곳이 없으면 그 결정을 코드로만 설명해야 한다.
 */
export function ProfileChanges({ changes }: { changes: ProfileChangeView[] }) {
  if (changes.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>변경 이력이 없습니다</EmptyTitle>
          <EmptyDescription>
            생성 이후 이 직원의 인적사항이 수정된 적이 없습니다.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>변경 시각</TableHead>
          <TableHead>항목</TableHead>
          <TableHead>이전</TableHead>
          <TableHead>이후</TableHead>
          <TableHead className="text-right">변경자</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((change) => (
          <TableRow key={change.id}>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatDateTime(change.createdAt)}
            </TableCell>
            <TableCell className="font-medium">
              {FIELD_LABEL[change.field] ?? change.field}
            </TableCell>
            <TableCell className="text-muted-foreground">
              <Value field={change.field} value={change.beforeValue} />
            </TableCell>
            <TableCell>
              <Value field={change.field} value={change.afterValue} />
            </TableCell>
            <TableCell className="text-right font-mono text-xs text-muted-foreground">
              {change.changedBy}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** 비어 있던 값과 지운 값을 모두 "없음"으로 보여준다. 빈 칸은 누락처럼 읽힌다. */
function Value({ field, value }: { field: string; value: string | null }) {
  if (!value) return <span className="text-muted-foreground">없음</span>;
  if (field === "dateOfBirth") return <>{formatDate(value) ?? value}</>;
  return <>{value}</>;
}
