export const PARTY_KIND_TEXT={
 ko:{label:'거래처 유형',INDIVIDUAL:'개인',CORPORATE:'법인',legacy:'선택 필요',codeHelp:'개인의 업체 코드는 선택 사항입니다. 비워 저장하면 기존 코드도 삭제됩니다.',invalid:'거래처 유형을 개인 또는 법인으로 선택해 주세요.'},
 en:{label:'Partner type',INDIVIDUAL:'Individual',CORPORATE:'Corporation',legacy:'Selection required',codeHelp:'Codes are optional for individuals. Saving an empty field removes the existing code.',invalid:'Select Individual or Corporation.'},
 vi:{label:'Loại đối tác',INDIVIDUAL:'Cá nhân',CORPORATE:'Pháp nhân',legacy:'Cần chọn',codeHelp:'Mã là tùy chọn cho cá nhân. Để trống và lưu sẽ xóa mã hiện có.',invalid:'Chọn Cá nhân hoặc Pháp nhân.'},
};
PARTY_KIND_TEXT.ko.codeLabel='업체 코드 (4자리)';
PARTY_KIND_TEXT.en.codeLabel='Company code (4 characters)';
PARTY_KIND_TEXT.vi.codeLabel='Mã công ty (4 ký tự)';
Object.assign(PARTY_KIND_TEXT.ko,{corporateCodeHelp:'법인 코드는 영문·숫자 4자리를 직접 입력하세요. 전체 SaaS에서 중복될 수 없습니다.',codeInvalid:'법인 거래처 코드는 영문·숫자 4자리로 직접 입력해 주세요.',businessRequired:'법인 거래처의 사업자·세금 번호를 입력해 주세요.',kindRequired:'거래처 유형을 개인 또는 법인으로 선택해 주세요.',codeConflict:'이미 사용 중인 코드입니다. 다른 4자리 코드를 직접 입력해 주세요.'});
Object.assign(PARTY_KIND_TEXT.en,{corporateCodeHelp:'Enter a unique 4-character code using letters or digits. Codes are unique across the SaaS.',codeInvalid:'Enter a 4-character corporate partner code using letters or digits.',businessRequired:'Enter the corporation’s business or tax number.',kindRequired:'Select Individual or Corporation.',codeConflict:'This code is already used. Enter another 4-character code.'});
Object.assign(PARTY_KIND_TEXT.vi,{corporateCodeHelp:'Nhập mã 4 chữ hoặc số, duy nhất trên toàn hệ thống SaaS.',codeInvalid:'Nhập mã đối tác pháp nhân gồm 4 chữ hoặc số.',businessRequired:'Nhập mã đăng ký kinh doanh hoặc mã số thuế của pháp nhân.',kindRequired:'Chọn Cá nhân hoặc Pháp nhân.',codeConflict:'Mã này đã được dùng. Hãy nhập mã 4 ký tự khác.'});
