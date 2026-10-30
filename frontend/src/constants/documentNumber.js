export const documentNumberText={
 ko:{invoice:'청구서 관리번호',expense:'관리번호',auto:'비워두면 발행·등록 시 자동으로 부여합니다.',invalid:'관리번호는 200자 이내이며 줄바꿈을 사용할 수 없습니다.',duplicate:'이미 사용된 관리번호입니다. 다른 번호를 입력해 주세요.',locked:'저장된 관리번호는 변경할 수 없습니다.'},
 en:{invoice:'Invoice management number',expense:'Reference',auto:'Leave blank to assign automatically when issued or registered.',invalid:'Use up to 200 characters without line breaks.',duplicate:'This management number is already in use. Enter a different number.',locked:'A saved management number cannot be changed.'},
 vi:{invoice:'Số quản lý hóa đơn',expense:'Mã quản lý',auto:'Để trống để tự cấp số khi phát hành hoặc đăng ký.',invalid:'Nhập tối đa 200 ký tự, không xuống dòng.',duplicate:'Số quản lý đã được sử dụng. Vui lòng nhập số khác.',locked:'Không thể thay đổi số quản lý đã lưu.'}
};
export const documentNumberError=(code,languageCode)=>{const t=documentNumberText[languageCode]||documentNumberText.en;return ({INVALID_DOCUMENT_NUMBER:t.invalid,DOCUMENT_NUMBER_ALREADY_EXISTS:t.duplicate,DOCUMENT_NUMBER_LOCKED:t.locked})[code];};
