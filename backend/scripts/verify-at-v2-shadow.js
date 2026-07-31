const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

const main = async () => {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRawUnsafe(`
      SELECT
        o."orgId",
        o."styleProcessId",
        sp."styleId",
        sp."processCode",
        sp."processName",
        o."assignmentPlanId",
        o."quantity",
        o."perPieceObservedSeconds",
        sp."atParams"->>'a' AS "v1A",
        sp."atParams"->>'b' AS "v1B",
        sp."atParams"->>'fitStatus' AS "v1FitStatus"
      FROM "StyleProcessAtObservation" o
      JOIN "StyleProcess" sp ON sp.id = o."styleProcessId"
      WHERE o."modelVersion" = 'v2'
      ORDER BY o."orgId", o."styleProcessId", o."quantity", o."assignmentPlanId"
    `);
  });

  const comparisons = rows.map((row) => {
    const quantity = Number(row.quantity);
    const observed = Number(row.perPieceObservedSeconds);
    const a = Number(row.v1A);
    const b = Number(row.v1B);
    const v1 =
      Number.isFinite(a) && Number.isFinite(b) && quantity > 0
        ? a + b / quantity
        : null;
    return {
      ...row,
      quantity,
      observed: round(observed),
      v1: v1 === null ? null : round(v1),
      absoluteDifference:
        v1 === null ? null : round(Math.abs(v1 - observed)),
    };
  });
  const comparable = comparisons.filter(
    (row) => row.absoluteDifference !== null
  );
  const missingV1 = comparisons.length - comparable.length;
  const meanAbsoluteDifference =
    comparable.length > 0
      ? round(
          comparable.reduce(
            (sum, row) => sum + row.absoluteDifference,
            0
          ) / comparable.length
        )
      : null;
  const maxDifference =
    comparable.length > 0
      ? Math.max(...comparable.map((row) => row.absoluteDifference))
      : null;
  const aj2102Ta04 = comparisons.filter(
    (row) => Number(row.styleProcessId) === 997
  );

  console.log(
    JSON.stringify(
      {
        observationCount: comparisons.length,
        comparableV1Count: comparable.length,
        missingV1Count: missingV1,
        meanAbsoluteDifference,
        maxAbsoluteDifference:
          maxDifference === null ? null : round(maxDifference),
        aj2102Ta04,
        largestDifferences: comparable
          .slice()
          .sort(
            (left, right) =>
              right.absoluteDifference - left.absoluteDifference
          )
          .slice(0, 20),
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
