import {buildIssuedInvoicePrintHtml} from './issuedInvoicePrint.mjs';
import {invoiceStyleRows} from './invoiceStyleRows.mjs';
import {paymentAccountRows,paymentAccountSelections} from './invoicePaymentAccount.mjs';

const ink='182B3D',muted='667085',rule='E7ECF2';
// Excel supports 15 significant digits. Keep larger stored decimals as text.
export function invoiceExcelNumber(value){
 const text=String(value??'');
 return /^-?\d+(\.\d+)?$/.test(text)&&text.replace(/[-.]/g,'').replace(/^0+/,'').length<=15?Number(text):text;
}
const moneyFormat=(currency,price=false)=>`"${/^[A-Z]{3}$/.test(currency||'')?currency:''} "#,##0${price?'.00##':['VND','KRW','JPY'].includes(currency)?'':'.00'}`;
const linesIn=(value,width)=>String(value||'').split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/width)),0);

// Both exports validate and read the same issued snapshot; no live master lookup.
export async function buildIssuedInvoiceExcel(invoice){
 buildIssuedInvoicePrintHtml(invoice);
 const {default:ExcelJS}=await import('exceljs');
 const book=new ExcelJS.Workbook(),s=invoice.snapshot,f=s.fields||{},general=s.documentKind==='GENERAL';
 book.creator='BARO';book.title=f.number||invoice.invoiceNumber||'Invoice';
 const sheet=book.addWorksheet('Invoice',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.55,right:0.55,top:0.55,bottom:0.55,header:0,footer:0}}});
 sheet.columns=Array.from({length:12},()=>({width:9}));
 sheet.properties.defaultRowHeight=16;
 const cell=(row,first,last,value,{size=10,bold=false,color=ink,align='left',format,bottom,fill}={})=>{
  if(last>first)sheet.mergeCells(row,first,row,last);
  const c=sheet.getCell(row,first);c.value=value??'';
  c.font={name:'Arial',size,bold,color:{argb:color}};
  c.alignment={vertical:'middle',horizontal:align,wrapText:true,indent:0};
  if(format)c.numFmt=format;
  if(bottom)c.border={bottom:{style:bottom,color:{argb:bottom==='medium'?ink:rule}}};
  if(fill)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
  return c;
 };
 const label=(row,first,last,value)=>cell(row,first,last,value,{size:8,color:muted});
 const logo=typeof f.logoDataUrl==='string'&&f.logoDataUrl.length<=400000&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(f.logoDataUrl)?f.logoDataUrl:'';
 if(logo){
  const id=book.addImage({base64:logo,extension:logo.startsWith('data:image/png')?'png':'jpeg'});
  // Use the stored aspect ratio instead of stretching into a fixed rectangle.
  let width=110,height=48;
  if(typeof Image!=='undefined'){
   const image=new Image();image.src=logo;await image.decode();
   const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);
   width=image.naturalWidth*scale;height=image.naturalHeight*scale;
  }
  sheet.addImage(id,{tl:{col:0,row:0.2},ext:{width,height},editAs:'oneCell'});
 }
 cell(2,logo?4:1,6,'INVOICE',{size:21,bold:true});
 sheet.getRow(2).height=30;
 label(1,7,9,'Invoice number');label(1,10,12,'Invoice date');
 cell(2,7,9,f.number,{bottom:'thin'});cell(2,10,12,f.date,{bottom:'thin'});
 for(let col=1;col<=12;col++)sheet.getCell(4,col).border={bottom:{style:'medium',color:{argb:ink}}};
 const addressHeight=Math.max(28,...[f.buyer,f.seller].map(p=>linesIn(p?.address,54)*13));
 for(const [offset,title,party] of [[0,'BILL TO',f.buyer||{}],[6,'SUPPLIER',f.seller||{}]]){
  cell(6,offset+1,offset+6,title,{bold:true,color:muted});
  label(7,offset+1,offset+4,'Company name');label(7,offset+5,offset+6,'Tax ID');
  cell(8,offset+1,offset+4,party.name,{bottom:'thin'});cell(8,offset+5,offset+6,party.taxId,{bottom:'thin'});
  label(9,offset+1,offset+6,'Address');cell(10,offset+1,offset+6,party.address,{bottom:'thin'});
  for(const [index,key,title] of [[0,'contactName','Contact person'],[1,'phone','Phone'],[2,'email','Email']]){
   const first=offset+1+index*2;label(11,first,first+1,title);cell(12,first,first+1,party[key],{bottom:'thin'});
  }
 }
 sheet.getRow(8).height=Math.max(24,...[f.buyer,f.seller].map(p=>linesIn(p?.name,34)*13));
 sheet.getRow(10).height=addressHeight;
 sheet.getRow(12).height=Math.max(28,...[f.buyer,f.seller].flatMap(p=>['contactName','phone','email'].map(k=>linesIn(p?.[k],20)*12)));
 const columns=general?[[1,1,'#'],[2,4,'Item'],[5,5,'Quantity'],[6,6,'Unit'],[7,7,'Currency'],[8,8,'Unit price'],[9,9,'VAT (%)'],[10,10,'Tax'],[11,12,'Total']]:[[1,1,'No.'],[2,6,'Description'],[7,8,'Quantity'],[9,10,'Unit price'],[11,12,'Invoice amount']];
 const header=14;
 for(const [first,last,title] of columns)cell(header,first,last,title,{size:8,bold:true,color:muted,fill:'F7F9FC',align:first>=5?'right':'left',bottom:'thin'});
 sheet.getRow(header).height=26;sheet.pageSetup.printTitlesRow=`${header}:${header}`;
 let row=header+1;
 const orderNumbers=new Map(s.orders.map(o=>[o.sourceOrderId,o.sourceOrderNumber]));
 const data=general?s.lines:invoiceStyleRows(s.lines.filter(line=>Number(line.quantity)>0));
 for(const [index,item] of data.entries()){
  const line=general?item:item.lines[0],currency=line.currencyCode||s.currencyCode;
  const description=general?line.description:[orderNumbers.get(line.orderId),line.description||line.styleName].filter(Boolean).join('\n');
  const values=general?[index+1,description,invoiceExcelNumber(line.quantity),line.unit,currency,invoiceExcelNumber(line.unitPrice),invoiceExcelNumber(line.vatRate),invoiceExcelNumber(line.vatAmount),invoiceExcelNumber(line.amount)]:[index+1,description,invoiceExcelNumber(item.quantity),invoiceExcelNumber(line.unitPrice),invoiceExcelNumber(item.amount)];
  columns.forEach(([first,last],i)=>{
   const format=general?(i===5?'#,##0.00##':i>=7?moneyFormat(currency):i===6?'0.##"%"':i===2?'#,##0.####':undefined):i>=3?moneyFormat(currency,i===3):i===2?'#,##0.####':undefined;
   cell(row,first,last,values[i],{size:9,bottom:'thin',align:i===0||typeof values[i]==='number'||format?'right':'left',format});
  });
  sheet.getRow(row).height=Math.max(26,linesIn(description,general?30:52)*13+8);row++;
 }
 row+=1;
 if(invoice.status&&invoice.status!=='ISSUED'){cell(row,1,12,invoice.status,{bold:true,color:'A33939'});row++;}
 label(row++,1,12,'REMARK');cell(row,1,12,f.notes,{bottom:'thin'});sheet.getRow(row).height=Math.max(28,linesIn(f.notes,110)*13);row+=2;
 const summaryStart=row;
 label(row,1,6,'Bank / Payment instructions');
 let bankRow=row+1;
 const accounts=paymentAccountSelections(f);
 if(accounts.length){
  for(const account of accounts){
   for(const field of paymentAccountRows(account.snapshot,'en')){
    label(bankRow,1,2,field.label);
    const value=field.key==='bankName'?String(field.value).toUpperCase():field.value;
    cell(bankRow,3,6,value,{size:9});sheet.getRow(bankRow).height=Math.max(sheet.getRow(bankRow).height||16,linesIn(value,34)*12+4);bankRow++;
   }bankRow++;
  }
 }else{cell(bankRow,1,6,f.bank||'—',{size:9});sheet.getRow(bankRow).height=Math.max(28,linesIn(f.bank,52)*12);bankRow++;}
 let amountRow=row;
 const amount=(label,value,currency=s.currencyCode,total=false,format)=>{
  cell(amountRow,7,10,label,{bold:total,size:total?12:9,bottom:total?'medium':undefined});
  cell(amountRow,11,12,invoiceExcelNumber(value),{bold:total,size:total?12:9,align:'right',format:format||moneyFormat(currency),bottom:total?'medium':undefined});
  sheet.getRow(amountRow).height=Math.max(sheet.getRow(amountRow).height||16,total?30:20);amountRow++;
 };
 if(general){
  for(const total of s.currencyTotals||[{currencyCode:s.currencyCode,subtotal:s.subtotal,vatAmount:s.vatAmount,total:s.total}]){
   amount('Subtotal',total.subtotal,total.currencyCode);amount('Tax',total.vatAmount,total.currencyCode);amount('Invoice amount',total.total,total.currencyCode,true);
  }
 }else{
  for(const order of s.orders){
   amount('Full amount',order.basisAmount);amount('Previously received',order.priorReceivedAmount||'0');amount('Billing',order.billingPercentage,s.currencyCode,false,'0.##"%"');
   if(Number(order.appliedDeductionAmount))amount('Deduction',order.appliedDeductionAmount);
   if(order.vatRate!==undefined)amount(`VAT ${order.vatRate}%`,order.vatAmount);
  }amount('TOTAL',s.total,s.currencyCode,true);
 }
 const signatureRow=amountRow+2;
 cell(signatureRow,7,12,f.seller?.name,{bold:true,align:'center'});
 sheet.mergeCells(signatureRow+1,7,signatureRow+7,12);
 // 7 x 15pt = 37mm of physical signing space before the caption.
 for(let r=signatureRow+1;r<=signatureRow+7;r++)sheet.getRow(r).height=Math.max(sheet.getRow(r).height||0,15);
 cell(signatureRow+8,7,12,'Authorized signature / Company seal',{size:8,color:muted,align:'center'});
 sheet.getCell(signatureRow+8,7).border={top:{style:'thin',color:{argb:'94A3B8'}}};
 const lastRow=Math.max(bankRow,signatureRow+8);
 sheet.pageSetup.printArea=`A1:L${lastRow}`;
 // Keep the full payment/signature block together when item rows fill the page.
 const height=(from,to)=>Array.from({length:Math.max(0,to-from+1)},(_,i)=>sheet.getRow(from+i).height||16).reduce((a,b)=>a+b,0);
 const printable=740,used=height(1,summaryStart-1),remaining=printable-used%printable;
 if(used>printable||height(summaryStart,lastRow)>remaining)sheet.getRow(summaryStart-2).addPageBreak();
 return book;
}

export async function buildIssuedInvoiceExcelBlob(invoice){
 const book=await buildIssuedInvoiceExcel(invoice);
 return new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function downloadInvoiceExcel(blob,invoice){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 try{link.href=url;link.download=`${String(invoice.invoiceNumber||invoice.snapshot?.fields?.number||'Invoice').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.xlsx`;document.body.appendChild(link);link.click();}
 finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
