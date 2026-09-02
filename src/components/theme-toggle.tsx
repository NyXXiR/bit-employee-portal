"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * 서버는 사용자의 테마를 모르므로 렌더 중에 아이콘을 고르면 하이드레이션이 어긋난다.
 * 두 아이콘을 모두 그려 두고 `.dark` 클래스로 CSS가 고르게 하면 마크업이 항상 같아
 * 마운트 여부를 상태로 추적할 필요가 없다.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="밝은 테마와 어두운 테마 전환"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  );
}
