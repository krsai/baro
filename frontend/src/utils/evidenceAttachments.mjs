export const nasEvidence=item=>/^\/nas-evidence\/[a-f0-9-]{36}\//i.test(item?.path||'');
export function evidenceFileName(item){
 if(!nasEvidence(item))return item?.path||'';
 try{return decodeURIComponent(item.path.split('/').slice(3).join('/'));}catch{return item.path;}
}
export const evidenceAttachmentText={
 ko:{attach:'파일 첨부',download:'다운로드',notConfigured:'NAS 미연결',loading:'NAS 설정 확인 중',retry:'다시 시도',uploading:'파일 업로드 중',failed:'첨부 작업에 실패했습니다. 입력을 유지한 채 다시 시도해 주세요.',invalid:'PDF·JPG·PNG·WebP 파일을 최대 5MB까지 첨부할 수 있습니다.',unknown:'저장 결과를 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요.',tooMany:'증빙은 최대 50개까지 등록할 수 있습니다.'},
 en:{attach:'Attach File',download:'Download',notConfigured:'NAS Not Connected',loading:'Checking NAS Configuration',retry:'Retry',uploading:'Uploading File',failed:'The Attachment Operation Failed. Your Input Is Preserved. Please Retry.',invalid:'Attach A PDF, JPG, PNG Or WebP File Up To 5 MB.',unknown:'The Upload Result Is Unknown. Retry With The Same File.',tooMany:'You Can Register Up To 50 Evidence Files.'},
 vi:{attach:'Đính Kèm Tệp',download:'Tải Xuống',notConfigured:'NAS Chưa Kết Nối',loading:'Đang Kiểm Tra Cấu Hình NAS',retry:'Thử Lại',uploading:'Đang Tải Tệp Lên',failed:'Thao Tác Tệp Đính Kèm Thất Bại. Dữ Liệu Được Giữ Lại. Vui Lòng Thử Lại.',invalid:'Đính Kèm Tệp PDF, JPG, PNG Hoặc WebP Tối Đa 5 MB.',unknown:'Chưa Xác Định Kết Quả Tải Lên. Thử Lại Với Cùng Tệp.',tooMany:'Có Thể Đăng Ký Tối Đa 50 Tệp Chứng Từ.'},
};
export function readEvidenceFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});}
export function downloadEvidenceFile(file){
 const binary=atob(file.contentBase64),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.contentType}));
 const link=document.createElement('a');link.href=url;link.download=file.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
