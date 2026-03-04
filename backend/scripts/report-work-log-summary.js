#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const ORG_ID = 2;

async function main() {
  const logs = await prisma.workLog.findMany({
    where: { orgId: ORG_ID },
    orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
    include: {
      workRecords: {
        select: {
          quantity: true,
          ctSeconds: true,
        },
      },
    },
  });

  const rows = logs.map((log) => ({
    id: log.id,
    workDate: log.workDate,
    factoryId: log.factoryId,
    workerCount: log.workerCount,
    itemCount: log.itemCount,
    recordCount: log.workRecords.length,
    totalHours:
      Math.round(((Number(log.totalContractedSeconds) || 0) / 3600) * 10) / 10,
    calcHours:
      Math.round(
        (log.workRecords.reduce(
          (sum, record) =>
            sum + (Number(record.ctSeconds) || 0) * (Number(record.quantity) || 0),
          0
        ) /
          3600) *
          10
      ) / 10,
    note: log.note,
  }));

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
