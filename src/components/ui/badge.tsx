import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * 방향 A에서는 배지를 채우지 않는다.
 *
 * 목록 한 화면에 배지가 스무 개 가까이 깔리는데 알약을 색으로 채우면 그 색들이
 * 표보다 먼저 읽힌다. 테두리와 글자색만으로 상태를 구분하고, 채움은 쓰지 않는다.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[2px] border px-1.5 py-0 text-[11px] font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-primary/45 text-primary [a]:hover:bg-primary/5",
        secondary: "border-border text-muted-foreground [a]:hover:bg-muted",
        destructive: "border-destructive/45 text-destructive [a]:hover:bg-destructive/5",
        outline: "border-border text-foreground [a]:hover:bg-muted",
        // 프로젝트 확장: Background Check 결과와 재직 상태를 구분하기 위한 상태 variant.
        success: "border-success/45 text-success [a]:hover:bg-success/5",
        warning: "border-warning/50 text-warning [a]:hover:bg-warning/5",
        info: "border-info/45 text-info [a]:hover:bg-info/5",
        ghost: "border-transparent text-muted-foreground hover:bg-muted",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
