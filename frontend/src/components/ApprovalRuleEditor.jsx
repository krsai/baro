import React from 'react';
import {Alert,Button,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import DecimalAmountField from './DecimalAmountField';
export const approvalRuleText={
 ko:{title:'비용 결재 규칙',hint:'위에서 처음 일치하는 규칙을 적용합니다. 금액은 VAT 포함 통화별 합계이며 최소·최대 금액을 포함합니다. 새 설정은 이후 생성되는 결재건부터 적용됩니다. 일치하는 규칙이 없으면 기본 한도를 사용합니다.',name:'규칙 이름',drafter:'기안자 역할',grade:'직급',any:'전체 직급',currency:'통화',min:'최소 금액',max:'최대 금액 (빈칸: 제한 없음)',stages:'결재 순서',add:'규칙 추가',example:'예시 추가: 운영 → 회계 → 관리자',addStage:'결재 단계 추가',remove:'삭제',up:'위로',down:'아래로',OPERATOR:'운영',ACCOUNTANT:'회계',ADMIN:'관리자',required:'직급 선택',error:'규칙 조건·직급·결재 순서를 확인해 주세요. 운영자 기안에는 회계 결재가 필요합니다.',changed:'다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 확인해 주세요.'},
 en:{title:'Expense approval rules',hint:'The first matching rule applies. Bounds are inclusive and use tax-inclusive totals per currency. Changes apply only to requests created after saving. Unmatched requests use the default limits.',name:'Rule name',drafter:'Drafter role',grade:'Grade',any:'All grades',currency:'Currency',min:'Minimum amount',max:'Maximum (blank: unlimited)',stages:'Approval order',add:'Add rule',example:'Add example: operations → accounting → admin',addStage:'Add stage',remove:'Remove',up:'Up',down:'Down',OPERATOR:'Operations',ACCOUNTANT:'Accounting',ADMIN:'Administrator',required:'Select grade',error:'Check conditions, grades and approval order. Operator requests require accounting approval.',changed:'Another administrator changed these settings. Reload and review.'},
 vi:{title:'Quy tắc duyệt chi phí',hint:'Áp dụng quy tắc khớp đầu tiên từ trên xuống. Khoảng tiền bao gồm hai đầu, tính tổng có VAT theo loại tiền. Chỉ áp dụng cho đề nghị tạo sau khi lưu. Nếu không khớp, dùng hạn mức mặc định.',name:'Tên quy tắc',drafter:'Vai trò người lập',grade:'Chức danh',any:'Tất cả chức danh',currency:'Tiền tệ',min:'Số tiền tối thiểu',max:'Tối đa (trống: không giới hạn)',stages:'Thứ tự duyệt',add:'Thêm quy tắc',example:'Ví dụ: vận hành → kế toán → quản trị',addStage:'Thêm bước',remove:'Xóa',up:'Lên',down:'Xuống',OPERATOR:'Vận hành',ACCOUNTANT:'Kế toán',ADMIN:'Quản trị viên',required:'Chọn chức danh',error:'Kiểm tra điều kiện, chức danh và thứ tự duyệt. Đề nghị vận hành cần kế toán duyệt.',changed:'Quản trị viên khác đã thay đổi cài đặt. Tải lại để kiểm tra.'},
};
approvalRuleText.ko.noAmountHint='이 결재 구분은 금액 없이 기안자의 역할·직급과 결재 순서로 규칙을 적용합니다. 위에서 처음 일치하는 규칙을 사용합니다.';
approvalRuleText.en.noAmountHint='This subject uses drafter role, grade and ordered approvers without an amount. The first matching rule applies.';
approvalRuleText.vi.noAmountHint='Loại này áp dụng vai trò, chức danh người lập và thứ tự duyệt, không dùng số tiền. Áp dụng quy tắc khớp đầu tiên.';
export default function ApprovalRuleEditor({subject={hasAmount:true},rules,grades=[],onChange,disabled,languageCode}){
 const t=approvalRuleText[languageCode]||approvalRuleText.en;
 const gradeName=g=>g[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||g.name;
 const patch=(index,value)=>onChange(rules.map((row,i)=>i===index?{...row,...value}:row));
 const move=(rows,index,delta)=>{const next=[...rows];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;};
 const roleOptions=['OPERATOR','ACCOUNTANT','ADMIN'].map(role=><MenuItem key={role} value={role}>{t[role]}</MenuItem>);
 const gradeOptions=grades.map(g=><MenuItem key={g.id} value={g.id}>{gradeName(g)}</MenuItem>);
 const add=example=>{const grade=code=>grades.find(g=>g.code===code)?.id||null;onChange([...rules,{id:crypto.randomUUID(),name:t.title+' '+(rules.length+1),drafterRole:'OPERATOR',drafterGradeId:example?grade('CL1'):null,currency:'USD',min:example?'5000':'0',max:'',stages:example?[{role:'OPERATOR',gradeId:grade('CL3')},{role:'ACCOUNTANT',gradeId:grade('CL2')},{role:'ADMIN',gradeId:null}]:[{role:'ACCOUNTANT',gradeId:grade('CL2')}]}]);};
 return <Stack spacing={2}><Typography variant="h6">{t.title}</Typography><Alert severity="info">{subject.hasAmount?t.hint:t.noAmountHint}</Alert>
 {rules.map((rule,index)=><Paper data-approval-rule={index} key={rule.id} variant="outlined" sx={{p:2}}><Stack spacing={1.5}>
 <Stack direction="row" spacing={1}><TextField fullWidth label={t.name} value={rule.name} disabled={disabled} onChange={e=>patch(index,{name:e.target.value})}/><Button disabled={disabled||!index} onClick={()=>onChange(move(rules,index,-1))}>{t.up}</Button><Button disabled={disabled||index===rules.length-1} onClick={()=>onChange(move(rules,index,1))}>{t.down}</Button><Button color="error" disabled={disabled} onClick={()=>onChange(rules.filter((_,i)=>i!==index))}>{t.remove}</Button></Stack>
 <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
 <TextField fullWidth select label={t.drafter} value={rule.drafterRole} disabled={disabled} onChange={e=>patch(index,{drafterRole:e.target.value})}>{roleOptions}</TextField>
 <TextField fullWidth select label={t.grade} value={rule.drafterGradeId||''} disabled={disabled} onChange={e=>patch(index,{drafterGradeId:e.target.value||null})} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}}><MenuItem value="">{t.any}</MenuItem>{gradeOptions}</TextField>
 {subject.hasAmount&&<><TextField fullWidth select label={t.currency} value={rule.currency} disabled={disabled} onChange={e=>patch(index,{currency:e.target.value})}>{['USD','KRW','VND'].map(c=><MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
 <DecimalAmountField fullWidth label={t.min} value={rule.min} disabled={disabled} onValueChange={min=>patch(index,{min})}/><DecimalAmountField fullWidth label={t.max} value={rule.max??''} disabled={disabled} onValueChange={max=>patch(index,{max})}/></>}
 </Stack><Typography variant="subtitle2">{t.stages}</Typography>
 {rule.stages.map((stage,i)=><Stack data-approval-rule-stage={i} key={i} direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}><Typography>{i+1}</Typography>
 <TextField fullWidth select label={t.stages+' '+(i+1)} value={stage.role} disabled={disabled} onChange={e=>patch(index,{stages:rule.stages.map((s,j)=>j===i?{...s,role:e.target.value}:s)})}>{roleOptions}</TextField>
 <TextField fullWidth select label={t.grade} value={stage.gradeId||''} disabled={disabled} onChange={e=>patch(index,{stages:rule.stages.map((s,j)=>j===i?{...s,gradeId:e.target.value||null}:s)})} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}}><MenuItem value="">{stage.role==='ADMIN'?t.any:t.required}</MenuItem>{gradeOptions}</TextField>
 <Button disabled={disabled||!i} onClick={()=>patch(index,{stages:move(rule.stages,i,-1)})}>{t.up}</Button><Button disabled={disabled||i===rule.stages.length-1} onClick={()=>patch(index,{stages:move(rule.stages,i,1)})}>{t.down}</Button><Button color="error" disabled={disabled} onClick={()=>patch(index,{stages:rule.stages.filter((_,j)=>i!==j)})}>{t.remove}</Button></Stack>)}
 <Button disabled={disabled||rule.stages.length>=10} onClick={()=>patch(index,{stages:[...rule.stages,{role:'ACCOUNTANT',gradeId:null}]})}>{t.addStage}</Button>
 </Stack></Paper>)}
 <Stack direction="row" spacing={1}><Button disabled={disabled||rules.length>=30} onClick={()=>add(false)}>{t.add}</Button><Button onClick={()=>add(true)} disabled={disabled||rules.length>=30||!subject.hasAmount}>{t.example}</Button></Stack>
 </Stack>;
}
