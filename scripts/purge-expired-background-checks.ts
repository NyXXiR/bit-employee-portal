import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const now = new Date();
  const result = await db.backgroundCheck.updateMany({
    where:{retentionUntil:{lte:now},resultPurgedAt:null},
    data:{criminalRecord:null,educationVerified:null,employmentVerified:null,creditScore:null,resultPurgedAt:now},
  });
  console.log(JSON.stringify({purged:result.count,executedAt:now.toISOString()}));
}

void main().finally(()=>db.$disconnect());
