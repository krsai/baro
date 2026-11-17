const TEXT={
 ko:{prefix:'연결되어 있어 삭제할 수 없습니다: ',codes:'기존 취급 코드 설정',codeBases:'기존 기본 코드 연결',customerIndustries:'기존 고객 유형 연결',productionPolicies:'생산 정책',partnerClassifications:'거래처 분류',accountingCodeLinks:'취급 코드 연결',transactionCosts:'비용 내역',transactionCodes:'회사별 취급 코드',partners:'회사별 거래처 연결'},
 en:{prefix:'Linked records prevent deletion: ',codes:'Legacy business code settings',codeBases:'Legacy base code links',customerIndustries:'Legacy customer type links',productionPolicies:'Production policies',partnerClassifications:'Partner classifications',accountingCodeLinks:'Business code links',transactionCosts:'Cost records',transactionCodes:'Company business codes',partners:'Company partner links'},
 vi:{prefix:'Không thể xóa do có liên kết: ',codes:'Thiết lập mã nghiệp vụ cũ',codeBases:'Liên kết mã gốc cũ',customerIndustries:'Liên kết loại khách hàng cũ',productionPolicies:'Chính sách sản xuất',partnerClassifications:'Phân loại đối tác',accountingCodeLinks:'Liên kết mã nghiệp vụ',transactionCosts:'Chi phí',transactionCodes:'Mã nghiệp vụ công ty',partners:'Liên kết đối tác công ty'},
};
export function systemIndustryUsageReason(row,language='ko'){
 const text=TEXT[language]||TEXT.en,counts={...row?._count};
 for(const local of row?.services||[])for(const [key,value] of Object.entries(local._count||{}))counts[key]=(counts[key]||0)+Number(value);
 const reasons=Object.entries(counts).filter(([key,value])=>text[key]&&Number(value)>0).map(([key,value])=>`${text[key]} (${value})`);
 const name=row=>row?.[language==='ko'?'nameKo':language==='vi'?'nameVi':'name']||row?.name||'';
 const references=(row?.partnerClassifications||[]).map(link=>{const owner=name(link.classification?.owner),entity=name(link.classification?.entity);return owner&&entity?(link.orgId===link.entityId?owner:`${owner} → ${entity}`):'';}).filter(Boolean);
 const codes=[...new Set([...(row?.codeBases||[]).map(base=>base.code),...(row?.accountingCodeLinks||[]).map(link=>link.base?.code)].filter(Boolean))];
 return reasons.length?text.prefix+reasons.join(', ')+(references.length?' \u00b7 '+references.join(', '):'')+(codes.length?' \u00b7 '+text.accountingCodeLinks+': '+codes.join(', '):''):'';
}
