const TEXT={
 ko:{prefix:'연결되어 있어 삭제할 수 없습니다: ',codes:'기존 회계 코드 설정',codeBases:'기존 기본 코드 연결',customerIndustries:'기존 고객 유형 연결',productionPolicies:'생산 정책',partnerClassifications:'거래처 분류',accountingCodeLinks:'회계 코드 연결',transactionCosts:'비용 내역',transactionCodes:'회사별 회계 코드',partners:'회사별 거래처 연결'},
 en:{prefix:'Linked records prevent deletion: ',codes:'Legacy accounting code settings',codeBases:'Legacy base code links',customerIndustries:'Legacy customer type links',productionPolicies:'Production policies',partnerClassifications:'Partner classifications',accountingCodeLinks:'Accounting code links',transactionCosts:'Cost records',transactionCodes:'Company accounting codes',partners:'Company partner links'},
 vi:{prefix:'Không thể xóa do có liên kết: ',codes:'Thiết lập mã kế toán cũ',codeBases:'Liên kết mã gốc cũ',customerIndustries:'Liên kết loại khách hàng cũ',productionPolicies:'Chính sách sản xuất',partnerClassifications:'Phân loại đối tác',accountingCodeLinks:'Liên kết mã kế toán',transactionCosts:'Chi phí',transactionCodes:'Mã kế toán công ty',partners:'Liên kết đối tác công ty'},
};
export function systemIndustryUsageReason(row,language='ko'){
 const text=TEXT[language]||TEXT.en,counts={...row?._count};
 for(const local of row?.services||[])for(const [key,value] of Object.entries(local._count||{}))counts[key]=(counts[key]||0)+Number(value);
 const reasons=Object.entries(counts).filter(([key,value])=>text[key]&&Number(value)>0).map(([key,value])=>`${text[key]} (${value})`);
 return reasons.length?text.prefix+reasons.join(', '):'';
}
