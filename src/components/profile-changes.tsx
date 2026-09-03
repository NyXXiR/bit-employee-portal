"use client";

import { useState } from "react";
import { HistoryIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";

export type ProfileChangeView = {
  id: string;
  field: string;
  beforeValue: string | null;
  afterValue: string | null;
  changedBy: string;
  createdAt: string;
};

export type ProfileChangePage = {
  changes: ProfileChangeView[];
  total: number;
  nextCursor: string | null;
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
export function ProfileChanges({
  employeeId,
  initialPage,
}: {
  employeeId: string;
  initialPage: ProfileChangePage;
}) {
  const [changes, setChanges] = useState(initialPage.changes);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: "20" });
      const response = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeId)}/changes?${params}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as ProfileChangePage | null;
      if (!response.ok || !body) {
        toast.error("변경 이력을 더 불러오지 못했습니다.");
        return;
      }
      setChanges((current) => {
        const known = new Set(current.map((change) => change.id));
        return [...current, ...body.changes.filter((change) => !known.has(change.id))];
      });
      setNextCursor(body.nextCursor);
    } catch {
      toast.error("변경 이력을 더 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

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
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        최근 {changes.length}건 · 전체 {initialPage.total}건
      </p>
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
      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={loadMore}>
            {loading ? <Loader2Icon className="animate-spin" /> : null}
            {loading ? "불러오는 중…" : "이력 더 보기"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 비어 있던 값과 지운 값을 모두 "없음"으로 보여준다. 빈 칸은 누락처럼 읽힌다. */
function Value({ field, value }: { field: string; value: string | null }) {
  if (!value) return <span className="text-muted-foreground">없음</span>;
  if (field === "dateOfBirth") return <>{formatDate(value) ?? value}</>;
  return <>{value}</>;
}
