#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { seedBaselineWorkLogs } = require('./lib/seed-baseline-work-logs');

const prisma = new PrismaClient();
const MANUFACTURER_CODE = 'TSMF';

async function main() {
  const manufacturer = await prisma.organization.findFirst({
    where: { code: MANUFACTURER_CODE },
    select: { id: true, code: true, name: true },
  });

  if (!manufacturer) {
    throw new Error(`organization not found for code ${MANUFACTURER_CODE}`);
  }

  const result = await seedBaselineWorkLogs({
    prisma,
    orgId: manufacturer.id,
  });

  console.log(JSON.stringify({
    orgId: manufacturer.id,
    orgCode: manufacturer.code,
    orgName: manufacturer.name,
    ...result,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
