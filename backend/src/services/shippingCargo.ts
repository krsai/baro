import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
const fail=():never=>{throw createHttpError(400,'SHIPPING_CARGO_INVALID');};
const number=(value:any,integer=false)=>{if(typeof value!=='string'||!(integer?/^\d{1,8}$/:/^\d{1,10}(\.\d{1,6})?$/).test(value)||!new Prisma.Decimal(value).gt(0))fail();return value;};
export function validateOogTransition(data:any,previous:any={}){
 if(data.outOfGauge&&data.oogSchemaVersion!==1&&(!previous.outOfGauge||previous.oogSchemaVersion===1))fail();
 if(data.outOfGauge&&!(Array.isArray(data.containers)&&data.containers.some((row:any)=>['OT','FR'].includes(row?.type)))&&!(previous.outOfGauge&&JSON.stringify(data.containers)===JSON.stringify(previous.containers)))fail();
}
export function shippingCargo(data:any,mode:string){
 if(data.cargoSchemaVersion==null)return {};
 if(data.cargoSchemaVersion!==1)fail();
 const result:any={cargoSchemaVersion:1};
 const express=mode==='AIR'&&data.transportService==='EXPRESS'&&data.expressCargoVersion===1;
 if(data.expressCargoVersion!=null&&!express)fail();
 if(express){result.expressCargoVersion=1;result.chargeableWeightKg=number(data.chargeableWeightKg);if(typeof data.unit!=='string'||!data.unit.trim()||data.unit.length>30)fail();result.unit=data.unit.trim();}
 if(data.hsCode!=null){if(typeof data.hsCode!=='string'||data.hsCode!==''&&!/^\d{4}(?:\.?\d{2}){0,4}$/.test(data.hsCode))fail();result.hsCode=data.hsCode;}
 if(data.dgClass!==undefined||data.unNumber!==undefined){
  if(typeof data.dgClass!=='string'||typeof data.unNumber!=='string')fail();
  if((data.dangerousGoods||data.dgClass)&&!['1.1','1.2','1.3','1.4','1.5','1.6','2.1','2.2','2.3','3','4.1','4.2','4.3','5.1','5.2','6.1','6.2','7','8','9'].includes(data.dgClass))fail();
  if((data.dangerousGoods||data.unNumber)&&!/^\d{4}$/.test(data.unNumber))fail();
  result.dgClass=data.dgClass;result.unNumber=data.unNumber;
 }
 if(typeof data.cargo!=='string'||!data.cargo.trim())fail();
 // Declared totals are independent of container counts and optional package measurements.
 const declared=['quantity','weightKg','cbm'].every(key=>Number(data[key])>0)&&typeof data.unit==='string'&&Boolean(data.unit.trim());
 for(const key of ['quantity','weightKg','cbm'])if(data[key]!=null&&data[key]!==''){
  if(typeof data[key]!=='string'||!(key==='quantity'?/^\d{1,12}$/:/^\d{1,10}(\.\d{1,6})?$/).test(data[key]))fail();
  result[key]=data[key];
 }
 if(data.unit!=null){if(typeof data.unit!=='string'||data.unit.length>30)fail();result.unit=data.unit.trim();}
 if(data.dangerousGoods&&data.dgClass===undefined&&(typeof data.dangerousGoodsDetails!=='string'||!data.dangerousGoodsDetails.trim()||data.dangerousGoodsDetails.length>500))fail();
 if(mode==='SEA'&&data.shipmentType==='FCL'){
  if(!Array.isArray(data.containers)||!data.containers.length||data.containers.length>50)fail();
  result.containers=data.containers.map((row:any)=>{
   if(!row||typeof row!=='object')fail();
   if(!['20','40','45'].includes(row.size)||!['DC','HQ','OT','OH','FR','FH','RF','RH','TK'].includes(row.type))fail();
   return {size:row.size,type:row.type,count:number(row.count,true)};
  });
  if(typeof data.outOfGauge!=='boolean')fail();
  result.outOfGauge=data.outOfGauge;result.oogDetails=data.oogDetails||'';
  if(typeof result.oogDetails!=='string'||result.oogDetails.length>2000)fail();
  if(data.oogSchemaVersion!==undefined||data.oogPackages!==undefined){
   if(data.oogSchemaVersion!==1)fail();
   result.oogSchemaVersion=1;result.oogPackages=[];
   if(result.outOfGauge){
    if(!Array.isArray(data.oogPackages)||!data.oogPackages.length||data.oogPackages.length>50)fail();
    result.oogPackages=data.oogPackages.map((row:any)=>{if(!row||typeof row!=='object'||Array.isArray(row))fail();return {quantity:number(row.quantity,true),lengthM:number(row.lengthM),widthM:number(row.widthM),heightM:number(row.heightM)};});
   }
  }else if(result.outOfGauge&&!result.oogDetails.trim())fail(); // Keep legacy text-only records readable.
  result.containerCount=result.containers.reduce((sum:number,row:any)=>sum+Number(row.count),0).toString();
  result.containerType=result.containers.map((row:any)=>`${row.size}${row.type}`).join(', ');
 }else{
  const packages=data.packages??[];
  if(!Array.isArray(packages)||!packages.length&&!declared||packages.length>50)fail();
  result.packages=packages.map((row:any)=>{if(!row||typeof row!=='object'||Array.isArray(row))fail();return {quantity:number(row.quantity,true),...Object.fromEntries(['lengthM','widthM','heightM'].map(key=>[key,express&&(row[key]==null||row[key]==='')?'':number(row[key])]))};});
  const measuredVolume=result.packages.reduce((sum:any,row:any)=>sum.add(new Prisma.Decimal(row.quantity).mul(row.lengthM||0).mul(row.widthM||0).mul(row.heightM||0)),new Prisma.Decimal(0));
  if(measuredVolume.gte('1000000000000'))fail();
  if(!declared){result.quantity=result.packages.reduce((sum:number,row:any)=>sum+Number(row.quantity),0).toString();
  result.cbm=express&&result.packages.some((row:any)=>!row.lengthM||!row.widthM||!row.heightM)?'':measuredVolume.toFixed(6);}
  if(result.cbm&&new Prisma.Decimal(result.cbm).gte('1000000000000'))fail();
  result.weightKg=number(data.weightKg);
 }
 return result;
}
