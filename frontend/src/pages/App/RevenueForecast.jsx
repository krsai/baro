import React from 'react';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const TEXT = {
  ko: { title: '수익 예측', intro: '작업을 시작하기 전에 예상 작업기간과 비용을 계산하고, 얼마에 판매해야 적정한 수익을 남길 수 있는지 검토하는 화면입니다.', note: '현재는 화면의 목적과 향후 제공할 계산 항목을 안내합니다. 실제 견적 계산 기능은 원가 정책이 확정된 뒤 연결됩니다.', sections: [['예상 작업기간', '스타일, 수량, 공정별 ST와 생산능력을 기준으로 완료 예상일을 계산합니다.'], ['예상 생산비', '예상 투입시간과 생산수당, 고정비 등 확정된 원가 항목을 합산합니다.'], ['권장 판매가', '목표 이익률을 적용해 고객에게 제안할 판매가격을 계산합니다.'], ['예상 수익 비교', '수량, 납기, 판매가를 바꿔가며 예상 이익과 이익률을 비교합니다.']] },
  en: { title: 'Profit Forecast', intro: 'Before production starts, estimate the duration and cost and review the selling price needed to achieve a suitable profit.', note: 'This page currently explains its purpose and planned calculations. The estimate calculation will be connected after the costing policy is finalized.', sections: [['Estimated Duration', 'Calculate the expected completion date from style, quantity, process ST, and production capacity.'], ['Estimated Production Cost', 'Combine approved cost items such as expected labor time, production allowance, and fixed costs.'], ['Recommended Selling Price', 'Apply a target margin to calculate a price to propose to the customer.'], ['Forecast Comparison', 'Compare expected profit and margin while changing quantity, due date, and selling price.']] },
  vi: { title: 'Dự báo lợi nhuận', intro: 'Trước khi sản xuất, ước tính thời gian và chi phí, đồng thời xem xét giá bán cần thiết để đạt lợi nhuận phù hợp.', note: 'Hiện tại trang này giải thích mục đích và các phép tính dự kiến. Chức năng tính báo giá sẽ được kết nối sau khi chính sách giá thành được xác định.', sections: [['Thời gian dự kiến', 'Tính ngày hoàn thành dự kiến dựa trên kiểu dáng, số lượng, ST công đoạn và năng lực sản xuất.'], ['Chi phí sản xuất dự kiến', 'Tổng hợp các khoản chi phí đã xác định như thời gian lao động, phụ cấp sản lượng và chi phí cố định.'], ['Giá bán đề xuất', 'Áp dụng tỷ suất lợi nhuận mục tiêu để tính giá đề xuất cho khách hàng.'], ['So sánh dự báo', 'So sánh lợi nhuận và tỷ suất dự kiến khi thay đổi số lượng, hạn giao và giá bán.']] },
};

const RevenueForecast = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  return <AppPageContainer title={text.title}><Stack spacing={2.5}>
    <Alert severity="info">{text.note}</Alert>
    <Typography variant="body1" color="text.secondary">{text.intro}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
      {text.sections.map(([title, description]) => <Paper key={title} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}><Typography variant="subtitle1" fontWeight={700} gutterBottom>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Paper>)}
    </Box>
  </Stack></AppPageContainer>;
};
export default RevenueForecast;
