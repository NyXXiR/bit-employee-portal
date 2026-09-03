/*
 * 제출용 파일을 docs/submit/ 에 모은다.
 *
 * 원본은 저장소 루트에 그대로 둔다. 평가자는 저장소 링크로 들어와 루트에서
 * MEASUREMENTS.md 를 바로 봐야 하고, 문서 안의 상대경로 링크도 루트 기준이다.
 * 여기는 제출할 때 한 폴더에서 집어 가려고 만드는 사본 모음이라 언제든 다시 만들면 된다.
 *
 * 사용: npx tsx scripts/collect-submission.ts
 */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

type Item = {
  /** 제출물 번호. 과제 설명서 4절 기준. */
  deliverable: string;
  source: string;
  /** 제출 폴더에 놓을 이름. 과제가 지정한 파일명을 그대로 쓴다. */
  target: string;
  required: boolean;
  note: string;
};

const items: Item[] = [
  { deliverable: "2", source: "MEASUREMENTS.md", target: "MEASUREMENTS.md", required: true, note: "API 실측 결과" },
  { deliverable: "3", source: "DECISIONS.md", target: "DECISIONS.md", required: true, note: "설계 판단 3개 이상" },
  { deliverable: "4", source: "AI_LOG.md", target: "AI_LOG.md", required: true, note: "AI 협업 기록 (A/B/C)" },
  { deliverable: "참고", source: "docs/measurements-summary.md", target: "참고-실측요약.md", required: false, note: "읽기용 요약. 제출 필수 아님" },
  { deliverable: "참고", source: "measurements/2026-09-03T15-20-07-345Z/report.txt", target: "참고-실측집계출력.txt", required: false, note: "MEASUREMENTS.md 의 근거 집계" },
];

const root = process.cwd();
const outputDir = path.join(root, "docs", "submit");

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const copied: Item[] = [];
  const missing: Item[] = [];
  for (const item of items) {
    if (existsSync(path.join(root, item.source))) {
      await copyFile(path.join(root, item.source), path.join(outputDir, item.target));
      copied.push(item);
    } else {
      missing.push(item);
    }
  }

  const line = (item: Item, ok: boolean) =>
    `| ${item.deliverable} | ${ok ? item.target : "—"} | ${ok ? "준비됨" : "**미작성**"} | ${item.note} |`;

  const readme = `# 제출용 모음

**이 폴더는 \`npx tsx scripts/collect-submission.ts\` 가 만든 사본이다.**
원본은 저장소 루트에 있고, 여기 파일을 고쳐도 원본에 반영되지 않는다.
원본을 고친 뒤 위 명령을 다시 돌리면 이 폴더가 새로 만들어진다.

마지막으로 모은 시각: ${new Date().toISOString()}

## 상태

| 제출물 | 파일 | 상태 | 내용 |
|---|---|---|---|
${[...copied.map((item) => line(item, true)), ...missing.map((item) => line(item, false))].join("\n")}

## 제출물 1 — 파일이 아닌 것

저장소에 담기지 않는 항목이라 여기 적어 둔다. 제출 메일에 직접 써야 한다.

- [ ] **배포 URL** (로컬 실행 아님, 제출 후 배포 상태 유지)
- [ ] **관리자 계정** 아이디 / 비밀번호
- [ ] **일반 직원 계정** 아이디 / 비밀번호
- [ ] **소스코드 저장소 링크** — https://github.com/NyXXiR/bit-employee-portal
- [ ] AI 대화 전체 로그 파일 (제출물 4가 별도 첨부를 요구한다)

## 제출 직전 확인

- [ ] 배포가 살아 있는가
- [ ] 시드 직원 10명이 그대로인가 (EMP-001 ~ EMP-010, 임의 수정·제외 금지)
- [ ] 관리자·직원 계정 둘 다 실제로 로그인되는가
- [ ] 직원이 관리자 기능에 접근하면 차단되는가
- [ ] 퇴사 처리된 직원의 접근이 막히는가
- [ ] MEASUREMENTS.md 의 모든 수치에 표본 수가 적혀 있는가
- [ ] DECISIONS.md 가 4가지 질문(무엇으로 / 왜 / 반대의 장점 / 틀리는 경우)에 각각 답하는가
`;

  await writeFile(path.join(outputDir, "README.md"), readme);

  console.log("모은 위치: docs/submit/");
  copied.forEach((item) => console.log("  [준비됨] " + item.target + "  <- " + item.source));
  missing.forEach((item) => console.log("  [미작성] " + item.source + (item.required ? "  (필수)" : "")));
  const missingRequired = missing.filter((item) => item.required);
  if (missingRequired.length) {
    console.log("\n아직 없는 필수 제출물 " + missingRequired.length + "건: " + missingRequired.map((item) => item.source).join(", "));
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
