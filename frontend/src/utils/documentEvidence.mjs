import {evidenceReference,validEvidencePath} from './evidenceReference.mjs';
import {nasEvidence} from './evidenceAttachments.mjs';
export const documentEvidenceText={
 ko:{title:'증빙',add:'증빙 추가',remove:'증빙 제거',reference:'증빙 번호',path:'증빙 파일 전체 경로',required:'관리번호에 연결할 증빙의 전체 경로를 확인해 주세요.'},
 en:{title:'Evidence',add:'Add Evidence',remove:'Remove Evidence',reference:'Evidence Number',path:'Full Evidence File Path',required:'Check The Full Paths Of The Evidence For This Document.'},
 vi:{title:'Chứng Từ',add:'Thêm Chứng Từ',remove:'Xóa Chứng Từ',reference:'Số Chứng Từ',path:'Đường Dẫn Đầy Đủ Của Tệp Chứng Từ',required:'Kiểm Tra Đường Dẫn Đầy Đủ Của Chứng Từ Cho Hồ Sơ Này.'},
};
export function documentEvidence(document,legacy=[]){
 if(Array.isArray(document?.evidenceFiles))return document.evidenceFiles;
 return [...new Map(legacy.map(item=>({path:item.details?.evidenceFile||item.evidenceNumber||'',reference:item.details?.reference||''})).filter(item=>item.path&&!item.path.startsWith('IBT:')).map(item=>[JSON.stringify(item),item])).values()];
}
export function validDocumentEvidence(items,previous=[]){
 const saved=new Set(previous.map(item=>JSON.stringify(item)));
 return Array.isArray(items)&&items.length<=50&&new Set(items.map(item=>JSON.stringify(item))).size===items.length&&items.every(item=>(nasEvidence(item)&&item.path.length<=500||validEvidencePath(item.path)||saved.has(JSON.stringify(item)))&&typeof item.reference==='string'&&item.reference.length<=500&&!/[\u0000-\u001f\u007f]/.test(item.reference));
}
export const normalizeEvidencePath=evidenceReference;
