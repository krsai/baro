export const ENTITY_CODE_TEXT={
 ko:{help:'비워 두면 영문 기본명의 앞 6자리로 자동 생성합니다.',conflict:'이미 사용 중인 업체 코드입니다. 중복되지 않는 코드를 직접 입력하거나 영문 기본명을 변경해 주세요.',required:'영문 기본명에서 코드를 만들 수 없습니다. 업체 코드를 직접 입력해 주세요.',invalid:'업체 코드는 영문·숫자·하이픈·밑줄·마침표로 최대 40자까지 입력해 주세요.'},
 en:{help:'Leave blank to use the first 6 letters or digits of the English name.',conflict:'This company code is already in use. Enter a unique code or change the English name.',required:'A code cannot be generated from the English name. Enter a company code.',invalid:'Use up to 40 letters, digits, hyphens, underscores or dots.'},
 vi:{help:'Để trống để tạo mã từ 6 chữ hoặc số đầu của tên tiếng Anh.',conflict:'Mã công ty đã được sử dụng. Nhập mã khác hoặc đổi tên tiếng Anh.',required:'Không thể tạo mã từ tên tiếng Anh. Hãy nhập mã công ty.',invalid:'Nhập tối đa 40 chữ, số, dấu gạch ngang, gạch dưới hoặc dấu chấm.'},
};
export function entityCodeError(error,languageCode,fallback){
 const t=ENTITY_CODE_TEXT[languageCode]||ENTITY_CODE_TEXT.en;
 if(['PARTNER_CODE_CONFLICT','COMPANY_CODE_EXISTS','code already exists'].includes(error?.message))return t.conflict;
 if(error?.message==='PARTNER_CODE_REQUIRED')return t.required;
 if(error?.message==='INVALID_PARTNER_CODE')return t.invalid;
 return error?.message||fallback;
}
