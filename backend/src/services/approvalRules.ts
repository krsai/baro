import {canSkipApprovalStage} from './approvalStageAuthority';
import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {EXPENSE_APPROVAL_SUBJECT,ApprovalSubject} from './approvalSubjects';
const roles=['OPERATOR','ACCOUNTANT','ADMIN'];
const fail=(code='INVALID_APPROVAL_RULE'):never=>{throw createHttpError(400,code);};
export async function validateApprovalRules(db:any,orgId:number,input:any,subject:ApprovalSubject=EXPENSE_APPROVAL_SUBJECT){
 if(!Array.isArray(input)||input.length>30)return fail();
 const rules=[];const ids=new Set();
 for(const row of input){
  if(!row||typeof row.id!=='string'||!/^[\w-]{1,64}$/.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||!['ALL',...roles].includes(row.drafterRole)||subject.hasAmount&&!['USD','VND','KRW'].includes(row.currency))return fail();
  ids.add(row.id);
  const grade=async(id:any)=>{if(id==null||id==='')return null;if(!Number.isSafeInteger(id)||!await db.employeeGrade.findFirst({where:{id,orgId,isActive:true,set:{isActive:true}}}))return fail();return id;};
  const money=(value:any,empty=false)=>{if(empty&&(value===''||value==null))return null;if(typeof value!=='string'||!(row.currency==='USD'?/^\d{1,15}(\.\d{1,2})?$/:/^\d{1,15}$/).test(value))return fail();return new Prisma.Decimal(value).toFixed();};
  const min=subject.hasAmount?money(row.min):null,max=subject.hasAmount?money(row.max,true):null;if(max!=null&&new Prisma.Decimal(min!).gt(max))return fail();
  if(!Array.isArray(row.stages)||!row.stages.length||row.stages.length>10)return fail();
  const stages=[];
  for(const stage of row.stages){
   if(!stage||!roles.includes(stage.role))return fail();
   const gradeId=await grade(stage.gradeId);
   if(stage.role!=='ADMIN'&&!gradeId&&!(subject.key==='BANK_LEDGER'&&stage.gradeMatch==='ANY'))return fail();
   if(subject.key==='BANK_LEDGER'&&stage.gradeMatch!==undefined&&!['ANY','EXACT','MINIMUM'].includes(stage.gradeMatch))return fail();
   if(subject.key==='BANK_LEDGER'&&(stage.gradeMatch==='ANY'&&gradeId||['EXACT','MINIMUM'].includes(stage.gradeMatch)&&!gradeId))return fail();
   stages.push({role:stage.role,gradeId,...(subject.key==='BANK_LEDGER'?{gradeMatch:stage.gradeMatch||(gradeId?'EXACT':'ANY')}: {})});
  }
  if(subject.key==='EXPENSE'&&['ALL','OPERATOR'].includes(row.drafterRole)&&!stages.some(stage=>stage.role==='ACCOUNTANT'))return fail('APPROVAL_ACCOUNTANT_REQUIRED');
  rules.push({id:row.id,name:row.name.trim(),drafterRole:row.drafterRole,drafterGradeId:await grade(row.drafterGradeId),currency:subject.hasAmount?row.currency:null,min,max,stages});
 }
 return rules;
}
export async function resolveApprovalRules(db:any,orgId:number,drafter:any,totals:Map<string,Prisma.Decimal>,config:any,selection:any,allowIncomplete:boolean,subject:ApprovalSubject=EXPENSE_APPROVAL_SUBJECT,fallback?:(currency:string)=>Promise<any[]>){
 if(config.version!==2||!config.rules?.length)return null;
 if(config.kind!==subject.key)return fail('INVALID_APPROVAL_SUBJECT');
 const applicable=config.rules.some((row:any)=>row.drafterRole==='ALL')?[...config.rules].sort((a:any,b:any)=>
  (b.drafterRole===drafter.orgRole?2:0)+(b.drafterGradeId?1:0)-(a.drafterRole===drafter.orgRole?2:0)-(a.drafterGradeId?1:0)):config.rules;
 const matched=[];
 if(!subject.hasAmount){const rule=applicable.find((row:any)=>(row.drafterRole==='ALL'||row.drafterRole===drafter.orgRole)&&(!row.drafterGradeId||row.drafterGradeId===drafter.gradeId));if(!rule)return fail('APPROVAL_RULE_NOT_FOUND');matched.push(rule);}
 if(subject.hasAmount){
  const conditions=[...totals].map(([currency,amount])=>({currency,rule:applicable.find((row:any)=>(row.drafterRole==='ALL'||row.drafterRole===drafter.orgRole)&&(!row.drafterGradeId||row.drafterGradeId===drafter.gradeId)&&row.currency===currency&&amount.gte(row.min)&&(row.max==null||amount.lte(row.max)))}));
  if(!conditions.some(row=>row.rule))return null;
  for(const {currency,rule} of conditions){
   if(rule)matched.push(rule);
   else if(fallback)matched.push({id:'fallback-'+currency,stages:await fallback(currency)});
   else return fail('APPROVAL_RULE_NOT_FOUND');
  }
 }
 // Merge currencies without comparing or converting their amounts. Keep every
 // chain's ordering; contradictory chains must be fixed rather than guessed.
 const nodes=new Map<string,any>(),edges=new Map<string,Set<string>>();
 for(const rule of matched){let previous:string|null=null;const occurrences=new Map<string,number>();for(const stage of rule.stages){const category=stage.role+':'+(stage.gradeId||'')+':'+(stage.gradeMatch||'EXACT'),occurrence=(occurrences.get(category)||0)+1;occurrences.set(category,occurrence);const key=category+':'+occurrence;nodes.set(key,stage);if(!edges.has(key))edges.set(key,new Set());if(previous)edges.get(previous)!.add(key);previous=key;}}
 const ordered:any[]=[];const remaining=new Set(nodes.keys());
 while(remaining.size){const key=[...remaining].find(key=>![...remaining].some(other=>edges.get(other)?.has(key)));if(!key)return fail('APPROVAL_RULE_ORDER_CONFLICT');remaining.delete(key);ordered.push(nodes.get(key));}
 const ids:number[]=[],stages:any[]=[],resolvedStages:any[]=[],skipped:string[]=[],effectiveRegistrationStages:any[]=[];let complete=true;
 for(const [index,stage] of ordered.entries()){
  const key='step'+(index+1);
  if(await canSkipApprovalStage(db,orgId,drafter,stage,index===ordered.length-1)){skipped.push(key);continue;}
  const required=stage.gradeId&&stage.gradeMatch==='MINIMUM'?await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}}):null;
  const where={orgId,status:'ACTIVE',orgRole:stage.role,...(stage.gradeId?stage.gradeMatch==='MINIMUM'&&required?{grade:{orgId,setId:required.setId,sortOrder:{gte:required.sortOrder},isActive:true,set:{isActive:true}}}:{gradeId:stage.gradeId,grade:{isActive:true,set:{isActive:true}}}:{})};
  const candidates=await db.employee.findMany({where:{...where,id:{notIn:[drafter.id,...ids]}},select:{id:true,name:true,gradeId:true,grade:{select:{name:true,nameKo:true,nameEn:true,nameVi:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
  const employeeId=selection?.[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null);
  const chosen=candidates.find((candidate:any)=>candidate.id===employeeId);
  if(!chosen){complete=false;if(!allowIncomplete)return fail(employeeId?'INVALID_EXPENSE_APPROVERS':'EXPENSE_APPROVER_REQUIRED');}
  else {ids.push(chosen.id);resolvedStages.push({employeeId:chosen.id,role:stage.role,gradeId:subject.key==='BANK_LEDGER'?chosen.gradeId:stage.gradeId});}
  effectiveRegistrationStages.push(stage);
  stages.push({key,role:stage.role,gradeId:stage.gradeMatch==='MINIMUM'?null:stage.gradeId,minimumGradeId:stage.gradeMatch==='MINIMUM'?stage.gradeId:null,gradeMatch:stage.gradeMatch,requiredGrade:required,employeeId:chosen?.id||null,name:chosen?.name,candidates,invalid:!!employeeId&&!chosen});
 }
 return {ids,complete,stages,drafter,policy:{drafterId:drafter.id,exempt:false,config,resolvedStages,...(subject.key==='BANK_LEDGER'?{effectiveRegistrationStages}:{}),ruleIds:matched.map(rule=>rule.id),skipped,level:ordered.length-1,...(selection===undefined?{}:{selection}),totals:[...totals].map(([currency,amount])=>({currency,amount:amount.toString()}))}};
}
