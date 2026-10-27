// Suspected omission, never proof of completion or a reason to invent records.
export function missingProcessRecords(processes: any[], options: { completed: boolean; invalidReferences: boolean }) {
  if (options.completed || options.invalidReferences) return [];
  const required = processes.filter(process => Number(process.applicableQuantity) > 0);
  if (required.length < 3 || required.some(process => !Number.isSafeInteger(process.styleProcessId) || process.styleProcessId <= 0 ||
    !Number.isFinite(Number(process.quantity)))) return [];
  const missing = required.filter(process => Number(process.quantity) === 0);
  const recorded = required.filter(process => Number(process.quantity) > 0);
  if (!missing.length || recorded.length <= missing.length ||
    recorded.some(process => Number(process.quantity) < Number(process.applicableQuantity))) return [];
  return missing.map(process => ({
    styleProcessId: process.styleProcessId, processCode: process.processCode,
    processName: process.processName, targetQuantity: Number(process.applicableQuantity),
    recordedQuantity: 0,
  }));
}
