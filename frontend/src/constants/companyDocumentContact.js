export const companyDocumentContactText={
 ko:{title:'서류용 대표자 및 연락처',representative:'대표자명 (영문)',phone:'대표 전화번호',email:'대표 이메일',address:'대표 주소 (영문)',addressTitle:'서류용 대표 주소',english:'대표자명과 주소는 영문으로 입력해 주세요.',invalid:'대표자 및 연락처 입력 내용을 확인해 주세요.'},
 en:{title:'Document contact',representative:'Representative name (English)',phone:'Contact phone',email:'Contact email',address:'Company address (English)',addressTitle:'Document address',english:'Enter the representative name and address in English.',invalid:'Check the document contact details.'},
 vi:{title:'Thông tin liên hệ trên chứng từ',representative:'Tên người đại diện (tiếng Anh)',phone:'Số điện thoại liên hệ',email:'Email liên hệ',address:'Địa chỉ công ty (tiếng Anh)',addressTitle:'Địa chỉ trên chứng từ',english:'Nhập tên người đại diện và địa chỉ bằng tiếng Anh.',invalid:'Kiểm tra thông tin liên hệ trên chứng từ.'},
};
export function companyDocumentContactError(error,languageCode,fallback){
 const text=companyDocumentContactText[languageCode]||companyDocumentContactText.en;
 return error?.message==='COMPANY_DOCUMENT_CONTACT_ENGLISH_REQUIRED'?text.english:error?.message==='COMPANY_DOCUMENT_CONTACT_INVALID'?text.invalid:fallback;
}

export const partnerContactText={
 ko:{title:'거래처 담당자 및 연락처',contactName:'담당자명',phone:'담당자 전화번호',email:'담당자 이메일',address:'거래처 주소 (영문)',defaults:'회사 기본 정보 사용',registration:'원본 등록 정보 사용',local:'우리 회사 저장 정보 사용',changed:'다른 화면에서 연락처가 변경되었습니다. 다시 조회한 뒤 수정해 주세요.',invalid:'담당자와 연락처를 확인해 주세요.'},
 en:{title:'Partner contact details',contactName:'Contact person',phone:'Contact phone',email:'Contact email',address:'Partner address (English)',defaults:'Use company defaults',registration:'Use original registration',local:'Use our saved details',changed:'Contact details changed. Reload before editing.',invalid:'Check the contact details.'},
 vi:{title:'Thông tin người liên hệ',contactName:'Người liên hệ',phone:'Điện thoại liên hệ',email:'Email liên hệ',address:'Địa chỉ đối tác (tiếng Anh)',defaults:'Dùng thông tin mặc định của công ty',registration:'Dùng thông tin đăng ký gốc',local:'Dùng thông tin riêng đã lưu',changed:'Thông tin liên hệ đã thay đổi. Hãy tải lại trước khi sửa.',invalid:'Kiểm tra thông tin liên hệ.'}
};
