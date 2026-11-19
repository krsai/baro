import { parseDecimalUnits, formatDecimalUnits } from './invoiceBilling.mjs';

export const newExpenseLine = () => ({ key: crypto.randomUUID(), transactionCodeId: '',
  itemOwnerOrgId:null,itemOwnerSnapshot:null,itemCustomerId:null,itemTypeId:null,itemAttributeSnapshot:null,paymentSchedule:[],unitId:'',linkedOrderIds:null,linkedStyles:null,currency: 'VND', description: '', quantity: '', unitPrice: '', vatRate: '0', workOrderId: '', styleId: '', styleProcessId: '', styleProcessIds: [],
  assignmentPlanId: '', details: {}, enabled: { order: false, style: false, process: false } });
export const expenseCodeForLine = (line,code) => {
  if (!code) return code;
  if (line.productionLinked) return {...code,linkTarget:'PROCESS',base:{...code.base,entryMode:'PROCESS',orderInput:'REQUIRED',styleInput:'REQUIRED',processInput:'REQUIRED'}};
  // Preserve stored references for validation; hidden historical fields are read only in the editor.
  const base={...code.base,entryMode:line.itemId?'GENERAL':code.base?.entryMode};
  if(base.materialSettings?.enabled){base.attributeInputs={};base.requiredFields=(base.requiredFields||[]).filter(key=>!['length','width','height'].includes(key));}
  if(line.itemId&&line.transactionCode?.id===code.id){
    base.attributeInputs={...base.attributeInputs};
    for(const [key,field] of [['customer','itemCustomerId'],['type','itemTypeId'],['owner','itemOwnerOrgId']])if(!line[field]&&line.inputSettings?.attributeInputs?.[key]!=='REQUIRED'&&base.attributeInputs[key]==='REQUIRED')base.attributeInputs[key]='OPTIONAL';
  }
  for(const [key,present] of Object.entries({order:line.workOrderId||line.linkedOrderIds?.length,style:line.styleId||line.linkedStyles?.length,process:line.styleProcessId||line.styleProcessIds?.length}))
    if(line.itemId&&present&&base[key+'Input']==='HIDDEN')base[key+'Input']='OPTIONAL';
  if(line.itemId&&line.transactionCode?.id===code.id)for(const [key,present] of Object.entries({order:line.workOrderId||line.linkedOrderIds?.length,style:line.styleId||line.linkedStyles?.length,process:line.styleProcessId||line.styleProcessIds?.length})){
    const required=line.inputSettings?line.inputSettings[key+'Input']==='REQUIRED':(key==='order'?['ORDER','STYLE','PROCESS']:key==='style'?['STYLE','PROCESS']:['PROCESS']).includes(line.linkTarget);
    if(!present&&!required&&base[key+'Input']==='REQUIRED')base[key+'Input']='OPTIONAL';
  }
  return {...code,base};
};
export const inputMode = (code, key) => code?.base?.[`${key}Input`] ?? 'HIDDEN';
export const visibleInput = (line, code, key) => inputMode(code, key) === 'REQUIRED' || inputMode(code, key) === 'OPTIONAL' && line.enabled[key];
export function expenseLineAmounts(line, currency) {
  const numeric = value => /^\d{1,12}(\.\d{1,4})?$/.test(String(value)) ? parseDecimalUnits(value, 4) : null;
  const price = numeric(line.unitPrice), quantity = numeric(line.quantity);
  const rate = /^\d{1,3}(\.\d{1,2})?$/.test(String(line.vatRate)) ? parseDecimalUnits(line.vatRate, 2) : null;
  if (!['USD','VND','KRW'].includes(currency) || price == null || quantity == null || price <= 0n || quantity <= 0n || rate == null || rate > 10000n) return null;
  const digits = currency === 'USD' ? 2 : 0;
  const divisor = 10n ** BigInt(8 - digits);
  const subtotal = (price * quantity + divisor / 2n) / divisor;
  const tax = (subtotal * rate + 5000n) / 10000n;
  if (subtotal <= 0n || subtotal + tax >= 10n ** BigInt(16 + digits)) return null;
  return { subtotal: formatDecimalUnits(subtotal, digits), vatAmount: formatDecimalUnits(tax, digits), amount: formatDecimalUnits(subtotal + tax, digits) };
}
export function expenseDocumentTotals(lines, currency) {
  const amounts = lines.map(line => expenseLineAmounts(line, currency));
  const digits = currency === 'USD' ? 2 : 0;
  const sum = key => formatDecimalUnits(amounts.reduce((total, item) => total + (item ? BigInt(item[key].replace('.', '')) : 0n), 0n), digits);
  return { subtotal: sum('subtotal'), vatAmount: sum('vatAmount'), amount: sum('amount'), incomplete: amounts.some(item => !item) };
}
export function validExpenseLine(line, code, currency) {
  code = expenseCodeForLine(line,code);
  if (!code || !expenseLineAmounts(line, currency)) return false;
  if(code.base?.materialSettings?.enabled&&!line.materialItemId&&(!line.itemId||line.materialItemWasRequired))return false;
  if(['customer','type','owner'].some(key=>code.base?.attributeInputs?.[key]==='REQUIRED'&&!line[key==='owner'?'itemOwnerOrgId':key==='customer'?'itemCustomerId':'itemTypeId']))return false;
  if(['length','width','height'].some(key=>line.details[key])&&(!line.details.length||!line.details.width||!line.details.height)&&!(line.itemId&&['length','width','height'].every(key=>(line.details[key]||'')===(line.originalDetails?.[key]||''))))return false;
  if(['length','width','height'].some(key=>line.details[key]&&(!/^\d{1,12}(\.\d{1,4})?$/.test(line.details[key])||Number(line.details[key])<=0)))return false;
  if(!line.productionLinked&&code.base?.entryMode!=='PROCESS'&&!line.details.evidenceFile?.trim())return false;
  if (!code.vatEnabled && Number(line.vatRate) !== 0) return false;
  if(line.styleProcessIds?.length&&(!line.workOrderId||!line.styleId||line.styleProcessIds.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(line.styleProcessIds).size!==line.styleProcessIds.length))return false;
  if (code.base?.entryMode === 'PROCESS' && (currency !== 'VND' || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) > 2147483647 || !line.assignmentPlanId)) return false;
  return ['order','style','process'].every(key => inputMode(code,key) !== 'REQUIRED' || Boolean(key==='process' ? line.styleProcessId || line.styleProcessIds?.length : line[{order:'workOrderId',style:'styleId'}[key]])) &&
    (code.base?.requiredFields || []).filter(key=>key!=='reference').every(key => line.details[key]?.trim());
}
export const expenseLinePayload = line => ({ ...(line.itemId ? {itemId:line.itemId} : {}), ...(line.sourceRecordId ? {sourceRecordId:line.sourceRecordId} : {}), transactionCodeId: line.transactionCodeId,materialItemId:line.materialItemId||null, currency: line.currency, paymentSchedule:line.paymentSchedule||[],
  itemOwnerOrgId:line.itemOwnerOrgId||null,itemCustomerId:line.itemCustomerId||null,itemTypeId:line.itemTypeId||null,unitId:line.unitId||null,linkedOrderIds:line.linkedOrderIds??(line.workOrderId?[line.workOrderId]:[]),linkedStyles:line.linkedStyles??(line.styleId?[{workOrderId:line.workOrderId,styleId:line.styleId}]:[]),quantity: line.quantity, unitPrice: line.unitPrice, vatRate: line.vatRate,
  workOrderId: line.workOrderId || null, styleId: line.styleId || null, styleProcessId: line.styleProcessId || null,
  ...(line.styleProcessIds===undefined?{}:{styleProcessIds:line.styleProcessIds}),
  assignmentPlanId: line.assignmentPlanId || null, details: line.details });

export const expenseTotalsByCurrency = lines => [...new Set(lines.map(line => line.currency))].sort().map(currency => ({ currency, ...expenseDocumentTotals(lines.filter(line => line.currency === currency), currency) }));
