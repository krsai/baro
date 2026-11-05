import AccountingCodeField from './AccountingCodeField';
import LedgerCounterpartyField from './LedgerCounterpartyField';
import {changeApprovalText} from '../constants/changeApprovals';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import DeleteActionButton from './DeleteActionButton';
import DecimalAmountField from './DecimalAmountField';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';
import React from 'react';
import {Button,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {Add} from '@mui/icons-material';
import CustomDatePicker from './CustomDatePicker';
import LedgerDocumentPicker from './LedgerDocumentPicker';
import {bankLedgerMessages} from '../constants/bankLedgerMessages';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
import {ledgerEntryText} from '../constants/ledgerEntry';
import {ledgerWorkspaceText} from '../constants/ledgerWorkspace';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
const minor=value=>/^\d+(\.\d{0,2})?$/.test(String(value))?BigInt(String(value).split('.')[0])*100n+BigInt((String(value).split('.')[1]||'').padEnd(2,'0')):0n;
const decimal=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
export default function LedgerEntryGrid({errorRow,errorMessage,rows,accounts,codes,parties=[],languageCode,orgId,locked,headerFields=false,edit,resetEvidence,changeDirection,selectDocument,addChild,mutate}){
 const t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,e=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en,l=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const c=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <TableContainer><Table size="small" sx={{minWidth:headerFields?1142:1446,tableLayout:'fixed','& th':{px:.5,whiteSpace:'nowrap'},'& .MuiFormControl-root':{minWidth:0}}}><colgroup>{[28,...(headerFields?[]:[144,160]),88,180,144,120,138,142,110,160,32].map((width,index)=><col key={index} style={width?{width}:undefined}/>)}</colgroup><TableHead><TableRow>{['#',...(headerFields?[]:[t.transactionDate,t.account]),t.direction,(changeApprovalText[languageCode]||changeApprovalText.en).party,t.amount,c.code,l.codeDescription,l.remark,l.evidenceKind,l.linked,''].map((label,index)=><TableCell key={index} align={index===0?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
 {rows.map((row,index)=>{
 const isBank=row.entryKind==='BANK',parent=isBank?row:rows.find(r=>r.clientKey===row.parentClientKey),account=accounts.find(a=>a.id===parent?.accountId),code=account?.currencyCode,key=row.clientKey,children=rows.filter(r=>r.parentClientKey===key),fee=children.filter(r=>r.entryKind==='FEE').reduce((sum,r)=>sum+minor(r.amount),0n),loss=children.filter(r=>r.entryKind==='WRITEOFF').reduce((sum,r)=>sum+minor(r.amount),0n),linked=row.evidenceType==='INVOICE'?minor(row.amount)+fee+loss:minor(row.amount)-fee;
 const amountLabel=isBank&&row.evidenceType==='ADJUSTMENT'?w.adjustAmount:t.amount;
 return <React.Fragment key={key}><TableRow data-ledger-entry-row={index} data-entry-kind={row.entryKind} data-row-error={errorRow===key?'true':undefined} sx={{'& td':{verticalAlign:'middle',py:.75,px:.5},...(!isBank?{bgcolor:'action.hover'}:{}),...(errorRow===key?{outline:'2px solid',outlineColor:'error.main',outlineOffset:-2}:{})}}>
 <TableCell align="right">{index+1}</TableCell>
 {!headerFields&&<TableCell>{isBank?<CustomDatePicker enableAccessibleFieldDOMStructure={false} slotProps={{textField:{fullWidth:true,inputProps:{'aria-label':t.transactionDate},sx:{minWidth:0}}}} value={row.transactionDate} minDate={account?.openingDate} maxDate={today()} adapterLocale={languageCode} disabled={locked} onChange={(date,context)=>{if(date?.isValid()&&!context?.validationError)edit(key,{transactionDate:date.format('YYYY-MM-DD')});}}/>:<Typography variant="caption">{parent?.transactionDate}</Typography>}</TableCell>}
 {!headerFields&&<TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':t.account}} value={row.accountId} disabled={locked} onChange={ev=>resetEvidence(key,{accountId:ev.target.value})}><MenuItem value="" disabled>{w.choose}</MenuItem>{accounts.map(a=><MenuItem key={a.id} value={a.id}>{a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / ')} / {a.currencyCode}</MenuItem>)}</TextField>:<Typography variant="body2" color="text.secondary">↳ {l.parent} {rows.indexOf(parent)+1}</Typography>}</TableCell>}
 <TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':t.direction}} value={row.evidenceType==='ADJUSTMENT'?'BALANCE_'+row.direction:row.direction} disabled={locked} onChange={ev=>changeDirection(row,ev.target.value)}>{['IN','OUT',...(row.evidenceType==='ADJUSTMENT'?['BALANCE_'+row.direction]:[])].map(d=><MenuItem key={d} value={d} disabled={d.startsWith('BALANCE_')}>{w[d]||t[d]}</MenuItem>)}</TextField>:<Typography variant="body2">{l[row.entryKind]}</Typography>}</TableCell>
 <TableCell><LedgerCounterpartyField row={row} parent={parent} options={parties} account={account} languageCode={languageCode} disabled={locked} onChange={counterparty=>edit(key,{counterparty})}/></TableCell>
 <TableCell><DecimalAmountField currencyCode={code} fullWidth size="small" value={row.amount} disabled={locked} onValueChange={amount=>edit(key,{amount})} inputProps={{'aria-label':amountLabel,maxLength:33,style:{textAlign:'right'}}}/></TableCell>
 <TableCell><AccountingCodeField direction={isBank?row.direction:'OUT'} hideLabel codes={codes} value={row.accountingCodeId} languageCode={languageCode} disabled={locked} onChange={accountingCodeId=>edit(key,{accountingCodeId:accountingCodeId||''})}/></TableCell>
 <TableCell><TextField fullWidth size="small" value={accountingCodeDescription(codes.find(option=>option.id===row.accountingCodeId),languageCode)} inputProps={{'aria-label':l.codeDescription,title:accountingCodeDescription(codes.find(option=>option.id===row.accountingCodeId),languageCode)}} InputProps={{readOnly:true}}/></TableCell>
 <TableCell><TextField fullWidth size="small" required={isBank||row.entryKind==='WRITEOFF'} value={row.purpose} disabled={locked} inputProps={{'aria-label':!isBank?(row.entryKind==='FEE'?l.feeReason:l.lossReason):row.evidenceType==='ADJUSTMENT'?w.adjustReason:l.remark,maxLength:1000}} onChange={ev=>edit(key,{purpose:ev.target.value})}/></TableCell>
 <TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':l.evidenceKind}} value={row.evidenceType} disabled={locked||row.evidenceType==='ADJUSTMENT'} onChange={ev=>resetEvidence(key,{evidenceType:ev.target.value,...(ev.target.value==='INVOICE'?{direction:'IN'}:ev.target.value==='EXPENSE'?{direction:'OUT'}:{})})}>{['FILE','INVOICE','EXPENSE',...(row.evidenceType==='ADJUSTMENT'?['ADJUSTMENT']:[])].map(type=><MenuItem key={type} value={type}>{l[type]||e[type]}</MenuItem>)}</TextField>:<Typography variant="caption">{l[parent?.evidenceType]||e[parent?.evidenceType]}</Typography>}</TableCell>
 <TableCell>{!isBank?null:row.evidenceType==='FILE'?<TextField fullWidth size="small" value={row.evidenceNumber} disabled={locked} inputProps={{'aria-label':e.reference,title:row.evidenceNumber,maxLength:500}} onChange={ev=>edit(key,{evidenceNumber:ev.target.value})}/>:row.evidenceType==='ADJUSTMENT'?null:<LedgerDocumentPicker orgId={orgId} currencyCode={code} type={row.evidenceType} value={row.document} disabled={locked} languageCode={languageCode} onChange={document=>selectDocument(row,document)}/>}</TableCell>
 <TableCell sx={{whiteSpace:'nowrap',px:.5}}><DeleteActionButton aria-label={w.remove} title={w.remove} disabled={locked||rows.length===1} onClick={()=>mutate(current=>current.filter(r=>r.clientKey!==key&&r.parentClientKey!==key))}/></TableCell>
 </TableRow>
 {errorRow===key&&errorMessage&&<TableRow data-ledger-row-error={index}><TableCell colSpan={headerFields?10:12} sx={{bgcolor:'error.light',color:'error.contrastText',py:1}}><Typography variant="body2" fontWeight={600}>{errorMessage}</Typography></TableCell></TableRow>}
 {isBank&&['INVOICE','EXPENSE'].includes(row.evidenceType)&&<TableRow data-ledger-details={index}><TableCell colSpan={12} sx={{p:2}}><Stack spacing={1.5}>
 <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{row.document?.payee}</Typography><Typography variant="body2" align="right">{l.matched}: {linked>=0n?formatLedgerMoney(decimal(linked),code):'—'}</Typography></Stack>
 {row.evidenceType==='EXPENSE'&&row.expenseItems.map((item,i)=><Stack key={item.itemId} direction="row" spacing={2} alignItems="center"><Typography variant="body2" sx={{flex:1}}>{item.label}</Typography><DecimalAmountField currencyCode={code} size="small" label={e.allocated} value={item.amount} disabled={locked} inputProps={{style:{textAlign:'right'}}} sx={{width:180}} onValueChange={amount=>edit(key,{expenseItems:row.expenseItems.map((a,j)=>i===j?{...a,amount}:a)})}/></Stack>)}
 <Stack direction="row" spacing={1} justifyContent="flex-end"><Button startIcon={<Add/>} disabled={locked||!row.document||rows.length>=50} onClick={()=>addChild(row,'FEE')}>{l.addFee}</Button>{row.evidenceType==='INVOICE'&&<Button startIcon={<Add/>} disabled={locked||!row.document||rows.length>=50} onClick={()=>addChild(row,'WRITEOFF')}>{l.addLoss}</Button>}</Stack>
 </Stack></TableCell></TableRow>}
 </React.Fragment>;
 })}
 </TableBody></Table></TableContainer>;
}
