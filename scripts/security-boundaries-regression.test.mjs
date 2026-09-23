import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const routeBody = (source, declaration) => {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `missing route: ${declaration}`);
  const nextRoute = source.indexOf('\napp.', start + declaration.length);
  return source.slice(start, nextRoute === -1 ? source.length : nextRoute);
};

test('organization admins cannot mutate subscription fields through organization update', async () => {
  const source = await readSource('backend/src/organizations/organization.routes.ts');
  const start = source.indexOf('organizationRouter.put("/organizations/:id"');
  const end = source.indexOf('organizationRouter.get("/organizations/:id/subscription"', start);
  const body = source.slice(start, end);

  assert.match(body, /hasSubscriptionPayload\(req\.body \?\? \{\}\) && !isSystemAdmin/);
  assert.match(body, /system admin access required to change subscription/);
  assert.match(body, /if \(isSystemAdmin\) \{\s*await applySubscriptionPayload/);
});

test('authorization resolution has no cross-request TTL cache', async () => {
  const source = await readSource('backend/src/middleware/access.ts');
  assert.doesNotMatch(source, /ORG_ACCESS_CACHE_TTL_MS|organizationAccessCache|organizationAccessInFlight/);
  assert.match(source, /const ORG_MANAGEMENT_ROLES[^;]+\["ADMIN", "OPERATOR", "ACCOUNTANT"\]/s);
  assert.match(source, /allowedRoles = ORG_MANAGEMENT_ROLES/);
});

test('high-impact mutations require an explicit non-worker management role', async () => {
  const source = await readSource('backend/src/index.ts');
  const declarations = [
    'app.patch("/assignment-plans/:externalId/final-quantity"',
    'app.post("/assignment-plans/:externalId/close"',
    'app.patch("/assignment-plans/:externalId/production-complete"',
    'app.patch("/assignment-plans/:externalId/reopen"',
    'app.post("/qc-pass-events"',
    'app.patch("/qc-pass-events/:id/cancel"',
    'app.post("/work-logs/import"',
    'app.post("/work-logs"',
    'app.put("/work-logs/:id"',
    'app.delete("/work-logs/:id"',
    'app.delete("/assignment-board-state/assignment/:assignmentId"',
    'app.put("/assignment-board-state"',
    'app.post("/orders"',
    'app.put("/orders/:orderId"',
    'app.post("/orders/:orderId/modification-lock"',
    'app.delete("/orders/:orderId"',
    'app.post("/business-partners"',
    'app.put("/business-partners/:id"',
  ];

  for (const declaration of declarations) {
    assert.match(
      routeBody(source, declaration),
      /requireOrgRole\(req, res, \{ allowedRoles: ORG_MANAGEMENT_ROLES \}\)/,
      declaration
    );
  }
  const manualCompletion = source.slice(
    source.indexOf('"/assignment-plans/:externalId/manual-production-complete"'),
    source.indexOf('app.patch("/assignment-plans/:externalId/reopen"')
  );
  assert.match(manualCompletion, /requireOrgRole\(req, res, \{ allowedRoles: ORG_MANAGEMENT_ROLES \}\)/);
});

test('payroll and quantity settlement controllers exclude workers from reads and writes', async () => {
  const payroll = await readSource('backend/src/payroll/payroll.controller.ts');
  const settlement = await readSource('backend/src/quantity-settlement/quantitySettlement.controller.ts');

  assert.doesNotMatch(payroll, /getOrganizationByQuery|requireOrgRole\(req, res\)(?!,)/);
  assert.match(payroll, /const PAYROLL_ROLES = \["ADMIN", "OPERATOR", "ACCOUNTANT"\]/);
  assert.doesNotMatch(settlement, /getOrganizationByQuery|requireOrgRole\(req, res\)(?!,)/);
  assert.match(settlement, /const QUANTITY_SETTLEMENT_ROLES = \["ADMIN", "OPERATOR", "ACCOUNTANT"\]/);
});
