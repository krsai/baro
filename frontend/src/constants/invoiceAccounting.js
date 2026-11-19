export const invoiceAccountingText={
 ko:{treatment:'부가세 구분',E:'CMTE · 봉제 공임 · 면세 0%',Z:'CMTZ · 봉제 공임 · 영세율 0%',V:'CMTV · 봉제 공임 · 과세',unavailable:'회사 회계 코드에 선택한 봉제 공임(CMT) 코드를 활성화해 주세요.'},
 en:{treatment:'VAT treatment',E:'CMTE · CMT · Exempt 0%',Z:'CMTZ · CMT · Zero-rated 0%',V:'CMTV · CMT · Taxable',unavailable:'Enable the selected CMT accounting code for this company.'},
 vi:{treatment:'Loại thuế GTGT',E:'CMTE · Gia công may · Miễn thuế 0%',Z:'CMTZ · Gia công may · Thuế suất 0%',V:'CMTV · Gia công may · Chịu thuế',unavailable:'Vui lòng kích hoạt mã kế toán CMT đã chọn cho công ty.'},
};
Object.assign(invoiceAccountingText.ko,{invalid:'부가세율은 0~100 사이, 소수 둘째 자리까지 입력하세요.'});
Object.assign(invoiceAccountingText.en,{invalid:'Enter a VAT rate from 0 to 100 with up to two decimal places.'});
Object.assign(invoiceAccountingText.vi,{invalid:'Nhập thuế suất từ 0 đến 100, tối đa hai chữ số thập phân.'});
