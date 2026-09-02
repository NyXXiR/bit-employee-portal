import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 라벨 + 입력 + 보조 설명을 한 덩어리로 묶는다.
 * 세 개의 폼이 같은 간격과 같은 필수 표시 규칙을 쓰도록 강제하기 위한 것이다.
 */
export function FormField({
  id,
  label,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
