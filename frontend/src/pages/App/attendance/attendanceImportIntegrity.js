const key = value => String(value ?? '').trim().toLowerCase().replace(/đ/g, 'd')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_./-]+/g, '');
const provenanceHeaders = new Set(['nguondulieu', 'loaixuly', 'datasource', 'source', 'processingtype', 'recordsource', '입력방식', '데이터출처', '수정구분']);
const manualMarker = value => {
  const normalized = key(value);
  return ['manual', 'thucong', 'nhaptay', '수동', '직접입력'].some(token => normalized.includes(token))
    || ['edited', 'modified', 'chinhsua', 'dachinhsua', '수정됨'].includes(normalized);
};
const canonicalTimestamp = value => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(String(value ?? '').trim());
const TEXT = {
  ko: {
    blocked: count => `수동 입력·수정 표시 또는 자료 무결성 확인이 필요한 행 ${count}개를 발견하여 업로드를 차단했습니다. 수동 편집한 자료는 업로드할 수 없습니다. 출퇴근 기기에서 원본을 다시 내려받아 주세요.`,
    manual: '수동 입력·수정 표시', formula: '날짜·시각 셀에 수식 사용', format: '파일 안의 날짜·시각 형식 불일치 (수동 편집 여부 확인 필요)',
    row: number => `${number}행`, more: count => `외 ${count}개 행`,
  },
  en: {
    blocked: count => `Upload blocked: ${count} rows have manual-edit indicators or require an integrity check. Manually edited data cannot be uploaded. Export the original report again from the attendance device.`,
    manual: 'Manual input/edit indicator', formula: 'Formula in a date/time cell', format: 'Inconsistent date/time format within the file (check for manual edits)',
    row: number => `Row ${number}`, more: count => `${count} more rows`,
  },
  vi: {
    blocked: count => `Đã chặn tải lên: ${count} dòng có dấu hiệu nhập/sửa thủ công hoặc cần kiểm tra tính toàn vẹn. Không thể tải dữ liệu đã sửa thủ công. Vui lòng xuất lại báo cáo gốc từ máy chấm công.`,
    manual: 'Dấu hiệu nhập/sửa thủ công', formula: 'Ô ngày/giờ chứa công thức', format: 'Định dạng ngày/giờ không nhất quán trong tệp (cần kiểm tra chỉnh sửa thủ công)',
    row: number => `Dòng ${number}`, more: count => `Còn ${count} dòng`,
  },
};

// Report content is evidence, not proof of edit history. Workbook author/formatting
// and missing punches alone never identify manual edits.
export function assertAttendanceImportIntegrity({ rows, header, formulaAt, languageCode = 'ko' }) {
  const sourceColumns = rows[header.headerRowIndex].flatMap((value, index) => provenanceHeaders.has(key(value)) ? [index] : []);
  const timeColumns = (header.shape === 'event' ? [header.timestampIndex] : [header.dateIndex, header.clockInIndex, header.clockOutIndex]).filter(index => index >= 0);
  const candidates = rows.slice(header.headerRowIndex + 1).map((row, index) => ({ row, index: index + header.headerRowIndex + 1 }))
    .filter(({ row }) => timeColumns.some(column => String(row[column] ?? '').trim()));
  const standardCount = header.shape === 'event' ? candidates.filter(({ row }) => canonicalTimestamp(row[header.timestampIndex])).length : 0;
  const issues = [];
  for (const { row, index } of candidates) {
    const reasons = [];
    if (sourceColumns.some(column => manualMarker(row[column]))) reasons.push('manual');
    if (timeColumns.some(column => formulaAt(index, column))) reasons.push('formula');
    const timestamp = String(row[header.timestampIndex] ?? '').trim();
    if (header.shape === 'event' && standardCount > candidates.length / 2 && /^\d{4}-\d{1,2}-\d{1,2}\s/.test(timestamp) && !canonicalTimestamp(timestamp)) reasons.push('format');
    if (reasons.length) issues.push({ rowNumber: index + 1, reasons });
  }
  if (!issues.length) return;
  const text = TEXT[languageCode] || TEXT.en;
  const lines = issues.slice(0, 10).map(issue => `${text.row(issue.rowNumber)}: ${issue.reasons.map(reason => text[reason]).join(', ')}`);
  if (issues.length > 10) lines.push(text.more(issues.length - 10));
  const error = new Error([text.blocked(issues.length), ...lines].join('\n'));
  error.code = 'ATTENDANCE_FILE_INTEGRITY';
  error.issues = issues;
  throw error;
}
