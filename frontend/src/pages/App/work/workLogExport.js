import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

export const resolveWorkLogExportRange = (dateFrom, dateTo) => ({
  dateFrom: dayjs(dateFrom).startOf('month').format('YYYY-MM-DD'),
  dateTo: dayjs(dateTo).endOf('month').format('YYYY-MM-DD'),
});

export const buildWorkLogExportWorkbook = (logs) => {
  const workbook = XLSX.utils.book_new();
  const header = ['Start Date', 'End Date', 'Factory', 'Worker / Vendor', 'Client', 'Order#', 'Style Code', 'Style', 'Process Code', 'Process', 'CT (sec/pcs)', 'Quantity', 'Total CT (sec)', 'Note'];
  const months = new Map();
  for (const log of [...logs].sort((a, b) => String(a.coverageStartDate || a.workDate).localeCompare(String(b.coverageStartDate || b.workDate)))) {
    const start = log.coverageStartDate || log.workDate || '';
    const end = log.coverageEndDate || log.workDate || '';
    if (!Array.isArray(log.records)) throw new Error('WORK_LOG_DETAILS_MISSING');
    const month = String(start).slice(0, 7);
    if (!months.has(month)) months.set(month, [header]);
    const details = months.get(month);
    for (const record of log.records) {
      const ct = record.ctSeconds ?? 0;
      const quantity = record.quantity ?? 0;
      details.push([
        record.effectiveCoverageStartDate || start, record.effectiveCoverageEndDate || end,
        log.factoryName || '', record.workerName || '', record.customerName || '', record.orderNo || '',
        record.styleCode || '', record.styleName || '', record.processCode || '', record.processName || '',
        ct, quantity, ct * quantity, record.note || log.note || '',
      ]);
    }
  }
  if (!months.size) months.set('Work Records', [header]);
  for (const [name, rows] of months) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map(() => ({ wch: 22 }));
    sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
};

export const downloadWorkLogs = (logs, dateFrom, dateTo) => {
  const from = dateFrom.slice(0, 7);
  const to = dateTo.slice(0, 7);
  XLSX.writeFile(buildWorkLogExportWorkbook(logs), `work-records-${from}${from === to ? '' : `-${to}`}.xlsx`);
};
