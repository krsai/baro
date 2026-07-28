import React from 'react';
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const TEXT = {
  ko: {
    title: '수익 예측', status: '기능 설계 안내',
    intro: '새로운 스타일의 생산을 시작하기 전에 예상 작업기간, 원가, 권장 판매가와 예상 수익을 검토하는 화면입니다.',
    note: '아래 내용은 이 페이지에 추가될 기능의 범위입니다. 현재는 안내만 제공하며 실제 계산이나 데이터 저장은 하지 않습니다.',
    sections: [
      ['1. 예측할 스타일과 수량', ['스타일 종류, 이름 또는 임시 코드를 입력합니다.', '예측할 생산 수량을 입력하고 여러 수량을 비교할 수 있습니다.']],
      ['2. 예상 작업시간', ['한 벌을 만드는 데 걸릴 것으로 예상되는 초를 직접 입력할 수 있습니다.', 'AJ2000을 예측할 때 AJ1972처럼 비슷한 기존 스타일을 선택하면 해당 스타일의 수량별 ST(q)를 참고할 수 있습니다.', '수량을 변경하면 그 수량에 맞는 ST 버킷과 예상시간을 다시 보여줍니다.']],
      ['3. 인원과 생산기간', ['기본 방식은 투입 인원을 선택하고 예상 생산기간을 계산하는 것입니다.', '필요하면 목표 기간을 먼저 입력하고 필요한 인원을 역산하는 방식도 함께 제공합니다.', '근무시간과 근무일을 반영해 예상 완료일을 확인합니다.']],
      ['4. 생산 원가', ['임대료, 월평균 전기요금, 관리비 등 회사의 월 고정비를 반영합니다.', '투입 인원과 예상기간을 기준으로 인건비와 해당 생산에 배부할 고정비를 계산합니다.', '재료비나 외주비처럼 스타일에 직접 발생하는 비용은 별도 항목으로 입력합니다.']],
      ['5. 권장 판매가와 예상 수익', ['목표 이익률을 입력하면 총원가를 기준으로 권장 판매가를 계산합니다.', '개당 원가, 개당 판매가, 예상 총매출, 예상 이익과 이익률을 함께 보여줍니다.']],
      ['6. 수량별 비교', ['수량을 바꾸면 필요한 기간, 원가, 권장 판매가와 수익성이 어떻게 달라지는지 비교합니다.', '여러 수량 시나리오를 표로 나란히 확인할 수 있습니다.']],
      ['7. 1개월 환산', ['같은 스타일을 한 달 동안 계속 생산한다고 가정한 생산 가능 수량을 보여줍니다.', '월간 예상 매출, 비용, 이익과 필요한 평균 인원을 함께 확인합니다.']],
    ],
  },
  en: {
    title: 'Profit Forecast', status: 'Feature design overview',
    intro: 'Before producing a new style, review its estimated duration, cost, recommended selling price, and expected profit.',
    note: 'The items below describe the planned scope of this page. It currently provides guidance only and does not calculate or save data.',
    sections: [
      ['1. Style and Quantity', ['Enter the style type, name, or a temporary code.', 'Enter a production quantity and compare multiple quantity scenarios.']],
      ['2. Estimated Work Time', ['Directly enter the estimated seconds required to make one piece.', 'For a new AJ2000 style, select a similar style such as AJ1972 to reference its quantity-based ST(q).', 'Changing quantity refreshes the applicable ST bucket and estimated time.']],
      ['3. Staffing and Duration', ['The default method selects the production headcount and calculates the estimated duration.', 'An optional target-duration mode calculates the required headcount.', 'Working hours and working days are used to estimate the completion date.']],
      ['4. Production Cost', ['Include monthly fixed costs such as rent, average electricity, and management expenses.', 'Allocate labor and fixed costs to the production based on staffing and estimated duration.', 'Enter direct style costs such as materials and outsourcing separately.']],
      ['5. Recommended Price and Profit', ['Enter a target profit margin to calculate a recommended selling price from total cost.', 'Review unit cost, unit price, expected revenue, profit, and margin together.']],
      ['6. Quantity Comparison', ['See how duration, cost, recommended price, and profitability change with quantity.', 'Compare multiple quantity scenarios side by side in a table.']],
      ['7. Monthly Conversion', ['Estimate how many pieces could be produced if the same style ran for one month.', 'Review projected monthly revenue, cost, profit, and average staffing.']],
    ],
  },
  vi: {
    title: 'Dự báo lợi nhuận', status: 'Hướng dẫn thiết kế chức năng',
    intro: 'Trước khi sản xuất kiểu dáng mới, xem xét thời gian, chi phí, giá bán đề xuất và lợi nhuận dự kiến.',
    note: 'Các mục dưới đây mô tả phạm vi chức năng dự kiến. Hiện tại trang chỉ cung cấp hướng dẫn, chưa tính toán hoặc lưu dữ liệu.',
    sections: [
      ['1. Kiểu dáng và số lượng', ['Nhập loại, tên hoặc mã tạm thời của kiểu dáng.', 'Nhập số lượng sản xuất và so sánh nhiều kịch bản số lượng.']],
      ['2. Thời gian công việc dự kiến', ['Nhập trực tiếp số giây dự kiến để làm một sản phẩm.', 'Khi dự báo AJ2000, có thể chọn kiểu dáng tương tự như AJ1972 để tham khảo ST(q) theo số lượng.', 'Khi đổi số lượng, hệ thống hiển thị lại bucket ST và thời gian phù hợp.']],
      ['3. Nhân lực và thời gian', ['Mặc định là chọn số người sản xuất rồi tính thời gian dự kiến.', 'Chế độ thời gian mục tiêu có thể tính ngược số người cần thiết.', 'Giờ làm việc và ngày làm việc được dùng để dự kiến ngày hoàn thành.']],
      ['4. Chi phí sản xuất', ['Bao gồm chi phí cố định hàng tháng như tiền thuê, điện trung bình và phí quản lý.', 'Phân bổ chi phí nhân công và chi phí cố định theo nhân lực và thời gian dự kiến.', 'Nhập riêng chi phí trực tiếp như nguyên vật liệu và gia công ngoài.']],
      ['5. Giá bán và lợi nhuận dự kiến', ['Nhập tỷ suất lợi nhuận mục tiêu để tính giá bán đề xuất từ tổng chi phí.', 'Xem đồng thời giá thành đơn vị, giá bán, doanh thu, lợi nhuận và tỷ suất.']],
      ['6. So sánh số lượng', ['Xem thời gian, chi phí, giá đề xuất và lợi nhuận thay đổi theo số lượng.', 'So sánh nhiều kịch bản số lượng cạnh nhau trong bảng.']],
      ['7. Quy đổi một tháng', ['Ước tính số lượng có thể sản xuất nếu chạy cùng kiểu dáng trong một tháng.', 'Xem doanh thu, chi phí, lợi nhuận tháng và nhân lực trung bình dự kiến.']],
    ],
  },
};

const RevenueForecast = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  return (
    <AppPageContainer title={text.title}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <Chip label={text.status} color="warning" variant="outlined" />
          <Typography variant="body1" color="text.secondary">{text.intro}</Typography>
        </Stack>
        <Alert severity="info">{text.note}</Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 2 }}>
          {text.sections.map(([title, items]) => (
            <Paper key={title} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}>
                {items.map((item) => <Typography component="li" variant="body2" key={item} sx={{ mb: 0.75 }}>{item}</Typography>)}
              </Box>
            </Paper>
          ))}
        </Box>
      </Stack>
    </AppPageContainer>
  );
};

export default RevenueForecast;
