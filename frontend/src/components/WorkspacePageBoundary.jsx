import React from 'react';
import { Button, Stack } from '@mui/material';
import AppNotice from './AppNotice';
import { useAppActions } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';

const TEXT = {
  ko: { failed: '화면을 불러오지 못했습니다. 배포 후 화면 파일이 변경되었거나 연결이 끊겼을 수 있습니다. 다른 탭의 입력을 저장한 후 최신 화면을 다시 불러와 주세요.', reload: '최신 화면 다시 불러오기' },
  en: { failed: 'Could not load this page. Its files may have changed after an update, or the connection may be unavailable. Save your work in other tabs before reloading.', reload: 'Reload latest page' },
  vi: { failed: 'Không thể tải trang. Tệp có thể đã thay đổi sau khi cập nhật hoặc kết nối bị gián đoạn. Hãy lưu dữ liệu ở các tab khác trước khi tải lại.', reload: 'Tải lại trang mới nhất' },
};

export class WorkspacePageErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    const text = TEXT[this.props.languageCode] || TEXT.en;
    return <Stack spacing={2} sx={{ p: 2 }} data-testid="workspace-page-load-error">
      <AppNotice severity="error">{text.failed}</AppNotice>
      <Button sx={{ alignSelf: 'flex-start' }} onClick={this.props.onReload}>{text.reload}</Button>
    </Stack>;
  }
}

export default function WorkspacePageBoundary({ children }) {
  const { languageCode } = useLanguage();
  const { confirmDiscardUnsavedChanges } = useAppActions();
  return <WorkspacePageErrorBoundary languageCode={languageCode} onReload={() => {
    if (confirmDiscardUnsavedChanges()) window.location.reload();
  }}>{children}</WorkspacePageErrorBoundary>;
}
