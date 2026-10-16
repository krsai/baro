import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as policyCore from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const { preparationPlan, runPlan } = require('../backend/scripts/prepare-database.js');
const source = fs.readFileSync('backend/src/index.ts', 'utf8');
const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function route(method, routePath, deps) {
  let code;
  for (const statement of tree.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (call.expression.getText(tree) !== `app.${method}`) continue;
    const paths = ts.isArrayLiteralExpression(call.arguments[0]) ? call.arguments[0].elements : [call.arguments[0]];
    if (paths.some(value => ts.isStringLiteral(value) && value.text === routePath)) code = statement.getText(tree);
  }
  assert.ok(code, routePath);
  let handler;
  const bindings = { ...deps, app: { [method]: (_paths, callback) => { handler = callback; } } };
  new Function(...Object.keys(bindings), ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(bindings));
  return handler;
}
const response = () => ({ code: null, body: null, headers: {}, set(key,value) { this.headers[key]=value; }, status(code) { this.code=code; return this; }, json(value) { this.body=value; return this; } });

test('retired completion endpoints check access and cannot execute any completion or database mutation', async () => {
  for (const [method,path] of [['post','/assignment-plans/:externalId/close'],['patch','/assignment-plans/:externalId/production-complete']]) {
    for (const authorized of [false,true]) {
      const handler = route(method,path, {
        requireOrgRole: async (_req,_res,{allowedRoles}) => { assert.deepEqual(allowedRoles,['ADMIN']); return authorized ? {} : null; },
        ORG_MANAGEMENT_ROLES: ['ADMIN'],
        prisma: new Proxy({}, { get() { throw Error('Unexpected database mutation'); } }),
      });
      const res=response(); await handler({body:{confirmedQty:100,reason:'legacy'}},res);
      if (!authorized) assert.equal(res.code,null);
      else { assert.equal(res.code,410); assert.equal(res.body.error,'PRODUCTION_COMPLETION_ENDPOINT_RETIRED'); assert.deepEqual(res.body.requiredFields,['reason']); }
    }
  }
});

test('current manual completion still rejects missing or excessive reasons before touching data', async () => {
  const handler=route('patch','/assignment-plans/:externalId/manual-production-complete', {
    requireOrgRole: async()=>({organization:{id:1}}), ORG_MANAGEMENT_ROLES:['ADMIN'],
    resolveOptionalString:(value,fallback)=>typeof value==='string'&&value.trim()?value.trim():fallback,
    prisma:new Proxy({}, {get(){throw Error('Should validate the reason before database access');}}),
  });
  for(const reason of ['',null,' '.repeat(5),'x'.repeat(1001)]) {
    const res=response(); await handler({params:{externalId:'a'},body:{reason}},res); assert.equal(res.code,400);
  }
});

function frontendModule(file, requestJSON, extra = {}) {
  const exports={};
  const dependencies={ './apiClient':{ requestJSON, buildQueryString:params=>`?${new URLSearchParams(params)}` }, './roleAccessPolicyCore.mjs':policyCore };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, require:name=>{assert.ok(dependencies[name],name);return dependencies[name];},
    window:{ localStorage:new Proxy({}, {get(){throw Error('Legacy browser settings must never be read or deleted');}}),dispatchEvent(){} },
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}, ...extra,
  });
  return exports;
}

test('empty server holidays stay empty for each organization without automatic PUT or browser fallback', async () => {
  const calls=[];
  const api=frontendModule('frontend/src/utils/holidayApi.js',async(path,options)=>{calls.push({path,options});return [];});
  for(const orgId of [1,2]) assert.equal((await api.fetchHolidayKeys({orgId})).length,0);
  assert.deepEqual(calls.map(call=>call.path),['/holidays?orgId=1','/holidays?orgId=2']);
  assert.ok(calls.every(call=>!call.options.method));
});

test('holiday request failures propagate instead of returning unrelated legacy browser dates', async () => {
  const api=frontendModule('frontend/src/utils/holidayApi.js',async()=>{throw Error('server unavailable');});
  await assert.rejects(api.fetchHolidayKeys({orgId:1}),/server unavailable/);
});

test('explicit holiday saving still normalizes and uses the selected organization', async () => {
  let input;
  const api=frontendModule('frontend/src/utils/holidayApi.js',async(path,options)=>{input={path,options};return JSON.parse(options.body);});
  const result=await api.saveHolidayKeys({orgId:2,holidays:['2026-10-20','invalid','2026-10-20']});
  assert.equal(input.path,'/holidays?orgId=2'); assert.equal(input.options.method,'PUT');
  assert.equal(JSON.stringify(result),'["2026-10-20"]');
});

test('opening an unsaved access policy only reads the server policy and does not upload browser defaults', async () => {
  const calls=[];
  const api=frontendModule('frontend/src/utils/roleAccessPolicy.js',async(path,options)=>{calls.push({path,options});return {stored:false,policy:policyCore.getDefaultRoleAccessPolicy()};});
  let saved,draft;
  const {loadPolicy}=loadSourceBindings('frontend/src/pages/App/system/AccessPolicyBoard.jsx',['loadPolicy'],{
    setLoadingPolicy(){}, fetchRoleAccessPolicy:api.fetchRoleAccessPolicy, cancelled:false, toEditablePolicy:value=>value,
    setSavedPolicy:value=>{saved=value;},setDraftPolicy:value=>{draft=value;},showNotification(){throw Error('Unexpected policy error');},
  });
  await loadPolicy();
  assert.ok(saved); assert.equal(saved,draft); assert.equal(calls.length,1); assert.equal(calls[0].path,'/system/access-policy');
  assert.equal(calls[0].options.method,undefined);
});

test('explicit access policy saves remain supported without touching browser legacy keys', async () => {
  let method;
  const api=frontendModule('frontend/src/utils/roleAccessPolicy.js',async(_path,options)=>{method=options.method;return {policy:JSON.parse(options.body).policy};});
  assert.ok(await api.saveRoleAccessPolicy(policyCore.getDefaultRoleAccessPolicy())); assert.equal(method,'PUT');
});

test('normal start and dev startup do not run database preparation or historical upgrades', () => {
  const pkg=JSON.parse(fs.readFileSync('backend/package.json','utf8'));
  assert.equal(pkg.scripts.start,'node dist/index.js');
  assert.equal(pkg.scripts['railway:predeploy'],'npm run database:prepare');
  assert.equal(pkg.scripts.predev,'npm run prisma:prepare-client');
  const railway=JSON.parse(fs.readFileSync('backend/railway.json','utf8'));
  assert.equal(railway.deploy.healthcheckPath,'/ready');
  assert.doesNotMatch(fs.readFileSync('backend/scripts/prisma-safe-deploy.js','utf8'),/remove-line-domain|transfer-manufacturer-ownership|--accept-data-loss|--force-reset/);
});

test('deployment, empty schema initialization, and legacy upgrades have separate ordered plans', () => {
  const current=preparationPlan();
  assert.ok(current.some(step=>step.script==='prisma:apply:migration-fix'));
  assert.ok(current.some(step=>step.script==='prisma:deploy:safe'));
  assert.ok(current.every(step=>!JSON.stringify(step).match(/remove-line|ownership|backfill|historical-cards/)));
  const initialize=preparationPlan('initialize');
  assert.equal(initialize[1].node,'scripts/assert-empty-database.js');
  assert.equal(initialize[2].script,'prisma:deploy:safe');
  assert.ok(initialize.every(step=>!JSON.stringify(step).match(/reset-to-baseline|--force-reset/)));
  const legacy=preparationPlan('legacy');
  assert.ok(legacy.some(step=>step.node==='scripts/transfer-manufacturer-ownership.js'));
  assert.ok(legacy.some(step=>step.script==='prisma:remove-line-domain'));
  assert.throws(()=>preparationPlan('unknown'));
});

test('a failed preparation step stops subsequent commands and no shell is used', () => {
  let calls=0;
  assert.throws(()=>runPlan([{script:'one'},{script:'two'}],(_exe,_args,options)=>{calls++;assert.equal(options.shell,undefined);return {status:1};}),/failed at one/);
  assert.equal(calls,1);
});

test('runtime schema drift fails closed with an operator command and never applies SQL automatically', async () => {
  const {ensureRuntimeSchemaReady}=loadSourceBindings('backend/src/index.ts',['ensureRuntimeSchemaReady'],{
    findRuntimeSchemaDriftReasons:async()=>['required constraint missing'],
  });
  await assert.rejects(ensureRuntimeSchemaReady(),/database:prepare/);
  const {startServer}=loadSourceBindings('backend/src/index.ts',['startServer'],{
    ensureDatabaseReady:async()=>{}, ensureRuntimeSchemaReady, startupLifecycleState:'booting',
    app:{listen(){throw Error('Must not accept traffic with missing schema');}},
  });
  await assert.rejects(startServer(),/required constraint missing/);
});

test('database initialization refuses existing application tables before schema creation', async () => {
  const { assertEmptyDatabase } = require('../backend/scripts/assert-empty-database.js');
  await assertEmptyDatabase({ $queryRaw: async () => [] });
  await assert.rejects(assertEmptyDatabase({ $queryRaw: async () => [{ table_name: 'Style' }] }), /empty public schema/);
});

test('maintenance modes separate schema preparation from historical data writes and always disconnect', async () => {
  const current = ['ensureOrganizationLocalizationColumnsReady','ensureWorkOrderLocalizationColumnsReady',
    'ensureStyleLocalizationColumnsReady','ensureWorkRecordCanonicalSchemaReady','ensureWorkOrderStatusSchemaReady',
    'ensureProcessMasterOptionTypeSchemaReady','ensureProcessMasterOptionRelationSchemaReady','ensureHardcodedSystemAdmin','ensureRuntimeSchemaReady'];
  for (const mode of ['prepare','legacy','historical-cards']) {
    const calls=[];
    const helpers=['ensureDatabaseReady',...current,'ensureBusinessPartnerMergedIntoOrganization','refreshAj1867UnassignedCardOnce'];
    const { runDatabaseMaintenance }=loadSourceBindings('backend/src/index.ts',['runDatabaseMaintenance'],{
      ...Object.fromEntries(helpers.map(name=>[name,async()=>{calls.push(name);} ])),
      prisma:{$disconnect:async()=>{calls.push('disconnect');}},
    });
    await runDatabaseMaintenance(mode);
    assert.deepEqual(calls,['ensureDatabaseReady',...(mode==='prepare'?current:mode==='legacy'?['ensureBusinessPartnerMergedIntoOrganization']:['refreshAj1867UnassignedCardOnce']),'disconnect']);
  }
});
