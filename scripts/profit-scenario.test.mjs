import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateProfitScenario,createProfitInputs,trialProfitInputs} from '../frontend/src/utils/profitScenario.mjs';
test('ST/PT and productivity determine regular-hours labor, duration and staffing',()=>{
 const input={...trialProfitInputs(),quantity:5760,stSeconds:600,ptSeconds:500,workers:12,factoryWorkers:20,targetDays:10,workdays:30,packWaste:0};
 const a=calculateProfitScenario(input);assert.equal(a.ready,true);assert.equal(a.workloadHours,960);assert.equal(a.days,10);assert.equal(a.requiredWorkers,12);
 const b=calculateProfitScenario({...input,productivity:120,workers:10});assert.equal(b.workloadHours,800);assert.equal(b.days,10);assert.equal(b.requiredWorkers,10);
 const c=calculateProfitScenario({...input,basis:'PT'});assert.equal(c.workloadHours,800);assert.equal(c.requiredWorkers,10);
 assert.equal(b.costs.production,a.costs.production);assert.ok(b.costs.base<a.costs.base);assert.ok(b.costs.rent<a.costs.rent);
});
test('salary is worker-days, overhead is duration times factory share, without a second hourly labor charge',()=>{
 const result=calculateProfitScenario({...trialProfitInputs(),quantity:5760,stSeconds:600,workers:12,factoryWorkers:24,workdays:30});
 assert.equal(result.costs.base,6000000*12/3);assert.equal(result.costs.allowance,1000000*12/3);
 assert.ok(Math.abs(result.costs.support-9000000/3*.5)<.000001);assert.ok(Math.abs(result.costs.rent-20000000/3*.5)<.000001);
 assert.equal(result.costs.production,5760*3000);
 assert.equal(result.total,Object.values(result.costs).reduce((a,b)=>a+b,0));assert.equal(result.profit,result.revenue-result.total);
});
test('packaging rounds purchasing quantities up and uses capacity rather than one box per garment',()=>{
 const result=calculateProfitScenario({...trialProfitInputs(),quantity:101,polyUsage:1.5,boxCapacity:50,packWaste:2});
 assert.equal(result.poly,155);assert.equal(result.boxes,3);assert.equal(result.costs.polyCost,62000);assert.equal(result.costs.boxCost,60000);
 const off=calculateProfitScenario({...trialProfitInputs(),packaging:false,polyPrice:'',boxPrice:'',boxCapacity:''});assert.equal(off.ready,true);assert.equal(off.costs.polyCost,0);
});
test('missing sources never become zero profit or a silently substituted ST/PT',()=>{
 const missing=calculateProfitScenario(createProfitInputs());assert.equal(missing.profit,null);assert.ok(missing.missing.includes('stSeconds'));
 const input={...trialProfitInputs(),basis:'PT',ptSeconds:''};assert.equal(calculateProfitScenario(input).workloadHours,null);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),baseMonthly:''}).total,null);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),baseMonthly:0}).ready,true);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),productivity:0}).days,null);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),workers:11,factoryWorkers:10}).ready,false);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),workers:1.5}).ready,true);
 assert.equal(calculateProfitScenario({...trialProfitInputs(),hoursDay:25}).ready,false);
});
test('linked pretax direct costs replace the estimate; unavailable sources stay incomplete',()=>{
 const input={...trialProfitInputs(),costMode:'linked',packaging:false,otherUnitCost:999999};
 assert.equal(calculateProfitScenario(input,{linkedAmount:32000}).costs.direct,32000);
 assert.equal(calculateProfitScenario(input,{linkedAmount:null}).profit,null);
 const loss=calculateProfitScenario({...trialProfitInputs(),salePrice:1});assert.ok(loss.profit<0);assert.ok(loss.margin<0);
});
