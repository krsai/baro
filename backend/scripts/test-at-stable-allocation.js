const assert = require("node:assert/strict");
const {
  fitAtParamsWithProportionalAllocation,
} = require("../dist/services/atTraining.js");

const metric = (id) => `STYLE_PROCESS:${id}`;

const run = () => {
  const capped = fitAtParamsWithProportionalAllocation(
    [
      {
        dayKey: "2026-04-30#1",
        order: 1,
        workerId: 1,
        productionStage: "SEWING",
        laborInputSeconds: 120000,
        processRows: [
          { metricKey: metric(1), quantity: 100, eventCount: 25, sourceGroupKey: "p1", assignmentPlanId: 1 },
          { metricKey: metric(2), quantity: 100, eventCount: 25, sourceGroupKey: "p1", assignmentPlanId: 1 },
        ],
      },
    ],
    { initialPerPieceByMetricKey: new Map([[metric(1), 100], [metric(2), 200]]) }
  );
  assert.equal(capped.iterationCount, 1);
  assert.equal(capped.converged, true);
  assert.equal(capped.allocatedObservations.length, 2);
  assert.equal(capped.allocatedObservations[0].laborInputSeconds, 20000);
  assert.equal(capped.allocatedObservations[1].laborInputSeconds, 40000);
  assert.equal(capped.allocatedObservations[0].unexplainedLaborInputSeconds, 60000);
  assert.equal(capped.allocatedObservations[1].unexplainedLaborInputSeconds, 60000);

  const stableRatios = fitAtParamsWithProportionalAllocation(
    [
      {
        dayKey: "2026-05-31#2",
        order: 2,
        workerId: 2,
        productionStage: "SEWING",
        laborInputSeconds: 200000,
        processRows: [
          { metricKey: metric(3), quantity: 100, eventCount: 24, sourceGroupKey: "p2", assignmentPlanId: 2 },
          { metricKey: metric(4), quantity: 100, eventCount: 24, sourceGroupKey: "p2", assignmentPlanId: 2 },
          { metricKey: metric(5), quantity: 100, eventCount: 24, sourceGroupKey: "p2", assignmentPlanId: 2 },
        ],
      },
    ],
    { initialPerPieceByMetricKey: new Map([[metric(3), 260], [metric(4), 120], [metric(5), 56]]) }
  );
  const stByMetric = new Map([[metric(3), 260], [metric(4), 120], [metric(5), 56]]);
  const ratios = stableRatios.allocatedObservations.map(
    (row) => row.laborInputSeconds / row.quantity / stByMetric.get(row.metricKey)
  );
  assert.ok(ratios.every((ratio) => Math.abs(ratio - 2) < 1e-9));

  const regression = fitAtParamsWithProportionalAllocation(
    [10, 20, 40].map((quantity, index) => ({
      dayKey: `2026-06-${String(index + 1).padStart(2, "0")}#${index + 10}`,
      order: index,
      workerId: index + 10,
      productionStage: "SEWING",
      laborInputSeconds: 100 * quantity + 500,
      processRows: [{
        metricKey: metric(6),
        quantity,
        eventCount: 2 + index * 9,
        sourceGroupKey: `plan-${index}`,
        assignmentPlanId: 10 + index,
      }],
    })),
    { initialPerPieceByMetricKey: new Map([[metric(6), 100]]) }
  );
  const fitted = regression.paramsByMetric.get(metric(6));
  assert.equal(fitted.fitStatus, "FITTED");
  assert.ok(Math.abs(fitted.a - 100) < 0.001, `a=${fitted.a}`);
  assert.ok(Math.abs(fitted.b - 500) < 0.001, `b=${fitted.b}`);

  const stageSeparated = fitAtParamsWithProportionalAllocation(
    [
      {
        dayKey: "2026-07-01#100",
        order: 1,
        workerId: 20,
        productionStage: "SEWING",
        laborInputSeconds: 10000,
        processRows: [{
          metricKey: metric(7), quantity: 100, eventCount: 1,
          sourceGroupKey: "sewing-plan", assignmentPlanId: 100,
        }],
      },
      {
        dayKey: "2026-07-01#101",
        order: 2,
        workerId: 21,
        productionStage: "IRONING",
        laborInputSeconds: 1000,
        processRows: [{
          metricKey: metric(8), quantity: 100, eventCount: 1,
          sourceGroupKey: "ironing-plan", assignmentPlanId: 101,
        }],
      },
    ],
    { initialPerPieceByMetricKey: new Map([[metric(7), 100], [metric(8), 10]]) }
  );
  const sewingObservation = stageSeparated.allocatedObservations.find(
    (row) => row.metricKey === metric(7)
  );
  const ironingObservation = stageSeparated.allocatedObservations.find(
    (row) => row.metricKey === metric(8)
  );
  assert.equal(sewingObservation.productionStage, "SEWING");
  assert.equal(ironingObservation.productionStage, "IRONING");
  assert.equal(sewingObservation.laborInputSeconds, 10000);
  assert.equal(ironingObservation.laborInputSeconds, 1000);

  console.log("[at-stable-allocation] all assertions passed");
};

run();
