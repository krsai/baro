#!/usr/bin/env node
"use strict";

// Verifies the diagnostic migration_fix.sql already runs at deploy time (Step 4b-1)
// as a standalone, re-runnable, blocking-exit-code check. AssignmentPlan/AssignmentCard
// are now the sole source of truth for the assignment board (see AGENTS.md "DB 설계
// 원칙"); AssignmentBoardState.cards/assignments are write-only Prisma.JsonNull targets
// going forward. This only reports legacy rows still carrying JSON data that has no
// matching relational row -- it does not backfill anything (unlike the WorkOrderItem
// backfill, there is no safe automatic mapping from a loose board-state JSON item back
// to an AssignmentPlan/AssignmentCard row without re-deriving fields the relational
// write path already computes, so any mismatch here needs manual investigation).

require("dotenv").config();
process.env.DIRECT_URL = String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
process.env.DATABASE_URL = String(process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const toNumber = (value) => {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const printRows = (title, rows) => {
  if (!rows || rows.length === 0) return;
  console.log(`\n${title}`);
  rows.forEach((row, index) => {
    console.log(`${index + 1}. ${JSON.stringify(row)}`);
  });
};

// jsonb_array_elements raises an error on non-array jsonb, and a CROSS JOIN LATERAL's
// function argument is evaluated as part of FROM (before WHERE can filter anything
// out), so every array access is wrapped in this CASE guard.
const safeArray = (column) =>
  `CASE WHEN state."${column}" IS NOT NULL AND jsonb_typeof(state."${column}"::jsonb) = 'array' THEN state."${column}"::jsonb ELSE '[]'::jsonb END`;

const MISSING_ASSIGNMENTS_QUERY = `
SELECT
  state."orgId",
  COALESCE(assignment_elem.elem ->> 'id', assignment_elem.elem ->> 'externalId') AS "externalId"
FROM "AssignmentBoardState" state
CROSS JOIN LATERAL jsonb_array_elements(${safeArray("assignments")}) AS assignment_elem(elem)
WHERE COALESCE(assignment_elem.elem ->> 'id', assignment_elem.elem ->> 'externalId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AssignmentPlan" plan
    WHERE plan."orgId" = state."orgId"
      AND plan."externalId" = COALESCE(assignment_elem.elem ->> 'id', assignment_elem.elem ->> 'externalId')
  )
`;

const MISSING_CARDS_QUERY = `
SELECT
  state."orgId",
  COALESCE(card_elem.elem ->> 'id', card_elem.elem ->> 'cardId') AS "cardId"
FROM "AssignmentBoardState" state
CROSS JOIN LATERAL jsonb_array_elements(${safeArray("cards")}) AS card_elem(elem)
WHERE COALESCE(card_elem.elem ->> 'id', card_elem.elem ->> 'cardId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AssignmentCard" card
    WHERE card."orgId" = state."orgId"
      AND card."cardId" = COALESCE(card_elem.elem ->> 'id', card_elem.elem ->> 'cardId')
  )
`;

const main = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL or DIRECT_URL is required");
  }

  const [assignmentCount, cardCount] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS "count" FROM (${MISSING_ASSIGNMENTS_QUERY}) m`),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) AS "count" FROM (${MISSING_CARDS_QUERY}) m`),
  ]);
  const missingAssignmentCount = toNumber(assignmentCount?.[0]?.count);
  const missingCardCount = toNumber(cardCount?.[0]?.count);

  console.log("AssignmentBoardState JSON -> AssignmentPlan/AssignmentCard backfill verification");
  console.log(`missingAssignmentCount: ${missingAssignmentCount}`);
  console.log(`missingCardCount: ${missingCardCount}`);

  if (missingAssignmentCount === 0 && missingCardCount === 0) {
    console.log(
      "\nPASS: every legacy AssignmentBoardState.cards/assignments entry has a matching AssignmentCard/AssignmentPlan row. Safe to drop the JSON columns after a final manual review."
    );
    return;
  }

  const [assignmentSamples, cardSamples] = await Promise.all([
    prisma.$queryRawUnsafe(`${MISSING_ASSIGNMENTS_QUERY} LIMIT 20;`),
    prisma.$queryRawUnsafe(`${MISSING_CARDS_QUERY} LIMIT 20;`),
  ]);
  printRows("Board assignments missing an AssignmentPlan row", assignmentSamples);
  printRows("Board cards missing an AssignmentCard row", cardSamples);
  throw new Error(
    "AssignmentBoardState backfill verification failed; do not drop cards/assignments columns until every row above is resolved."
  );
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
