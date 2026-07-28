import React from 'react';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const TEXT = {
  ko: { title: '수익 분석', intro: '생산이 끝난 뒤 실제 생산 실적을 기준으로 이번 달에 얼마를 벌었는지 확인하는 화면입니다.', note: '현재는 화면의 목적과 향후 제공할 지표를 안내합니다. 실제 손익 계산 기능은 데이터 기준이 확정된 뒤 연결됩니다.', sections: [['이번 달 생산 실적', '이번 달에 완료된 스타일과 실제 생산 수량을 확인합니다.'], ['실제 매출과 비용', '완료 생산분의 매출, 생산비와 기타 비용을 비교합니다.'], ['실제 수익', '매출에서 실제 비용을 제외한 이익과 이익률을 확인합니다.'], ['비교와 추세', '고객·스타일·공장별 손익과 월별 변화를 비교합니다.']] },
  en: { title: 'Profit Analysis', intro: 'Review how much was earned this month based on actual completed production.', note: 'This page currently explains its purpose and planned metrics. Actual profit calculations will be connected after the data rules are finalized.', sections: [['This Month’s Production', 'Review completed styles and actual production quantities for the month.'], ['Actual Revenue and Cost', 'Compare revenue, production costs, and other costs for completed output.'], ['Actual Profit', 'Review profit and margin after deducting actual costs from revenue.'], ['Comparison and Trends', 'Compare profit by customer, style, and factory, and review monthly changes.']] },
  vi: { title: 'Phân tích lợi nhuận', intro: 'Kiểm tra lợi nhuận thực tế trong tháng dựa trên sản lượng đã hoàn thành.', note: 'Hiện tại trang này giải thích mục đích và các chỉ số dự kiến. Chức năng tính lợi nhuận sẽ được kết nối sau khi quy tắc dữ liệu được xác định.', sections: [['Sản lượng tháng này', 'Xem các kiểu dáng đã hoàn thành và số lượng sản xuất thực tế trong tháng.'], ['Doanh thu và chi phí thực tế', 'So sánh doanh thu, chi phí sản xuất và các chi phí khác của sản lượng hoàn thành.'], ['Lợi nhuận thực tế', 'Xem lợi nhuận và tỷ suất sau khi trừ chi phí thực tế khỏi doanh thu.'], ['So sánh và xu hướng', 'So sánh lợi nhuận theo khách hàng, kiểu dáng, nhà máy và biến động theo tháng.']] },
};

const RevenueAnalysis = () => {
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
export default RevenueAnalysis;
