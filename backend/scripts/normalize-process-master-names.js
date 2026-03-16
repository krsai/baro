#!/usr/bin/env node
'use strict';

require('dotenv').config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= 'binary';
const { PrismaClient } = require('@prisma/client');
const {
  buildCombinedLocalizedProcessName,
  normalizeProcessNaming,
} = require('./lib/processNamingRules');

const prisma = new PrismaClient();

const toTrimmedText = (value) => String(value ?? '').trim();

const sameValue = (left, right) => toTrimmedText(left) === toTrimmedText(right);

const normalizeOrgId = (value, fallback = 2) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeAttrProcesses = async (orgId) => {
  const rows = await prisma.attrProcess.findMany({
    where: { orgId },
    orderBy: { code: 'asc' },
  });

  const normalizedByCode = new Map();
  let updatedCount = 0;

  for (const row of rows) {
    const normalized = normalizeProcessNaming(row);
    normalizedByCode.set(normalized.code, normalized);

    if (
      sameValue(row.name, normalized.name) &&
      sameValue(row.nameEn, normalized.nameEn) &&
      sameValue(row.nameKo, normalized.nameKo) &&
      sameValue(row.nameVi, normalized.nameVi)
    ) {
      continue;
    }

    await prisma.attrProcess.update({
      where: { id: row.id },
      data: {
        name: normalized.name,
        nameEn: normalized.nameEn,
        nameKo: normalized.nameKo,
        nameVi: normalized.nameVi,
      },
    });
    updatedCount += 1;
  }

  return { normalizedByCode, updatedCount, totalCount: rows.length };
};

const normalizeStyleProcessMirror = async (orgId, normalizedByCode) => {
  const rows = await prisma.styleProcess.findMany({
    where: { orgId },
    select: { id: true, processCode: true, processName: true },
  });

  let updatedCount = 0;

  for (const row of rows) {
    const normalized = normalizedByCode.get(toTrimmedText(row.processCode).toUpperCase());
    if (!normalized) continue;

    const nextName = buildCombinedLocalizedProcessName(normalized);
    if (sameValue(row.processName, nextName)) continue;

    await prisma.styleProcess.update({
      where: { id: row.id },
      data: { processName: nextName },
    });
    updatedCount += 1;
  }

  return { updatedCount, totalCount: rows.length };
};

const normalizeStyleJsonProcesses = async (orgId, normalizedByCode) => {
  const styles = await prisma.style.findMany({
    where: { orgId },
    select: { uid: true, styleCode: true, processes: true },
    orderBy: { uid: 'asc' },
  });

  let updatedStyleCount = 0;
  let updatedProcessCount = 0;

  for (const style of styles) {
    const processes = Array.isArray(style.processes) ? style.processes : null;
    if (!processes) continue;

    let touched = false;
    const nextProcesses = processes.map((process) => {
      if (!process || typeof process !== 'object' || Array.isArray(process)) return process;

      const code = toTrimmedText(process.code).toUpperCase();
      const normalized = normalizedByCode.get(code);
      if (!normalized) return process;

      const nextName = buildCombinedLocalizedProcessName(normalized);
      if (sameValue(process.name, nextName)) return process;

      touched = true;
      updatedProcessCount += 1;
      return {
        ...process,
        name: nextName,
      };
    });

    if (!touched) continue;

    await prisma.style.update({
      where: { uid: style.uid },
      data: { processes: nextProcesses },
    });
    updatedStyleCount += 1;
  }

  return { updatedStyleCount, updatedProcessCount, totalCount: styles.length };
};

const main = async () => {
  const orgId = normalizeOrgId(process.argv[2], 2);
  const attrResult = await normalizeAttrProcesses(orgId);
  const styleProcessResult = await normalizeStyleProcessMirror(
    orgId,
    attrResult.normalizedByCode
  );
  const styleJsonResult = await normalizeStyleJsonProcesses(
    orgId,
    attrResult.normalizedByCode
  );

  console.log(
    JSON.stringify(
      {
        orgId,
        attrProcesses: {
          totalCount: attrResult.totalCount,
          updatedCount: attrResult.updatedCount,
        },
        styleProcessMirror: styleProcessResult,
        styleJson: styleJsonResult,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
