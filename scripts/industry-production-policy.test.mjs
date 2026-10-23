import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import policy from '../backend/dist/services/industryProductionPolicy.js';
import {expenseCodeForLine,validExpenseLine} from '../frontend/src/utils/expenseRequest.mjs';

test('effective policy never mutates system definitions and preserves saved production/cost-only state',()=>{
 const original={base:{serviceTypeId:10,entryMode:'PROCESS',requiredFields:[]},serviceType:{systemDefaultId:99}};
 const before=structuredClone(original),cost=policy.applyIndustryProductionPolicy(original,false);
 assert.equal(policy.industryIdForCode(original),10);
 assert.equal(cost.base.entryMode,'GENERAL');assert.equal(cost.base.processInput,'HIDDEN');
 assert.deepEqual(original,before);
 assert.equal(expenseCodeForLine({productionLinked:true},cost).base.entryMode,'PROCESS');
 assert.equal(expenseCodeForLine({itemId:'saved'},original).base.entryMode,'GENERAL');
 const code={...cost,vatEnabled:false};
 assert.equal(validExpenseLine({quantity:'1.5',unitPrice:'20',vatRate:'0',details:{}},code,'USD'),true);
 assert.equal(validExpenseLine({quantity:'1.5',unitPrice:'20',vatRate:'0',details:{}},original,'USD'),false);
});

test('industry policy API uses authenticated tenant and admin gates, validates FK, and reset removes only that override',async()=>{
 const routes=new Map(),writes=[];let allowed=true,valid=true;
 const db={settingServiceDefault:{findFirst:async()=>valid?{id:10}:null},industryProductionPolicy:{
  upsert:async args=>writes.push(args),deleteMany:async args=>writes.push(args)},$transaction:fn=>fn(db)};
 policy.registerIndustryProductionPolicyRoutes({get:()=>{},put:(path,handler)=>routes.set(path,handler)},db,{requireOrgRole:async(req,res,{allowedRoles})=>{
  assert.deepEqual(allowedRoles,['ADMIN']);return allowed?{organization:{id:1}}:null;
 }});
 const route=routes.get('/app-settings/industry-production'),req={query:{orgId:2},body:{systemIndustryId:10,productionLinkRequired:false}},res={json:()=>{}};
 await route(req,res);assert.deepEqual(writes[0].where,{orgId_systemIndustryId:{orgId:1,systemIndustryId:10}});
 allowed=false;await route(req,res);assert.equal(writes.length,1);allowed=true;
 valid=false;await assert.rejects(route(req,res),/INVALID_INDUSTRY_PRODUCTION_POLICY/);assert.equal(writes.length,1);valid=true;
 req.body.productionLinkRequired=null;await route(req,res);assert.deepEqual(writes[1],{where:{orgId:1,systemIndustryId:10}});
 for(const value of ['false',undefined,1]){req.body.productionLinkRequired=value;await assert.rejects(route(req,res),/INVALID_INDUSTRY_PRODUCTION_POLICY/);}
});

test('policy migration is repeatable, FK protected, tenant isolated and leaves absent settings inherited',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "Organization"(id INTEGER PRIMARY KEY);CREATE TABLE "SettingServiceDefault"(id INTEGER PRIMARY KEY);INSERT INTO "Organization" VALUES(1),(2);INSERT INTO "SettingServiceDefault" VALUES(10);');
  const sql=readFileSync('backend/prisma/migrations/20261023090000_industry_production_policy/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('SELECT * FROM "IndustryProductionPolicy"')).rows.length,0);
  await db.exec('INSERT INTO "IndustryProductionPolicy"("orgId","systemIndustryId","productionLinkRequired") VALUES(1,10,false),(2,10,true);');
  await db.exec(sql);assert.equal((await db.query('SELECT * FROM "IndustryProductionPolicy"')).rows.length,2);
  await assert.rejects(db.exec('INSERT INTO "IndustryProductionPolicy"("orgId","systemIndustryId","productionLinkRequired") VALUES(3,10,false);'));
  await assert.rejects(db.exec('INSERT INTO "IndustryProductionPolicy"("orgId","systemIndustryId","productionLinkRequired") VALUES(1,99,false);'));
 }finally{await db.close();}
});
