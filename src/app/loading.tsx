import { Skeleton } from "@/components/ui/skeleton";

/*
 * 모든 라우트가 공유하는 대기 화면.
 *
 * 화면마다 모양이 달라 정확한 스켈레톤을 그리지 않는다. 대신 상단 바와 제목이
 * 들어올 자리만 잡아, 내용이 채워질 때 레이아웃이 튀지 않게 한다.
 */
export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="h-14 border-b" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-72" />
        <Skeleton className="mt-8 h-64 w-full" />
        <span className="sr-only">불러오는 중</span>
      </div>
    </div>
  );
}
