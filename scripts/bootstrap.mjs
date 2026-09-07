import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Compose 내부 접속 정보는 호스트용 DATABASE_URL과 구분한다. */
export function databaseUrlFromEnv(config) {
  if (config.DATABASE_HOST) {
    for (const key of ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]) {
      if (!config[key]) throw new Error(`${key} 설정이 필요합니다.`);
    }
    const url = new URL(`postgresql://${config.DATABASE_HOST}:5432`);
    url.username = config.POSTGRES_USER;
    url.password = config.POSTGRES_PASSWORD;
    url.pathname = `/${config.POSTGRES_DB}`;
    url.search = "schema=public";
    return url.toString();
  }
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL이 없습니다. .env.example을 .env로 복사해 설정해 주세요.");
  return config.DATABASE_URL;
}

function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env, shell: false });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0) resolvePromise();
      else reject(new Error(`${args.join(" ")} 실행 중단 (${signal ?? code})`));
    });
  });
}

/** 실패한 단계 이후에는 시드나 앱 실행으로 넘어가지 않는다. DB 초기화·삭제 명령은 사용하지 않는다. */
export async function bootstrap({ start = false, dev = false, run = runCommand } = {}) {
  await run(process.execPath, ["node_modules/prisma/build/index.js", "generate"]);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run(process.execPath, ["--import", "tsx", "prisma/seed.ts"]);
  if (start || dev) {
    await run(process.execPath, ["node_modules/next/dist/bin/next", dev ? "dev" : "start", "--hostname", "0.0.0.0", "--port", "3000"]);
  }
}

async function main() {
  const args = process.argv.slice(2);
  // Node의 dotenv 처리를 사용한다. 기존 .env를 생성·수정하거나 비밀값을 출력하지 않는다.
  if (existsSync(".env") && !args.includes("--env-loaded")) {
    await runCommand(process.execPath, ["--env-file=.env", fileURLToPath(import.meta.url), "--env-loaded", ...args]);
    return;
  }
  process.env.DATABASE_URL = databaseUrlFromEnv(process.env);
  await bootstrap({ start: args.includes("--start"), dev: args.includes("--dev") });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
