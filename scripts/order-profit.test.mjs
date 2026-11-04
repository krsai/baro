import test from 'node:test';
import assert from 'node:assert/strict';
import {orderCostDefaults,orderStyleProfit,orderProfitTotals,orderCommonPurchase,companyPayroll,regularOrderCrew} from '../frontend/src/utils/orderProfit.mjs';
const defaults={...orderCostDefaults(),currency:'VND',baseMonthly:6000000,allowanceMonthly:1000000,supportMonthly:9000000,rentMonthly:20000000,workdays:25};
const style={quantity:100,salesAmount:1000,salePrice:10,currency:'USD',sources:{times:{ST:600,PT:null},costs:[{id:'a',exact:true,approved:true,subtotal:'100000',currency:'VND'},{id:'b',exact:true,approved:true,subtotal:'4',currency:'USD'},{id:'shared',exact:false,approved:true,subtotal:'999999',currency:'VND'},{id:'pending',exact:true,approved:false,subtotal:'999999',currency:'VND'}]}};
test('regular crew uses every selected style and allows fractional estimates without replacing missing times',()=>{
 const input={basis:'ST',hoursDay:8,targetDays:10,productivity:120};
 assert.equal(regularOrderCrew([style,{...style,quantity:200}],input),300*600/3600/1.2/8/10);
 assert.equal(regularOrderCrew([style],{...input,basis:'PT'}),null);
 assert.equal(regularOrderCrew([style],{...input,basis:'PT'},()=>({ptSeconds:500})),100*500/3600/1.2/8/10);
});
test('saved payroll wins over manual input while missing monthly totals can be supplied',()=>{
 const company={pools:[{currencyCode:'VND',officeFixedMonthly:100,productionFixedMonthly:null,variableBaseMonthly:200,variableAllowanceMonthly:0,variableProductionMonthly:300}]};
 const loaded=companyPayroll(company,'VND',{}, {officeFixedMonthly:999,productionFixedMonthly:500});assert.equal(loaded.officeFixedMonthly,100);assert.equal(loaded.productionFixedMonthly,500);assert.equal(loaded.variableAllowanceMonthly,0);
 assert.equal(companyPayroll(company,'VND').productionFixedMonthly,null);
 const result=orderStyleProfit(style,{...defaults,workers:.5,productionFixedMonthly:500},{},{},{USD:'1',VND:'25000'},{company});
 assert.equal(result.laborComplete,true);assert.equal(result.laborBreakdown.productionFixed,500*result.days/25);assert.equal(result.ready,true);
});
test('saved quantity and existing sales amount override arbitrary scenario values; purchases are not duplicated by payment',()=>{
 const r=orderStyleProfit(style,defaults,{quantity:999999,salePrice:999999},{},{USD:'1',VND:'25000'});
 assert.equal(r.input.quantity,100);assert.equal(r.revenue,25000000);assert.equal(r.purchase,200000);assert.equal(r.costs.direct,200000);assert.equal(r.ready,true);
});
test('missing FX or PT leaves profit incomplete while saved sales stay intact',()=>{
 assert.equal(orderStyleProfit(style,defaults,{},{}).revenue,null);
 const r=orderStyleProfit(style,{...defaults,basis:'PT'},{},{},{USD:'1',VND:'25000'});assert.equal(r.days,null);assert.equal(r.profit,null);assert.equal(r.revenue,25000000);
});
test('every style contributes its own duration, purchases and fixed costs; incomplete styles block complete-order totals',()=>{
 const a=orderStyleProfit(style,defaults,{},{},{USD:'1',VND:'25000'}),b=orderStyleProfit({...style,quantity:200,salesAmount:2000},defaults,{},{},{USD:'1',VND:'25000'});
 const total=orderProfitTotals([a,b]);assert.equal(total.revenue,75000000);assert.equal(total.purchase,400000);assert.equal(total.days,a.days+b.days);assert.equal(total.profit,a.profit+b.profit);
 assert.equal(orderProfitTotals([a,{...b,profit:null}]).profit,null);assert.equal(orderProfitTotals([a],true).profit,null);
});
test('style packaging uses matching currency rates and adds only explicitly enabled estimated consumption',()=>{
 const r=orderStyleProfit(style,defaults,{packaging:true,polyUsage:2,boxCapacity:50,packWaste:0,polyPrice:100,boxPrice:1000,currency:'VND'},{},{USD:'1',VND:'25000'});
 assert.equal(r.poly,200);assert.equal(r.boxes,2);assert.equal(r.costs.polyCost,20000);assert.equal(r.costs.boxCost,2000);
 const changed=orderStyleProfit(style,{...defaults,currency:'USD',polyPrice:1,boxPrice:2},{currency:'VND',polyPrice:10000,boxPrice:10000},{});assert.equal(changed.input.polyPrice,1);
});
test('approved order-wide costs count once at order level; style-linked and cross-order amounts are not allocated again',()=>{
 const a={id:'style',withinOrder:true,exact:true,approved:true,subtotal:'1000',currency:'VND'},shared={id:'common',withinOrder:true,exact:false,approved:true,subtotal:'3000',currency:'VND'},cross={...shared,id:'cross',withinOrder:false};
 const styles=[{sources:{costs:[a,shared,cross]}},{sources:{costs:[{...a,exact:false},shared,cross]}}];
 const common=orderCommonPurchase(styles,'VND',{});assert.equal(common.amount,3000);assert.equal(common.rows.length,1);
 const row={revenue:10000,purchase:1000,total:2000,profit:8000,days:1};
 const total=orderProfitTotals([row,row],false,common.amount);assert.equal(total.purchase,5000);assert.equal(total.profit,13000);assert.equal(total.total,7000);
 assert.equal(orderProfitTotals([row],false,null).profit,null);
});
test('automatic factory salary calculates independently of missing rent and uses ST/PT output pay without double-counting hourly payroll',()=>{
 const basis={currencyCode:'VND',directCount:20,baseHourly:30000,allowanceHourly:5000,supportHourly:40000,productionPerSecond:2};
 const r=orderStyleProfit(style,{...defaults,baseMonthly:'',allowanceMonthly:'',supportMonthly:'',rentMonthly:''},{},{},{USD:'1',VND:'25000'},basis);
 assert.equal(r.automaticLabor,true);assert.ok(Math.abs(r.costs.base-r.workloadHours*30000)<.001);assert.ok(Math.abs(r.costs.allowance-r.workloadHours*5000)<.001);
 assert.ok(Math.abs(r.costs.support-r.workloadHours*40000/20)<.001);assert.equal(r.costs.production,100*600*2);
 assert.equal(r.laborComplete,true);assert.ok(r.labor>0);assert.equal(r.costs.rent,null);assert.equal(r.profit,null);
 const manual=orderStyleProfit(style,{...defaults,laborSource:'MANUAL'},{},{},{USD:'1',VND:'25000'},basis);assert.equal(manual.automaticLabor,false);
});
test('all company employees are charged for the production period without crew/headcount discount',()=>{
 const company={employeeCount:100,counts:{GENERAL:10,OUTPUT_FIXED:30,OUTPUT:60},pools:[{currencyCode:'VND',officeFixedMonthly:30000000,productionFixedMonthly:60000000,variableBaseMonthly:90000000,variableAllowanceMonthly:15000000,variableProductionMonthly:30000000}]};
 const input={...defaults,workers:10,factoryWorkers:100,workdays:30,productivity:100};
 const target={...style,quantity:4800,salesAmount:48000};
 const r=orderStyleProfit(target,input,{},{},{USD:'1',VND:'25000'},{company,directCount:90});
 assert.equal(r.days,10);assert.equal(r.labor,75000000);assert.equal(r.laborBreakdown.officeFixed,10000000);assert.equal(r.laborBreakdown.productionFixed,20000000);assert.equal(r.costs.base,30000000);assert.equal(r.costs.allowance,5000000);assert.equal(r.costs.production,10000000);
 assert.equal(r.input.factoryWorkers,10);assert.ok(Math.abs(r.costs.rent-20000000/3)<.001);
 const faster=orderStyleProfit(target,{...input,productivity:120},{},{},{USD:'1',VND:'25000'},{company});assert.ok(faster.costs.support<r.costs.support);assert.ok(Math.abs(faster.costs.production-r.costs.production)<.001);
});
test('standalone style scales historical garment costs to entered quantity instead of reusing historical totals',()=>{
 const standalone={...style,analysisMode:'STYLE',quantity:500,salesAmount:5000,sources:{...style.sources,estimatedPurchases:[{currency:'VND',unitCost:300,quantityBasis:1000,orderCount:2}]}};
 const r=orderStyleProfit(standalone,defaults,{},{},{USD:'1',VND:'25000'});assert.equal(r.purchase,150000);assert.equal(r.input.quantity,500);assert.equal(r.revenue,125000000);
});
