import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function harness() {
  const source = readFileSync(new URL('../frontend/src/utils/apiClient.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, '')
    .replace(/import\.meta\.env\.VITE_API_BASE_URL/g, "''");
  const calls = [], events = [];
  const api = new Function('fetch', 'referenceSettingsTopics', 'normalizeHumanPayload', 'loadTextAcronyms', 'supabase', 'recordLastUpdaterForCurrentPath', 'emitWorkspaceDataChanged', 'WORKSPACE_DATA_TOPICS',
    `${source}; return {requestJSON, setRequestContext, clearGetResponseCache};`)(
    (url, options) => new Promise(resolve => calls.push({url, options, resolve})),
    () => [], value => value, async () => {}, null, () => {}, event => events.push(event), {PAYROLL_SOURCES:'payroll-sources',ASSIGNMENT_BOARD:'assignment-board'});
  const context = {accessToken: 'test-session', userEmail: 'test@example.test', orgId: 1};
  api.setRequestContext(context);
  const reply = (index, value, ok = true) => calls[index].resolve({ok, status: ok ? 200 : 500, text: async () => JSON.stringify(value)});
  return {...api, calls, reply, context, events};
}

test('successful mutation prevents a pending old read from refilling cache or being shared', async () => {
  const h = harness();
  const old = h.requestJSON('/orders');
  const save = h.requestJSON('/orders/1', {method: 'DELETE'});
  h.reply(1, {ok: true}); await save;
  const fresh = h.requestJSON('/orders');
  assert.equal(h.calls.length, 3);
  h.reply(0, 'old'); await old;
  h.reply(2, 'new'); await fresh;
  assert.equal(await h.requestJSON('/orders'), 'new');
});

test('local factory changes invalidate dependent views and quantity review emits no saved event',async()=>{
 const h=harness();const save=h.requestJSON('/factories/12?orgId=1',{method:'PUT'});h.reply(0,{ok:true});await save;
 assert.equal(h.events.length,1);assert.equal(h.events[0].orgId,'1');assert.ok(h.events[0].topics.includes('attendance'));assert.ok(h.events[0].topics.includes('payroll-sources'));
 const review=h.requestJSON('/work-logs?orgId=1',{method:'POST'});h.reply(1,{ok:true,requiresQuantityReview:true});await review;assert.equal(h.events.length,1);
 const actual=h.requestJSON('/work-logs?orgId=1',{method:'POST'});h.reply(2,{ok:true});await actual;assert.equal(h.events.length,2);assert.ok(h.events[1].topics.includes('assignment-board'));
});

test('force refresh wins even when an earlier read finishes later', async () => {
  const h = harness();
  const old = h.requestJSON('/orders');
  const fresh = h.requestJSON('/orders', {forceRefresh: true});
  h.reply(1, 'new'); await fresh;
  h.reply(0, 'old'); await old;
  assert.equal(await h.requestJSON('/orders'), 'new');
});

test('older request completion does not remove the current shared request', async () => {
  const h = harness();
  const old = h.requestJSON('/orders');
  const fresh = h.requestJSON('/orders', {forceRefresh: true});
  h.reply(0, 'old'); await old;
  const shared = h.requestJSON('/orders');
  assert.equal(h.calls.length, 2);
  h.reply(1, 'new');
  assert.deepEqual(await Promise.all([fresh, shared]), ['new', 'new']);
});

test('live invalidation prevents pending reads from restoring stale cache', async () => {
  const h = harness();
  const old = h.requestJSON('/orders');
  h.clearGetResponseCache();
  h.reply(0, 'old'); await old;
  const fresh = h.requestJSON('/orders');
  assert.equal(h.calls.length, 2);
  h.reply(1, 'new'); await fresh;
});

test('logout and same-account login isolate both cached and pending reads', async () => {
  const h = harness();
  const cached = h.requestJSON('/orders');
  h.reply(0, 'old'); await cached;
  const pending = h.requestJSON('/customers');
  h.setRequestContext({});
  h.setRequestContext({...h.context, accessToken: 'new-session'});
  h.reply(1, 'old customer'); await pending;
  const orders = h.requestJSON('/orders');
  const customers = h.requestJSON('/customers');
  assert.equal(h.calls.length, 4);
  h.reply(2, 'new'); h.reply(3, 'new customer');
  assert.deepEqual(await Promise.all([orders, customers]), ['new', 'new customer']);
});

test('unchanged context retains cached reads and results remain independent copies', async () => {
  const h = harness();
  const first = h.requestJSON('/orders');
  h.reply(0, {value: 'saved'});
  (await first).value = 'edited';
  h.setRequestContext(h.context);
  assert.deepEqual(await h.requestJSON('/orders'), {value: 'saved'});
  assert.equal(h.calls.length, 1);
});

test('selective mutation keeps unrelated requests shared', async () => {
  const h = harness();
  const customers = h.requestJSON('/customers');
  const save = h.requestJSON('/orders/1', {method: 'DELETE'});
  h.reply(1, {ok: true}); await save;
  const shared = h.requestJSON('/customers');
  assert.equal(h.calls.length, 2);
  h.reply(0, 'customers');
  assert.deepEqual(await Promise.all([customers, shared]), ['customers', 'customers']);
});

test('failed mutations keep valid cache and failed refreshes can be retried', async () => {
  const h = harness();
  const first = h.requestJSON('/orders');
  h.reply(0, 'saved'); await first;
  const save = h.requestJSON('/orders/1', {method: 'DELETE'});
  h.reply(1, {error: 'save failed'}, false);
  await assert.rejects(save, /save failed/);
  assert.equal(await h.requestJSON('/orders'), 'saved');
  const refresh = h.requestJSON('/orders', {forceRefresh: true});
  h.reply(2, {error: 'read failed'}, false);
  await assert.rejects(refresh, /read failed/);
  const retry = h.requestJSON('/orders', {forceRefresh: true});
  h.reply(3, 'new'); await retry;
  assert.equal(await h.requestJSON('/orders'), 'new');
});
