import React from 'react';
import { Alert, Paper, Stack, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useLanguage } from '../../context/LanguageContext';

const TEXT = {
  ko: {
    title: '표준 공임 검토', description: '표준 공임 기준점 간 충돌과 검토 경고를 모아보는 메뉴입니다.',
    notice: '메뉴 자리만 먼저 만들었습니다. 표준 공임 검토 로직과 경고 목록은 다음 작업에서 연결하면 됩니다.',
    planned: '예정 기능:', item1: '1. 스타일+공정별 ST 기준점 비교',
    item2: '2. 수량 증가/감소 대비 ST 추세 이상 경고', item3: '3. 운영팀 수동 검토 대상 목록',
  },
  en: {
    title: 'Standard Review', description: 'Review conflicts and warnings between standard-time reference points.',
    notice: 'This menu is currently a placeholder. Standard-time review logic and warning lists will be connected in a future update.',
    planned: 'Planned features:', item1: '1. Compare ST reference points by style and process',
    item2: '2. Warn about unusual ST trends as quantity changes', item3: '3. List items requiring manual operations review',
  },
  vi: {
    title: 'Xem xét công chuẩn', description: 'Tổng hợp xung đột và cảnh báo giữa các mốc thời gian tiêu chuẩn.',
    notice: 'Menu này hiện mới là vị trí dự kiến. Logic xem xét công chuẩn và danh sách cảnh báo sẽ được kết nối trong bản cập nhật sau.',
    planned: 'Chức năng dự kiến:', item1: '1. So sánh mốc ST theo kiểu dáng và công đoạn',
    item2: '2. Cảnh báo xu hướng ST bất thường khi số lượng thay đổi', item3: '3. Danh sách cần đội vận hành xem xét thủ công',
  },
};

const StReview = () => {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.ko;
  return (
    <AppPageContainer header={<Stack spacing={0.5}><Typography variant="h5" sx={{ fontWeight: 700 }}>{text.title}</Typography><Typography variant="body2" color="text.secondary">{text.description}</Typography></Stack>}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}><Stack spacing={2}>
        <Alert severity="info">{text.notice}</Alert>
        <Typography variant="body2" color="text.secondary">{text.planned}</Typography>
        <Typography variant="body2" color="text.secondary">{text.item1}</Typography>
        <Typography variant="body2" color="text.secondary">{text.item2}</Typography>
        <Typography variant="body2" color="text.secondary">{text.item3}</Typography>
      </Stack></Paper>
    </AppPageContainer>
  );
};

export default StReview;
