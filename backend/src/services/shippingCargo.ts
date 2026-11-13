import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
const fail=():never=>{throw createHttpError(400,'SHIPPING_CARGO_INVALID');};
const number=(value:any,integer=false)=>{if(typeof value!=='string'||!(integer?/^\d{1,8}$/:/^\d{1,10}(\.\d{1,6})?$/).test(value)||!new Prisma.Decimal(value).gt(0))fail();return value;};
export function validateOogTransition(data:any,previous:any={}){
 if(data.outOfGauge&&data.oogSchemaVersion!==1&&(!previous.outOfGauge||previous.oogSchemaVersion===1))fail();
}
export function shippingCargo(data:any,mode:string){
 if(data.cargoSchemaVersion==null)return {};
 if(data.cargoSchemaVersion!==1)fail();
 const result:any={cargoSchemaVersion:1};
 if(data.hsCode!=null){if(typeof data.hsCode!=='string'||data.hsCode!==''&&!/^\d{4}(?:\.?\d{2}){0,4}$/.test(data.hsCode))fail();result.hsCode=data.hsCode;}
 if(data.dgClass!==undefined||data.unNumber!==undefined){
  if(typeof data.dgClass!=='string'||typeof data.unNumber!=='string')fail();
  if((data.dangerousGoods||data.dgClass)&&!['1.1','1.2','1.3','1.4','1.5','1.6','2.1','2.2','2.3','3','4.1','4.2','4.3','5.1','5.2','6.1','6.2','7','8','9'].includes(data.dgClass))fail();
  if((data.dangerousGoods||data.unNumber)&&!/^\d{4}$/.test(data.unNumber))fail();
  result.dgClass=data.dgClass;result.unNumber=data.unNumber;
 }
 if(typeof data.cargo!=='string'||!data.cargo.trim())fail();
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
  if(!Array.isArray(data.packages)||!data.packages.length||data.packages.length>50)fail();
  result.packages=data.packages.map((row:any)=>{if(!row||typeof row!=='object')fail();return {quantity:number(row.quantity,true),lengthM:number(row.lengthM),widthM:number(row.widthM),heightM:number(row.heightM)};});
  result.quantity=result.packages.reduce((sum:number,row:any)=>sum+Number(row.quantity),0).toString();
  result.cbm=result.packages.reduce((sum:any,row:any)=>sum.add(new Prisma.Decimal(row.quantity).mul(row.lengthM).mul(row.widthM).mul(row.heightM)),new Prisma.Decimal(0)).toFixed(6);
  if(new Prisma.Decimal(result.cbm).gte('1000000000000'))fail();
  result.weightKg=number(data.weightKg);
 }
 return result;
}
