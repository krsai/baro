import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  collectStBucketFkViolations,
} = require('../backend/scripts/inspect-st-bucket-fk-readiness.js');

const schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const backend = fs.readFileSync('backend/src/index.ts', 'utf8');
const frontend = fs.readFileSync(
  'frontend/src/pages/App/customer/CustomerPricingBoard.jsx',
  'utf8'
);
const stFkVerifier = fs.readFileSync(
  'backend/scripts/inspect-st-bucket-fk-readiness.js',
  'utf8'
);

test('sales buckets stay relational while their quantity boundaries synchronize with time buckets', () => {
  assert.match(schema, /model OrgRelationshipStyleSalesBucket \{/);
  assert.match(
    schema,
    /@@unique\(\[orgRelationshipId, styleId\](?:,[^)]+)?\)/
  );
  const quantityBucketRoute = backend.slice(
    backend.indexOf('app.put("/customers/:id/quantity-buckets"'),
    backend.indexOf('const SALES_PRICING_BASES')
  );
  assert.match(quantityBucketRoute, /orgRelationshipStyleSalesBucket/);
  assert.match(quantityBucketRoute, /timeBucketSetVersionId/);
  assert.match(quantityBucketRoute, /syncStyleStandardsForBucketVersion/);
  assert.match(quantityBucketRoute, /copyRetainedSalesPricesToVersion/);
  assert.match(quantityBucketRoute, /addedQuantities/);
  assert.match(quantityBucketRoute, /removedQuantities/);
  assert.match(quantityBucketRoute, /expectedVersionId is required/);
  assert.match(quantityBucketRoute, /quantity buckets changed since this screen was loaded/);
  assert.match(quantityBucketRoute, /connected to multiple manufacturers/);
  assert.match(
    quantityBucketRoute,
    /Returning to the default must therefore only switch the version link/
  );
  assert.match(backend, /"BUCKET_INHERITED_REVIEW"/);
  assert.match(schema, /quantityBucketEntryId\s+Int/);
  assert.match(schema, /StyleProcessStandard_entry_version_fkey/);
  assert.match(schema, /StyleProcessStandard_process_org_fkey/);
  assert.match(schema, /StyleProcess_id_org_key/);
  assert.doesNotMatch(
    schema.slice(
      schema.indexOf('model StyleProcessStandard'),
      schema.indexOf('model AtTrainingBucket')
    ),
    /bucketQuantity\s+Int/
  );
  assert.doesNotMatch(
    backend.slice(
      backend.indexOf('const syncStyleStandardsForBucketVersion'),
      backend.indexOf('const copyRetainedSalesPricesToVersion')
    ),
    /ptSeconds|PT_DERIVED/
  );
  assert.match(backend, /resolveStyleProcessBucketStandardByEntryId/);
  assert.match(backend, /resolveStyleProcessBucketStSecondsByEntryId/);
  assert.doesNotMatch(backend, /resolveStyleProcessBucketStSeconds\s*=/);
  assert.match(
    backend,
    /standard\.quantityBucketSetVersionId === activeVersionId/
  );
  assert.match(frontend, /기존 단가와 과거 급여 자료는 유지됩니다/);
  assert.match(frontend, /savedCustomerBuckets/);
  assert.match(frontend, /expectedVersionId/);
  assert.match(frontend, /requestBucketConfirmation/);
  assert.doesNotMatch(frontend, /window\.confirm\(confirmation\)/);
});

test('sales prices use Decimal rows tied to a bucket entry and version', () => {
  assert.match(schema, /model CustomerSalesPriceList \{/);
  assert.match(schema, /model CustomerSalesPrice \{/);
  assert.match(schema, /unitPrice\s+Decimal\s+@db\.Decimal\(18, 4\)/);
  assert.match(schema, /quantityBucketEntryId\s+Int/);
  assert.match(schema, /quantityBucketSetVersionId\s+Int/);
  assert.match(schema, /CustomerSalesPriceList_id_version_key/);
  assert.match(schema, /QuantityBucketEntry_id_version_key/);
  assert.match(schema, /CustomerSalesPrice_list_version_fkey/);
  assert.match(schema, /CustomerSalesPrice_entry_version_fkey/);
  assert.match(backend, /STARTUP_REQUIRED_RUNTIME_CONSTRAINTS/);
});

test('ST bucket FK verifier fails closed on relational violations', () => {
  assert.match(stFkVerifier, /missing_bucket_fk/);
  assert.match(stFkVerifier, /process_org_mismatch/);
  assert.match(stFkVerifier, /unresolved_cross_org/);
  assert.match(stFkVerifier, /legacy_columns/);
  assert.match(stFkVerifier, /throw new Error/);
  const cleanResult = {
    standards: [{ missing_bucket_fk: 0 }],
    entryMatches: [{ missing_entry: 0, process_org_mismatch: 0 }],
    standardRelationshipMatches: [{ unresolved_cross_org: 0 }],
    legacyColumns: [{ count: 0 }],
  };
  assert.deepEqual(collectStBucketFkViolations(cleanResult), []);
  assert.deepEqual(
    collectStBucketFkViolations({
      ...cleanResult,
      entryMatches: [{ missing_entry: 2, process_org_mismatch: 1 }],
    }),
    [
      ['missing_entry', 2],
      ['process_org_mismatch', 1],
    ]
  );
});

test('assignment ST snapshots reject a bucket label that disagrees with its entry FK', () => {
  const snapshotBuilder = backend.slice(
    backend.indexOf('const buildAssignmentStSnapshot ='),
    backend.indexOf('const resolveWorklogRatioConfidence')
  );
  assert.match(snapshotBuilder, /canonicalBucketQuantity/);
  assert.match(snapshotBuilder, /canonicalBucketQuantity !== bucketQuantity/);
  assert.match(snapshotBuilder, /ST snapshot bucket identity mismatch/);
});

test('sales price saves send changes only and persist them in a batched transaction', () => {
  const saveRoute = backend.slice(
    backend.indexOf('app.put("/customers/:id/sales-prices"'),
    backend.indexOf('const freezeOrderSalesPriceSnapshots')
  );
  assert.match(saveRoute, /createMany/);
  assert.match(saveRoute, /INSERT INTO "CustomerSalesPrice"/);
  assert.match(saveRoute, /ON CONFLICT/);
  assert.doesNotMatch(saveRoute, /for \(const entry of requestedPrices\)[\s\S]*findUnique/);
  assert.match(frontend, /const dirtyPriceChanges = useMemo/);
  assert.match(frontend, /prices: dirtyPriceChanges\.map/);
  assert.match(frontend, /useUnsavedChanges\(dirtyPriceChanges\.length > 0\)/);
});

test('order locking freezes sales price snapshots and fails closed when price is missing', () => {
  assert.match(schema, /pricingBasis\s+String\s+@default\("MANUFACTURING_SERVICE_PRICE"\)/);
  assert.match(schema, /currencyCode\s+String\s+@default\("USD"\)/);
  assert.match(schema, /salesPriceSnapshot\s+Json\?/);
  assert.match(backend, /const freezeOrderSalesPriceSnapshots = async/);
  assert.match(backend, /sales price is missing for style/);
  const lockRoute = backend.slice(
    backend.indexOf('app.post("/orders/:orderId/modification-lock"'),
    backend.indexOf('app.delete("/orders/:orderId"')
  );
  assert.match(lockRoute, /await freezeOrderSalesPriceSnapshots\(\{ db: tx, order: existing \}\)/);
  assert.match(backend, /app\.get\("\/orders\/sales-price-diagnostics"/);
  assert.match(backend, /salesPriceSnapshotStatus/);
});
