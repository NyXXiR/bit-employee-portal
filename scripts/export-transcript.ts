/*
 * Claude Code 세션 트랜스크립트(.jsonl)를 읽을 수 있는 마크다운으로 옮긴다.
 * 제출물 4가 "AI와 대화한 전체 내용을 파일로 첨부"를 요구해서 만든 것이다.
 *
 * 원본 .jsonl 도 함께 복사한다. 마크다운은 읽으라고 만든 것이고,
 * 원본은 아무것도 빠지지 않았음을 보이는 용도다.
 *
 * 사용: npx tsx scripts/export-transcript.ts <session.jsonl> <출력.md>
 */
import { readFileSync, writeFileSync } from "node:fs";

type Block = { type: string; text?: string; thinking?: string; name?: string; input?: unknown; content?: unknown; is_error?: boolean };
type Record_ = {
  type: string;
  timestamp?: string;
  message?: { role?: string; content?: string | Block[]; model?: string };
  isSidechain?: boolean;
  gitBranch?: string;
  cwd?: string;
};

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("사용: npx tsx scripts/export-transcript.ts <session.jsonl> <출력.md>");
  process.exit(1);
}

const records: Record_[] = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => { try { return JSON.parse(line) as Record_; } catch { return null; } })
  .filter((value): value is Record_ => value !== null);

const time = (value?: string) => value ? value.slice(11, 19) : "";
const day = (value?: string) => value ? value.slice(0, 10) : "";

/** 도구 입력은 통째로 싣지 않는다. 무엇을 했는지 알아볼 만큼만 남긴다. */
function toolSummary(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = (key: string) => typeof i[key] === "string" ? (i[key] as string) : undefined;
  const oneLine = (value: string, limit = 160) => {
    const flat = value.replace(/\s+/g, " ").trim();
    return flat.length > limit ? flat.slice(0, limit) + " …" : flat;
  };
  const candidate =
    pick("file_path") ?? pick("path") ?? pick("pattern") ?? pick("url") ??
    pick("command") ?? pick("description") ?? pick("prompt") ?? pick("skill") ?? pick("query");
  return candidate ? `${name} — ${oneLine(candidate)}` : name;
}

function resultSummary(content: unknown, isError?: boolean): string {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.map((part) => {
      const block = part as Block;
      return block.type === "text" ? (block.text ?? "") : `[${block.type}]`;
    }).join("\n");
  } else if (content && typeof content === "object") text = JSON.stringify(content);

  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const head = lines.slice(0, 6).map((line) => line.length > 200 ? line.slice(0, 200) + " …" : line);
  const suffix = lines.length > 6 ? `\n… (${lines.length - 6}줄 생략)` : "";
  return (isError ? "오류: " : "") + head.join("\n") + suffix;
}

const out: string[] = [];
let turn = 0;
let lastDay = "";
let toolCount = 0;

out.push("# AI 대화 전체 기록");
out.push("");
out.push("비트컴퓨터 채용 과제 — 제출물 4 첨부용. Claude Code 세션 트랜스크립트를 옮긴 것이다.");
out.push("");
out.push("- 원본: `" + inputPath.split(/[\\/]/).pop() + "` (같은 폴더에 함께 둔다)");
out.push("- 이 파일은 **읽으라고** 만든 것이고, 원본 `.jsonl` 이 빠짐없는 기록이다.");
out.push("- 사람의 발화와 AI의 답변은 **원문 그대로** 싣는다.");
out.push("- 도구 호출(파일 읽기·쓰기, 명령 실행)은 무엇을 했는지 알아볼 만큼만 요약한다.");
out.push("  전체 입출력은 원본에 있다.");
out.push("- AI의 내부 사고(thinking) 블록은 제외했다. 판단의 근거는 답변과 코드 주석,");
out.push("  MEASUREMENTS.md 에 남아 있다.");
out.push("");
out.push("---");
out.push("");

for (const record of records) {
  if (record.isSidechain) continue;
  const role = record.message?.role;
  if (role !== "user" && role !== "assistant") continue;
  const content = record.message?.content;

  if (record.timestamp && day(record.timestamp) !== lastDay) {
    lastDay = day(record.timestamp);
    out.push(`\n## ${lastDay}\n`);
  }

  if (role === "user") {
    // 문자열이면 사람이 친 것, 배열이면 대개 도구 결과다.
    if (typeof content === "string") {
      turn += 1;
      out.push(`### ${turn}. 사용자 — ${time(record.timestamp)}`);
      out.push("");
      out.push(content.split("\n").map((line) => "> " + line).join("\n"));
      out.push("");
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          turn += 1;
          out.push(`### ${turn}. 사용자 — ${time(record.timestamp)}`);
          out.push("");
          out.push(block.text.split("\n").map((line) => "> " + line).join("\n"));
          out.push("");
        } else if (block.type === "tool_result") {
          out.push("<details><summary>도구 결과</summary>");
          out.push("");
          out.push("```");
          out.push(resultSummary(block.content, block.is_error));
          out.push("```");
          out.push("");
          out.push("</details>");
          out.push("");
        }
      }
    }
    continue;
  }

  if (!Array.isArray(content)) continue;
  for (const block of content) {
    if (block.type === "text" && block.text && block.text.trim()) {
      out.push(`**Claude — ${time(record.timestamp)}**`);
      out.push("");
      out.push(block.text);
      out.push("");
    } else if (block.type === "tool_use") {
      toolCount += 1;
      out.push("`도구` " + toolSummary(block.name ?? "unknown", block.input));
      out.push("");
    }
  }
}

const first = records.find((record) => record.timestamp)?.timestamp;
const last = [...records].reverse().find((record) => record.timestamp)?.timestamp;
out.splice(9, 0,
  `- 기간: ${first?.slice(0, 19).replace("T", " ")} ~ ${last?.slice(0, 19).replace("T", " ")} UTC`,
  `- 사용자 발화 ${turn}회, 도구 호출 ${toolCount}회, 원본 레코드 ${records.length}건`,
);

writeFileSync(outputPath, out.join("\n"));
console.log(`${outputPath} 작성`);
console.log(`  사용자 발화 ${turn}회 · 도구 호출 ${toolCount}회 · 원본 레코드 ${records.length}건`);
