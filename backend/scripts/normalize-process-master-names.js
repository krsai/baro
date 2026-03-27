#!/usr/bin/env node
'use strict';

require('dotenv').config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= 'binary';
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TOKEN_SEPARATOR = '\u00B7';
const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

const toTrimmedText = (value) => String(value ?? '').trim();
const normalizeProcessCodeKey = (value) => toTrimmedText(value).toUpperCase();
const sameValue = (left, right) => toTrimmedText(left) === toTrimmedText(right);

const PROCESS_TEXT_PLACEHOLDERS = {
  ko: {
    target: '((주대상 누락))',
    action: '((작업 누락))',
  },
  en: {
    target: '((Primary target missing))',
    action: '((Action missing))',
  },
  vi: {
    target: '((Thieu doi tuong chinh))',
    action: '((Thieu thao tac))',
  },
};

const splitProcessTokens = (value, separatorPattern) =>
  String(value ?? '')
    .split(separatorPattern)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeProcessPlaceholderText = (text, placeholders) => {
  const normalized = toTrimmedText(text);
  if (!normalized) return normalized;
  const compact = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    /(primary|주대상|doi tuong chinh)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.target;
  }
  if (
    /(action|작업|thao tac)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.action;
  }
  return normalized;
};

const normalizeProcessDisplayText = (value, placeholders) => {
  const rawText = toTrimmedText(value);
  if (!rawText) {
    return `${placeholders.target} - ${placeholders.action}`;
  }

  const [leftChunk = '', rightChunk = ''] = String(rawText).split(/\s*-\s*/, 2);
  const rawLeft = normalizeProcessPlaceholderText(
    toTrimmedText(leftChunk) || placeholders.target,
    placeholders
  );
  const rawRight = normalizeProcessPlaceholderText(
    toTrimmedText(rightChunk) || placeholders.action,
    placeholders
  );

  let partText = rawLeft;
  let targetText = '';
  let shouldRequireTarget = false;
  const hasHangul = HANGUL_REGEX.test(rawLeft);
  const isPlaceholderLeft = rawLeft.includes('((') && rawLeft.includes('))');

  const colonIndex = rawLeft.indexOf(':');
  if (!isPlaceholderLeft && colonIndex >= 0) {
    partText = rawLeft.slice(0, colonIndex).trim();
    targetText = rawLeft.slice(colonIndex + 1).trim();
    shouldRequireTarget = true;
  } else if (!isPlaceholderLeft && rawLeft.includes('/')) {
    const slashTokens = splitProcessTokens(rawLeft, /[\u00B7/]/g);
    if (slashTokens.length > 1) {
      partText = slashTokens[0] ?? '';
      targetText = slashTokens.slice(1).join(TOKEN_SEPARATOR);
      shouldRequireTarget = true;
    }
  } else {
    const firstSpaceMatch = rawLeft.match(/\s+/);
    const firstSpaceIndex = firstSpaceMatch?.index ?? -1;
    if (hasHangul && !isPlaceholderLeft && firstSpaceIndex > 0) {
      partText = rawLeft.slice(0, firstSpaceIndex).trim();
      targetText = rawLeft.slice(firstSpaceIndex + firstSpaceMatch[0].length).trim();
      shouldRequireTarget = true;
    }
  }

  const normalizedPart = partText || placeholders.target;
  const normalizedTargets = splitProcessTokens(targetText, /[\u00B7/]/g).join(
    TOKEN_SEPARATOR
  );
  const leftText =
    shouldRequireTarget || normalizedTargets
      ? `${normalizedPart}: ${normalizedTargets || placeholders.target}`
      : normalizedPart;

  const specTokens = Array.from(rawRight.matchAll(/\(([^)]*)\)/g))
    .map((match) => match?.[1] ?? '')
    .flatMap((specValue) => splitProcessTokens(specValue, /[\u00B7/+]/g));
  const normalizedSpec = specTokens.join(TOKEN_SEPARATOR);
  const actionChunk = rawRight.replace(/\([^)]*\)/g, ' ');
  const normalizedActions = splitProcessTokens(actionChunk, /[\u00B7+]/g).join(
    TOKEN_SEPARATOR
  );
  const rightText = normalizedActions || placeholders.action;

  return normalizedSpec
    ? `${leftText} - ${rightText} (${normalizedSpec})`
    : `${leftText} - ${rightText}`;
};

const normalizeOptionalProcessDisplayText = (value, placeholders) => {
  const text = toTrimmedText(value);
  if (!text) return null;
  return normalizeProcessDisplayText(text, placeholders);
};

const normalizeProcessNameData = (row = {}) => {
  const fallbackName = toTrimmedText(row?.name);
  const rawNameEn = toTrimmedText(row?.nameEn) || fallbackName;
  const rawNameKo = toTrimmedText(row?.nameKo);
  const rawNameVi = toTrimmedText(row?.nameVi);

  const nameEn = normalizeProcessDisplayText(rawNameEn, PROCESS_TEXT_PLACEHOLDERS.en);
  const nameKo = normalizeOptionalProcessDisplayText(
    rawNameKo,
    PROCESS_TEXT_PLACEHOLDERS.ko
  );
  const nameVi = normalizeOptionalProcessDisplayText(
    rawNameVi,
    PROCESS_TEXT_PLACEHOLDERS.vi
  );

  return {
    code: toTrimmedText(row?.code),
    name: nameEn,
    nameEn,
    nameKo,
    nameVi,
  };
};

const buildCombinedLocalizedProcessName = ({ code, nameEn, nameKo, nameVi }) => {
  const parts = [toTrimmedText(nameKo), toTrimmedText(nameVi)].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  return (
    toTrimmedText(nameEn) ||
    toTrimmedText(code) ||
    `${PROCESS_TEXT_PLACEHOLDERS.ko.target} / ${PROCESS_TEXT_PLACEHOLDERS.vi.target}`
  );
};

const normalizeAttrProcesses = async (orgId) => {
  const rows = await prisma.attrProcess.findMany({
    where: { orgId },
    orderBy: { code: 'asc' },
  });

  const normalizedByCode = new Map();
  let updatedCount = 0;

  for (const row of rows) {
    const normalized = normalizeProcessNameData(row);
    normalizedByCode.set(normalizeProcessCodeKey(normalized.code), normalized);

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
    const normalized = normalizedByCode.get(normalizeProcessCodeKey(row.processCode));
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
    select: { uid: true, processes: true },
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

      const code = normalizeProcessCodeKey(process.code);
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

const resolveTargetOrgIds = async () => {
  const input = toTrimmedText(process.argv[2]);
  if (!input) return [2];

  if (input.toLowerCase() === '--all') {
    const orgs = await prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return orgs
      .map((org) => Number(org.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  const parsed = Number.parseInt(input, 10);
  return [Number.isFinite(parsed) && parsed > 0 ? parsed : 2];
};

const main = async () => {
  const orgIds = await resolveTargetOrgIds();
  const summaries = [];

  for (const orgId of orgIds) {
    const attrResult = await normalizeAttrProcesses(orgId);
    const styleProcessResult = await normalizeStyleProcessMirror(
      orgId,
      attrResult.normalizedByCode
    );
    const styleJsonResult = await normalizeStyleJsonProcesses(
      orgId,
      attrResult.normalizedByCode
    );

    summaries.push({
      orgId,
      attrProcesses: {
        totalCount: attrResult.totalCount,
        updatedCount: attrResult.updatedCount,
      },
      styleProcessMirror: styleProcessResult,
      styleJson: styleJsonResult,
    });
  }

  console.log(JSON.stringify({ orgCount: summaries.length, summaries }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

