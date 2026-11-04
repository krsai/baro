export const accountingDirectionText={
 ko:{label:'입출금 성격',IN:'입금만 허용',OUT:'출금만 허용',BOTH:'입금·출금 모두 허용',hint:'실제 입출금 방향을 제한합니다. 납부와 반환처럼 방향이 다른 거래는 코드를 구분하거나 양쪽 허용으로 설정하세요.',mismatch:'회계 코드에서 허용하지 않는 입출금 방향입니다. 코드 또는 입출금 구분을 확인하세요.'},
 en:{label:'Cash flow direction',IN:'Deposits only',OUT:'Withdrawals only',BOTH:'Deposits and withdrawals',hint:'Restricts actual cash flow direction. Use separate codes or allow both for payments and refunds.',mismatch:'This accounting code does not allow the selected cash flow direction. Check the code or transaction direction.'},
 vi:{label:'Tính chất thu chi',IN:'Chỉ thu',OUT:'Chỉ chi',BOTH:'Cho phép thu và chi',hint:'Giới hạn chiều thu chi thực tế. Dùng mã riêng hoặc cho phép cả hai cho thanh toán và hoàn trả.',mismatch:'Mã kế toán không cho phép chiều thu chi đã chọn. Kiểm tra mã hoặc loại giao dịch.'}
};
export const permitsAccountingDirection=(code,direction)=>{const allowed=code?.base?.cashDirection??code?.cashDirection??'BOTH';return allowed==='BOTH'||allowed===direction;};
