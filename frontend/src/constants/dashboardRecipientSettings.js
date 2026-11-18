export const dashboardRecipientText={
 ko:{title:'설정',handled:'거래처 취급 품목 불일치',ADMIN:'관리자',ACCOUNTANT:'회계',OPERATOR:'운영',roles:'수신 역할',mandatory:'관리자는 모든 알림을 받습니다.',permission:'선택한 역할의 업무 접근 권한도 함께 적용됩니다.',empty:'등록된 수신 설정 항목이 없습니다.',save:'저장',close:'닫기',retry:'재시도',reload:'최신 설정 불러오기',failed:'회사 알림 설정을 불러오거나 저장하지 못했습니다.',changed:'다른 관리자가 설정을 변경했습니다. 최신 설정을 불러온 뒤 다시 적용해 주세요.',saved:'회사 알림 수신 설정을 저장했습니다.',discard:'저장하지 않은 수신 설정 변경을 버리시겠습니까?'},
 en:{title:'settings',handled:'Partner handled item mismatch',ADMIN:'Administrator',ACCOUNTANT:'Accountant',OPERATOR:'Operator',roles:'Recipient roles',mandatory:'Administrators receive every alert.',permission:'Access to the source workflow is also required.',empty:'No recipient rules have been added.',save:'Save',close:'Close',retry:'Retry',reload:'Load latest settings',failed:'Could not load or save company alert settings.',changed:'Another administrator changed the settings. Load the latest settings before applying your changes.',saved:'Company alert recipients saved.',discard:'Discard unsaved recipient changes?'},
 vi:{title:'Cài đặt',handled:'Mặt hàng không thuộc phạm vi đối tác',ADMIN:'Quản trị viên',ACCOUNTANT:'Kế toán',OPERATOR:'Vận hành',roles:'Vai trò nhận thông báo',mandatory:'Quản trị viên nhận tất cả thông báo.',permission:'Người nhận cũng cần quyền truy cập nghiệp vụ gốc.',empty:'Chưa có quy tắc người nhận.',save:'Lưu',close:'Đóng',retry:'Thử lại',reload:'Tải cài đặt mới nhất',failed:'Không thể tải hoặc lưu cài đặt thông báo công ty.',changed:'Quản trị viên khác đã thay đổi cài đặt. Tải cài đặt mới nhất trước khi áp dụng thay đổi.',saved:'Đã lưu người nhận thông báo công ty.',discard:'Bỏ thay đổi người nhận chưa lưu?'},
};

dashboardRecipientText.ko.uncoded='코드 미지정 입출금';
dashboardRecipientText.en.uncoded='Bank transactions without accounting codes';
dashboardRecipientText.vi.uncoded='Thu chi chưa có mã kế toán';

export function dashboardSettingsTitle(label,languageCode){
 const t=dashboardRecipientText[languageCode]||dashboardRecipientText.en;
 return languageCode==='vi'?`${t.title} ${label}`:`${label} ${t.title}`;
}
