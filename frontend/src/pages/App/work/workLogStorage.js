import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from '../../../utils/workspaceDataEvents';

const buildReadRequestOptions = (options = {}) => ({
  skipGlobalLoading: Boolean(options?.skipGlobalLoading),
  skipCache: Boolean(options?.skipCache),
  forceRefresh: Boolean(options?.forceRefresh),
  ...(options?.signal ? { signal: options.signal } : {}),
  ...(options?.cacheTtlMs ? { cacheTtlMs: options.cacheTtlMs } : {}),
  ...(options?.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
});
const toText = (value) => String(value || '').trim();
const summarizeWorkLogRecords = (records = []) =>
  (Array.isArray(records) ? records : []).slice(0, 5).map((record, index) => ({
    index,
    workerId: record?.workerId ?? null,
    workerName: toText(record?.workerName),
    styleId: record?.styleRefId ?? record?.styleId ?? null,
    styleCode: toText(record?.styleCode),
    styleName: toText(record?.styleName),
    styleProcessId: record?.styleProcessId ?? null,
    processCode: toText(record?.processCode),
    quantity: Number(record?.quantity ?? 0) || 0,
    assignmentPlanId: record?.assignmentPlanId ?? null,
  }));
const summarizeWorkLogPayload = (payload = {}) => {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return {
    workDate: payload?.workDate ?? '',
    coverageStartDate: payload?.coverageStartDate ?? '',
    coverageEndDate: payload?.coverageEndDate ?? '',
    entryMode: payload?.entryMode ?? '',
    factoryId: payload?.factoryId ?? null,
    lineId: payload?.lineId ?? null,
    workerCount: payload?.workerCount ?? null,
    itemCount: payload?.itemCount ?? null,
    totalCtSeconds: payload?.totalCtSeconds ?? null,
    noteLength: toText(payload?.note).length,
    recordCount: records.length,
    recordsPreview: summarizeWorkLogRecords(records),
  };
};

const collectAssignmentIdsFromRecords = (records = []) =>
  Array.from(
    new Set(
      (Array.isArray(records) ? records : [])
        .map((record) => String(record?.assignmentPlanId || '').trim())
        .filter(Boolean)
    )
  );

const emitWorkLogWorkspaceDataChanged = ({ orgId, records = [], source = '' } = {}) => {
  emitWorkspaceDataChanged({
    orgId,
    topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD, WORKSPACE_DATA_TOPICS.ORDERS],
    assignmentIds: collectAssignmentIdsFromRecords(records),
    source: source || 'work-log',
  });
};

export const loadWorkLogs = async (options = {}) => {
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    workDate: options?.workDate,
    dateFrom: options?.dateFrom,
    dateTo: options?.dateTo,
    includeRecords:
      options?.includeRecords === undefined ? undefined : options.includeRecords ? 1 : 0,
    recordKind: options?.recordKind,
  });
  const data = await requestJSON('/work-logs' + query, buildReadRequestOptions(options));
  return Array.isArray(data) ? data : [];
};

export const appendWorkLog = async (payload, options = {}) => {
  const query = buildQueryString({ orgId: options?.orgId });
  const payloadSummary = summarizeWorkLogPayload(payload);
  try {
    const result = await requestJSON('/work-logs' + query, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    emitWorkLogWorkspaceDataChanged({
      orgId: options?.orgId,
      records: result?.records,
      source: 'work-log:create',
    });
    return result;
  } catch (error) {
    console.error('[appendWorkLog] error', {
      orgId: options?.orgId ?? null,
      status: error?.status ?? null,
      message: error?.message || String(error || ''),
      details: error?.details ?? null,
      payload: payloadSummary,
    });
    throw error;
  }
};

export const findWorkLogById = async (workLogId, options = {}) => {
  if (!workLogId) return null;
  try {
    const query = buildQueryString({
      orgId: options?.orgId,
      includeContext:
        options?.includeContext === undefined ? undefined : options.includeContext ? 1 : 0,
    });
    return await requestJSON(
      `/work-logs/${encodeURIComponent(workLogId)}` + query,
      buildReadRequestOptions(options)
    );
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

export const loadWorkLogContext = async (options = {}) => {
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    lineId: options?.lineId,
    workDate: options?.workDate,
    coverageStartDate: options?.coverageStartDate,
    debug: options?.debug ? 1 : undefined,
    recordKind: options?.recordKind,
  });
  const result = await requestJSON(
    `/work-log-context${query}`,
    buildReadRequestOptions(options)
  );
  const workers = Array.isArray(result?.workers) ? result.workers : [];
  const assignments = Array.isArray(result?.assignments) ? result.assignments : [];
  return result;
};

export const updateWorkLog = async (workLogId, payload, options = {}) => {
  if (!workLogId) return null;
  const payloadSummary = summarizeWorkLogPayload(payload);
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    const result = await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    emitWorkLogWorkspaceDataChanged({
      orgId: options?.orgId,
      records: result?.records,
      source: 'work-log:update',
    });
    return result;
  } catch (error) {
    if (error?.status === 404) return null;
    console.error('[updateWorkLog] error', {
      orgId: options?.orgId ?? null,
      workLogId,
      status: error?.status ?? null,
      message: error?.message || String(error || ''),
      details: error?.details ?? null,
      payload: payloadSummary,
    });
    throw error;
  }
};

export const deleteWorkLog = async (workLogId, options = {}) => {
  if (!workLogId) return false;
  const existingBeforeDelete = await findWorkLogById(workLogId, {
    orgId: options?.orgId,
    includeContext: false,
    skipGlobalLoading: true,
    skipCache: true,
    forceRefresh: true,
  });
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'DELETE',
    });
    emitWorkLogWorkspaceDataChanged({
      orgId: options?.orgId,
      records: existingBeforeDelete?.records,
      source: 'work-log:delete',
    });
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    console.error('[deleteWorkLog] error', {
      orgId: options?.orgId ?? null,
      workLogId,
      status: error?.status ?? null,
      message: error?.message || String(error || ''),
      details: error?.details ?? null,
    });
    throw error;
  }
};
