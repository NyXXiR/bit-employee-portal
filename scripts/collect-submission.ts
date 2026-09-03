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
  // 이 스크립트가 만드는 파일만 지운다. docs/submit/ 을 통째로 날리면
  // 여기서 관리하지 않는 것(ai-log/ 의 대화 기록 등)까지 같이 사라진다.
  await mkdir(outputDir, { recursive: true });
  for (const item of items) {
    await rm(path.join(outputDir, item.target), { force: true });
  }

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
원본을 고친 뒤 위 명령을 다시 돌리면 아래 표의 파일만 새로 덮어쓴다
(\`ai-log/\` 처럼 이 스크립트가 관리하지 않는 것은 건드리지 않는다).

마지막으로 모은 시각: ${new Date().toISOString()}

## 상태

| 제출물 | 파일 | 상태 | 내용 |
|---|---|---|---|
${[...copied.map((item) => line(item, true)), ...missing.map((item) => line(item, false))].join("\n")}

## ai-log/ — 제출물 4의 첨부

\`ai-log/\` 는 이 스크립트가 건드리지 않는다. AI 대화 기록이 들어 있고,
\`npx tsx scripts/export-transcript.ts <세션.jsonl> <출력.md>\` 로 만든다.

| 파일 | 내용 |
|---|---|
| \`대화전체-세션1.md\` | 읽기용. 사람 발화와 AI 답변은 원문, 도구 호출은 요약 |
| \`원본-세션1.jsonl\` | 빠짐없는 원본 트랜스크립트 |

제출물 4는 이 첨부와 별개로 A(거절한 제안 3개) · B(잘못 만들어 고친 지점) ·
C(설명하기 어려운 부분)를 \`AI_LOG.md\` 에 따로 정리할 것을 요구한다.

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
