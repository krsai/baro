import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const backend = fs.readFileSync('backend/src/index.ts', 'utf8');
const frontend = fs.readFileSync(
  'frontend/src/pages/App/customer/CustomerPricingBoard.jsx',
  'utf8'
);

test('sales bucket overrides are relational and separate from style time buckets', () => {
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
  assert.doesNotMatch(quantityBucketRoute, /timeBucketSetVersionId/);
  assert.doesNotMatch(quantityBucketRoute, /syncStyleStandardsForBucketVersion/);
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
