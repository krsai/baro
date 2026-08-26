import { useEffect, useMemo, useState } from 'react';
import { Box, Divider, FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, Stack, Switch, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { canAccessPath } from '../../utils/accessControl';
import { readPersonalPreferences, writePersonalPreferences } from '../../utils/personalPreferences';

const COPY = {
  ko: { title: '개인 설정', startup: '로그인 시작 화면', startupHelp: '이 계정으로 로그인할 때 처음 열 화면을 설정합니다.', dashboard: '로그인 후 대시보드 자동 열기', dashboardHelp: '끄면 빈 작업 공간에서 시작하며 필요한 메뉴를 직접 열 수 있습니다.', dashboardUnavailable: '현재 계정에는 대시보드 접근 권한이 없어 사용할 수 없습니다.', display: '화면 표시', language: '표시 언어', languageHelp: '메뉴와 지원되는 화면의 언어가 즉시 변경됩니다.', saved: '개인 설정을 저장했습니다.' },
  en: { title: 'Personal Settings', startup: 'Login start page', startupHelp: 'Choose the first screen shown when you sign in with this account.', dashboard: 'Open Dashboard after login', dashboardHelp: 'When off, you will start in an empty workspace and open a menu yourself.', dashboardUnavailable: 'This account does not have access to the Dashboard.', display: 'Display', language: 'Display language', languageHelp: 'Menus and supported screens change language immediately.', saved: 'Personal settings saved.' },
  vi: { title: 'Cài đặt cá nhân', startup: 'Màn hình khi đăng nhập', startupHelp: 'Chọn màn hình đầu tiên khi đăng nhập bằng tài khoản này.', dashboard: 'Tự động mở Bảng điều khiển', dashboardHelp: 'Khi tắt, ứng dụng bắt đầu tại vùng làm việc trống.', dashboardUnavailable: 'Tài khoản này không có quyền truy cập Bảng điều khiển.', display: 'Hiển thị', language: 'Ngôn ngữ hiển thị', languageHelp: 'Menu và các màn hình được hỗ trợ sẽ đổi ngôn ngữ ngay.', saved: 'Đã lưu cài đặt cá nhân.' },
};

const PersonalSettings = () => {
  const { activeProfile, accessProfile, devBypass, devProfile, isAuthenticated, user } = useAuth();
  const { languageCode, setLanguageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const text = COPY[languageCode] || COPY.en;
  const [preferences, setPreferences] = useState(() => readPersonalPreferences(activeProfile, user));
  useEffect(() => {
    setPreferences(readPersonalPreferences(activeProfile, user));
  }, [activeProfile, user]);
  const canOpenDashboard = useMemo(() => canAccessPath('/dashboard', { isAuthenticated, accessProfile, devBypass, devProfile }), [accessProfile, devBypass, devProfile, isAuthenticated]);

  const handleDashboardChange = (event) => {
    const next = { ...preferences, openDashboardOnLogin: event.target.checked };
    setPreferences(next);
    writePersonalPreferences(activeProfile, user, next);
    showNotification(text.saved, 'success');
  };

  return (
    <AppPageContainer title={text.title}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 820, borderRadius: 2 }}>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Box><Typography variant="h6" fontWeight={700}>{text.startup}</Typography><Typography variant="body2" color="text.secondary">{text.startupHelp}</Typography></Box>
          <FormControlLabel
            control={<Switch checked={preferences.openDashboardOnLogin && canOpenDashboard} disabled={!canOpenDashboard} onChange={handleDashboardChange} />}
            label={<Box><Typography fontWeight={600}>{text.dashboard}</Typography><Typography variant="body2" color="text.secondary">{canOpenDashboard ? text.dashboardHelp : text.dashboardUnavailable}</Typography></Box>}
            sx={{ alignItems: 'flex-start', m: 0, '& .MuiSwitch-root': { mr: 1 } }}
          />
          <Divider />
          <Box>
            <Typography variant="h6" fontWeight={700}>{text.display}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{text.languageHelp}</Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}><InputLabel>{text.language}</InputLabel><Select value={languageCode} label={text.language} onChange={(event) => setLanguageCode(event.target.value)}><MenuItem value="ko">한국어</MenuItem><MenuItem value="en">English</MenuItem><MenuItem value="vi">Tiếng Việt</MenuItem></Select></FormControl>
          </Box>
        </Stack>
      </Paper>
    </AppPageContainer>
  );
};

export default PersonalSettings;
