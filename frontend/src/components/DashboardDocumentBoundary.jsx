import React from 'react';
import {Button,Stack} from '@mui/material';
import Alert from "./AppNotice";
import {isModuleLoadFailure} from '../utils/moduleLoadFailure.mjs';

const TEXT={
 ko:{failed:'상세 화면을 불러오지 못했습니다. 배포 후 화면 파일이 변경되었거나 연결이 끊겼을 수 있습니다. 최신 화면을 다시 불러온 후 알림을 열어 주세요.',reload:'최신 화면 다시 불러오기'},
 en:{failed:'Could not load the detail view. Its files may have changed after an update, or the connection may be unavailable. Reload the latest page, then open the alert again.',reload:'Reload latest page'},
 vi:{failed:'Không thể tải màn hình chi tiết. Tệp có thể đã thay đổi sau khi cập nhật hoặc kết nối bị gián đoạn. Hãy tải lại trang mới nhất rồi mở thông báo.',reload:'Tải lại trang mới nhất'},
};
const RENDER_TEXT={
 ko:{failed:'상세 화면을 표시하는 중 오류가 발생했습니다. 상세 화면을 다시 열어 주세요. 반복되면 최신 화면을 불러와 주세요.',retry:'상세 화면 다시 열기'},
 en:{failed:'An error occurred while displaying the detail view. Try opening it again. If the error persists, reload the latest page.',retry:'Reopen detail view'},
 vi:{failed:'Đã xảy ra lỗi khi hiển thị chi tiết. Hãy mở lại màn hình chi tiết. Nếu lỗi vẫn tiếp diễn, hãy tải lại trang mới nhất.',retry:'Mở lại chi tiết'},
};

export default class DashboardDocumentBoundary extends React.Component{
 state={failed:false,error:null};
 static getDerivedStateFromError(error){return {failed:true,error};}
 componentDidCatch(error,info){console.error('[DashboardDocumentBoundary]',error,info.componentStack);}
 retry=event=>{
  const dialog=event.currentTarget.closest('[role="dialog"]');
  this.setState({failed:false,error:null},()=>{
   const target=dialog?.querySelector('.MuiDialogActions-root button:not(:disabled)')||dialog;
   target?.focus({preventScroll:true});
  });
 };
 render(){
  if(!this.state.failed)return this.props.children;
  const t=TEXT[this.props.languageCode]||TEXT.en;
  const renderText=RENDER_TEXT[this.props.languageCode]||RENDER_TEXT.en,moduleFailure=isModuleLoadFailure(this.state.error);
  return <Stack spacing={2} data-testid="dashboard-document-load-error" data-error-kind={moduleFailure?'module':'render'}><Alert severity="error">{moduleFailure?t.failed:renderText.failed}</Alert><Stack direction="row" spacing={1} sx={{flexWrap:'wrap'}}>{!moduleFailure&&<Button onClick={this.retry}>{renderText.retry}</Button>}<Button onClick={this.props.onReload}>{t.reload}</Button></Stack></Stack>;
 }
}
