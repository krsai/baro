import * as XLSX from 'xlsx';

export const buildWorkLogExportWorkbook = (logs) => {
  const workbook = XLSX.utils.book_new();
  const summary = [['Start Date', 'End Date', 'Factory', 'Workers', 'Records', 'Total CT (sec)', 'Note']];
  const details = [['Start Date', 'End Date', 'Factory', 'Worker / Vendor', 'Client', 'Order#', 'Style Code', 'Style', 'Process Code', 'Process', 'CT (sec/pcs)', 'Quantity', 'Total CT (sec)']];
  for (const log of logs) {
    const start = log.coverageStartDate || log.workDate || '';
    const end = log.coverageEndDate || log.workDate || '';
    summary.push([start, end, log.factoryName || '', log.workerCount ?? 0, log.itemCount ?? 0, log.totalCtSeconds ?? 0, log.note || '']);
    if (!Array.isArray(log.records)) throw new Error('WORK_LOG_DETAILS_MISSING');
    for (const record of log.records) {
      const ct = record.ctSeconds ?? 0;
      const quantity = record.quantity ?? 0;
      details.push([
        record.effectiveCoverageStartDate || start, record.effectiveCoverageEndDate || end,
        log.factoryName || '', record.workerName || '', record.customerName || '', record.orderNo || '',
        record.styleCode || '', record.styleName || '', record.processCode || '', record.processName || '',
        ct, quantity, ct * quantity,
      ]);
    }
  }
  for (const [name, rows] of [['Summary', summary], ['Work Records', details]]) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
};

export const downloadWorkLogs = (logs, dateFrom, dateTo) =>
  XLSX.writeFile(buildWorkLogExportWorkbook(logs), `work-records-${dateFrom}-${dateTo}.xlsx`);
