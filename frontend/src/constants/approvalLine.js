export const approvalLineText={
 ko:{drafterSelect:'기안자 선택',middle:'중간 결재',final:'최종 결재',finalSelect:'최종 결재자 선택',middleSelect:'중간 결재자 선택',notRequired:'설정에 따라 생략',self:'본인 전결',sameCompany:'기안자는 본인으로 고정됩니다. 결재자는 같은 회사의 해당 결재 단계에 속한 직원만 선택할 수 있습니다.'},
 en:{drafterSelect:'Select drafter',middle:'Intermediate approval',final:'Final approval',finalSelect:'Select final approver',middleSelect:'Select intermediate approver',notRequired:'Not required by policy',self:'Self-authorized',sameCompany:'The drafter is fixed to the original author. Only employees in this company who qualify for each stage can be selected as approvers.'},
 vi:{drafterSelect:'Chọn người lập',middle:'Duyệt trung gian',final:'Duyệt cuối',finalSelect:'Chọn người duyệt cuối',middleSelect:'Chọn người duyệt trung gian',notRequired:'Bỏ qua theo quy tắc',self:'Tự quyết',sameCompany:'Người lập được cố định là tác giả ban đầu. Chỉ chọn người duyệt cùng công ty đủ điều kiện cho từng bước.'},
};
Object.assign(approvalLineText.ko,{name:'성명'});
Object.assign(approvalLineText.en,{name:'Name'});
Object.assign(approvalLineText.vi,{name:'Họ tên'});
approvalLineText.ko.noCandidates='이 단계에 해당하는 같은 회사의 활성 결재자가 없습니다.';
approvalLineText.en.noCandidates='No active approver in this company qualifies for this stage.';
approvalLineText.vi.noCandidates='Không có người duyệt đang hoạt động cùng công ty phù hợp với bước này.';
approvalLineText.ko.person='결재자';approvalLineText.en.person='Approver';approvalLineText.vi.person='Người duyệt';
approvalLineText.ko.invalidAmount='금액을 확인해 주세요.';approvalLineText.en.invalidAmount='Check the amount.';approvalLineText.vi.invalidAmount='Kiểm tra số tiền.';
Object.assign(approvalLineText.ko,{orAbove:' 이상',alreadySelected:'조건에 맞는 직원이 앞 단계에 이미 지정돼 있습니다. 앞 단계 결재자를 바꾸거나 관리자에게 결재선을 확인해 주세요.',drafterOnly:'조건에 맞는 직원이 기안자 본인뿐입니다. 본인은 결재할 수 없으므로 관리자에게 결재선을 확인해 주세요.'});
Object.assign(approvalLineText.en,{orAbove:' or above',alreadySelected:'Eligible employees are already assigned to earlier stages. Change an earlier approver or ask an administrator to review the approval line.',drafterOnly:'Only the drafter qualifies. Self-approval is not allowed. Ask an administrator to review the approval line.'});
Object.assign(approvalLineText.vi,{orAbove:' trở lên',alreadySelected:'Nhân viên đủ điều kiện đã được chọn ở bước trước. Đổi người duyệt ở bước trước hoặc nhờ quản trị viên kiểm tra luồng duyệt.',drafterOnly:'Chỉ người lập đủ điều kiện. Không được tự duyệt. Nhờ quản trị viên kiểm tra luồng duyệt.'});
approvalLineText.ko.gradeNotConfigured='이 단계의 기준 직급이 설정되지 않았거나 비활성 상태입니다. 회사 직급과 결재선의 직급 설정을 확인해 주세요.';
approvalLineText.en.gradeNotConfigured='The required grade is not configured or is inactive. Check company grades and the approval line grade setting.';
approvalLineText.vi.gradeNotConfigured='Cấp bậc yêu cầu chưa được thiết lập hoặc đã ngừng hoạt động. Kiểm tra cấp bậc công ty và thiết lập luồng duyệt.';
