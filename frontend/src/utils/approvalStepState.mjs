export function approvalStepState(approval, employeeId) {
 const steps=[...(approval?.steps||[])].sort((a,b)=>a.position-b.position);
 const step=steps.find(row=>row.employeeId===employeeId);
 if(!step)return 'unconfirmed';
 if(step.rejected)return 'rejected';
 if(step.approved)return 'approved';
 if(step.blocked||approval?.rejected)return 'stopped';
 return steps.find(row=>!row.approved)?.employeeId===employeeId?'pending':'waiting';
}
export const approvalStepLabels={
 ko:{pending:'결재 대기',waiting:'차례 대기',approved:'승인 완료',rejected:'반려',stopped:'중단',unconfirmed:'미요청'},
 en:{pending:'Awaiting approval',waiting:'Waiting turn',approved:'Approved',rejected:'Rejected',stopped:'Stopped',unconfirmed:'Not requested'},
 vi:{pending:'Chờ duyệt',waiting:'Chưa đến lượt',approved:'Đã duyệt',rejected:'Từ chối',stopped:'Đã dừng',unconfirmed:'Chưa gửi'},
};
