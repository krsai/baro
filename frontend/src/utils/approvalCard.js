import {getUiMessage} from '../constants/uiMessages';
import {approvalReviewText} from '../constants/approvalReview';
import {changeApprovalText} from '../constants/changeApprovals';

const labels={ko:{ledger:'입출금 내역',pending:'수정 결재 진행 중'},en:{ledger:'Cash transaction',pending:'Change approval in progress'},vi:{ledger:'Giao dịch thu chi',pending:'Đang chờ duyệt sửa'}};
const fields={ko:{accountingCodeId:'회계 코드',transactionDate:'거래일',amount:'금액',purpose:'내용',remark:'메모',evidenceNumber:'연결 증빙',direction:'입출금 방향',accountId:'계좌'},en:{accountingCodeId:'Accounting code',transactionDate:'Transaction date',amount:'Amount',purpose:'Description',remark:'Remark',evidenceNumber:'Evidence',direction:'Direction',accountId:'Account'},vi:{accountingCodeId:'Mã kế toán',transactionDate:'Ngày giao dịch',amount:'Số tiền',purpose:'Nội dung',remark:'Ghi chú',evidenceNumber:'Chứng từ',direction:'Chiều thu chi',accountId:'Tài khoản'}};
export function approvalCardTitle(row,language='ko'){
 if(!row)return '';
 const text=approvalReviewText[language]||approvalReviewText.en;
 const name=row.menu==='BANK_LEDGER'?(labels[language]||labels.en).ledger:getUiMessage(row.menu==='INVOICE'?'menu.invoice':'menu.outsourcingRecord','',language);
 return [name,row.menu==='INVOICE'?(changeApprovalText[language]||changeApprovalText.en).requestCancel:text[row.operation]].filter(Boolean).join(' ');
}
export function approvalCardDetail(row,language='ko'){
 if(!row)return '';
 const text=approvalReviewText[language]||approvalReviewText.en;
 // Evidence paths describe attachments, never the transaction being reviewed.
 const reference=row.managementNumber&&!/[\\/]|^["']/.test(row.managementNumber)?row.managementNumber:null;
 const changed=(row.changedFields||[]).map(key=>(fields[language]||fields.en)[key]).filter(Boolean).join(', ');
 return [row.requestDate&&`${text.date}: ${row.requestDate}`,row.targetName||reference,changed||row.changeReason,row.drafter&&`${text.drafter}: ${row.drafter}`].filter(Boolean).join(' \u00b7 ');
}
export const accountingPendingText=labels;
