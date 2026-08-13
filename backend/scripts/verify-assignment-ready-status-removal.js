#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.DIRECT_URL = String(process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const main = async () => {
  const [legacyCount, completedCount] = await Promise.all([
    prisma.assignmentPlan.count({ where: { scheduleStatus: "READY_TO_COMPLETE" } }),
    prisma.assignmentPlan.count({
      where: { scheduleStatus: "PRODUCTION_COMPLETED", isCompleted: true },
    }),
  ]);

  console.log(JSON.stringify({ legacyReadyToCompleteCount: legacyCount, productionCompletedCount: completedCount }));
  if (legacyCount > 0 && process.argv.includes("--require-clean")) {
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
