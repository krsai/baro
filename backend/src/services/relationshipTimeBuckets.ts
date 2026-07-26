import type { Prisma } from "@prisma/client";
import { ensureArray, toPositiveIntOrNull } from "../utils/common";
import { createHttpError } from "../utils/http";

export const normalizeQuantityBucketValues = (value: any): number[] => {
  const quantities = Array.from(
    new Set(
      ensureArray(value)
        .map((item) => toPositiveIntOrNull(item))
        .filter((item): item is number => item !== null)
    )
  ).sort((left, right) => left - right);
  if (quantities.length === 0) {
    throw createHttpError(400, "at least one positive bucket quantity is required");
  }
  if (quantities.length > 50) {
    throw createHttpError(400, "quantity bucket count cannot exceed 50");
  }
  return quantities;
};

export const createQuantityBucketSetVersion = async ({
  db,
  orgId,
  setName,
  existingSetId = null,
  bucketQuantities,
  actor,
}: {
  db: Prisma.TransactionClient;
  orgId: number;
  setName: string;
  existingSetId?: number | null;
  bucketQuantities: number[];
  actor: string;
}) => {
  const quantities = normalizeQuantityBucketValues(bucketQuantities);
  const set = existingSetId
    ? await db.quantityBucketSet.findFirst({
        where: { id: existingSetId, orgId },
        select: { id: true },
      })
    : await db.quantityBucketSet.upsert({
        where: { orgId_name: { orgId, name: setName } },
        update: {},
        create: { orgId, name: setName, createdBy: actor },
        select: { id: true },
      });
  if (!set) throw createHttpError(409, "quantity bucket set scope mismatch");
  const latest = await db.quantityBucketSetVersion.findFirst({
    where: { quantityBucketSetId: set.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const version = await db.quantityBucketSetVersion.create({
    data: {
      orgId,
      quantityBucketSetId: set.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      createdBy: actor,
      entries: {
        create: quantities.map((bucketQuantity) => ({ orgId, bucketQuantity })),
      },
    },
    include: { entries: { orderBy: { bucketQuantity: "asc" } } },
  });
  await db.quantityBucketSet.update({
    where: { id: set.id },
    data: { currentVersionId: version.id },
  });
  return version;
};

export const syncStyleStandardsForBucketVersion = async ({
  db,
  transitions,
  addedBucketQuantities,
}: {
  db: Prisma.TransactionClient;
  transitions: Array<{
    styleId: number;
    processOrgId: number;
    previousVersionId: number;
    nextVersionId: number;
  }>;
  addedBucketQuantities: number[];
}) => {
  const normalizedTransitions = transitions.filter(
    (item) =>
      toPositiveIntOrNull(item.styleId) !== null &&
      toPositiveIntOrNull(item.processOrgId) !== null &&
      toPositiveIntOrNull(item.previousVersionId) !== null &&
      toPositiveIntOrNull(item.nextVersionId) !== null
  );
  const addedQuantities = Array.from(
    new Set(
      ensureArray(addedBucketQuantities)
        .map((quantity) => toPositiveIntOrNull(quantity))
        .filter((quantity): quantity is number => quantity !== null)
    )
  ).sort((left, right) => left - right);
  if (normalizedTransitions.length === 0) return 0;
  const processes = await db.styleProcess.findMany({
    where: {
      OR: normalizedTransitions.map((item) => ({
        styleId: item.styleId,
        orgId: item.processOrgId,
      })),
    },
    select: {
      id: true,
      orgId: true,
      styleId: true,
      standards: {
        select: {
          id: true,
          bucketStSeconds: true,
          setBy: true,
          setAt: true,
          quantityBucketSetVersionId: true,
          quantityBucketEntry: { select: { id: true, bucketQuantity: true } },
        },
      },
    },
  });
  const versionIds = Array.from(
    new Set(
      normalizedTransitions.flatMap((item) => [
        item.previousVersionId,
        item.nextVersionId,
      ])
    )
  );
  const entries = await db.quantityBucketEntry.findMany({
    where: { quantityBucketSetVersionId: { in: versionIds } },
    select: { id: true, quantityBucketSetVersionId: true, bucketQuantity: true },
  });
  const entriesByVersion = new Map<number, any[]>();
  entries.forEach((entry) => {
    entriesByVersion.set(entry.quantityBucketSetVersionId, [
      ...(entriesByVersion.get(entry.quantityBucketSetVersionId) ?? []),
      entry,
    ]);
  });
  let createdOrUpdatedCount = 0;
  for (const transition of normalizedTransitions) {
    const previousEntries = entriesByVersion.get(transition.previousVersionId) ?? [];
    const nextEntries = entriesByVersion.get(transition.nextVersionId) ?? [];
    const previousEntryByQuantity = new Map(
      previousEntries.map((entry) => [entry.bucketQuantity, entry])
    );
    for (const process of processes.filter(
      (row) =>
        row.styleId === transition.styleId &&
        row.orgId === transition.processOrgId
    )) {
      const previousStandards = ensureArray(process.standards).filter(
        (standard: any) =>
          standard.quantityBucketSetVersionId === transition.previousVersionId
      );
      for (const nextEntry of nextEntries) {
        const bucketQuantity = nextEntry.bucketQuantity;
        const retainedEntry = previousEntryByQuantity.get(bucketQuantity);
        const retainedStandard = retainedEntry
          ? previousStandards.find(
              (standard: any) =>
                standard.quantityBucketEntry?.id === retainedEntry.id
            )
          : null;
        const source =
          retainedStandard ??
          [...previousStandards]
            .filter(
              (standard: any) =>
                Number(standard.quantityBucketEntry?.bucketQuantity) <
                  bucketQuantity && Number(standard.bucketStSeconds) > 0
            )
            .sort(
              (left: any, right: any) =>
                Number(right.quantityBucketEntry?.bucketQuantity) -
                Number(left.quantityBucketEntry?.bucketQuantity)
            )[0];
        if (!source) {
          throw createHttpError(
            409,
            `ST(${bucketQuantity}) cannot be initialized because styleProcessId=${process.id} has no lower bucket ST`
          );
        }
        await db.styleProcessStandard.upsert({
          where: {
            styleProcessId_quantityBucketEntryId: {
              styleProcessId: process.id,
              quantityBucketEntryId: nextEntry.id,
            },
          },
          update: {
            bucketStSeconds: Number(source.bucketStSeconds),
            setBy: retainedStandard ? source.setBy : "BUCKET_INHERITED_REVIEW",
            setAt: retainedStandard ? source.setAt : new Date(),
            quantityBucketSetVersionId: transition.nextVersionId,
          },
          create: {
            orgId: process.orgId,
            styleProcessId: process.id,
            quantityBucketEntryId: nextEntry.id,
            quantityBucketSetVersionId: transition.nextVersionId,
            bucketStSeconds: Number(source.bucketStSeconds),
            setBy: retainedStandard ? source.setBy : "BUCKET_INHERITED_REVIEW",
            setAt: retainedStandard ? source.setAt : undefined,
          },
        });
        if (!retainedStandard && addedQuantities.includes(bucketQuantity)) {
          createdOrUpdatedCount += 1;
        }
      }
    }
  }
  return createdOrUpdatedCount;
};
