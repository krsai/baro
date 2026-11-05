export const PACKAGING_KEYS=['boxLengthCm','boxWidthCm','boxHeightCm','packedCbmPerPiece','polyUsage','boxCapacity','packWaste','polyPrice','boxPrice'];
export function packagingGeometry(input){
 const length=Number(input.boxLengthCm??60),width=Number(input.boxWidthCm??40),height=Number(input.boxHeightCm??40),piece=Number(input.packedCbmPerPiece);
 const boxCbm=length>0&&width>0&&height>0?length*width*height/1000000:null;
 const capacity=boxCbm!==null&&piece>0?(boxCbm<piece?0:Math.ceil(Number((boxCbm/piece).toPrecision(12)))):null;
 return {boxCbm,capacity};
}
export const createProfitInputs=()=>({currency:'VND',quantity:'',salePrice:'',basis:'ST',stSeconds:'',ptSeconds:'',productivity:100,workers:10,targetDays:10,hoursDay:8,workdays:26,factoryWorkers:10,baseMonthly:'',allowanceMonthly:'',supportMonthly:'',rentMonthly:'',productionPay:'',otherUnitCost:'',boxLengthCm:60,boxWidthCm:40,boxHeightCm:40,packedCbmPerPiece:'',packaging:true,polyUsage:1,boxCapacity:50,packWaste:2,polyPrice:'',boxPrice:'',costMode:'estimate'});
export const trialProfitInputs=()=>({...createProfitInputs(),quantity:1000,salePrice:40000,stSeconds:600,ptSeconds:500,baseMonthly:6000000,allowanceMonthly:1000000,supportMonthly:9000000,rentMonthly:20000000,productionPay:3000,otherUnitCost:1000,polyPrice:400,boxPrice:20000});
const number=value=>value===''||value==null||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
export function calculateProfitScenario(input,{linkedAmount=0}={}){
 const missing=[];
 const read=(key,positive=false)=>{const value=number(input[key]);if(value===null||positive&&value<=0){missing.push(key);return null;}return value;};
 const quantity=read('quantity',true),seconds=read(input.basis==='AT'?'atSeconds':input.basis==='PT'?'ptSeconds':'stSeconds',true),productivity=read('productivity',true),workers=read('workers',true),hours=read('hoursDay',true),workdays=read('workdays',true),capacity=read('factoryWorkers',true);
 if(quantity!==null&&!Number.isInteger(quantity))missing.push('quantity');
 if(hours>24)missing.push('hoursDay');if(workdays>31)missing.push('workdays');
 const workloadHours=quantity!==null&&seconds!==null&&productivity!==null?quantity*seconds/3600/(productivity/100):null;
 const days=workloadHours!==null&&workers!==null&&hours!==null?workloadHours/workers/hours:null;
 const target=number(input.targetDays),requiredWorkers=workloadHours!==null&&hours!==null&&target>0?Math.ceil(workloadHours/hours/target):null;
 const share=workers!==null&&capacity!==null?workers/capacity:null;
 if(share>1)missing.push('capacityExceeded');
 const fraction=days!==null&&workdays!==null?days/workdays:null;
 const prorate=(key,perWorker=false)=>{const value=read(key);return value!==null&&fraction!==null&&share!==null?value*fraction*(perWorker?workers:share):null;};
 const base=prorate('baseMonthly',true),allowance=prorate('allowanceMonthly',true),support=prorate('supportMonthly'),rent=input.includeRent===false?0:prorate('rentMonthly');
 const office=input.includeOffice?prorate('officeMonthly'):0,factory=input.includeFactory?prorate('factoryOtherMonthly'):0;
 const piece=read('productionPay'),production=piece!==null&&quantity!==null?piece*quantity:null;
 let direct=null,poly=0,boxes=0,polyCost=0,boxCost=0;
 if(input.costMode==='linked'){direct=number(linkedAmount);if(direct===null)missing.push('linkedAmount');}
 else {const rate=read('otherUnitCost');direct=rate!==null&&quantity!==null?rate*quantity:null;}
 if(input.packaging){
  const geometry=packagingGeometry(input);
  const hasVolume=Number(input.packedCbmPerPiece)>0;
  if(hasVolume){for(const key of ['boxLengthCm','boxWidthCm','boxHeightCm'])if(!(Number(input[key]??({boxLengthCm:60,boxWidthCm:40,boxHeightCm:40}[key]))>0))missing.push(key);input={...input,boxCapacity:geometry.capacity??''};}
  const usage=read('polyUsage'),boxCapacity=input.boxPayer==='CUSTOMER'?number(input.boxCapacity):read('boxCapacity',true),waste=read('packWaste'),polyPrice=input.polyPayer==='CUSTOMER'?0:read('polyPrice'),boxPrice=input.boxPayer==='CUSTOMER'?0:read('boxPrice');
  poly=quantity!==null&&usage!==null&&waste!==null?Math.ceil(quantity*usage*(1+waste/100)):null;
  boxes=quantity!==null&&boxCapacity!==null&&waste!==null?Math.ceil(quantity/boxCapacity*(1+waste/100)):null;
  polyCost=input.polyPayer==='CUSTOMER'?0:poly!==null&&polyPrice!==null?poly*polyPrice:null;boxCost=input.boxPayer==='CUSTOMER'?0:boxes!==null&&boxPrice!==null?boxes*boxPrice:null;
 }
 const price=read('salePrice'),revenue=quantity!==null&&price!==null?quantity*price:null;
 const costs={base,allowance,production,support,rent,office,factory,direct,polyCost,boxCost};
 const knownCost=Object.values(costs).reduce((sum,value)=>sum+(value??0),0),ready=missing.length===0,total=ready?knownCost:null,profit=ready?revenue-total:null;
 return {missing:[...new Set(missing)],ready,quantity,workloadHours,days,requiredWorkers,share,poly,boxes,costs,knownCost,total,revenue,profit,unitCost:total!==null&&quantity?total/quantity:null,margin:profit!==null&&revenue>0?profit/revenue*100:null};
}
