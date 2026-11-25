export const ledgerReferenceText={
 ko:{number:'입출금 번호',expense:'연결 비용 신청 번호',invoice:'연결 청구서 번호',expenseNumber:'비용 신청 번호',invoiceNumber:'청구서 번호',file:'증빙 파일명',reference:'증빙 참조',automatic:'최종 승인 후 자동 부여'},
 en:{number:'Transaction Number',expense:'Linked Expense Request Number',invoice:'Linked Invoice Number',expenseNumber:'Expense Request Number',invoiceNumber:'Invoice Number',file:'Evidence Filename',reference:'Evidence Reference',automatic:'Assigned After Final Approval'},
 vi:{number:'Mã Thu Chi',expense:'Mã Đề Nghị Chi Liên Kết',invoice:'Số Hóa Đơn Liên Kết',expenseNumber:'Mã Đề Nghị Chi',invoiceNumber:'Số Hóa Đơn',file:'Tên Tệp Chứng Từ',reference:'Tham Chiếu Chứng Từ',automatic:'Cấp Sau Khi Duyệt Cuối Cùng'},
};
export function ledgerReferenceRows(row,language='ko'){
 if(!row)return [];
 const t=ledgerReferenceText[language]||ledgerReferenceText.en;
 const evidence=String(row.evidenceNumber||'').trim().replace(/^["']|["']$/g,'');
 const filename=row.evidenceType==='FILE'&&!evidence.startsWith('IBT:')?evidence.split(/[\\/]/).pop():row.evidenceFilename;
 const lines=[[t.number,row.managementNumber],[t.expense,row.expenseRequestNumbers?.join(' / ')],[t.invoice,row.invoiceNumbers?.join(' / ')],[t.file,filename]];
 if(!lines.some(([,value])=>value)&&row.reference)lines.push([row.sourceKind==='EXPENSE'?t.expenseNumber:row.sourceKind==='INVOICE'?t.invoiceNumber:t.reference,row.reference]);
 return lines.filter(([,value])=>value);
}
