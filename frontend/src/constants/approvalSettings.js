export const approvalSettingsText={
 ko:{
  title:'결재선 설정',drafter:'기안자',approver:'승인자',none:'추가 승인 불필요',
  hint:'금액에 따라 선임 → 책임 → 관리자 순서로 승인합니다. 담당자가 없는 단계는 상위 승인자로 우회합니다.',
  save:'저장',saved:'금액 한도를 저장했습니다.',error:'금액 한도를 확인해 주세요.',missing:'필요한 승인자를 선택해 주세요.',
  senior:'선임 회계사',lead:'책임 회계사',admin:'관리자',limit:'승인 한도 (이하)',grade:'직급',vacant:'담당자 없음 · 상위 승인으로 우회',
  amountHint:'VAT 포함 통화별 합계를 각 한도와 비교합니다. 혼합 통화는 가장 높은 승인 단계를 적용합니다. USD·KRW 한도는 사용 전에 설정하세요.',
  rules:'통화별 승인 한도',self:'기안자는 접속자 본인으로 고정됩니다. 회계사는 본인 직급까지의 단계를 생략하고 필요한 상위 승인을 받습니다.',
  preview:'저장 시 적용될 결재선',total:'신청 금액',over:'책임 한도 초과 시 관리자 승인 필수',limitMissing:'신청 통화의 승인 한도를 설정해 주세요.',
  selfError:'기안자와 관리자 승인자가 같습니다. 다른 관리자 승인자를 지정해 주세요.',notReady:'신청 금액을 입력하면 결재선을 표시합니다.',readonly:'회사 결재 규칙은 관리자만 변경할 수 있습니다.'
 },
 en:{
  title:'Approval settings',drafter:'Drafter',approver:'Approver',none:'No further approval',
  hint:'Approvals accumulate: senior accountant → lead accountant → administrator. Vacant stages escalate to the next level.',
  save:'Save',saved:'Amount limits saved.',error:'Check the amount limits.',missing:'Select the required approvers.',
  senior:'Senior accountant',lead:'Lead accountant',admin:'Administrator',limit:'Approval limit (inclusive)',grade:'Grade',vacant:'Vacant · escalate',
  amountHint:'Compare tax-inclusive totals separately by currency. Mixed currencies use the highest required approval level. Configure USD and KRW limits before use.',
  rules:'Approval limits by currency',self:'The signed-in user is the fixed drafter. Accountants skip stages up to their own grade and obtain required higher approvals.',
  preview:'Approval line on save',total:'Request amount',over:'Administrator approval is mandatory above the lead limit',limitMissing:'Configure approval limits for this currency.',
  selfError:'The drafter is also the designated administrator. Select another administrator.',notReady:'Enter request amounts to preview the approval line.',readonly:'Only administrators may change company approval rules.'
 },
 vi:{
  title:'Cài đặt phê duyệt',drafter:'Người lập',approver:'Người duyệt',none:'Không cần duyệt thêm',
  hint:'Duyệt lần lượt: kế toán cấp cao → kế toán phụ trách → quản trị viên. Nếu thiếu người duyệt, chuyển lên cấp trên.',
  save:'Lưu',saved:'Đã lưu hạn mức.',error:'Kiểm tra hạn mức.',missing:'Chọn người phê duyệt cần thiết.',
  senior:'Kế toán cấp cao',lead:'Kế toán phụ trách',admin:'Quản trị viên',limit:'Hạn mức duyệt (trở xuống)',grade:'Chức danh',vacant:'Chưa có · chuyển cấp trên',
  amountHint:'So sánh tổng gồm VAT theo từng loại tiền. Đề nghị nhiều loại tiền dùng cấp duyệt cao nhất. Thiết lập hạn mức USD và KRW trước khi sử dụng.',
  rules:'Hạn mức duyệt theo loại tiền',self:'Người đăng nhập là người lập cố định. Kế toán bỏ qua các bước đến cấp của mình và xin duyệt cấp cao hơn khi cần.',
  preview:'Luồng phê duyệt khi lưu',total:'Số tiền đề nghị',over:'Vượt hạn mức phụ trách phải được quản trị viên duyệt',limitMissing:'Thiết lập hạn mức duyệt cho loại tiền của đề nghị.',
  selfError:'Người lập cũng là quản trị viên phê duyệt. Chọn quản trị viên khác.',notReady:'Nhập số tiền để xem luồng phê duyệt.',readonly:'Chỉ quản trị viên được thay đổi quy tắc của công ty.'
 }
};
