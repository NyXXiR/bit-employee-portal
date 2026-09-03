/*
 * tests/*.test.ts 를 전부 실행한다.
 *
 * --conditions=react-server 가 필요하다. tests 중 일부가 src/server 를 직접 가져오는데
 * 그쪽은 "server-only" 로 보호돼 있어서, 이 조건 없이 실행하면
 * "This module cannot be imported from a Client Component module" 로 죽는다.
 *
 * 글롭을 셸에 맡기지 않고 여기서 파일 목록을 만든다. npm 스크립트는 OS 마다
 * 다른 셸에서 돌아가고 cmd.exe 는 글롭을 확장하지 않는다.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const testDir = path.join(process.cwd(), "tests");
const files = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join("tests", name));

if (files.length === 0) {
  console.error("tests/ 에서 *.test.ts 를 찾지 못했습니다.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--conditions=react-server", "--test", ...files],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
