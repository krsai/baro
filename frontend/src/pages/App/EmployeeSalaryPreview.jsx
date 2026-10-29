import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { currentVersionMonth } from '../../utils/versionApplication.mjs';
import { resolveLocalizedAttributeName } from '../../utils/appLanguage';
import { getPayTypeLabel } from '../../constants/payType';
import { ui } from '../../theme/ui';

const TEXT = {
  ko: {title:'직원별 예상 급여',month:'기준 월',all:'전체 직원 보기',close:'닫기',retry:'다시 시도',empty:'해당 직원이 없습니다.',name:'직원',grade:'직급',type:'급여 타입',days:'근무일수',hours:'정규 시간',tenure:'근속수당 대상',yes:'대상',no:'미대상',total:'합계',subtotal:'확인된 소계',excluded:'급여 제외',error:'계산 근거 확인 필요',unknown:'확인 필요',notice:'선택한 월의 적용 급여 버전으로 계산한 세전 추정액입니다. 만근·정시 근무, 야근·휴일근무 0시간, 근속 0년을 가정합니다. 생산수당은 정규 근무시간만큼 생산한 경우(100%)이며 실제 급여명세서를 생성하지 않습니다.',tenureNote:'근속수당은 전년도에 6개월 이상 재직한 직원만 대상입니다. 이번 표는 근속 0년으로 계산합니다.',unassigned:'공장 미지정 직원: ',break:'휴게',minutes:'분',hoursUnit:'시간',daysUnit:'일',unpaid:'지급 월 아님',ineligible:'전년도 재직 6개월 미만',notApplicable:'미적용',missingRate:'직급 단가 미설정',missingProduction:'공장 생산 단가 미설정',badFormula:'계산식 확인 필요',unsaved:'저장·월별 적용된 버전 기준이며, 설정 화면의 미저장 변경은 반영하지 않습니다.'},
  en: {title:'Employee salary estimate',month:'Month',all:'Show all employees',close:'Close',retry:'Try again',empty:'No employees found.',name:'Employee',grade:'Grade',type:'Pay type',days:'Workdays',hours:'Regular hours',tenure:'Seniority eligible',yes:'Eligible',no:'Ineligible',total:'Total',subtotal:'Known subtotal',excluded:'Payroll excluded',error:'Check calculation basis',unknown:'Check required',notice:'Gross estimate using the salary version effective in the selected month. Assumes full attendance, regular hours, zero overtime/holiday hours and zero tenure years. Production allowance assumes production equal to regular working time (100%). No payslip is created.',tenureNote:'Seniority allowance requires at least six months of employment in the previous year. This estimate uses zero tenure years.',unassigned:'Employees without a factory: ',break:'Break',minutes:'min',hoursUnit:'h',daysUnit:'days',unpaid:'Not a payment month',ineligible:'Under six months in the previous year',notApplicable:'Not applicable',missingRate:'Grade rate missing',missingProduction:'Factory production rate missing',badFormula:'Check formula',unsaved:'Uses saved, effective versions; unsaved settings are not included.'},
  vi: {title:'Lương dự kiến theo nhân viên',month:'Tháng',all:'Hiện tất cả nhân viên',close:'Đóng',retry:'Thử lại',empty:'Không có nhân viên.',name:'Nhân viên',grade:'Cấp bậc',type:'Loại lương',days:'Ngày công',hours:'Giờ chính thức',tenure:'Đủ điều kiện thâm niên',yes:'Đủ điều kiện',no:'Không đủ',total:'Tổng',subtotal:'Tạm tính đã xác định',excluded:'Không tính lương',error:'Cần kiểm tra cơ sở tính',unknown:'Cần kiểm tra',notice:'Ước tính lương trước khấu trừ theo phiên bản có hiệu lực trong tháng. Giả định đủ công, làm đúng giờ, không tăng ca/ngày lễ và thâm niên 0 năm. Phụ cấp sản lượng giả định sản xuất bằng thời gian làm việc tiêu chuẩn (100%). Không tạo phiếu lương.',tenureNote:'Phụ cấp thâm niên chỉ dành cho người làm ít nhất 6 tháng trong năm trước. Bảng này dùng thâm niên 0 năm.',unassigned:'Nhân viên chưa có nhà máy: ',break:'Nghỉ',minutes:'phút',hoursUnit:'giờ',daysUnit:'ngày',unpaid:'Chưa đến tháng trả',ineligible:'Làm dưới 6 tháng trong năm trước',notApplicable:'Không áp dụng',missingRate:'Chưa có đơn giá cấp bậc',missingProduction:'Chưa có đơn giá sản xuất',badFormula:'Kiểm tra công thức',unsaved:'Dùng phiên bản đã lưu và có hiệu lực; không gồm thay đổi chưa lưu.'},
};
const WEEKDAYS = {ko:['월','화','수','목','금','토','일'],en:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],vi:['T2','T3','T4','T5','T6','T7','CN']};

export default function EmployeeSalaryPreview({open,onClose,orgId,languageCode}) {
  const text=TEXT[languageCode] || TEXT.en;
  const [month,setMonth]=useState(currentVersionMonth),[all,setAll]=useState(false),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
  useEffect(()=>{
    if(!open || !orgId) return;
    let cancelled=false;const controller=new AbortController();
    setLoading(true);setError(false);setData(null);
    requestJSON('/salary-system/employee-preview'+buildQueryString({orgId,month,includeInactive:all?'1':'0'}),{signal:controller.signal,forceRefresh:true})
      .then(value=>{if(!cancelled)setData(value);}).catch(()=>{if(!cancelled)setError(true);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;controller.abort();};
  },[open,orgId,month,all,reload]);
  const money=value=>value===null?text.unknown:value===0?'—':Number(value).toLocaleString(languageCode);
  const reasonText=reason=>({NOT_APPLICABLE:text.notApplicable,PAYROLL_EXCLUDED:text.excluded,NOT_PAYMENT_MONTH:text.unpaid,TENURE_INELIGIBLE:text.ineligible,MISSING_RATE:text.missingRate,MISSING_PRODUCTION_RATE:text.missingProduction,INVALID_FORMULA:text.badFormula}[reason] || '');
  const sticky={position:'sticky',left:0,zIndex:1,bgcolor:ui.color.surface,minWidth:160};
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" aria-labelledby="employee-salary-preview-title">
    <DialogTitle id="employee-salary-preview-title">{text.title}</DialogTitle>
    <DialogContent dividers>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{mb:2}}>
        <TextField size="small" type="month" label={text.month} value={month} onChange={e=>{if(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.target.value))setMonth(e.target.value);}} InputLabelProps={{shrink:true}} />
        <FormControlLabel control={<Checkbox checked={all} onChange={e=>setAll(e.target.checked)} />} label={text.all} />
      </Stack>
      <Alert severity="info" sx={{mb:2}}>{text.notice}<br/>{text.tenureNote}<br/>{text.unsaved}</Alert>
      {loading && <Box sx={{p:3,textAlign:'center'}}><CircularProgress size={24}/></Box>}
      {error && <Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{text.retry}</Button>}>{text.error}</Alert>}
      {data?.unassigned?.length>0 && <Alert severity="warning" sx={{mb:2}}>{text.unassigned}{data.unassigned.map(row=>row.name).join(', ')}</Alert>}
      {data && !data.factories?.length && <Typography>{text.empty}</Typography>}
      {data?.factories?.map(factory=><Paper key={factory.id} variant="outlined" sx={{mb:2}} data-employee-salary-factory={factory.id}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{p:2}}><Typography fontWeight={600}>{factory.name} · {factory.currencyCode}</Typography>{factory.versionNumber && <Chip size="small" variant="outlined" label={`Ver.${factory.versionNumber}`}/>}</Stack>
        <Stack spacing={0.5} sx={{px:2,pb:2}}>{factory.standards.map(policy=><Typography key={policy.payType} variant="caption" color="text.secondary" data-preview-standard={policy.payType}>
          {getPayTypeLabel(policy.payType,policy.payType,languageCode)}: {(WEEKDAYS[languageCode] || WEEKDAYS.en).filter((_,index)=>policy.workWeekdays.includes(index+1)).join(' · ')} / {policy.standardClockIn}–{policy.standardClockOut} ({text.break} {policy.breakMinutes}{text.minutes}) / {policy.scheduledWorkdays}{text.daysUnit} · {policy.regularHours}{text.hoursUnit}
        </Typography>)}</Stack>
        <TableContainer sx={{overflowX:'auto'}}><Table size="small" sx={{minWidth:1000}}><TableHead><TableRow>
          <TableCell sx={{...sticky,bgcolor:ui.color.header}}>{text.name}</TableCell><TableCell>{text.grade}</TableCell><TableCell>{text.type}</TableCell><TableCell align="right">{text.days}</TableCell><TableCell align="right">{text.hours}</TableCell><TableCell>{text.tenure}</TableCell>
          {factory.items.map(item=><TableCell key={item.code || item.id} align="right">{resolveLocalizedAttributeName(item,languageCode)}</TableCell>)}<TableCell align="right">{text.total}</TableCell>
        </TableRow></TableHead><TableBody>{factory.employees.map(employee=><TableRow key={employee.id} hover data-preview-employee={employee.id}>
          <TableCell sx={sticky}><Typography variant="body2" fontWeight={600}>{employee.name}</Typography><Typography variant="caption" color="text.secondary">{employee.employeeNo}</Typography>{employee.payrollExcluded && <Typography variant="caption" display="block" color="text.secondary">{text.excluded}</Typography>}</TableCell>
          <TableCell sx={{whiteSpace:'nowrap'}}>{resolveLocalizedAttributeName(employee.grade || {},languageCode)}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{getPayTypeLabel(employee.payType,employee.payType,languageCode)}</TableCell><TableCell align="right">{employee.scheduledWorkdays}</TableCell><TableCell align="right">{employee.regularHours}</TableCell><TableCell>{employee.tenureEligible?text.yes:text.no}</TableCell>
          {employee.salaryItems.map(item=><TableCell key={item.code} align="right" sx={{whiteSpace:'nowrap'}} data-preview-item={item.code}><Tooltip title={reasonText(item.reason)}><span>{money(item.amount)}</span></Tooltip></TableCell>)}
          <TableCell align="right" sx={{fontWeight:600,whiteSpace:'nowrap'}}>{money(employee.total)}{employee.total===null && <Typography variant="caption" display="block">{text.subtotal}: {money(employee.subtotal)}</Typography>}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
      </Paper>)}
    </DialogContent><DialogActions><Button onClick={onClose}>{text.close}</Button></DialogActions>
  </Dialog>;
}
