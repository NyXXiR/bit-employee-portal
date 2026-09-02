import { listEmployees } from "./src/server/employees";

const row = (e: { employeeId: string; fullName: string; dateOfBirth: string | null }) =>
  `${e.employeeId}:${e.fullName}${e.dateOfBirth ? "" : "(생일없음)"}`;

async function show(label: string, opts: Parameters<typeof listEmployees>[0]) {
  const r = await listEmployees({ ...opts, pageSize: 20 });
  console.log(`\n■ ${label}  [sort=${r.sort} dir=${r.direction}]`);
  console.log("  " + r.employees.map(row).join(", "));
}

async function paging(label: string, opts: Parameters<typeof listEmployees>[0]) {
  const size = 3;
  const seen: string[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const r = await listEmployees({ ...opts, pageSize: size, page });
    totalPages = r.totalPages;
    seen.push(...r.employees.map((e) => e.employeeId));
  }
  const dup = seen.filter((v, i) => seen.indexOf(v) !== i);
  const uniq = new Set(seen);
  const all = await listEmployees({ ...opts, pageSize: 100 });
  const missing = all.employees.map((e) => e.employeeId).filter((id) => !uniq.has(id));
  console.log(`\n■ ${label} — ${size}개씩 ${totalPages}쪽 순회`);
  console.log(`  수집=${seen.length} 고유=${uniq.size} 중복=[${dup.join(",")}] 누락=[${missing.join(",")}]`);
  console.log(`  ${dup.length === 0 && missing.length === 0 ? "✅ 겹침·빠짐 없음" : "❌ 문제 있음"}`);
}

async function main() {
  await show("성명 오름차순", { sort: "name", direction: "asc" });
  await show("성명 내림차순", { sort: "name", direction: "desc" });
  await show("생년월일 오름차순", { sort: "dateOfBirth", direction: "asc" });
  await show("생년월일 내림차순", { sort: "dateOfBirth", direction: "desc" });
  await show("재직 상태", { sort: "status", direction: "asc" });
  await show("기본(정렬 미지정)", {});
  await paging("성명 정렬 + 페이징 (동명이인 존재)", { sort: "name", direction: "asc" });
  await paging("재직 상태 정렬 + 페이징 (값이 대부분 동일)", { sort: "status", direction: "asc" });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
