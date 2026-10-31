import {ledgerEvidenceText,ledgerEvidenceErrors} from './ledgerEvidence.js';
export const bankLedgerMessages={
 ko:{title:'은행 입출금',account:'계좌',addAccount:'계좌 등록',addEntry:'입출금 등록',bankName:'은행명',accountNumber:'계좌번호',accountHolder:'예금주',currencyCode:'통화',openingDate:'기초잔액 기준일',openingBalance:'기초잔액',openingHint:'기초잔액은 기준일 시작 시점의 잔액입니다. 입출금은 기준일부터 입력합니다.',transactionDate:'거래일',direction:'구분',IN:'입금',OUT:'출금',amount:'금액',purpose:'용도',evidenceNumber:'증빙 번호',currentBalance:'현재 잔액',totalIn:'조회 기간 입금',totalOut:'조회 기간 출금',balance:'거래 후 잔액',createdBy:'입력자',save:'저장',cancel:'취소',retry:'다시 시도',close:'닫기',empty:'조회 내역이 없습니다.',noAccounts:'계좌를 등록한 뒤 입출금 내역을 입력하세요.',previous:'이전',next:'다음',void:'내역 취소',voidReason:'취소 사유',voided:'취소됨',members:'회사 사용자',name:'이름',email:'구글 로그인 이메일',role:'역할',ADMIN:'관리자',ACCOUNTANT:'회계사',addMember:'사용자 등록',failed:'요청을 처리하지 못했습니다.',uncertain:'저장 결과를 확인하지 못했습니다. 입력을 유지한 상태로 다시 시도하세요.',saved:'저장했습니다.',errors:{LEDGER_ADJUSTMENT_ADMIN_REQUIRED:'\uC794\uC561 \uC870\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',LEDGER_INVALID_AMOUNT:'통화에 맞는 금액을 입력하세요. USD는 소수 둘째 자리까지, VND/KRW는 정수입니다.',LEDGER_BEFORE_OPENING:'기초잔액 기준일 이전의 내역은 입력할 수 없습니다.',LEDGER_ACCOUNT_EXISTS:'이미 등록된 계좌입니다.',LEDGER_RETRY_CONFLICT:'같은 요청의 내용이 달라졌습니다. 저장 내역을 확인하세요.',LEDGER_INVALID_INPUT:'필수 입력값을 확인하세요.',LEDGER_INVALID_DATE:'올바른 날짜를 입력하세요.',COMPANY_MEMBER_EXISTS:'이미 등록된 이메일입니다. 기존 직원의 상태와 권한을 확인하세요.'}},
 en:{title:'Bank transactions',account:'Account',addAccount:'Add account',addEntry:'Add transaction',bankName:'Bank',accountNumber:'Account number',accountHolder:'Account holder',currencyCode:'Currency',openingDate:'Opening date',openingBalance:'Opening balance',openingHint:'The opening balance is the balance at the start of this date. Enter transactions from this date onward.',transactionDate:'Date',direction:'Direction',IN:'Deposit',OUT:'Withdrawal',amount:'Amount',purpose:'Purpose',evidenceNumber:'Evidence number',currentBalance:'Current balance',totalIn:'Deposits in period',totalOut:'Withdrawals in period',balance:'Balance after transaction',createdBy:'Entered by',save:'Save',cancel:'Cancel',retry:'Retry',close:'Close',empty:'No transactions found.',noAccounts:'Add an account to enter bank transactions.',previous:'Previous',next:'Next',void:'Void transaction',voidReason:'Reason for void',voided:'Voided',members:'Company users',name:'Name',email:'Google login email',role:'Role',ADMIN:'Admin',ACCOUNTANT:'Accountant',addMember:'Add user',failed:'Unable to complete request.',uncertain:'The save result is unknown. Keep these inputs and retry.',saved:'Saved.',errors:{LEDGER_ADJUSTMENT_ADMIN_REQUIRED:'Only administrators can adjust balances.',LEDGER_INVALID_AMOUNT:'Enter an amount in the currency precision: up to 2 decimals for USD, whole numbers for VND/KRW.',LEDGER_BEFORE_OPENING:'Transactions cannot precede the opening date.',LEDGER_ACCOUNT_EXISTS:'This account is already registered.',LEDGER_RETRY_CONFLICT:'The retry differs from the saved request. Check saved transactions.',LEDGER_INVALID_INPUT:'Check required fields.',LEDGER_INVALID_DATE:'Enter a valid date.',COMPANY_MEMBER_EXISTS:'This email is already registered. Check the existing employee status and role.'}},
 vi:{title:'Thu chi ngân hàng',account:'Tài khoản',addAccount:'Thêm tài khoản',addEntry:'Thêm giao dịch',bankName:'Ngân hàng',accountNumber:'Số tài khoản',accountHolder:'Chủ tài khoản',currencyCode:'Tiền tệ',openingDate:'Ngày số dư đầu kỳ',openingBalance:'Số dư đầu kỳ',openingHint:'Số dư đầu kỳ là số dư đầu ngày này. Nhập giao dịch từ ngày này trở đi.',transactionDate:'Ngày giao dịch',direction:'Loại',IN:'Thu',OUT:'Chi',amount:'Số tiền',purpose:'Mục đích',evidenceNumber:'Số chứng từ',currentBalance:'Số dư hiện tại',totalIn:'Thu trong kỳ',totalOut:'Chi trong kỳ',balance:'Số dư sau giao dịch',createdBy:'Người nhập',save:'Lưu',cancel:'Hủy',retry:'Thử lại',close:'Đóng',empty:'Không có giao dịch.',noAccounts:'Thêm tài khoản để nhập giao dịch ngân hàng.',previous:'Trước',next:'Tiếp',void:'Hủy giao dịch',voidReason:'Lý do hủy',voided:'Đã hủy',members:'Người dùng công ty',name:'Tên',email:'Email đăng nhập Google',role:'Vai trò',ADMIN:'Quản trị',ACCOUNTANT:'Kế toán',addMember:'Thêm người dùng',failed:'Không thể xử lý yêu cầu.',uncertain:'Chưa xác nhận kết quả lưu. Giữ nguyên nội dung và thử lại.',saved:'Đã lưu.',errors:{LEDGER_ADJUSTMENT_ADMIN_REQUIRED:'Ch\u1ec9 qu\u1ea3n tr\u1ecb vi\u00ean \u0111\u01b0\u1ee3c \u0111i\u1ec1u ch\u1ec9nh s\u1ed1 d\u01b0.',LEDGER_INVALID_AMOUNT:'Nhập số tiền đúng đơn vị: USD tối đa 2 chữ số thập phân, VND/KRW là số nguyên.',LEDGER_BEFORE_OPENING:'Ngày giao dịch không được trước ngày số dư đầu kỳ.',LEDGER_ACCOUNT_EXISTS:'Tài khoản này đã được đăng ký.',LEDGER_RETRY_CONFLICT:'Nội dung thử lại khác giao dịch đã lưu. Kiểm tra giao dịch.',LEDGER_INVALID_INPUT:'Kiểm tra các trường bắt buộc.',LEDGER_INVALID_DATE:'Nhập ngày hợp lệ.',COMPANY_MEMBER_EXISTS:'Email đã được đăng ký. Kiểm tra trạng thái và quyền nhân viên.'}},
};
bankLedgerMessages.ko.errors.LEDGER_FUTURE_DATE='미래 날짜의 은행 내역은 입력할 수 없습니다.';
bankLedgerMessages.en.errors.LEDGER_FUTURE_DATE='Bank entries cannot use future dates.';
bankLedgerMessages.vi.errors.LEDGER_FUTURE_DATE='Không được nhập giao dịch ngân hàng trong tương lai.';
bankLedgerMessages.ko.refresh='새로고침';
bankLedgerMessages.en.refresh='Refresh';
bankLedgerMessages.vi.refresh='Làm mới';

bankLedgerMessages.ko.noAccounts="사업체 메뉴에서 계좌를 등록해 주세요. 잔액은 0에서 시작하며 잔액 조정으로 맞출 수 있습니다.";
bankLedgerMessages.en.noAccounts="Register an account in Business. Accounts start at zero; use a balance adjustment to reconcile them.";
bankLedgerMessages.vi.noAccounts="Đăng ký tài khoản trong mục Doanh nghiệp. Số dư bắt đầu từ 0; dùng điều chỉnh số dư để đối chiếu.";
Object.assign(bankLedgerMessages.ko.errors,{
 LEDGER_ACCOUNT_IDENTITY_LOCKED:'입출금에 연결된 계좌의 통화·종류·계좌번호는 변경할 수 없습니다. 별도 계좌로 등록해 주세요.',
 LEDGER_OPENING_LOCKED:'저장된 기초잔액 기준일과 금액은 변경할 수 없습니다.',
 INVALID_BANK_ACCOUNT:'계좌명 또는 은행 계좌 정보를 확인해 주세요.',
 INVALID_ACCOUNT_ORDER:'계좌 목록이 변경되었습니다. 새로 조회한 뒤 순서를 저장해 주세요.',
});
Object.assign(bankLedgerMessages.en.errors,{
 LEDGER_ACCOUNT_IDENTITY_LOCKED:'The currency, type and number of a ledger account cannot change. Register a separate account.',
 LEDGER_OPENING_LOCKED:'The saved opening date and balance cannot change.',
 INVALID_BANK_ACCOUNT:'Check the account name or bank details.',
 INVALID_ACCOUNT_ORDER:'The account list changed. Reload it before saving the order.',
});
Object.assign(bankLedgerMessages.vi.errors,{
 LEDGER_ACCOUNT_IDENTITY_LOCKED:'Không thể đổi loại tiền, loại và số tài khoản đã liên kết giao dịch. Hãy đăng ký tài khoản riêng.',
 LEDGER_OPENING_LOCKED:'Không thể thay đổi ngày và số dư đầu kỳ đã lưu.',
 INVALID_BANK_ACCOUNT:'Kiểm tra tên tài khoản hoặc thông tin ngân hàng.',
 INVALID_ACCOUNT_ORDER:'Danh sách tài khoản đã thay đổi. Tải lại trước khi lưu thứ tự.',
});

for(const lang of ['ko','en','vi'])Object.assign(bankLedgerMessages[lang].errors,ledgerEvidenceErrors[lang],{LEDGER_INVALID_EVIDENCE:ledgerEvidenceText[lang].errors});

bankLedgerMessages.ko.title='\uC785\uCD9C\uAE08';
bankLedgerMessages.en.title='Transactions';
bankLedgerMessages.vi.title='Thu chi';
bankLedgerMessages.ko.purpose='내역';
bankLedgerMessages.en.purpose='Description';
bankLedgerMessages.vi.purpose='Nội dung';
Object.assign(bankLedgerMessages.ko.errors,{LEDGER_ACCOUNTING_CODE_REQUIRED:'회계 코드를 선택해 주세요.',LEDGER_ACCOUNTING_CODE_INVALID:'사용 가능한 회사 회계 코드를 선택해 주세요.'});
Object.assign(bankLedgerMessages.en.errors,{LEDGER_ACCOUNTING_CODE_REQUIRED:'Select an accounting code.',LEDGER_ACCOUNTING_CODE_INVALID:'Select an available accounting code for this company.'});
Object.assign(bankLedgerMessages.vi.errors,{LEDGER_ACCOUNTING_CODE_REQUIRED:'Chọn mã kế toán.',LEDGER_ACCOUNTING_CODE_INVALID:'Chọn mã kế toán đang sử dụng của công ty.'});
Object.assign(bankLedgerMessages.ko.errors,{LEDGER_INVALID_SETTLEMENT:'수수료·대손 행의 연결 대상과 금액·사유를 확인해 주세요.',LEDGER_SETTLEMENT_MISMATCH:'연결한 수수료·대손 행의 합계가 일치하지 않습니다.',EXPENSE_REQUEST_CHANGED:'비용 신청이 변경되었습니다. 다시 검색해 최신 버전을 연결하세요.'});
Object.assign(bankLedgerMessages.en.errors,{LEDGER_INVALID_SETTLEMENT:'Check the linked transaction, amount and reason for fee or write-off rows.',LEDGER_SETTLEMENT_MISMATCH:'Linked fee and write-off rows do not match their totals.',EXPENSE_REQUEST_CHANGED:'The expense request changed. Search again and link the latest version.'});
Object.assign(bankLedgerMessages.vi.errors,{LEDGER_INVALID_SETTLEMENT:'Kiểm tra giao dịch liên kết, số tiền và lý do của dòng phí hoặc nợ xấu.',LEDGER_SETTLEMENT_MISMATCH:'Tổng các dòng phí hoặc nợ xấu không khớp.',EXPENSE_REQUEST_CHANGED:'Đề nghị chi đã thay đổi. Tìm lại và liên kết phiên bản mới nhất.'});

Object.assign(bankLedgerMessages.ko.errors,{LEDGER_ENTRY_CHANGED:'내역이 이미 수정 또는 삭제되었습니다. 목록을 다시 확인해 주세요.',LEDGER_PURPOSE_CODE_REQUIRED:'사용 중인 비용·회계 코드를 선택해 주세요.'});
Object.assign(bankLedgerMessages.en.errors,{LEDGER_ENTRY_CHANGED:'This transaction has already been edited or deleted. Reload the list.',LEDGER_PURPOSE_CODE_REQUIRED:'Select an active expense / accounting code.'});
Object.assign(bankLedgerMessages.vi.errors,{LEDGER_ENTRY_CHANGED:'Giao dịch đã được sửa hoặc xóa. Tải lại danh sách.',LEDGER_PURPOSE_CODE_REQUIRED:'Chọn mã chi phí / kế toán đang sử dụng.'});
