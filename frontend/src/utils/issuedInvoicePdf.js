import {buildIssuedInvoicePrintHtml} from './issuedInvoicePrint.mjs';

// Render the stored document in the browser so Korean/Vietnamese system fonts
// remain available without sending invoice data to an external PDF service.
export async function buildIssuedInvoicePdfBlob(invoice){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 const frame=document.createElement('iframe');frame.title='Invoice PDF renderer';frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');
 frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none';
 try{
  const ready=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=reject;});frame.srcdoc=buildIssuedInvoicePrintHtml(invoice);document.body.appendChild(frame);await ready;
  const doc=frame.contentDocument;doc.querySelector('.screen')?.remove();doc.body.style.cssText='margin:0;width:794px;background:white';await doc.fonts.ready;
  const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});pdf.setProperties({title:invoice.invoiceNumber||'Invoice'});
  const width=794,pageHeight=width*269/182,total=doc.body.scrollHeight,blocks=[...doc.querySelectorAll('tr,section,h1,h2')].map(node=>({top:node.getBoundingClientRect().top-doc.body.getBoundingClientRect().top,height:node.offsetHeight}));
  let start=0,page=0;
  while(start<total){
   let end=Math.min(total,start+pageHeight);
   const crossing=blocks.filter(block=>block.top>start+50&&block.top<end&&block.top+block.height>end&&block.height<pageHeight).sort((a,b)=>a.top-b.top)[0];
   if(crossing)end=crossing.top;
   const canvas=await html2canvas(doc.body,{backgroundColor:'#ffffff',scale:2,width,height:Math.ceil(end-start),x:0,y:start,windowWidth:width,windowHeight:1123,logging:false});
   if(page++)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',0.96),'JPEG',14,14,182,(end-start)*182/width,undefined,'FAST');canvas.width=canvas.height=0;start=end;
  }
  return pdf.output('blob');
 }finally{frame.remove();}
}

export function showInvoicePdf(popup,blob){
 if(popup.closed)return;
 const url=URL.createObjectURL(blob);popup.location.replace(url);
 // Keep the URL alive for the PDF viewer's later download button.
 const timer=window.setInterval(()=>{if(popup.closed){URL.revokeObjectURL(url);window.clearInterval(timer);}},2000);
}
