import {rowActionsText} from './rowActions.js';
export const shippingText={
 ko:{title:"운송",new:'운송 의뢰',forwarder:'포워더',number:'SR 번호',receipt:'접수 상태',PENDING:'접수 대기',ACCEPTED:'접수 완료',accept:'접수',share:'고객에게 진행 정보 공유',shared:'공유한 운송 진행',request:'운송 의뢰 내용',privacy:'의뢰와 운송은 같은 운송건입니다. 포워더의 내부 메모·매입·원가·마진·회계 자료는 공유하지 않습니다.',documents:'운송 서류·포장물',history:'변경 이력',saved:'저장했습니다.',failed:'처리하지 못했습니다. 새로고침 후 다시 시도해 주세요.',mapping:'포워더가 고객 거래처의 회사 연결을 확인해야 합니다.',pendingOnly:'고객은 접수 전 의뢰 내용을 수정할 수 있습니다. 접수 후 변경은 담당 포워더에게 요청해 주세요.',empty:'등록된 운송 의뢰가 없습니다.',legacy:'이전 운송 의뢰·공유 기록',billing:'비용·청구 연결',billingHint:'기존 비용 신청·청구 문서는 각 회계 업무에서 관리합니다. 이 운송건에서 자동 생성하지 않습니다.'},
 en:{title:"Transport",new:'Shipping Request',forwarder:'Forwarder',number:'SR No.',receipt:'Receipt',PENDING:'Pending receipt',ACCEPTED:'Received',accept:'Receive',share:'Share progress with customer',shared:'Shared transport progress',request:'Shipping request',privacy:'The request and shipment are one job. Internal notes, purchases, costs, margins and accounting records are private.',documents:'Transport documents & packages',history:'History',saved:'Saved.',failed:'Could not complete. Refresh and try again.',mapping:'The forwarder must verify the customer company connection.',pendingOnly:'Customers can edit before receipt. Contact the forwarder for changes after receipt.',empty:'No shipping requests.',legacy:'Master & express operations',billing:'Costs & billing',billingHint:'Existing expenses and invoices remain in their accounting workflows. They are not automatically created here.'},
 vi:{title:"Vận chuyển",new:'Yêu cầu vận chuyển',forwarder:'Đơn vị giao nhận',number:'Số SR',receipt:'Tiếp nhận',PENDING:'Chờ tiếp nhận',ACCEPTED:'Đã tiếp nhận',accept:'Tiếp nhận',share:'Chia sẻ tiến độ với khách hàng',shared:'Tiến độ đã chia sẻ',request:'Yêu cầu vận chuyển',privacy:'Yêu cầu và lô vận chuyển là một hồ sơ. Ghi chú nội bộ, giá mua, chi phí, lợi nhuận và sổ kế toán được giữ riêng.',documents:'Chứng từ và kiện hàng',history:'Lịch sử',saved:'Đã lưu.',failed:'Không thể xử lý. Vui lòng tải lại và thử lại.',mapping:'Đơn vị giao nhận cần xác minh liên kết công ty khách hàng.',pendingOnly:'Khách hàng có thể sửa trước khi tiếp nhận. Sau đó hãy liên hệ đơn vị giao nhận để thay đổi.',empty:'Chưa có yêu cầu vận chuyển.',legacy:'Các trao đổi vận chuyển trước đây',billing:'Chi phí và hóa đơn',billingHint:'Chi phí và hóa đơn hiện có được quản lý trong nghiệp vụ kế toán. Không tự động tạo tại đây.'},
};
shippingText.ko.srDate='SR 일자';
shippingText.en.srDate='SR date';
shippingText.vi.srDate='Ngày SR';
shippingText.ko.shareDocument='이 서류를 고객에게 공유';
shippingText.en.shareDocument='Share this document with customer';
shippingText.vi.shareDocument='Chia sẻ chứng từ này với khách hàng';
shippingText.ko.DRAFT='준비 중';
shippingText.en.DRAFT='Preparing';
shippingText.vi.DRAFT='Chuẩn bị';
shippingText.ko.legacy='Master·특송 관리';
shippingText.en.legacy='Master & express operations';
shippingText.vi.legacy='Quản lý Master và chuyển phát';

Object.assign(shippingText.ko,{ACCEPTED:'접수',REJECTED:'거부',actions:rowActionsText.ko,reject:'거부',rejectConfirm:'이 운송 접수를 거부하시겠습니까?',deleteRejected:'영구 삭제',deleteRejectedConfirm:'거부된 SR과 해당 이력을 영구 삭제합니다. 백업을 남기지 않으며 복구할 수 없습니다. 삭제하시겠습니까?',deleted:'삭제했습니다.',linkedBlocked:'운송이 시작되었거나 연결된 서류·금액·포장물 등이 있어 처리할 수 없습니다.',sourceOwnerOnly:'SR 원본을 생성한 회사만 삭제할 수 있습니다.'});
Object.assign(shippingText.en,{REJECTED:'Rejected',actions:rowActionsText.en,reject:'Reject',rejectConfirm:'Reject This Received Shipment?',deleteRejected:'Delete Permanently',deleteRejectedConfirm:'Permanently Delete The Rejected SR And Its History? No Backup Will Be Kept And This Cannot Be Undone.',deleted:'Deleted.',linkedBlocked:'The Shipment Has Started Or Has Linked Documents, Charges, Packages Or Other Records.',sourceOwnerOnly:'Only The Company That Created The Original SR Can Delete It.'});
Object.assign(shippingText.vi,{REJECTED:'Đã Từ Chối',actions:'Thao Tác',reject:'Từ Chối',rejectConfirm:'Từ Chối Lô Hàng Đã Tiếp Nhận Này?',deleteRejected:'Xóa Vĩnh Viễn',deleteRejectedConfirm:'Xóa Vĩnh Viễn SR Đã Từ Chối Và Lịch Sử? Không Giữ Bản Sao Lưu Và Không Thể Khôi Phục.',deleted:'Đã Xóa.',linkedBlocked:'Lô Hàng Đã Bắt Đầu Hoặc Có Chứng Từ, Chi Phí, Kiện Hàng Hay Hồ Sơ Liên Kết.',sourceOwnerOnly:'Chỉ Công Ty Tạo SR Gốc Có Thể Xóa.'});
export const shippingStatusTone=status=>({PENDING:"yellow",ACCEPTED:"green",REJECTED:"red",DRAFT:"gray",BOOKED:"blue",IN_TRANSIT:"blue",ARRIVED:"green",DELIVERED:"green",CANCELLED:"gray"}[status]||"gray");
