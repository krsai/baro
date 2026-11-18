const handledAlerts={
 ko:{PARTNER_HANDLED_ITEM:'거래처 취급 품목 불일치',PARTNER_HANDLED_SETTINGS:'거래처 취급 품목 설정 확인'},
 en:{PARTNER_HANDLED_ITEM:'Partner handled item mismatch',PARTNER_HANDLED_SETTINGS:'Review partner handled item settings'},
 vi:{PARTNER_HANDLED_ITEM:'Mặt hàng không thuộc phạm vi đối tác',PARTNER_HANDLED_SETTINGS:'Kiểm tra cài đặt mặt hàng đối tác'},
};
const SOURCE_TEXT={
 ko:{EXPENSE:'비용 신청',COST:'비용 입력',LEDGER:'입출금',SETTLEMENT:'입출금 정산',INVOICE:'청구서',UNKNOWN:'회계 업무'},
 en:{EXPENSE:'Expense request',COST:'Cost entry',LEDGER:'Bank transaction',SETTLEMENT:'Bank settlement',INVOICE:'Invoice',UNKNOWN:'Accounting'},
 vi:{EXPENSE:'Đề nghị chi phí',COST:'Ghi nhận chi phí',LEDGER:'Thu chi',SETTLEMENT:'Quyết toán thu chi',INVOICE:'Hóa đơn',UNKNOWN:'Kế toán'},
};
export function accountingAlertTitle(row,languageCode='en'){
 const text=accountingAlertText[languageCode]||accountingAlertText.en,source=SOURCE_TEXT[languageCode]||SOURCE_TEXT.en;
 const sourceKind=row?.sourceKind==='EXPENSE'&&row?.path?.startsWith('/outsourcing-record/edit/cost/')?'COST':row?.sourceKind;
 return `${source[sourceKind]||source.UNKNOWN}: ${text[row?.kind]||text.review}`;
}
export function accountingAlertOptions(languageCode='en'){
 const text=accountingAlertText[languageCode]||accountingAlertText.en;
 const audience={ko:'관리자 · 회계',en:'Administrator · Accountant',vi:'Quản trị viên · Kế toán'};
 return [{id:'accounting-retired',label:text.RETIRED_EMPLOYEE},{id:'accounting-direction',label:text.DIRECTION},{id:'accounting-partner',label:text.PARTNER_INDUSTRY}];
}
export const accountingAlertText={
 ko:{...handledAlerts.ko,RETIRED_EMPLOYEE:'퇴사자 지급 확인',DIRECTION:'회계 코드 입출금 방향 불일치',PARTNER_INDUSTRY:'거래처·회계 코드 업종 불일치',confirm:'확인',IN:'입금',OUT:'출금',expected:'코드 기준',actual:'입력 방향',retry:'재시도',failed:'회계 알림을 불러오거나 확인하지 못했습니다.',previous:'이전',next:'다음',stale:'항목이 변경되었습니다. 새로 조회한 내용을 확인해 주세요.'},
 en:{...handledAlerts.en,RETIRED_EMPLOYEE:'Review payment to former employee',DIRECTION:'Accounting code direction mismatch',PARTNER_INDUSTRY:'Partner / accounting code industry mismatch',confirm:'Acknowledge',IN:'Deposit',OUT:'Withdrawal',expected:'Code direction',actual:'Recorded direction',retry:'Retry',failed:'Could not load or acknowledge accounting alerts.',previous:'Previous',next:'Next',stale:'The item changed. Review the refreshed record.'},
 vi:{...handledAlerts.vi,RETIRED_EMPLOYEE:'Kiểm tra chi trả cho nhân viên đã nghỉ việc',DIRECTION:'Mã kế toán không khớp chiều thu chi',PARTNER_INDUSTRY:'Ngành đối tác không khớp mã kế toán',confirm:'Đã kiểm tra',IN:'Thu',OUT:'Chi',expected:'Chiều của mã',actual:'Chiều đã nhập',retry:'Thử lại',failed:'Không thể tải hoặc xác nhận thông báo kế toán.',previous:'Trước',next:'Sau',stale:'Mục đã thay đổi. Vui lòng kiểm tra dữ liệu mới.'}
};

accountingAlertText.ko.empty='\uD655\uC778\uD560 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.';accountingAlertText.en.empty='No items to review.';accountingAlertText.vi.empty='Kh\u00f4ng c\u00f3 m\u1ee5c c\u1ea7n ki\u1ec3m tra.';
Object.assign(accountingAlertText.ko,{review:'알림 확인',date:'거래일',party:'대상',code:'회계 코드',description:'항목 설명',reference:'문서 번호',openSource:'원본 확인 · 수정',personalNote:'확인하면 내 대시보드에서만 이 알림이 숨겨집니다. 원본 거래와 다른 사람의 알림은 유지됩니다.',refreshAlert:'최신 알림 보기'});
Object.assign(accountingAlertText.en,{review:'Review alert',date:'Transaction date',party:'Target',code:'Accounting code',description:'Description',reference:'Document number',openSource:'Review · edit source',personalNote:'Acknowledging hides this alert only on your dashboard. The source transaction and other people’s alerts are preserved.',refreshAlert:'View latest alerts'});
Object.assign(accountingAlertText.vi,{review:'Kiểm tra thông báo',date:'Ngày giao dịch',party:'Đối tượng',code:'Mã kế toán',description:'Diễn giải',reference:'Số chứng từ',openSource:'Xem · sửa bản gốc',personalNote:'Xác nhận chỉ ẩn thông báo trên bảng điều khiển của bạn. Giữ nguyên giao dịch gốc và thông báo của người khác.',refreshAlert:'Xem thông báo mới nhất'});

accountingAlertText.ko.UNCODED_LEDGER='\uD68C\uACC4 \uCF54\uB4DC \uBBF8\uC9C0\uC815';
accountingAlertText.en.UNCODED_LEDGER='Missing accounting code';
accountingAlertText.vi.UNCODED_LEDGER='Thu chi ch\u01b0a c\u00f3 m\u00e3 k\u1ebf to\u00e1n';
accountingAlertText.ko.amount='금액';
accountingAlertText.en.amount='Amount';
accountingAlertText.vi.amount='Số tiền';
