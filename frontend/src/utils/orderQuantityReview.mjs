export function formatQuantityReview(review, languageCode) {
  const labels = languageCode === 'ko' ? ['감량 이력', '조직', '스타일', '주문', '생산', '초과', '확인 필요', '실적 보존·자동 재고 처리 없음']
    : languageCode === 'vi' ? ['Lịch sử giảm', 'Tổ chức', 'Mẫu', 'Đặt', 'Sản xuất', 'Dư', 'Cần kiểm tra', 'Giữ sản lượng, không tự động xử lý kho']
      : ['Reduction history', 'Organization', 'Style', 'Ordered', 'Produced', 'Excess', 'Review required', 'Production preserved; no automatic stock adjustment'];
  return `${labels[0]} · ${review.actor} · ${new Date(review.createdAt).toLocaleString()}\n${review.reason}\n${labels[7]}\n`
    + (review.snapshot?.production || []).map(row => `${labels[1]} ${row.orgId} / ${labels[2]} ${row.styleId}: ${labels[3]} ${row.orderedQuantity}, ${labels[4]} ${row.producedQuantity ?? labels[6]}, ${labels[5]} ${row.excessQuantity ?? labels[6]}`).join('\n');
}
