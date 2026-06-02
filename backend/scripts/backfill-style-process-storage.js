#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DEFAULT_TIME_REF_QUANTITY = 1000;

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const toOptionalSeconds = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : parsed;
};

const toOptionalString = (value, fallback = null) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const normalizeProcessCodeKey = (value) => {
  const text = String(value ?? "").trim().toUpperCase();
  return text || "";
};

const normalizeProcessNameKey = (value) => {
  const text = String(value ?? "").trim();
  return text ? text.toUpperCase() : "";
};

const normalizeAtParams = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = toOptionalSeconds(value.a);
  const b = toOptionalSeconds(value.b);
  if (a === null || b === null) return null;
  return {
    ...value,
    a,
    b,
  };
};

const normalizeStValues = (values, legacyProcess = null) => {
  const byQuantity = new Map();
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const quantity = toPositiveInt(value.bucketQuantity ?? value.quantity, 0);
    const seconds = toOptionalSeconds(value.bucketStSeconds ?? value.seconds);
    if (quantity <= 0 || seconds === null) return;
    byQuantity.set(quantity, {
      bucketQuantity: quantity,
      bucketStSeconds: seconds,
      setBy: toOptionalString(value.setBy, null),
      setAt: toOptionalString(value.setAt, null),
      updatedAt: toOptionalString(value.updatedAt, null),
    });
  });

  const legacyCt = toOptionalSeconds(legacyProcess?.ct);
  const legacyQuantity = toPositiveInt(
    legacyProcess?.timeRefQuantity ?? legacyProcess?.referenceQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );

  if (
    byQuantity.size === 0 &&
    legacyProcess?.stManual === true &&
    legacyCt !== null &&
    legacyQuantity > 0
  ) {
    byQuantity.set(legacyQuantity, {
      bucketQuantity: legacyQuantity,
      bucketStSeconds: legacyCt,
      setBy: "MIGRATED",
      setAt: null,
      updatedAt: null,
    });
  }

  return Array.from(byQuantity.values()).sort(
    (left, right) => left.bucketQuantity - right.bucketQuantity
  );
};

const normalizeProcesses = (processes) => {
  if (!Array.isArray(processes)) return [];
  return processes
    .map((process) => {
      if (!process || typeof process !== "object" || Array.isArray(process)) return null;
      return process;
    })
    .filter(Boolean);
};

const resolveStorageCode = (process, index) => {
  const codeKey = normalizeProcessCodeKey(process?.code);
  if (codeKey) return codeKey;
  const nameKey = normalizeProcessNameKey(process?.name);
  if (nameKey) return nameKey;
  return `PROC_${index + 1}`;
};

const buildDrafts = (processes) =>
  normalizeProcesses(processes).map((process, index) => ({
    processCode: resolveStorageCode(process, index),
    processName:
      toOptionalString(process?.name, null) ??
      toOptionalString(process?.code, null) ??
      resolveStorageCode(process, index),
    processDescription: toOptionalString(process?.description, null),
    timesPerPiece: toPositiveInt(
      process?.timesPerPiece ?? process?.quantity ?? process?.processQuantity,
      1
    ),
    sortOrder: index,
    ptSeconds: toOptionalSeconds(process?.pt),
    atParams: normalizeAtParams(process?.atParams),
    stValues: normalizeStValues(process?.stBuckets ?? process?.stValues, process),
  }));

const buildMirrorProcesses = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .slice()
    .sort(
      (left, right) =>
            Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0) ||
            Number(left?.id ?? 0) - Number(right?.id ?? 0)
    )
    .map((row) => {
      const standards = (Array.isArray(row?.standards) ? row.standards : [])
        .slice()
        .sort(
          (left, right) =>
            Number(left?.bucketQuantity ?? left?.quantity ?? 0) -
              Number(right?.bucketQuantity ?? right?.quantity ?? 0) ||
            Number(left?.id ?? 0) - Number(right?.id ?? 0)
        )
        .map((standard) => ({
          bucketQuantity: toPositiveInt(
            standard.bucketQuantity ?? standard.quantity,
            DEFAULT_TIME_REF_QUANTITY
          ),
          bucketStSeconds: toOptionalSeconds(standard.bucketStSeconds ?? standard.stSeconds),
          setBy: toOptionalString(standard.setBy, null),
          setAt: standard.setAt instanceof Date ? standard.setAt.toISOString() : null,
          updatedAt: standard.updatedAt instanceof Date ? standard.updatedAt.toISOString() : null,
        }));
      const firstStandard = standards[0] || null;
      const timeRefQuantity = firstStandard?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY;
      const exactStandard =
        standards.find((standard) => standard.bucketQuantity === timeRefQuantity) || null;

      return {
        code: row.processCode,
        name: row.processName,
        description: row.processDescription ?? null,
        timesPerPiece: toPositiveInt(row.timesPerPiece ?? row.processQuantity, 1),
        pt: toOptionalSeconds(row.ptSeconds),
        atParams: normalizeAtParams(row.atParams),
        stBuckets: standards,
        timeRefQuantity,
        ct: exactStandard?.bucketStSeconds ?? null,
        stManual: standards.length > 0,
      };
    });

const syncStyle = async (style) => {
  const drafts = buildDrafts(style.processes);
  const existingRows = await prisma.styleProcess.findMany({
    where: { styleUid: style.uid },
    select: { id: true, processCode: true },
  });
  const existingByCode = new Map(
    existingRows.map((row) => [normalizeProcessCodeKey(row.processCode), row.id])
  );
  const nextCodes = new Set(drafts.map((draft) => normalizeProcessCodeKey(draft.processCode)));

  const deleteIds = existingRows
    .filter((row) => !nextCodes.has(normalizeProcessCodeKey(row.processCode)))
    .map((row) => row.id);

  if (deleteIds.length > 0) {
    await prisma.styleProcess.deleteMany({
      where: { id: { in: deleteIds } },
    });
  }

  let processCount = 0;
  let standardCount = 0;

  for (const draft of drafts) {
    const existingId = existingByCode.get(normalizeProcessCodeKey(draft.processCode));
    const row = existingId
      ? await prisma.styleProcess.update({
          where: { id: existingId },
          data: {
            processCode: draft.processCode,
            processName: draft.processName,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        })
      : await prisma.styleProcess.create({
          data: {
            orgId: style.orgId,
            styleUid: style.uid,
            processCode: draft.processCode,
            processName: draft.processName,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        });

    await prisma.styleProcessStandard.deleteMany({
      where: { styleProcessId: row.id },
    });

    if (draft.stValues.length > 0) {
      await prisma.styleProcessStandard.createMany({
        data: draft.stValues.map((stValue) => ({
          orgId: style.orgId,
          styleProcessId: row.id,
          bucketQuantity: stValue.bucketQuantity,
          bucketStSeconds: stValue.bucketStSeconds,
          setBy: stValue.setBy,
          ...(stValue.setAt ? { setAt: new Date(stValue.setAt) } : {}),
        })),
      });
    }

    processCount += 1;
    standardCount += draft.stValues.length;
  }

  const rows = await prisma.styleProcess.findMany({
    where: { styleUid: style.uid },
    include: {
      standards: {
        orderBy: [{ bucketQuantity: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  await prisma.style.update({
    where: { uid: style.uid },
    data: {
      processes: buildMirrorProcesses(rows),
    },
  });

  return {
    styleUid: style.uid,
    styleId: style.styleId,
    processCount,
    standardCount,
  };
};

const parseOrgIdArg = () => {
  const arg = process.argv.find((value) => String(value).startsWith("--orgId="));
  if (!arg) return null;
  const raw = String(arg).split("=")[1];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid orgId argument: ${raw}`);
  }
  return Math.trunc(parsed);
};

async function main() {
  const orgId = parseOrgIdArg();
  const styles = await prisma.style.findMany({
    where: orgId ? { orgId } : undefined,
    select: {
      uid: true,
      orgId: true,
      styleId: true,
      processes: true,
    },
    orderBy: [{ orgId: "asc" }, { uid: "asc" }],
  });

  const candidates = styles.filter((style) => normalizeProcesses(style.processes).length > 0);
  const results = [];
  for (const style of candidates) {
    const result = await syncStyle(style);
    results.push(result);
  }

  const summary = results.reduce(
    (acc, row) => {
      acc.styles += 1;
      acc.processes += row.processCount;
      acc.standards += row.standardCount;
      return acc;
    },
    { styles: 0, processes: 0, standards: 0 }
  );

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main()
  .catch((error) => {
    console.error("[backfill-style-process-storage] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
