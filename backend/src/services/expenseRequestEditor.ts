import { createHash } from 'node:crypto';
import { env } from 'node:process';
import { createHttpError } from '../utils/http';
import { loadManagementPeriod, assertManagedDate } from '../factories/factoryManagementStart';
import { validateCostDate } from './partnerTransactionCost';
import { registerTransactionRequest, REQUEST_INCLUDE } from './transactionRequest';

const recordInclude = {
  workLog: true, style: { select: { id: true, name: true, code: true } }, styleProcess: true,
  outsourcingPartner: { select: { id: true, name: true } },
  createdByEmployee: { select: { id: true, name: true } },
  assignmentPlan: { select: { id: true, orgId: true, styleId: true, workOrderId: true, factoryId: true, isCompleted: true,
    ctReviewRequired: true, completedAt: true, productionCompletedAt: true, closedAt: true,
    workOrder: { select: { id: true, orderNumber: true, invoiceFinalLockedAt: true } } } },
};
const costInclude = { ...REQUEST_INCLUDE, workOrder: { select: { id: true, orderNumber: true, invoiceFinalLockedAt: true } }, outsourcedWorkRecord: { include: recordInclude } };
const documentInclude = { partner: { select: { id: true, name: true } }, createdByEmployee: { select: { id: true, name: true } },
  items: { include: costInclude, orderBy: { expenseRequestLine: 'asc' } } };
const fail = (status: number, code: string): never => { throw createHttpError(status, code); };
const numericId = (id: string) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id)>0 ? Number(id) : fail(400,'INVALID_EXPENSE_SOURCE');
const snapshot = (value: any) => JSON.parse(JSON.stringify(value));
const hash = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function loadExpenseEditorSource(db: any, orgId: number, kind: string, id: string): Promise<any> {
  if (kind === 'request') {
    const document = await db.expenseRequest.findFirst({ where: { id: numericId(id), orgId }, include: documentInclude });
    if (!document) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
    return { kind, id: String(document.id), document, costs: document.items, record: null };
  }
  if (kind === 'cost') {
    if (!/^[\w-]{1,100}$/.test(id)) return fail(400,'INVALID_EXPENSE_SOURCE');
    const cost = await db.partnerTransactionCost.findFirst({ where: { id, orgId }, include: costInclude });
    if (!cost) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
    if (cost.expenseRequestId) return loadExpenseEditorSource(db,orgId,'request',String(cost.expenseRequestId));
    return { kind, id: cost.id, document: null, costs: [cost], record: null };
  }
  if (kind !== 'legacy') return fail(400,'INVALID_EXPENSE_SOURCE');
  const record = await db.outsourcedWorkRecord.findFirst({ where: { id: numericId(id), orgId }, include: recordInclude });
  if (!record) return fail(404,'EXPENSE_SOURCE_NOT_FOUND');
  const cost = await db.partnerTransactionCost.findFirst({ where: { orgId, outsourcedWorkRecordId: record.id } });
  if (cost) return loadExpenseEditorSource(db,orgId,'cost',cost.id);
  return { kind, id: String(record.id), document: null, costs: [], record };
}

export function expenseEditorRevision(source: any) {
  return hash(snapshot({ kind: source.kind, id: source.id, document: source.document && {
    id: source.document.id, title: source.document.title, requestDate: source.document.requestDate, partnerOrgId: source.document.partnerOrgId,
  }, costs: source.costs.map((cost: any) => ({...cost,partner:undefined,serviceType:undefined,transactionCode:undefined,workOrder:undefined,style:undefined,styleProcess:undefined,createdByEmployee:undefined})), record: source.record }));
}

function editorLine(cost: any, record: any) {
  const refs = record && { order: record.assignmentPlan.workOrder,
    style: { ...record.style, styleProcesses: [record.styleProcess] },
    plan: { id: record.assignmentPlanId, styleId: record.styleId, processIds: [record.styleProcessId] } };
  return { itemId: cost?.id || null, sourceRecordId: record?.id || null,
    transactionCodeId: cost?.transactionCodeId || '', currency: cost?.currency || 'VND',
    description: cost?.description || [record?.style?.name,record?.styleProcess?.processName].filter(Boolean).join(' · '),
    quantity: String(cost?.quantity ?? record?.quantity ?? 1), unitPrice: String(cost?.unitPrice ?? record?.outsourceUnitPrice ?? cost?.amount ?? ''),
    vatRate: String(cost?.vatRate ?? 0), details: cost?.details || {},
    workOrderId: cost?.workOrderId || record?.assignmentPlan?.workOrderId || '', styleId: cost?.styleId || record?.styleId || '',
    styleProcessId: cost?.styleProcessId || record?.styleProcessId || '', assignmentPlanId: record?.assignmentPlanId || '',
    productionLinked: Boolean(record), productionLocked: Boolean(record?.assignmentPlan?.isCompleted), preservedReferences: refs,
    enabled: { order: Boolean(cost?.workOrderId || record), style: Boolean(cost?.styleId || record), process: Boolean(cost?.styleProcessId || record) } };
}

export function expenseEditorForm(source: any) {
  const first = source.costs[0], record = source.record || first?.outsourcedWorkRecord;
  return { title: source.document?.title || first?.description || '',
    requestDate: source.document?.requestDate || first?.transactionDate || record?.workLog.displayDate,
    partnerOrgId: source.document?.partnerOrgId || first?.partnerOrgId || record?.outsourcingPartnerId,
    partner: source.document?.partner || first?.partner || record?.outsourcingPartner,
    createdByEmployee: source.document?.createdByEmployee || first?.createdByEmployee || record?.createdByEmployee || null, revision: expenseEditorRevision(source),
    readOnly: Boolean(record?.assignmentPlan?.workOrder?.invoiceFinalLockedAt || source.costs.some((cost: any)=>cost.workOrder?.invoiceFinalLockedAt || cost.outsourcedWorkRecord?.assignmentPlan?.workOrder?.invoiceFinalLockedAt)),
    items: source.record ? [editorLine(null,source.record)] : source.costs.map((cost: any)=>editorLine(cost,cost.outsourcedWorkRecord)),
    canonicalSource: { kind: source.kind, id: source.id } };
}

export async function saveExpenseEditor(tx: any, orgId: number, actorId: number, kind: string, id: string, body: any, appendQuantityRemark?: any) {
  if (!/^[\w-]{8,64}$/.test(body?.clientKey || '') || typeof body?.revision !== 'string') return fail(400,'INVALID_TRANSACTION_KEY');
  const key = `EXPENSE_REQUEST_EDIT:${orgId}:${body.clientKey}`;
  const inputHash = hash({kind,id,body});
  const previous = await tx.systemSetting.findUnique({ where: { key } });
  if (previous) {
    if (previous.updatedByEmployeeId !== actorId || previous.value.inputHash !== inputHash) return fail(409,'EXPENSE_REQUEST_RETRY_MISMATCH');
    return { requestId: previous.value.requestId, assignmentPlanIds: [] };
  }
  let source = await loadExpenseEditorSource(tx,orgId,kind,id);
  const orders = [...new Set([...source.costs.flatMap((cost: any)=>[cost.workOrderId,cost.outsourcedWorkRecord?.assignmentPlan?.workOrderId]),source.record?.assignmentPlan?.workOrderId,
    ...(Array.isArray(body.items)?body.items.map((item: any)=>item?.workOrderId):[])].filter((value: any)=>Number.isSafeInteger(value)&&value>0))].sort((a: any,b: any)=>a-b);
  for (const orderId of orders) await tx.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',orderId,orgId);
  if (orders.length && await tx.workOrder.findFirst({ where: { id: { in: orders }, orgId, invoiceFinalLockedAt: { not: null } }, select: { id: true } })) return fail(409,'ORDER_FINALLY_LOCKED');
  if (source.document) await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',source.document.id,orgId);
  for (const cost of [...source.costs].sort((a,b)=>a.id.localeCompare(b.id))) await tx.$queryRawUnsafe('SELECT id FROM "PartnerTransactionCost" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',cost.id,orgId);
  const records = [source.record,...source.costs.map((cost: any)=>cost.outsourcedWorkRecord)].filter(Boolean).sort((a,b)=>a.id-b.id);
  for (const record of records) await tx.$queryRawUnsafe('SELECT id FROM "OutsourcedWorkRecord" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',record.id,orgId);
  source = await loadExpenseEditorSource(tx,orgId,kind,id);
  if (expenseEditorRevision(source) !== body.revision) return fail(409,'EXPENSE_REQUEST_CHANGED');
  // Transaction-local capability, verified by database guards and a deferred
  // check that the matching audit event was saved before commit.
  await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(orgId)},true),set_config('baro.expense_editor_actor',${String(actorId)},true),set_config('baro.expense_editor_key',${key},true),set_config('baro.expense_editor_timezone',${env.BUSINESS_TIME_ZONE || 'Asia/Seoul'},true)`;
  const before = snapshot(source);
  const requestDate = validateCostDate(body.requestDate), title = typeof body.title==='string' ? body.title.trim() : '';
  assertManagedDate(requestDate,(await loadManagementPeriod(tx,orgId)).startDate);
  if (!title || title.length>200 || !Number.isSafeInteger(body.partnerOrgId) || body.partnerOrgId<=0 || !Array.isArray(body.items) || !body.items.length || body.items.length>50 || body.items.some((item: any)=>!item || typeof item!=='object' || Array.isArray(item))) return fail(400,'INVALID_EXPENSE_REQUEST_HEADER');
  const byId = new Map(source.costs.map((cost: any)=>[cost.id,cost]));
  const itemIds = body.items.map((item: any)=>item?.itemId).filter(Boolean);
  if (new Set(itemIds).size!==itemIds.length || itemIds.some((itemId: string)=>!byId.has(itemId))) return fail(400,'INVALID_EXPENSE_REQUEST_ITEM');
  if (source.record && body.items.filter((item: any)=>item.sourceRecordId===source.record.id).length!==1) return fail(400,'LEGACY_SOURCE_REQUIRED');
  for (const item of body.items) {
    const expected = item.itemId ? (byId.get(item.itemId) as any)?.outsourcedWorkRecord?.id : source.record?.id;
    if (item.sourceRecordId != null && item.sourceRecordId!==expected) return fail(400,'INVALID_REQUEST_REFERENCE');
  }
  // Release only the document/payee composite FK inside this transaction; IDs and source FKs remain intact.
  if (source.document) await tx.partnerTransactionCost.updateMany({ where: { expenseRequestId: source.document.id, orgId }, data: { expenseRequestId: null, expenseRequestLine: null } });
  const header = { title, requestDate, partnerOrgId: body.partnerOrgId,
    currency: body.items.every((item: any)=>item.currency===body.items[0].currency) ? body.items[0].currency : null };
  const document = source.document ? await tx.expenseRequest.update({ where: { id: source.document.id }, data: header }) :
    await tx.expenseRequest.create({ data: { ...header, orgId, createdByEmployeeId: actorId, clientKey: body.clientKey, submissionHash: inputHash } });
  const assignmentPlanIds: number[] = [];
  for (const [index,item] of body.items.entries()) {
    const cost: any = item.itemId ? byId.get(item.itemId) : null;
    const record = cost?.outsourcedWorkRecord || (source.record && item.sourceRecordId===source.record.id ? source.record : null);
    const input = { ...item, transactionDate: requestDate, partnerOrgId: body.partnerOrgId, clientKey: `${body.clientKey}-${index+1}` };
    const saved = await registerTransactionRequest(tx,orgId,actorId,input,appendQuantityRemark,true,{cost,record,request:{id:document.id,line:index+1}});
    if (saved.outsourcedWorkRecord) assignmentPlanIds.push(saved.outsourcedWorkRecord.assignmentPlanId);
  }
  const removed = source.costs.filter((cost: any)=>!itemIds.includes(cost.id));
  // Removing an expense line never removes its original production record or shared work-log group.
  for (const cost of removed) await tx.partnerTransactionCost.delete({ where: { id: cost.id } });
  const after = await loadExpenseEditorSource(tx,orgId,'request',String(document.id));
  await tx.systemSetting.create({ data: { key, updatedByEmployeeId: actorId,
    value: snapshot({ inputHash, requestId: document.id, before, after }) } });
  return { requestId: document.id, assignmentPlanIds: [...new Set(assignmentPlanIds)] };
}

export function registerExpenseEditorRoutes(app: any, db: any, gates: any) {
  const path = '/expense-request-editor/:kind/:id';
  app.get(path,async(req: any,res: any)=>{
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}); if(!access)return;
    const source = await loadExpenseEditorSource(db,access.organization.id,req.params.kind,req.params.id);
    assertManagedDate(expenseEditorForm(source).requestDate,(await loadManagementPeriod(db,access.organization.id)).startDate);
    res.json(expenseEditorForm(source));
  });
  app.put(path,async(req: any,res: any)=>{
    const access = await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']}); if(!access)return;
    const actorId = gates.actorId(); if(!actorId)return res.status(403).json({error:'ACTIVE_EMPLOYEE_REQUIRED'});
    const result = await db.$transaction((tx: any)=>saveExpenseEditor(tx,access.organization.id,actorId,req.params.kind,req.params.id,req.body,gates.appendQuantityRemark),{isolationLevel:'Serializable',timeout:60000});
    if(result.assignmentPlanIds.length) await gates.syncProduction?.(access.organization.id,result.assignmentPlanIds);
    res.json(result);
  });
}
