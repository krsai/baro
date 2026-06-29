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
const buildAssignmentDisplayKey = (assignment) => {
  const orderNo = toText(assignment?.orderNo);
  const label = toText(assignment?.label || assignment?.styleId);
  const assignmentQuantityText = toText(
    assignment?.finalQuantity ?? assignment?.assignmentQuantity
  );
  if (!orderNo && !label && !assignmentQuantityText) return '';
  return [orderNo, label, assignmentQuantityText].join('|');
};
const summarizeDuplicateAssignments = (assignments = []) => {
  const buckets = (Array.isArray(assignments) ? assignments : []).reduce((map, assignment) => {
    const displayKey = buildAssignmentDisplayKey(assignment);
    if (!displayKey) return map;
    const current = map.get(displayKey) || {
      displayKey,
      count: 0,
      assignmentIds: [],
      lineIds: [],
    };
    current.count += 1;
    const assignmentId = toText(assignment?.id || assignment?.externalId || assignment?.dbId);
    if (assignmentId) current.assignmentIds.push(assignmentId);
    const lineId = toText(assignment?.lineId);
    if (lineId) current.lineIds.push(lineId);
    map.set(displayKey, current);
    return map;
  }, new Map());

  return Array.from(buckets.values())
    .filter((entry) => entry.count > 1)
    .slice(0, 10);
};
const summarizeWorkLogRecords = (records = []) =>
  (Array.isArray(records) ? records : []).slice(0, 5).map((record, index) => ({
    index,
    workerId: record?.workerId ?? null,
    workerName: toText(record?.workerName),
    styleRefId: record?.styleRefId ?? record?.styleUid ?? record?.styleId ?? null,
    styleId: toText(record?.styleCode || record?.styleId),
    styleName: toText(record?.styleName),
    processId: record?.processId ?? null,
    processCode: toText(record?.processCode),
    quantity: Number(record?.quantity ?? 0) || 0,
    assignmentPlanId: record?.assignmentPlanId ?? null,
  }));
const buildWorkLogRecordDebugRows = (records = []) =>
  (Array.isArray(records) ? records : []).map((record, index) => ({
    index: index + 1,
    workerId: record?.workerId ?? null,
    workerName: toText(record?.workerName),
    assignmentPlanId: record?.assignmentPlanId ?? null,
    orderNo: toText(record?.orderNo),
    lineId: record?.lineId ?? null,
    styleRefId: record?.styleRefId ?? record?.styleUid ?? record?.styleId ?? null,
    styleId: toText(record?.styleCode || record?.styleId),
    styleName: toText(record?.styleName),
    processId: record?.processId ?? null,
    processCode: toText(record?.processCode),
    quantity: Number(record?.quantity ?? 0) || 0,
    ctSeconds: Number(record?.ctSeconds ?? 0) || 0,
  }));
const logWorkLogPayloadDebug = (label, payloadSummary, payload = {}) => {
  const rows = buildWorkLogRecordDebugRows(payload?.records);
  console.log(`[${label}] payload-summary`, payloadSummary);
  if (rows.length === 0) return;
  console.groupCollapsed(`[${label}] records (${rows.length})`);
  console.table(rows);
  console.groupEnd();
};
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
  });
  const data = await requestJSON('/work-logs' + query, buildReadRequestOptions(options));
  return Array.isArray(data) ? data : [];
};

export const appendWorkLog = async (payload, options = {}) => {
  const query = buildQueryString({ orgId: options?.orgId });
  const payloadSummary = summarizeWorkLogPayload(payload);
  console.log('[appendWorkLog] called', {
    orgId: options?.orgId ?? null,
    payload: payloadSummary,
  });
  logWorkLogPayloadDebug('appendWorkLog', payloadSummary, payload);
  try {
    const result = await requestJSON('/work-logs' + query, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    console.log('[appendWorkLog] success', {
      orgId: options?.orgId ?? null,
      workLogId: result?.id ?? null,
      recordCount: Array.isArray(result?.records) ? result.records.length : null,
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
  console.log('[loadWorkLogContext] called', {
    orgId: options?.orgId ?? null,
    factoryId: options?.factoryId ?? null,
    lineId: options?.lineId ?? null,
    workDate: options?.workDate ?? '',
    coverageStartDate: options?.coverageStartDate ?? '',
    debug: Boolean(options?.debug),
  });
  const query = buildQueryString({
    orgId: options?.orgId,
    factoryId: options?.factoryId,
    lineId: options?.lineId,
    workDate: options?.workDate,
    coverageStartDate: options?.coverageStartDate,
    debug: options?.debug ? 1 : undefined,
  });
  const result = await requestJSON(
    `/work-log-context${query}`,
    buildReadRequestOptions(options)
  );
  const workers = Array.isArray(result?.workers) ? result.workers : [];
  const assignments = Array.isArray(result?.assignments) ? result.assignments : [];
  console.log('[loadWorkLogContext] result', {
    workerCount: workers.length,
    assignmentCount: assignments.length,
    duplicateAssignments: summarizeDuplicateAssignments(assignments),
    previousCoverageEndDate: result?.previousCoverageEndDate ?? null,
    suggestedCoverageStartDate: result?.suggestedCoverageStartDate ?? null,
    isFirstLineWorkLog: Boolean(result?.isFirstLineWorkLog),
  });
  return result;
};

export const updateWorkLog = async (workLogId, payload, options = {}) => {
  if (!workLogId) return null;
  const payloadSummary = summarizeWorkLogPayload(payload);
  console.log('[updateWorkLog] called', {
    orgId: options?.orgId ?? null,
    workLogId,
    payload: payloadSummary,
  });
  logWorkLogPayloadDebug('updateWorkLog', payloadSummary, payload);
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    const result = await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    console.log('[updateWorkLog] success', {
      orgId: options?.orgId ?? null,
      workLogId: result?.id ?? workLogId,
      recordCount: Array.isArray(result?.records) ? result.records.length : null,
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
  console.log('[deleteWorkLog] called', {
    orgId: options?.orgId ?? null,
    workLogId,
  });
  try {
    const query = buildQueryString({ orgId: options?.orgId });
    await requestJSON(`/work-logs/${encodeURIComponent(workLogId)}` + query, {
      method: 'DELETE',
    });
    console.log('[deleteWorkLog] success', {
      orgId: options?.orgId ?? null,
      workLogId,
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
