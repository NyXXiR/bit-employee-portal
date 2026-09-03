import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  SearchXIcon,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CreateEmployeeDialog } from "@/components/create-employee-dialog";
import { EmployeeSearch } from "@/components/employee-search";
import { PageHeader } from "@/components/page-header";
import { EmploymentBadge, ProfileCompletenessBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
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
import { loginRedirectPath } from "@/lib/auth-redirect";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCurrentSession } from "@/server/auth";
import {
  listEmployees,
  type EmployeeListFilter,
  type EmployeeSortKey,
  type SortDirection,
} from "@/server/employees";
import { listEmployeesQuerySchema } from "@/server/schemas";

/**
 * 목록 상태를 주소로 만든다.
 *
 * page를 넘기지 않으면 1쪽으로 돌아간다. 필터나 검색어가 바뀌면 결과 집합 자체가
 * 달라지므로 이전에 보던 쪽 번호는 의미가 없다 — 3쪽을 보다가 필터를 바꿨는데
 * 여전히 3쪽이면 빈 화면이 나올 수 있다.
 */
function buildHref({
  filter,
  query,
  sort,
  direction,
  page,
}: {
  filter?: EmployeeListFilter;
  query?: string;
  sort?: EmployeeSortKey;
  direction?: SortDirection;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (query) params.set("q", query);
  // 기본 정렬은 주소에 남기지 않는다. 아무것도 고르지 않은 상태가 /admin이어야
  // 필터 해제 링크나 브랜드 링크로 돌아왔을 때 상태가 깔끔하게 비워진다.
  if (sort && sort !== "employeeId") params.set("sort", sort);
  if (direction === "desc") params.set("dir", "desc");
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect(await loginRedirectPath());
  if (session.role !== "ADMIN") redirect("/portal");

  /*
   * 주소의 조건을 검증한다. API와 같은 스키마를 쓰되, 여기서는 실패해도 오류를
   * 내지 않고 조건 없는 목록으로 되돌린다. 사람이 주소창에 오타를 낸 것까지
   * 오류 화면으로 막을 이유가 없다.
   */
  const parsed = listEmployeesQuerySchema.safeParse(await searchParams);
  const {
    filter,
    q: query,
    sort: parsedSort,
    dir: parsedDir,
    page: requestedPage,
  } = parsed.success ? parsed.data : {};

  const { employees, total, page, pageSize, totalPages, sort, direction, summary } =
    await listEmployees({
      filter,
      query,
      sort: parsedSort,
      direction: parsedDir,
      page: requestedPage,
    });

  /*
   * 정렬을 바꾸면 쪽 번호를 버린다. 순서가 달라지면 3쪽에 있던 직원이 1쪽으로
   * 올 수 있어, 보고 있던 쪽 번호를 유지하는 것이 오히려 길을 잃게 만든다.
   */
  const sortHref = (key: EmployeeSortKey) =>
    buildHref({
      filter,
      query,
      sort: key,
      // 같은 열을 다시 누르면 방향만 뒤집고, 다른 열로 옮기면 오름차순부터 시작한다.
      direction: sort === key && direction === "asc" ? "desc" : "asc",
    });

  const narrowed = filter !== undefined || query !== undefined;
  const start = (page - 1) * pageSize;

  return (
    <AppShell role="ADMIN" loginId={session.loginId}>
      <PageHeader
        title="직원 관리"
        description="계정, 재직 상태와 프로필 완성도를 관리합니다."
        actions={<CreateEmployeeDialog />}
      />

      {/*
       * 요약 수치가 곧 필터다. 누르면 그 수치가 세고 있던 직원만 남는다.
       *
       * 탭 바 형태를 쓰는 이유는 어포던스 때문이다. 수치를 그냥 크게 적어 두면
       * 눌러 볼 수 있다는 것이 드러나지 않는다 — 호버로만 알 수 있는 단서는
       * 터치 기기에서 아예 없는 것과 같다. 아래 가로선을 공유하고 활성 항목에
       * 밑줄이 붙는 형태는 그 자체로 "고를 수 있는 것"으로 읽힌다.
       */}
      <nav aria-label="직원 목록 필터" className="mb-8 flex flex-wrap gap-x-6 border-b">
        <Stat
          label="전체 직원"
          value={summary.total}
          href={buildHref({ query, sort, direction })}
          active={filter === undefined}
        />
        <Stat
          label="재직 중"
          value={summary.active}
          href={buildHref({
            filter: filter === "active" ? undefined : "active",
            query,
            sort,
            direction,
          })}
          active={filter === "active"}
        />
        <Stat
          label="정보 보완 필요"
          value={summary.incomplete}
          href={buildHref({
            filter: filter === "incomplete" ? undefined : "incomplete",
            query,
            sort,
            direction,
          })}
          active={filter === "incomplete"}
          warn={summary.incomplete > 0}
        />
      </nav>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            직원 목록
            {narrowed ? (
              <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                {total}명 / 전체 {summary.total}명
              </span>
            ) : null}
          </h2>
          <div className="flex items-center gap-2">
            <EmployeeSearch query={query ?? ""} filter={filter} sort={sort} direction={direction} />
            {narrowed ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin">필터 해제</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {employees.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyTitle>조건에 맞는 직원이 없습니다</EmptyTitle>
              <EmptyDescription>검색어나 필터를 바꿔 보세요.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {/*
              * table-fixed가 없으면 아래 너비는 힌트로만 쓰여 브라우저가 남는 폭을
              * 열들에 나눠준다. 그러면 값이 짧은 열 사이가 벌어져 한 줄을 읽는 데
              * 눈이 가로로 크게 움직인다. 좁은 화면에서는 찌그러지는 대신 가로로 스크롤한다.
              */}
            <Table className="min-w-[46rem] table-fixed">
              <TableHeader>
                {/*
                  * 이름 열만 남는 폭을 흡수하게 두고 나머지는 고정한다.
                  * 모두 자동으로 두면 짧은 값들 사이가 벌어져 한 줄을 읽는 데
                  * 눈이 가로로 크게 움직인다.
                  */}
                <TableRow>
                  <SortableHead
                    label="사번"
                    column="employeeId"
                    sort={sort}
                    direction={direction}
                    href={sortHref("employeeId")}
                    className="w-28"
                  />
                  <SortableHead
                    label="성명"
                    column="name"
                    sort={sort}
                    direction={direction}
                    href={sortHref("name")}
                    className="w-28"
                  />
                  {/* 로그인 아이디와 프로필은 정렬 기준으로 쓸 일이 없다.
                      계정 아이디 순서는 의미가 없고, 프로필 완성도는 필터가 대신한다. */}
                  <TableHead className="w-40">로그인 아이디</TableHead>
                  <SortableHead
                    label="생년월일"
                    column="dateOfBirth"
                    sort={sort}
                    direction={direction}
                    href={sortHref("dateOfBirth")}
                    className="w-40"
                  />
                  <TableHead className="w-24">프로필</TableHead>
                  {/* 너비를 주지 않아 남는 폭을 흡수한다. 빈 공간이 맨 오른쪽에 모인다. */}
                  <SortableHead
                    label="재직 상태"
                    column="status"
                    sort={sort}
                    direction={direction}
                    href={sortHref("status")}
                    align="right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  /*
                   * 행 전체가 상세로 가는 링크다. 사번 링크에 행을 덮는 가상요소를
                   * 씌우는 방식이라, 가운데 클릭이나 "링크 주소 복사" 같은 앵커의
                   * 성질을 그대로 유지한다. onClick 핸들러로 처리하면 그게 사라진다.
                   */
                  <TableRow key={employee.employeeId} className="group relative">
                    <TableCell>
                      <Link
                        href={`/admin/employees/${employee.employeeId}`}
                        aria-label={`${employee.fullName} (${employee.employeeId}) 상세 보기`}
                        className="rounded-sm font-mono font-medium text-primary group-hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring after:absolute after:inset-0"
                      >
                        {employee.employeeId}
                      </Link>
                    </TableCell>
                    <TableCell className="truncate font-medium">{employee.fullName}</TableCell>
                    {/*
                     * 여기만 덮개 위로 올려 복사할 수 있게 할까 했지만, 행 가운데에
                     * 눌러도 반응 없는 구멍이 생긴다. 행 전체가 같게 동작하는 편이 낫다.
                     */}
                    <TableCell>
                      <span
                        title={employee.loginId ?? undefined}
                        className={cn(
                          "block truncate",
                          employee.loginId
                            ? "font-mono text-sm text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {employee.loginId ?? "미발급"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(employee.dateOfBirth) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ProfileCompletenessBadge complete={employee.profileComplete} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EmploymentBadge status={employee.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pager
              start={start + 1}
              end={start + employees.length}
              total={total}
              page={page}
              totalPages={totalPages}
              hrefFor={(target) => buildHref({ filter, query, sort, direction, page: target })}
            />
          </>
        )}
      </section>
    </AppShell>
  );
}

/**
 * 눌러서 정렬하는 표 머리.
 *
 * 현재 정렬 중인 열만 방향 화살표를 진하게 보여주고, 나머지는 흐린 양방향
 * 아이콘을 항상 띄운다. 호버에만 나타나게 하면 터치 기기에서는 정렬할 수 있다는
 * 사실 자체가 드러나지 않는다.
 */
function SortableHead({
  label,
  column,
  sort,
  direction,
  href,
  className,
  align = "left",
}: {
  label: string;
  column: EmployeeSortKey;
  sort: EmployeeSortKey;
  direction: SortDirection;
  href: string;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort === column;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )
        ) : (
          <ChevronsUpDownIcon className="size-3 opacity-40" />
        )}
      </Link>
    </TableHead>
  );
}

/** 요약 수치 겸 필터 탭. 활성 항목만 아래 굵은 밑줄을 갖는다. */
function Stat({
  label,
  value,
  href,
  active,
  warn,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      // -mb-px로 nav의 아래 선 위에 정확히 겹쳐 앉힌다.
      className={cn(
        "-mb-px flex items-baseline gap-2 border-b-2 pt-1 pb-3 transition-colors",
        active
          ? "border-primary"
          : "border-transparent hover:border-border hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "font-heading text-xl font-semibold tabular-nums",
          warn ? "text-warning" : active ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className={cn("text-sm", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </Link>
  );
}

/**
 * 쪽 이동. 한 쪽뿐이면 이동 단추를 감추되 범위 표시는 남긴다.
 * "지금 몇 번째부터 몇 번째를 보고 있는가"는 쪽이 하나여도 알아야 하는 정보다.
 */
function Pager({
  start,
  end,
  total,
  page,
  totalPages,
  hrefFor,
}: {
  start: number;
  end: number;
  total: number;
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {start}–{end} / {total}명
      </span>

      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <PagerLink href={hrefFor(page - 1)} disabled={page === 1} label="이전 쪽">
            <ChevronLeftIcon />
            이전
          </PagerLink>
          <span className="px-2 tabular-nums">
            {page} / {totalPages}
          </span>
          <PagerLink href={hrefFor(page + 1)} disabled={page === totalPages} label="다음 쪽">
            다음
            <ChevronRightIcon />
          </PagerLink>
        </div>
      ) : null}
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  // 첫/마지막 쪽에서는 링크가 아니라 비활성 표시로 둔다. 눌러도 같은 곳에
  // 도착하는 링크를 남겨 두면 키보드 사용자가 헛걸음을 하게 된다.
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex items-center gap-0.5 px-1.5 py-1 opacity-40 [&_svg]:size-3.5"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-sm px-1.5 py-1 hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </Link>
  );
}
