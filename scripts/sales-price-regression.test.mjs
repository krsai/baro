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
const relationshipTimeBucketService = fs.readFileSync(
  'backend/src/services/relationshipTimeBuckets.ts',
  'utf8'
);
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
  assert.match(quantityBucketRoute, /syncRelationshipStyleStandards/);
  assert.match(quantityBucketRoute, /copyRetainedSalesPricesToVersion/);
  assert.match(quantityBucketRoute, /addedQuantities/);
  assert.match(quantityBucketRoute, /removedQuantities/);
  assert.match(quantityBucketRoute, /expectedVersionId is required/);
  assert.match(quantityBucketRoute, /quantity buckets changed since this screen was loaded/);
  assert.doesNotMatch(quantityBucketRoute, /relationshipCountForBrand/);
  assert.match(quantityBucketRoute, /orgRelationshipStyleTimeBucket/);
  assert.match(quantityBucketRoute, /timeBucketSetVersionId: timeVersion\.id/);
  assert.match(quantityBucketRoute, /RELATIONSHIP_TIME_BUCKETS_/);
  assert.doesNotMatch(quantityBucketRoute, /data: \{ timeBucketSetVersionId: nextTimeVersionId \}/);
  assert.match(
    quantityBucketRoute,
    /Returning to the default must therefore only switch the version link/
  );
  assert.match(backend, /"BUCKET_INHERITED_REVIEW"/);
  assert.match(schema, /quantityBucketEntryId\s+Int/);
  assert.match(schema, /StyleProcessStandard_entry_version_fkey/);
  assert.match(schema, /StyleProcessStandard_process_org_fkey/);
  assert.match(schema, /StyleProcess_id_org_key/);
  assert.match(schema, /model OrgRelationshipStyleTimeBucket \{/);
  assert.match(schema, /OrgRelationship_time_bucket_version_org_fkey/);
  assert.match(schema, /OrgRelationshipStyleTimeBucket_relationship_scope_fkey/);
  assert.match(schema, /OrgRelationshipStyleTimeBucket_style_brand_fkey/);
  assert.match(schema, /OrgRelationshipStyleTimeBucket_version_manufacturer_fkey/);
  assert.match(schema, /AssignmentPlan_relationship_scope_fkey/);
  assert.match(backend, /loadRelationshipTimeBucketContextByStyleId/);
  assert.doesNotMatch(
    schema.slice(
      schema.indexOf('model StyleProcessStandard'),
      schema.indexOf('model AtTrainingBucket')
    ),
    /bucketQuantity\s+Int/
  );
  assert.doesNotMatch(
    relationshipTimeBucketService,
    /ptSeconds|PT_DERIVED/
  );
  assert.doesNotMatch(
    relationshipTimeBucketService,
    /normalizeQuantityBucketValues\(addedBucketQuantities\)/
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
  const bucketSaveRequest = frontend.slice(
    frontend.indexOf('const saveActiveBuckets = useCallback'),
    frontend.indexOf('const dirtyPriceChanges = useMemo')
  );
  assert.match(bucketSaveRequest, /headers: \{ 'Content-Type': 'application\/json' \}/);
  assert.doesNotMatch(frontend, /window\.confirm\(confirmation\)/);
});

test('brand style creation does not create a legacy owner-level time bucket', () => {
  assert.doesNotMatch(backend, /resolveDefaultTimeBucketSetVersionIdForNewStyle/);
  assert.doesNotMatch(backend, /name:\s*["']DEFAULT_TIME_BUCKETS["']/);
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
  assert.match(stFkVerifier, /missing_relationship_time_bucket/);
  assert.match(stFkVerifier, /invalid_time_bucket_override/);
  assert.match(stFkVerifier, /invalid_assignment_relationship/);
  assert.match(stFkVerifier, /assignment_style_buyer_missing/);
  assert.match(stFkVerifier, /missing_active_relationship_standard/);
  assert.match(stFkVerifier, /legacy_columns/);
  assert.match(stFkVerifier, /throw new Error/);
  const cleanResult = {
    standards: [{ missing_bucket_fk: 0 }],
    entryMatches: [{ missing_entry: 0, process_org_mismatch: 0 }],
    standardRelationshipMatches: [{ unresolved_cross_org: 0 }],
    legacyColumns: [{ count: 0 }],
    relationshipTimeBuckets: [{ missing_or_mismatched: 0 }],
    timeBucketOverrides: [{ invalid_scope: 0 }],
    assignmentRelationships: [{ invalid_scope: 0, style_buyer_missing: 0 }],
    activeRelationshipStandards: [{ missing_standard: 0 }],
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
  const priceSaveRequest = frontend.slice(
    frontend.indexOf('const savePrices = useCallback'),
    frontend.indexOf('const customerLabel =')
  );
  assert.match(priceSaveRequest, /headers: \{ 'Content-Type': 'application\/json' \}/);
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
