import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../backend/node_modules/@prisma/client/default.js";
import relationshipTimeBucketService from "../backend/dist/services/relationshipTimeBuckets.js";

const {
  createQuantityBucketSetVersion,
  syncStyleStandardsForBucketVersion,
} = relationshipTimeBucketService;

const baseUrl = process.env.RELATIONSHIP_BUCKET_TEST_DATABASE_URL;
if (!baseUrl) {
  throw new Error("RELATIONSHIP_BUCKET_TEST_DATABASE_URL is required");
}

const schemaName = `relationship_bucket_test_${randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(baseUrl);
testUrl.searchParams.set("schema", schemaName);
const testDatabaseUrl = testUrl.toString();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(rootDir, "backend");
const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
let db;

const createBucketVersion = async ({ orgId, name, quantities }) => {
  return createQuantityBucketSetVersion({
    db,
    orgId,
    setName: name,
    bucketQuantities: quantities,
    actor: "TEST:RELATIONSHIP_BUCKET_ISOLATION",
  });
};

const transitionRelationship = async ({ relationshipId, styleId, quantities }) =>
  db.$transaction(async (tx) => {
    const relationship = await tx.orgRelationship.findUniqueOrThrow({
      where: { id: relationshipId },
      include: {
        timeBucketSetVersion: {
          include: {
            quantityBucketSet: true,
            entries: { orderBy: { bucketQuantity: "asc" } },
          },
        },
      },
    });
    const previousVersion = relationship.timeBucketSetVersion;
    assert(previousVersion);
    const nextVersion = await createQuantityBucketSetVersion({
      db: tx,
      orgId: relationship.manufacturerOrgId,
      setName: relationship.timeBucketSetVersion.quantityBucketSet.name,
      existingSetId: previousVersion.quantityBucketSetId,
      bucketQuantities: quantities,
      actor: "TEST:RELATIONSHIP_BUCKET_ISOLATION",
    });
    const previousQuantities = previousVersion.entries.map(
      (entry) => entry.bucketQuantity
    );
    const addedQuantities = quantities.filter(
      (quantity) => !previousQuantities.includes(quantity)
    );
    await syncStyleStandardsForBucketVersion({
      db: tx,
      transitions: [{
        styleId,
        processOrgId: relationship.manufacturerOrgId,
        previousVersionId: previousVersion.id,
        nextVersionId: nextVersion.id,
      }],
      addedBucketQuantities: addedQuantities,
    });
    await tx.orgRelationship.update({
      where: { id: relationship.id },
      data: { timeBucketSetVersionId: nextVersion.id },
    });
    return nextVersion.id;
  }, { timeout: 30000 });

const relationshipState = async (relationshipId, styleId) => {
  const relationship = await db.orgRelationship.findUniqueOrThrow({
    where: { id: relationshipId },
    include: {
      timeBucketSetVersion: {
        include: { entries: { orderBy: { bucketQuantity: "asc" } } },
      },
    },
  });
  const standards = await db.styleProcessStandard.findMany({
    where: {
      orgId: relationship.manufacturerOrgId,
      styleProcess: { styleId },
      quantityBucketSetVersionId: relationship.timeBucketSetVersionId,
    },
    orderBy: [{ styleProcessId: "asc" }, { quantityBucketEntryId: "asc" }],
    include: { quantityBucketEntry: true },
  });
  const plans = await db.assignmentPlan.findMany({
    where: { orgRelationshipId: relationship.id },
    orderBy: { id: "asc" },
    select: { id: true, assignmentStSnapshot: true },
  });
  return {
    versionId: relationship.timeBucketSetVersionId,
    entries: relationship.timeBucketSetVersion.entries.map((entry) => ({
      id: entry.id,
      quantity: entry.bucketQuantity,
    })),
    standards: standards.map((standard) => ({
      id: standard.id,
      processId: standard.styleProcessId,
      entryId: standard.quantityBucketEntryId,
      quantity: standard.quantityBucketEntry.bucketQuantity,
      seconds: standard.bucketStSeconds,
      setBy: standard.setBy,
    })),
    plans,
  };
};

try {
  execFileSync(
    process.execPath,
    [
      path.join(backendDir, "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      "prisma/schema.prisma",
    ],
    {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
      stdio: "inherit",
    }
  );
  db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

  const manufacturerA = await db.organization.create({
    data: { name: "Manufacturer A", code: "TEST_MA", type: "MANUFACTURER" },
  });
  const manufacturerB = await db.organization.create({
    data: { name: "Manufacturer B", code: "TEST_MB", type: "MANUFACTURER" },
  });
  const brand = await db.organization.create({
    data: { name: "Shared Brand", code: "TEST_BRAND", type: "BRAND" },
  });
  const versionA = await createBucketVersion({
    orgId: manufacturerA.id,
    name: "REL_A_TIME",
    quantities: [1, 10, 30],
  });
  const versionB = await createBucketVersion({
    orgId: manufacturerB.id,
    name: "REL_B_TIME",
    quantities: [1, 5, 10],
  });
  const relationshipA = await db.orgRelationship.create({
    data: {
      manufacturerOrgId: manufacturerA.id,
      brandOrgId: brand.id,
      timeBucketSetVersionId: versionA.id,
    },
  });
  const relationshipB = await db.orgRelationship.create({
    data: {
      manufacturerOrgId: manufacturerB.id,
      brandOrgId: brand.id,
      timeBucketSetVersionId: versionB.id,
    },
  });
  const style = await db.style.create({
    data: { orgId: brand.id, code: "SHARED_STYLE", name: "Shared Style" },
  });

  for (const [manufacturer, version, baseSeconds] of [
    [manufacturerA, versionA, 100],
    [manufacturerB, versionB, 200],
  ]) {
    const factory = await db.factory.create({
      data: { orgId: manufacturer.id, name: `Factory ${manufacturer.id}` },
    });
    const line = await db.line.create({
      data: { orgId: manufacturer.id, factoryId: factory.id, name: "Line 1" },
    });
    const process = await db.styleProcess.create({
      data: {
        orgId: manufacturer.id,
        styleId: style.id,
        processCode: "SEW",
        processName: "Sewing",
        ptSeconds: baseSeconds,
      },
    });
    for (const [index, entry] of version.entries.entries()) {
      await db.styleProcessStandard.create({
        data: {
          orgId: manufacturer.id,
          styleProcessId: process.id,
          quantityBucketEntryId: entry.id,
          quantityBucketSetVersionId: version.id,
          bucketStSeconds: baseSeconds + index,
          setBy: "MANUAL",
        },
      });
    }
    const relationship = manufacturer.id === manufacturerA.id ? relationshipA : relationshipB;
    await db.assignmentPlan.create({
      data: {
        orgId: manufacturer.id,
        lineId: line.id,
        externalId: `PLAN_${manufacturer.id}`,
        styleId: style.id,
        buyerOrgId: brand.id,
        orgRelationshipId: relationship.id,
        assignmentQuantity: 10,
        assignmentStTotalSeconds: baseSeconds * 10,
        assignmentStSnapshot: {
          version: 1,
          quantityBucketSetVersionId: version.id,
          quantityBucketEntryId: version.entries[0].id,
          bucketQuantity: 1,
          marker: `immutable-${manufacturer.id}`,
        },
        startIndex: 0,
        endIndex: 0,
      },
    });
  }

  const beforeA = await relationshipState(relationshipA.id, style.id);
  const beforeB = await relationshipState(relationshipB.id, style.id);
  await transitionRelationship({
    relationshipId: relationshipA.id,
    styleId: style.id,
    quantities: [1, 3, 5],
  });
  const afterA = await relationshipState(relationshipA.id, style.id);
  const afterB = await relationshipState(relationshipB.id, style.id);
  assert.notEqual(afterA.versionId, beforeA.versionId);
  assert.deepEqual(afterA.entries.map((entry) => entry.quantity), [1, 3, 5]);
  assert.deepEqual(
    afterA.standards.map(({ quantity, seconds, setBy }) => ({ quantity, seconds, setBy })),
    [
      { quantity: 1, seconds: 100, setBy: "MANUAL" },
      { quantity: 3, seconds: 100, setBy: "BUCKET_INHERITED_REVIEW" },
      { quantity: 5, seconds: 100, setBy: "BUCKET_INHERITED_REVIEW" },
    ]
  );
  assert.deepEqual(afterA.plans, beforeA.plans);
  assert.deepEqual(afterB, beforeB);

  const stableA = structuredClone(afterA);
  await transitionRelationship({
    relationshipId: relationshipB.id,
    styleId: style.id,
    quantities: [1, 10, 30],
  });
  const finalA = await relationshipState(relationshipA.id, style.id);
  const finalB = await relationshipState(relationshipB.id, style.id);
  assert.deepEqual(finalA, stableA);
  assert.deepEqual(finalB.entries.map((entry) => entry.quantity), [1, 10, 30]);
  assert.deepEqual(
    finalB.standards.map(({ quantity, seconds, setBy }) => ({ quantity, seconds, setBy })),
    [
      { quantity: 1, seconds: 200, setBy: "MANUAL" },
      { quantity: 10, seconds: 202, setBy: "MANUAL" },
      { quantity: 30, seconds: 202, setBy: "BUCKET_INHERITED_REVIEW" },
    ]
  );
  assert.deepEqual(finalB.plans, beforeB.plans);

  const failingProcess = await db.styleProcess.create({
    data: {
      orgId: manufacturerA.id,
      styleId: style.id,
      processCode: "FAIL_NO_LOWER_ST",
      processName: "Missing lower ST",
      ptSeconds: 300,
    },
  });
  for (const entry of finalA.entries.filter((item) => item.quantity > 1)) {
    await db.styleProcessStandard.create({
      data: {
        orgId: manufacturerA.id,
        styleProcessId: failingProcess.id,
        quantityBucketEntryId: entry.id,
        quantityBucketSetVersionId: finalA.versionId,
        bucketStSeconds: 300,
        setBy: "MANUAL",
      },
    });
  }
  const activeVersionBeforeFailure = await db.quantityBucketSetVersion.findUniqueOrThrow({
    where: { id: finalA.versionId },
    select: { quantityBucketSetId: true },
  });
  const setBeforeFailure = await db.quantityBucketSet.findUniqueOrThrow({
    where: { id: activeVersionBeforeFailure.quantityBucketSetId },
    select: { currentVersionId: true },
  });
  const versionCountBeforeFailure = await db.quantityBucketSetVersion.count({
    where: { quantityBucketSetId: activeVersionBeforeFailure.quantityBucketSetId },
  });
  const standardCountBeforeFailure = await db.styleProcessStandard.count({
    where: { styleProcessId: failingProcess.id },
  });
  await assert.rejects(
    transitionRelationship({
      relationshipId: relationshipA.id,
      styleId: style.id,
      quantities: [2, 3, 5],
    }),
    /has no lower bucket ST/
  );
  const relationshipAfterFailure = await db.orgRelationship.findUniqueOrThrow({
    where: { id: relationshipA.id },
    select: { timeBucketSetVersionId: true },
  });
  const setAfterFailure = await db.quantityBucketSet.findUniqueOrThrow({
    where: { id: activeVersionBeforeFailure.quantityBucketSetId },
    select: { currentVersionId: true },
  });
  assert.equal(relationshipAfterFailure.timeBucketSetVersionId, finalA.versionId);
  assert.equal(setAfterFailure.currentVersionId, setBeforeFailure.currentVersionId);
  assert.equal(
    await db.quantityBucketSetVersion.count({
      where: { quantityBucketSetId: activeVersionBeforeFailure.quantityBucketSetId },
    }),
    versionCountBeforeFailure
  );
  assert.equal(
    await db.styleProcessStandard.count({ where: { styleProcessId: failingProcess.id } }),
    standardCountBeforeFailure
  );
  console.log("relationship time bucket integration: PASS");
} finally {
  try {
    if (db) await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}
