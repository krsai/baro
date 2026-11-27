import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function harness({loadAcronyms=async()=>{},supabase=null}={}) {
  const source = readFileSync(new URL('../frontend/src/utils/apiClient.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, '')
    .replace(/import\.meta\.env\.VITE_API_BASE_URL/g, "''");
  const calls = [], events = [];
  const api = new Function('fetch', 'referenceSettingsTopics', 'normalizeHumanPayload', 'loadTextAcronyms', 'supabase', 'recordLastUpdaterForCurrentPath', 'emitWorkspaceDataChanged', 'WORKSPACE_DATA_TOPICS',
    `${source}; return {requestJSON, setRequestContext, getRequestContext, clearGetResponseCache};`)(
    (url, options) => new Promise(resolve => calls.push({url, options, resolve})),
    () => [], value => value, loadAcronyms, supabase, () => {}, event => events.push(event), {PAYROLL_SOURCES:'payroll-sources',ASSIGNMENT_BOARD:'assignment-board'});
  const context = {accessToken: 'test-session', userEmail: 'test@example.test', orgId: 1};
  api.setRequestContext(context);
  const reply = (index, value, ok = true, status=ok?200:500) => calls[index].resolve({ok, status, text: async () => JSON.stringify(value)});
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

test('a company switch during mutation preflight never sends the previous company payload',async()=>{
 let release;const h=harness({loadAcronyms:()=>new Promise(resolve=>{release=resolve;})});
 const mutation=h.requestJSON('/orders/1',{method:'PUT',body:JSON.stringify({name:'Company A Order'})}).then(value=>({value}),error=>({error}));
 h.setRequestContext({...h.context,orgId:2});release();await new Promise(setImmediate);
 if(h.calls.length)h.reply(0,{ok:true});const result=await mutation;
 assert.equal(h.calls.length,0,'a stale payload must not reach fetch under the new company');assert.equal(result.error?.status,499);
});

test('leaving and returning to the same company or logging back in does not revive an old save',async()=>{
 for(const transition of ['company','logout','user']){
  let release;const h=harness({loadAcronyms:()=>new Promise(resolve=>{release=resolve;})});
  const mutation=h.requestJSON('/orders/1',{method:'PUT',body:'{}'}).catch(error=>error);
  if(transition==='company')h.setRequestContext({...h.context,orgId:2});
  else if(transition==='logout')h.setRequestContext({});
  else h.setRequestContext({...h.context,userEmail:'another@example.test'});
  h.setRequestContext(h.context);release();const error=await mutation;
  assert.equal(error.status,499,transition);assert.equal(h.calls.length,0,transition);
 }
});

test('a scoped read waiting to execute cannot adopt a new company context',async()=>{
 const h=harness();const pending=h.requestJSON('/orders',{requestScheduler:{groupId:'workspace',scopeId:'orders-tab'}}).catch(error=>error);
 h.setRequestContext({...h.context,orgId:2});assert.equal((await pending).status,499);assert.equal(h.calls.length,0);
});

test('same-user token renewal during preflight retains the save and uses the renewed token',async()=>{
 let release;const h=harness({loadAcronyms:()=>new Promise(resolve=>{release=resolve;})});
 const mutation=h.requestJSON('/orders/1',{method:'PUT',body:'{}'});
 h.setRequestContext({...h.context,accessToken:'renewed-token'});release();await new Promise(setImmediate);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.headers.get('authorization'),'Bearer renewed-token');assert.equal(h.calls[0].options.headers.get('x-org-id'),'1');
 h.reply(0,{ok:true});assert.deepEqual(await mutation,{ok:true});
});

test('a company switch during 401 renewal prevents resending an old mutation',async()=>{
 let release;const h=harness({supabase:{auth:{refreshSession:()=>new Promise(resolve=>{release=resolve;})}}});
 const mutation=h.requestJSON('/orders/1',{method:'DELETE'}).catch(error=>error);
 h.reply(0,{error:'expired'},false,401);await new Promise(setImmediate);assert.equal(typeof release,'function');
 h.setRequestContext({...h.context,orgId:2});release({data:{session:{access_token:'renewed-token',user:{email:h.context.userEmail}}}});
 assert.equal((await mutation).status,499);assert.equal(h.calls.length,1);
});

test('a late refresh from a previous login cannot overwrite the current login context',async()=>{
 let release;const h=harness({supabase:{auth:{refreshSession:()=>new Promise(resolve=>{release=resolve;})}}});
 const mutation=h.requestJSON('/orders/1',{method:'DELETE'}).catch(error=>error);
 h.reply(0,{error:'expired'},false,401);await new Promise(setImmediate);
 const next={accessToken:'current-user-token',userEmail:'current@example.test',orgId:2};h.setRequestContext(next);
 release({data:{session:{access_token:'previous-user-token',user:{email:h.context.userEmail}}}});assert.equal((await mutation).status,499);
 assert.deepEqual(h.getRequestContext(),next);
});

test('a completed old-company mutation emits updates for its sent company, not the current company',async()=>{
 const h=harness();const mutation=h.requestJSON('/factories/1',{method:'DELETE'});
 assert.equal(h.calls[0].options.headers.get('x-org-id'),'1');h.setRequestContext({...h.context,orgId:2});
 h.reply(0,{ok:true});await mutation;assert.equal(h.events.length,1);assert.equal(h.events[0].orgId,'1');
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
