export const orderWorkflowInformation = {
  ko: {
    title: '상태',
    paragraphs: [
      '접수: 주문이 등록되었으며 아직 생산 이력이 없는 상태입니다. 배정만 등록한 경우도 포함합니다.',
      '생산: 직원 작업·외주 작업 또는 과거 생산 완료 이력이 있으며, 전체 생산 완료 조건은 아직 충족하지 않은 상태입니다.',
      '청구: 스타일별 주문 수량을 배정량이 충족하고 모든 배정의 생산 완료가 확인되었으며, 전체 청구가 아직 완료되지 않은 상태입니다.',
      '수금: 생산 완료 조건과 전체 청구 조건을 충족했으며, 청구서 증빙에 연결된 입금으로 아직 전액 정산되지 않은 상태입니다.',
      '마감: 실제 주문·품목 수량을 충족하는 100% 청구가 있고, 해당 주문의 청구서 증빙에 연결된 유효 입금으로 청구 잔액이 전액 정산된 상태입니다. 부분 입금만으로 마감하지 않으며 입금 취소·환불로 잔액이 생기면 다시 판정합니다.',
      '판매 회사에서 청구 대상 제외로 설정한 주문도 마감으로 표시합니다. 제외에 따른 마감은 실제 입금 완료를 뜻하지 않으며, 다시 포함하면 생산·청구·입금 근거로 상태를 계산합니다.',
      '생산 진행률 100%만으로 생산 완료를 판정하지 않으며 청구율 30%와 70%를 단순 합산하지 않습니다. 전액 정산 전에는 기존 생산·청구 상태를 유지합니다. 마감 표시는 생산 완료나 원본 금액을 변경하지 않습니다.',
    ],
  },
  en: {
    title: 'Status',
    paragraphs: [
      'Received: The order is registered with no production history yet. Assignments alone also remain in this state.',
      'Production: Employee work, outsourced work or prior production completion exists, but the conditions for full production completion are not yet met.',
      'Billing: Assignments cover the ordered quantity for every style and all assignments have confirmed production completion, but full billing is still pending.',
      'Collection: Production completion and full billing conditions are met, but linked invoice receipts have not fully settled the balance.',
      'Closed: A valid 100% invoice covers the actual order items and posted receipts linked to its invoice evidence fully settle the balance. Partial payment alone does not close an order. Voided receipts or refunds reopen the status when a balance remains.',
      'Orders excluded from billing by the selling company also appear as Closed. Exclusion does not mean payment was received. Including them again restores the status derived from production, invoices and linked receipts.',
      'A production progress of 100% alone does not confirm completion; cumulative 30% and 70% statements are not added together. Existing production and billing stages remain until full settlement. Closing does not change production completion or original amounts.',
    ],
  },
  vi: {
    title: 'Trạng Thái',
    paragraphs: [
      'Tiếp nhận: Đơn hàng đã được đăng ký nhưng chưa có lịch sử sản xuất. Chỉ có phân công cũng thuộc trạng thái này.',
      'Sản xuất: Đã có công việc của nhân viên, công việc gia công hoặc lịch sử hoàn thành sản xuất, nhưng chưa đáp ứng đầy đủ điều kiện hoàn thành sản xuất.',
      'Lập hóa đơn: Số lượng phân công đáp ứng số lượng đặt của từng mẫu và tất cả phân công đã được xác nhận hoàn thành sản xuất, nhưng chưa lập đủ hóa đơn.',
      'Thu tiền: Đã hoàn thành sản xuất và lập đủ hóa đơn nhưng các khoản thu liên kết với chứng từ hóa đơn chưa thanh toán hết số dư.',
      'Đã chốt: Hóa đơn 100% hợp lệ đáp ứng số lượng mặt hàng thực tế và các khoản thu đã ghi sổ liên kết với hóa đơn thanh toán hết số dư. Thu một phần không tự chốt. Hủy khoản thu hoặc hoàn tiền làm trạng thái được tính lại khi còn số dư.',
      'Đơn hàng được công ty bán loại khỏi đối tượng lập hóa đơn cũng hiển thị Đã chốt. Việc loại trừ không có nghĩa là đã nhận tiền. Khi đưa vào lại, trạng thái được tính từ sản xuất, hóa đơn và khoản thu liên kết.',
      'Tiến độ sản xuất 100% không tự xác nhận hoàn thành; không cộng đơn giản hóa đơn lũy kế 30% và 70%. Giữ các bước sản xuất và lập hóa đơn hiện có đến khi thanh toán đủ. Chốt không sửa hoàn thành sản xuất hay số tiền gốc.',
    ],
  },
};
