import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Prisma}=require('../backend/node_modules/@prisma/client');
const ts=require('../backend/node_modules/typescript');
let intercept;
class PrismaClient{
 $extends(extension){intercept=extension.query.$allModels.$allOperations;return this;}
}
const module={exports:{}};
const source=ts.transpileModule(readFileSync('backend/src/db.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',source)(name=>{
 if(name==='./config/env')return {};
 if(name==='@prisma/client')return {Prisma,PrismaClient};
 if(name==='./requestActor')return {getCurrentRequestActor:()=> 'editor@example.com',getCurrentRequestActorEmployeeId:()=>8};
 throw Error('Unexpected dependency '+name);
},module.exports);
const invoke=async(model,operation,args)=>{let forwarded;await intercept({model,operation,args,query:async value=>{forwarded=value;return value;}});return forwarded;};

test('classification create and update inject the employee FK without turning updatedBy relation into a string',async()=>{
 const model=Prisma.dmmf.datamodel.models.find(m=>m.name==='PartnerClassification');
 assert.equal(model.fields.find(f=>f.name==='updatedBy').kind,'object');
 for(const operation of ['create','update','updateMany']){
  const args=await invoke(model.name,operation,{data:{orgId:1,entityId:44}});
  assert.deepEqual(args.data,{orgId:1,entityId:44,updatedByEmployeeId:8});
 }
 const args=await invoke(model.name,'upsert',{create:{orgId:1,entityId:44},update:{revision:{increment:1},updatedByEmployeeId:9}});
 assert.equal(args.create.updatedByEmployeeId,8);assert.equal(args.update.updatedByEmployeeId,9);
 assert.ok(!('updatedBy' in args.create));assert.ok(!('updatedBy' in args.update));
});

test('all actual Prisma models receive only supported scalar audit fields and retain explicit actors',async()=>{
 for(const model of Prisma.dmmf.datamodel.models){
  for(const operation of ['create','createMany','update','updateMany']){
   const args=await invoke(model.name,operation,{data:{}});
   for(const [name,value] of Object.entries(args.data)){
    const field=model.fields.find(f=>f.name===name);assert.equal(field?.kind,'scalar',model.name+'.'+name);
    assert.equal(value,name.endsWith('EmployeeId')?8:'editor@example.com');
   }
  }
 }
 const args=await invoke('Organization','create',{data:{createdBy:'original@example.com'}});
 assert.equal(args.data.createdBy,'original@example.com');
});

test('nested classification creates and bulk creates preserve relation objects and employee audit FKs',async()=>{
 const model=Prisma.dmmf.datamodel.models.find(m=>m.name==='Organization');
 const relation=model.fields.find(f=>f.type==='PartnerClassification'&&f.kind==='object');
 assert.ok(relation);
 const args=await invoke(model.name,'update',{data:{[relation.name]:{create:[{orgId:1,entityId:44}],createMany:{data:[{orgId:1,entityId:45}]}}}});
 const nested=args.data[relation.name];
 for(const row of [...nested.create,...nested.createMany.data]){assert.equal(row.updatedByEmployeeId,8);assert.ok(!('updatedBy' in row));}
});
