import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const backend = fs.readFileSync('backend/src/index.ts', 'utf8');

test('sales bucket overrides are relational and separate from style time buckets', () => {
  assert.match(schema, /model OrgRelationshipStyleSalesBucket \{/);
  assert.match(
    schema,
    /@@unique\(\[orgRelationshipId, styleId\]\)/
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
});
