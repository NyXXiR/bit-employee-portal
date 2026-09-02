"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/*
 * 검색어를 URL에 싣는다.
 *
 * 컴포넌트 안에 목록을 들고 걸러내지 않고 주소로 넘기는 이유는, 걸러진 목록이
 * 공유되고 새로고침에도 남아야 하기 때문이다. "생년월일 없는 직원 목록"을
 * 링크로 건네줄 수 있어야 한다.
 *
 * 현재 필터는 prop으로 받아 다시 붙인다. useSearchParams를 쓰면 이 컴포넌트가
 * Suspense 경계를 요구하게 되는데, 지금 필요한 값은 두 개뿐이라 그럴 이유가 없다.
 */
export function EmployeeSearch({
  query,
  filter,
  sort,
  direction,
}: {
  query: string;
  filter?: string;
  sort?: string;
  direction?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(query);

  useEffect(() => {
    // 이미 주소에 반영된 값이면 아무것도 하지 않는다. 이 확인이 없으면
    // 주소가 바뀔 때마다 이펙트가 다시 돌며 같은 이동을 반복한다.
    if (value.trim() === query) return;

    const timer = setTimeout(() => {
      // 검색어만 바꾸고 나머지 목록 상태는 그대로 둔다. 쪽 번호는 일부러
      // 빼서 1쪽으로 돌아가게 한다 — 결과 집합이 달라졌으니 쪽 번호는 무의미하다.
      const next = new URLSearchParams();
      if (filter) next.set("filter", filter);
      if (value.trim()) next.set("q", value.trim());
      if (sort && sort !== "employeeId") next.set("sort", sort);
      if (direction === "desc") next.set("dir", "desc");
      const qs = next.toString();
      router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, query, filter, sort, direction, router]);

  return (
    <div className="relative w-full max-w-xs">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="이름 또는 사번"
        aria-label="직원 검색"
        className="h-8 pl-8 text-sm"
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="검색어 지우기"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setValue("")}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
