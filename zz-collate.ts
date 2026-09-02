import { db } from "./src/server/db";

async function main() {
  const info: unknown = await db.$queryRawUnsafe(
    `SELECT current_setting('lc_collate') AS lc_collate,
            (SELECT datcollate FROM pg_database WHERE datname = current_database()) AS db_collate`,
  );
  console.log("DB 콜레이션:", JSON.stringify(info));

  const col: unknown = await db.$queryRawUnsafe(
    `SELECT collation_name FROM information_schema.columns
      WHERE table_name='Employee' AND column_name='familyName'`,
  );
  console.log("컬럼 콜레이션:", JSON.stringify(col));

  const def: unknown = await db.$queryRawUnsafe(
    `SELECT "familyName"||"givenName" AS name FROM "Employee" ORDER BY "familyName","givenName"`,
  );
  console.log("\n기본 정렬 :", (def as {name:string}[]).map(r=>r.name).join(", "));

  try {
    const icu: unknown = await db.$queryRawUnsafe(
      `SELECT "familyName"||"givenName" AS name FROM "Employee"
        ORDER BY "familyName" COLLATE "ko-KR-x-icu", "givenName" COLLATE "ko-KR-x-icu"`,
    );
    console.log("ko-KR-x-icu:", (icu as {name:string}[]).map(r=>r.name).join(", "));
  } catch (e) {
    console.log("ko-KR-x-icu 사용 불가:", (e as Error).message.split("\n")[0]);
  }

  try {
    const c: unknown = await db.$queryRawUnsafe(
      `SELECT "familyName"||"givenName" AS name FROM "Employee"
        ORDER BY "familyName" COLLATE "C", "givenName" COLLATE "C"`,
    );
    console.log('COLLATE "C" :', (c as {name:string}[]).map(r=>r.name).join(", "));
  } catch (e) {
    console.log('COLLATE "C" 실패:', (e as Error).message.split("\n")[0]);
  }
}

main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
