import React from 'react';
import {Alert,Button,Stack} from '@mui/material';

const TEXT={
 ko:{failed:'상세 화면을 불러오지 못했습니다. 배포 후 화면 파일이 변경되었거나 연결이 끊겼을 수 있습니다. 최신 화면을 다시 불러온 후 알림을 열어 주세요.',reload:'최신 화면 다시 불러오기'},
 en:{failed:'Could not load the detail view. Its files may have changed after an update, or the connection may be unavailable. Reload the latest page, then open the alert again.',reload:'Reload latest page'},
 vi:{failed:'Không thể tải màn hình chi tiết. Tệp có thể đã thay đổi sau khi cập nhật hoặc kết nối bị gián đoạn. Hãy tải lại trang mới nhất rồi mở thông báo.',reload:'Tải lại trang mới nhất'},
};

export default class DashboardDocumentBoundary extends React.Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  const t=TEXT[this.props.languageCode]||TEXT.en;
  return <Stack spacing={2} data-testid="dashboard-document-load-error"><Alert severity="error">{t.failed}</Alert><Button sx={{alignSelf:'flex-start'}} onClick={this.props.onReload}>{t.reload}</Button></Stack>;
 }
}
