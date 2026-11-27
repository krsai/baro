export const orderWorkflowInformation = {
  ko: {
    title: '상태',
    paragraphs: [
      '접수: 주문이 등록되었으며 아직 생산 이력이 없는 상태입니다. 배정만 등록한 경우도 포함합니다.',
      '생산: 직원 작업·외주 작업 또는 과거 생산 완료 이력이 있으며, 전체 생산 완료 조건은 아직 충족하지 않은 상태입니다.',
      '청구: 스타일별 주문 수량을 배정량이 충족하고 모든 배정의 생산 완료가 확인되었으며, 전체 청구가 아직 완료되지 않은 상태입니다.',
      '수금: 생산 완료 조건과 전체 청구 조건을 충족한 상태입니다. 판매 회사에서 청구 대상 제외로 설정한 주문도 수금으로 표시합니다. 수금 표시는 입금 완료를 뜻하지 않습니다.',
      '마감: 현재 자동 전환하지 않는 상태입니다.',
      '생산 진행률 100%만으로 생산 완료를 판정하지 않습니다. 선청구를 해도 생산 전에는 접수, 생산 중에는 생산으로 표시하며, 수량 증량이나 배정 재개에 따라 생산으로 돌아갈 수 있습니다.',
    ],
  },
  en: {
    title: 'Status',
    paragraphs: [
      'Received: The order is registered with no production history yet. Assignments alone also remain in this state.',
      'Production: Employee work, outsourced work or prior production completion exists, but the conditions for full production completion are not yet met.',
      'Billing: Assignments cover the ordered quantity for every style and all assignments have confirmed production completion, but full billing is still pending.',
      'Collection: Production completion and full billing conditions are met. Orders excluded from billing by the selling company also appear here. This status does not mean payment has been received.',
      'Closed: Orders do not currently move to this state automatically.',
      'A production progress of 100% alone does not confirm completion. Advance billing leaves orders at Received before production and Production during production. Increased quantities or reopened assignments can return an order to Production.',
    ],
  },
  vi: {
    title: 'Trạng Thái',
    paragraphs: [
      'Tiếp nhận: Đơn hàng đã được đăng ký nhưng chưa có lịch sử sản xuất. Chỉ có phân công cũng thuộc trạng thái này.',
      'Sản xuất: Đã có công việc của nhân viên, công việc gia công hoặc lịch sử hoàn thành sản xuất, nhưng chưa đáp ứng đầy đủ điều kiện hoàn thành sản xuất.',
      'Lập hóa đơn: Số lượng phân công đáp ứng số lượng đặt của từng mẫu và tất cả phân công đã được xác nhận hoàn thành sản xuất, nhưng chưa lập đủ hóa đơn.',
      'Thu tiền: Đã đáp ứng điều kiện hoàn thành sản xuất và lập đủ hóa đơn. Đơn hàng được công ty bán loại khỏi đối tượng lập hóa đơn cũng hiển thị ở đây. Trạng thái này không có nghĩa là đã nhận đủ tiền.',
      'Đã chốt: Hiện chưa tự động chuyển sang trạng thái này.',
      'Tiến độ sản xuất 100% không tự xác nhận hoàn thành. Lập hóa đơn trước vẫn giữ Tiếp nhận khi chưa sản xuất và Sản xuất khi đang sản xuất. Tăng số lượng hoặc mở lại phân công có thể đưa đơn hàng về Sản xuất.',
    ],
  },
};
