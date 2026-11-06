import ReadOnlyField from './ReadOnlyField';
import AccountingCodeField from './AccountingCodeField';
import LedgerCounterpartyField from './LedgerCounterpartyField';
import {changeApprovalText} from '../constants/changeApprovals';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import DeleteActionButton from './DeleteActionButton';
import DecimalAmountField from './DecimalAmountField';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';
import React from 'react';
import {Box,Button,IconButton,Tooltip,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {Add} from '@mui/icons-material';
import CustomDatePicker from './CustomDatePicker';
import LedgerDocumentPicker from './LedgerDocumentPicker';
import {bankLedgerMessages} from '../constants/bankLedgerMessages';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
import {ledgerEntryText} from '../constants/ledgerEntry';
import {ledgerWorkspaceText} from '../constants/ledgerWorkspace';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
export default function LedgerEntryGrid({errorRow,errorMessage,rows,accounts,codes,parties=[],languageCode,orgId,locked,headerFields=false,documentRemark=false,onAddRow,edit,resetEvidence,changeDirection,selectDocument,addChild,mutate}){
 const t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,e=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en,l=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const columnCount=(headerFields?10:12)-(documentRemark?1:0);
 const c=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <TableContainer><Table size="small" sx={{minWidth:(headerFields?1142:1446)-(documentRemark?142:0)+(onAddRow?40:0),tableLayout:'fixed','& th':{px:.5,whiteSpace:'nowrap'},'& .MuiFormControl-root':{minWidth:0}}}><colgroup>{[28,...(headerFields?[]:[144,160]),88,220,144,120,110,...(documentRemark?[]:[142]),110,160,onAddRow?72:32].map((width,index)=><col key={index} style={width?{width}:undefined}/>)}</colgroup><TableHead><TableRow>{['#',...(headerFields?[]:[t.transactionDate,t.account]),t.direction,(changeApprovalText[languageCode]||changeApprovalText.en).party,t.amount,c.code,l.codeDescription,...(documentRemark?[]:[l.remark]),l.evidenceKind,l.linked,''].map((label,index)=><TableCell key={index} align={index===0?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
 {rows.map(row=>{const index=rows.indexOf(row);
 const isBank=row.entryKind==='BANK',parent=isBank?row:rows.find(r=>r.clientKey===row.parentClientKey),account=accounts.find(a=>a.id===parent?.accountId),code=account?.currencyCode,key=row.clientKey;
 const amountLabel=isBank&&row.evidenceType==='ADJUSTMENT'?w.adjustAmount:t.amount;
 return <React.Fragment key={key}><TableRow data-ledger-entry-row={index} data-entry-kind={row.entryKind} data-row-error={errorRow===key?'true':undefined} sx={{'& td':{verticalAlign:'middle',py:.75,px:.5},...(!isBank?{bgcolor:'action.hover'}:{}),...(errorRow===key?{outline:'2px solid',outlineColor:'error.main',outlineOffset:-2}:{})}}>
 <TableCell align="right">{index+1}</TableCell>
 {!headerFields&&<TableCell>{isBank?<CustomDatePicker enableAccessibleFieldDOMStructure={false} slotProps={{textField:{fullWidth:true,inputProps:{'aria-label':t.transactionDate},sx:{minWidth:0}}}} value={row.transactionDate} minDate={account?.openingDate} maxDate={today()} adapterLocale={languageCode} disabled={locked} onChange={(date,context)=>{if(date?.isValid()&&!context?.validationError)edit(key,{transactionDate:date.format('YYYY-MM-DD')});}}/>:<Typography variant="caption">{parent?.transactionDate}</Typography>}</TableCell>}
 {!headerFields&&<TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':t.account}} value={row.accountId} disabled={locked} onChange={ev=>resetEvidence(key,{accountId:ev.target.value})}><MenuItem value="" disabled>{w.choose}</MenuItem>{accounts.map(a=><MenuItem key={a.id} value={a.id}>{a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / ')} / {a.currencyCode}</MenuItem>)}</TextField>:<Typography variant="body2" color="text.secondary">↳ {l.parent} {rows.indexOf(parent)+1}</Typography>}</TableCell>}
 <TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':t.direction}} value={row.evidenceType==='ADJUSTMENT'?'BALANCE_'+row.direction:row.direction} disabled={locked} onChange={ev=>changeDirection(row,ev.target.value)}>{['IN','OUT',...(row.evidenceType==='ADJUSTMENT'?['BALANCE_'+row.direction]:[])].map(d=><MenuItem key={d} value={d} disabled={d.startsWith('BALANCE_')}>{w[d]||t[d]}</MenuItem>)}</TextField>:<Typography variant="body2">{l[row.entryKind]}</Typography>}</TableCell>
 <TableCell><LedgerCounterpartyField row={row} parent={parent} options={parties} account={account} languageCode={languageCode} disabled={locked} onChange={counterparty=>edit(key,{counterparty})}/></TableCell>
 <TableCell><DecimalAmountField currencyCode={code} fullWidth size="small" value={row.amount} disabled={locked} onValueChange={amount=>edit(key,{amount})} inputProps={{'aria-label':amountLabel,maxLength:33,style:{textAlign:'right'}}}/></TableCell>
 <TableCell><AccountingCodeField direction={isBank?row.direction:'OUT'} hideLabel codes={codes} value={row.accountingCodeId} languageCode={languageCode} disabled={locked} onChange={accountingCodeId=>edit(key,{accountingCodeId:accountingCodeId||''})}/></TableCell>
 <TableCell><ReadOnlyField hideLabel label={l.codeDescription} value={accountingCodeDescription(codes.find(option=>option.id===row.accountingCodeId),languageCode)}/></TableCell>
 {!documentRemark&&<TableCell><TextField fullWidth size="small" required={isBank||row.entryKind==='WRITEOFF'} value={row.purpose} disabled={locked} inputProps={{'aria-label':!isBank?(row.entryKind==='FEE'?l.feeReason:l.lossReason):row.evidenceType==='ADJUSTMENT'?w.adjustReason:l.remark,maxLength:1000}} onChange={ev=>edit(key,{purpose:ev.target.value})}/></TableCell>}
 <TableCell>{isBank?<TextField select fullWidth size="small" SelectProps={{'aria-label':l.evidenceKind}} value={row.evidenceType} disabled={locked||row.evidenceType==='ADJUSTMENT'} onChange={ev=>resetEvidence(key,{evidenceType:ev.target.value,...(ev.target.value==='INVOICE'?{direction:'IN'}:ev.target.value==='EXPENSE'?{direction:'OUT'}:{})})}>{['FILE','INVOICE','EXPENSE',...(row.evidenceType==='ADJUSTMENT'?['ADJUSTMENT']:[])].map(type=><MenuItem key={type} value={type}>{l[type]||e[type]}</MenuItem>)}</TextField>:<Typography variant="caption">{l[parent?.evidenceType]||e[parent?.evidenceType]}</Typography>}</TableCell>
 <TableCell>{!isBank?null:row.evidenceType==='FILE'?<TextField fullWidth size="small" value={row.evidenceNumber} disabled={locked} inputProps={{'aria-label':e.reference,title:row.evidenceNumber,maxLength:500}} onChange={ev=>edit(key,{evidenceNumber:ev.target.value})}/>:row.evidenceType==='ADJUSTMENT'?null:<LedgerDocumentPicker orgId={orgId} currencyCode={code} type={row.evidenceType} value={row.document} disabled={locked} languageCode={languageCode} onChange={document=>selectDocument(row,document)}/>}</TableCell>
 <TableCell sx={{whiteSpace:'nowrap',px:.5}}><>{isBank&&onAddRow&&<Tooltip title={w.add}><span><IconButton size="small" aria-label={w.add} disabled={locked} onClick={()=>onAddRow(key)}><Add fontSize="small"/></IconButton></span></Tooltip>}<DeleteActionButton aria-label={w.remove} title={w.remove} disabled={locked||rows.length===1||isBank&&rows.filter(row=>row.entryKind==='BANK').length===1} onClick={()=>mutate(current=>current.filter(r=>r.clientKey!==key&&r.parentClientKey!==key))}/></></TableCell>
 </TableRow>
 {errorRow===key&&errorMessage&&<TableRow data-ledger-row-error={index}><TableCell colSpan={columnCount} sx={{bgcolor:'error.light',color:'error.contrastText',py:1}}><Typography variant="body2" fontWeight={600}>{errorMessage}</Typography></TableCell></TableRow>}
 {isBank&&(row.evidenceType==='EXPENSE'&&row.expenseItems.length>1||row.evidenceType==='INVOICE')&&<TableRow data-ledger-details={index}><TableCell sx={{verticalAlign:'top',pt:2,color:'text.secondary',textAlign:'right'}}><span aria-hidden="true">└</span></TableCell><TableCell colSpan={columnCount-1} sx={{p:1.5}}><Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
 {row.evidenceType==='EXPENSE'&&row.expenseItems.map((item,i)=><Stack key={item.itemId} direction="row" spacing={1} alignItems="center"><Typography variant="body2">{item.label}</Typography><DecimalAmountField currencyCode={code} size="small" label={e.allocated} value={item.amount} disabled={locked} inputProps={{style:{textAlign:'right'}}} sx={{width:160}} onValueChange={amount=>edit(key,{expenseItems:row.expenseItems.map((a,j)=>i===j?{...a,amount}:a)})}/></Stack>)}
 {row.evidenceType==='INVOICE'&&<Button startIcon={<Add/>} disabled={locked||!row.document||rows.length>=50} onClick={()=>addChild(row,'WRITEOFF')}>{l.addLoss}</Button>}
 </Stack></TableCell></TableRow>}
 </React.Fragment>;
 })}
 </TableBody></Table></TableContainer>;
}
