const STORAGE_KEY = 'baro_work_logs_v2';

export const loadWorkLogs = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

export const saveWorkLogs = (logs) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(logs) ? logs : []));
};

export const appendWorkLog = (payload) => {
  const nextLog = {
    id: `work-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ctBasis: 'CT',
    ...payload,
  };
  const nextLogs = [nextLog, ...loadWorkLogs()];
  saveWorkLogs(nextLogs);
  return nextLog;
};

export const findWorkLogById = (workLogId) => {
  if (!workLogId) return null;
  return (
    loadWorkLogs().find((log) => String(log?.id || '') === String(workLogId)) ||
    null
  );
};

export const updateWorkLog = (workLogId, payload) => {
  if (!workLogId) return null;

  const logs = loadWorkLogs();
  let updatedLog = null;
  const nextLogs = logs.map((log) => {
    if (String(log?.id || '') !== String(workLogId)) return log;
    updatedLog = {
      ...log,
      ...payload,
      id: log.id,
      updatedAt: new Date().toISOString(),
    };
    return updatedLog;
  });

  if (!updatedLog) return null;
  saveWorkLogs(nextLogs);
  return updatedLog;
};
