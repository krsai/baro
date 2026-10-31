import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const {Prisma}=require('../backend/node_modules/@prisma/client');
const {loadIssuedOrderSalesValues}=require('../backend/dist/services/issuedOrderSalesValue.js');
const {calculateOrderSalesValue}=require('../backend/dist/utils/orderSalesValue.js');
const source=fs.readFileSync('backend/src/index.ts','utf8');
const declarations=['loadMissingSalesPriceStyleCountByRelationship','loadCurrentOrderValueByOrderDbId'];
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const chunks=[];
function visit(n){if(ts.isVariableDeclaration(n)&&declarations.includes(n.name.getText(ast)))chunks.push('const '+n.getText(ast)+';');ts.forEachChild(n,visit);}visit(ast);
const load=db=>new Function('prisma','Prisma','ensureArray','toPositiveIntOrNull','calculateOrderSalesValue','loadIssuedOrderSalesValues',ts.transpileModule(chunks.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return loadMissingSalesPriceStyleCountByRelationship;')(db,Prisma,v=>Array.isArray(v)?v:[],v=>Number(v)>0?Number(v):null,calculateOrderSalesValue,loadIssuedOrderSalesValues);
const version=(id,values)=>({id,entries:values.map(bucketQuantity=>({bucketQuantity}))});
const price=(styleId,v,values,basis='MANUFACTURING_SERVICE_PRICE',currency='USD')=>({styleId,quantityBucketSetVersionId:v.id,pricingBasis:basis,currency:{code:currency},prices:values.map(([bucketQuantity,unitPrice])=>({unitPrice,quantityBucketEntry:{bucketQuantity}}))});

test('customer warning checks each order style quantity, active overrides and common price scope',async()=>{
  const sql=new PGlite();
  try{
    await sql.exec(`CREATE TABLE "OrgRelationship"(id INT,"manufacturerOrgId" INT,"brandOrgId" INT,"salesBucketSetVersionId" INT);
      CREATE TABLE "Style"(id INT,"orgId" INT,"customerOrgId" INT);
      CREATE TABLE "OrgRelationshipStyleSalesBucket"("orgRelationshipId" INT,"styleId" INT,"quantityBucketSetVersionId" INT);
      CREATE TABLE "CustomerSalesPriceList"(id INT,"orgRelationshipId" INT,"styleId" INT,"quantityBucketSetVersionId" INT);
      CREATE TABLE "CustomerSalesPrice"("salesPriceListId" INT,"quantityBucketSetVersionId" INT);
      INSERT INTO "OrgRelationship" VALUES(1,1,2,10),(2,9,2,10),(3,1,3,10);
      INSERT INTO "Style" VALUES(7,1,2),(8,1,2),(9,9,2),(10,1,3);
      INSERT INTO "CustomerSalesPriceList" VALUES(1,1,7,10),(2,1,8,10),(3,2,9,10),(4,3,10,10);
      INSERT INTO "CustomerSalesPrice" VALUES(1,10),(2,10),(3,10),(4,10);`);
    const v=version(10,[100,500,1000]),override=version(20,[100,300,500]);
    const rel={id:1,manufacturerOrgId:1,brandOrgId:2,salesBucketSetVersion:v,salesBucketOverrides:[],salesPriceLists:[price(7,v,[[100,2]]),price(8,v,[[100,3],[500,3]])]};
    let orders=[{id:52,sellerOrgId:1,buyerOrgId:2,workOrderItems:[{styleId:7,totalQuantity:300},{styleId:7,totalQuantity:250},{styleId:8,totalQuantity:100}]}];
    const db={invoiceOrder:{findMany:async()=>[]},
      $queryRaw:async q=>(await sql.query(q.text,q.values)).rows,
      orgRelationship:{findMany:async({where,select})=>{
        if(select){assert.equal(where.manufacturerOrgId,1);assert.deepEqual(where.id.in,[1]);return [{id:1,brandOrgId:2}];}
        assert.deepEqual(where.OR,[{manufacturerOrgId:1,brandOrgId:2}]);return [rel];
      }},
      workOrder:{findMany:async({where})=>{assert.equal(where.sellerOrgId,1);assert.deepEqual(where.buyerOrgId.in,[2]);return orders;}},
    };
    const check=()=>load(db)({manufacturerOrgId:1,relationshipIds:[1],db});
    assert.equal((await check()).get(1),1,'D52-like order needs tier 500 despite a saved tier 100');
    rel.salesPriceLists[0].prices.push(...price(7,v,[[500,2]]).prices);
    assert.equal((await check()).get(1),undefined,'matching tier clears the warning');
    orders=[{...orders[0],workOrderItems:[{styleId:7,totalQuantity:300}]},{...orders[0],id:53,workOrderItems:[{styleId:7,totalQuantity:300}]}];
    rel.salesPriceLists[0]=price(7,v,[[100,2]]);
    assert.equal((await check()).get(1),undefined,'separate orders never sum into the next tier');
    rel.salesBucketOverrides=[{styleId:7,quantityBucketSetVersion:override}];
    assert.equal((await check()).get(1),1,'old/default version price cannot satisfy an active style override');
    rel.salesPriceLists.push(price(7,override,[[300,4]]));
    assert.equal((await check()).get(1),undefined);
    orders=[{...orders[0],workOrderItems:[{styleId:7,totalQuantity:300},{styleId:8,totalQuantity:100}]}];
    rel.salesPriceLists=rel.salesPriceLists.filter(p=>p.styleId===7);
    rel.salesPriceLists.push(price(8,v,[[100,8]],'FINISHED_GOODS_PRICE'));
    assert.equal((await check()).get(1),1,'incompatible CMT/FP scopes cannot produce a complete order amount');
    rel.salesPriceLists.push(price(7,override,[[300,5]],'FINISHED_GOODS_PRICE'));
    assert.equal((await check()).get(1),undefined,'one complete common scope clears the warning');
    await sql.exec('DELETE FROM "CustomerSalesPrice" WHERE "salesPriceListId"=1');
    rel.salesPriceLists=rel.salesPriceLists.filter(p=>p.styleId!==7);
    assert.equal((await check()).get(1),1,'setup and order omissions count the same style once');
    orders=[];
    assert.equal((await check()).get(1),1,'styles without any current price retain setup warnings without orders');
    const empty=await load(db)({manufacturerOrgId:1,relationshipIds:[],db});assert.equal(empty.size,0);
  }finally{await sql.close();}
});
