import { cn } from "@/lib/utils";

/**
 * 화면 제목 영역. 제목/설명은 왼쪽, 주요 동작은 오른쪽에 둔다.
 * 좁은 화면에서는 동작이 제목 아래로 내려간다.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {breadcrumb}
        <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
