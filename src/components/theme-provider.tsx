"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes는 localStorage와 matchMedia를 읽어야 하므로 클라이언트 경계가 필요하다.
 * 서버 컴포넌트인 RootLayout에서 직접 감쌀 수 없어 별도 파일로 분리한다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
