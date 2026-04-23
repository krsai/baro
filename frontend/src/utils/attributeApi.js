import { buildQueryString, getRequestContext, requestJSON } from './apiClient';
import { buildAttributeSearchText, resolveLocalizedAttributeName } from './appLanguage';

const ATTRIBUTE_CACHE_TTL_MS = 30 * 1000;
const attributesCache = new Map();
const attributesInFlight = new Map();

const normalizeArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const getEffectiveAttributeOrgId = (value) => {
  const explicitOrgId = toPositiveOrgId(value);
  if (explicitOrgId !== null) return explicitOrgId;
  return toPositiveOrgId(getRequestContext().orgId);
};
const normalizePayType = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'CT' || normalized === 'FIXED' ? normalized : null;
};
const normalizeSortOrder = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTrimmedText = (value) => String(value ?? '').trim();

const resolveAttributeBaseName = (item = {}) => {
  const name = toTrimmedText(item?.name);
  const nameEn = toTrimmedText(item?.nameEn);
  const nameKo = toTrimmedText(item?.nameKo);
  const nameVi = toTrimmedText(item?.nameVi);
  return nameEn || name || nameKo || nameVi || '';
};

const normalizeAttributeItem = (item = {}) => {
  const normalized = {
    id: item.id ?? null,
    code: toTrimmedText(item.code),
    name: resolveAttributeBaseName(item),
    nameKo: toTrimmedText(item.nameKo),
    nameEn: toTrimmedText(item.nameEn) || toTrimmedText(item.name),
    nameVi: toTrimmedText(item.nameVi),
    defaultPayType: normalizePayType(item.defaultPayType),
    sortOrder: normalizeSortOrder(item.sortOrder),
  };

  return {
    ...normalized,
    displayName: resolveLocalizedAttributeName(normalized),
    searchText: buildAttributeSearchText(normalized),
  };
};

const normalizeAttributes = (data = {}) => ({
  colors: normalizeArray(data?.colors).map(normalizeAttributeItem),
  categories: normalizeArray(data?.categories).map(normalizeAttributeItem),
  roles: normalizeArray(data?.roles).map(normalizeAttributeItem),
  processes: normalizeArray(data?.processes).map(normalizeAttributeItem),
  canManageProcesses: data?.canManageProcesses !== false,
});

const normalizePartialAttributes = (data = {}) => {
  const normalized = {};
  if (Array.isArray(data?.colors)) {
    normalized.colors = data.colors.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.categories)) {
    normalized.categories = data.categories.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.roles)) {
    normalized.roles = data.roles.map(normalizeAttributeItem);
  }
  if (Array.isArray(data?.processes)) {
    normalized.processes = data.processes.map(normalizeAttributeItem);
  }
  if (typeof data?.canManageProcesses === 'boolean') {
    normalized.canManageProcesses = data.canManageProcesses;
  }
  return normalized;
};

const normalizeAttributePayload = (payload = {}) => {
  const normalized = {};
  const keys = ['colors', 'categories', 'roles', 'processes'];
  keys.forEach((key) => {
    if (!Array.isArray(payload?.[key])) return;
    normalized[key] = payload[key].map((item = {}) => ({
      id: item.id ?? undefined,
      code: toTrimmedText(item.code),
      name: resolveAttributeBaseName(item),
      nameKo: toTrimmedText(item.nameKo),
      nameEn: toTrimmedText(item.nameEn) || toTrimmedText(item.name),
      nameVi: toTrimmedText(item.nameVi),
      ...(key === 'roles'
        ? {
            defaultPayType: normalizePayType(item.defaultPayType) ?? 'FIXED',
            sortOrder: normalizeSortOrder(item.sortOrder),
          }
        : {}),
    }));
  });
  return normalized;
};

const PROCESS_MASTER_TYPE_BY_GROUP = {
  locations: 'LOCATION',
  targets: 'TARGET',
  targetSpecs: 'TARGET_SPEC',
  actions: 'ACTION',
  actionSpecs: 'ACTION_SPEC',
};

const normalizeProcessMasterCode = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const normalizeProcessMasterItem = (item = {}, defaultType = '') => ({
  id: item.id ?? null,
  type: String(item.type ?? defaultType).trim().toUpperCase(),
  code: normalizeProcessMasterCode(item.code),
  label: toTrimmedText(item.label ?? item.nameKo ?? item.nameEn ?? item.nameVi ?? item.name ?? item.value),
  nameKo: toTrimmedText(item.nameKo ?? item.label),
  nameEn: toTrimmedText(item.nameEn),
  nameVi: toTrimmedText(item.nameVi),
  sortOrder: normalizeSortOrder(item.sortOrder),
});

const normalizeProcessMasterData = (data = {}) => {
  const locations = normalizeArray(data?.locations ?? data?.parts).map((item) =>
    normalizeProcessMasterItem(item, 'LOCATION')
  );
  const targets = normalizeArray(data?.targets).map((item) =>
    normalizeProcessMasterItem(item, 'TARGET')
  );
  const targetSpecs = normalizeArray(data?.targetSpecs ?? data?.specs).map((item) =>
    normalizeProcessMasterItem(item, 'TARGET_SPEC')
  );
  const actions = normalizeArray(data?.actions).map((item) =>
    normalizeProcessMasterItem(item, 'ACTION')
  );
  const actionSpecs = normalizeArray(data?.actionSpecs).map((item) =>
    normalizeProcessMasterItem(item, 'ACTION_SPEC')
  );

  return {
    locations,
    targets,
    targetSpecs,
    actions,
    actionSpecs,
    // Backward compatibility for screens not migrated yet.
    parts: locations,
    specs: targetSpecs,
  };
};

const normalizeProcessMasterPayload = (payload = {}) => {
  const normalized = {};
  Object.entries(PROCESS_MASTER_TYPE_BY_GROUP).forEach(([groupKey, type]) => {
    const sourceRows =
      groupKey === 'locations'
        ? payload?.locations ?? payload?.parts
        : groupKey === 'targetSpecs'
          ? payload?.targetSpecs ?? payload?.specs
          : payload?.[groupKey];
    if (!Array.isArray(sourceRows)) return;
    normalized[groupKey] = sourceRows.map((item = {}, index) => ({
      id: item.id ?? undefined,
      type,
      code: normalizeProcessMasterCode(item.code),
      label: toTrimmedText(
        item.label ?? item.nameKo ?? item.nameEn ?? item.nameVi ?? item.name ?? item.value
      ),
      nameKo: toTrimmedText(item.nameKo ?? item.label),
      nameEn: toTrimmedText(item.nameEn),
      nameVi: toTrimmedText(item.nameVi),
      sortOrder: normalizeSortOrder(item.sortOrder) || index + 1,
    }));
  });

  if (!normalized.locations && Array.isArray(payload?.parts)) {
    normalized.locations = payload.parts.map((item = {}, index) => ({
      id: item.id ?? undefined,
      type: 'LOCATION',
      code: normalizeProcessMasterCode(item.code),
      label: toTrimmedText(
        item.label ?? item.nameKo ?? item.nameEn ?? item.nameVi ?? item.name ?? item.value
      ),
      nameKo: toTrimmedText(item.nameKo ?? item.label),
      nameEn: toTrimmedText(item.nameEn),
      nameVi: toTrimmedText(item.nameVi),
      sortOrder: normalizeSortOrder(item.sortOrder) || index + 1,
    }));
  }
  if (!normalized.targetSpecs && Array.isArray(payload?.specs)) {
    normalized.targetSpecs = payload.specs.map((item = {}, index) => ({
      id: item.id ?? undefined,
      type: 'TARGET_SPEC',
      code: normalizeProcessMasterCode(item.code),
      label: toTrimmedText(
        item.label ?? item.nameKo ?? item.nameEn ?? item.nameVi ?? item.name ?? item.value
      ),
      nameKo: toTrimmedText(item.nameKo ?? item.label),
      nameEn: toTrimmedText(item.nameEn),
      nameVi: toTrimmedText(item.nameVi),
      sortOrder: normalizeSortOrder(item.sortOrder) || index + 1,
    }));
  }

  return normalized;
};

const resolveAttributeSectionOptions = (options = {}) => ({
  includeColors: options?.includeColors !== false,
  includeCategories: options?.includeCategories !== false,
  includeRoles: options?.includeRoles !== false,
  includeProcesses: options?.includeProcesses !== false,
});

const toAttributeCacheBaseKey = (orgId, hasOrgFilter) =>
  hasOrgFilter ? `org:${orgId}` : 'global';
const toAttributeCacheKey = (orgId, hasOrgFilter, sectionOptions) => {
  const { includeColors, includeCategories, includeRoles, includeProcesses } =
    resolveAttributeSectionOptions(sectionOptions);
  return `${toAttributeCacheBaseKey(orgId, hasOrgFilter)}::sections:${
    includeColors ? '1' : '0'
  }${includeCategories ? '1' : '0'}${includeRoles ? '1' : '0'}${
    includeProcesses ? '1' : '0'
  }`;
};

const readFreshAttributesCache = (cacheKey) => {
  const cached = attributesCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > ATTRIBUTE_CACHE_TTL_MS) {
    attributesCache.delete(cacheKey);
    return null;
  }
  return cached.data;
};

const writeAttributesCache = (cacheKey, data) => {
  attributesCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
};

const clearAttributeCacheVariants = (orgId, hasOrgFilter) => {
  const cacheBaseKey = `${toAttributeCacheBaseKey(orgId, hasOrgFilter)}::`;
  for (const key of attributesCache.keys()) {
    if (key.startsWith(cacheBaseKey)) {
      attributesCache.delete(key);
    }
  }
  for (const key of attributesInFlight.keys()) {
    if (key.startsWith(cacheBaseKey)) {
      attributesInFlight.delete(key);
    }
  }
};

export const fetchAttributes = async (options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const { includeColors, includeCategories, includeRoles, includeProcesses } =
    resolveAttributeSectionOptions(options);
  const forceRefresh = Boolean(options?.forceRefresh);
  const skipGlobalLoading = Boolean(options?.skipGlobalLoading);
  const requestScheduler = options?.requestScheduler ?? null;
  const cacheKey = toAttributeCacheKey(orgId, hasOrgScope, {
    includeColors,
    includeCategories,
    includeRoles,
    includeProcesses,
  });
  const schedulerGroupId = String(requestScheduler?.groupId ?? '').trim();
  const schedulerScopeId = String(requestScheduler?.scopeId ?? '').trim();
  const inFlightKey =
    schedulerGroupId && schedulerScopeId
      ? `${cacheKey}::scope:${schedulerGroupId}:${schedulerScopeId}`
      : cacheKey;

  if (!forceRefresh) {
    const cached = readFreshAttributesCache(cacheKey);
    if (cached) return normalizeAttributes(cached);
    const inflight = attributesInFlight.get(inFlightKey);
    if (inflight) return inflight;
  }

  const requestPromise = (async () => {
    const data = await requestJSON(
      `/attributes${buildQueryString({
        orgId: hasOrgScope ? orgId : undefined,
        includeColors: includeColors ? undefined : 0,
        includeCategories: includeCategories ? undefined : 0,
        includeRoles: includeRoles ? undefined : 0,
        includeProcesses: includeProcesses ? undefined : 0,
      })}`,
      {
        skipGlobalLoading,
        requestScheduler,
        signal: options?.signal,
      }
    );
    writeAttributesCache(cacheKey, data);
    return normalizeAttributes(data);
  })();

  attributesInFlight.set(inFlightKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    attributesInFlight.delete(inFlightKey);
  }
};

export const updateAttributes = async (payload, options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const body = normalizeAttributePayload(payload);
  const data = await requestJSON(
    `/attributes${buildQueryString({
      orgId: hasOrgScope ? orgId : undefined,
    })}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const normalizedPartial = normalizePartialAttributes(data);
  clearAttributeCacheVariants(orgId, hasOrgScope);
  return normalizedPartial;
};

export const fetchProcessMasterOptions = async (options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const data = await requestJSON(
    `/process-master-options${buildQueryString({
      orgId: hasOrgScope ? orgId : undefined,
    })}`,
    { skipGlobalLoading: Boolean(options?.skipGlobalLoading) }
  );
  return normalizeProcessMasterData(data);
};

export const updateProcessMasterOptions = async (payload, options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const data = await requestJSON(
    `/process-master-options${buildQueryString({
      orgId: hasOrgScope ? orgId : undefined,
    })}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizeProcessMasterPayload(payload)),
      skipGlobalLoading: Boolean(options?.skipGlobalLoading),
    }
  );
  return normalizeProcessMasterData(data);
};

export const createColorAttribute = async (payload, options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const body = {
    code: toTrimmedText(payload?.code),
    name: resolveAttributeBaseName(payload),
    nameKo: toTrimmedText(payload?.nameKo),
    nameEn: toTrimmedText(payload?.nameEn) || toTrimmedText(payload?.name),
    nameVi: toTrimmedText(payload?.nameVi),
  };
  const data = await requestJSON(
    `/attributes/colors${buildQueryString({
      orgId: hasOrgScope ? orgId : undefined,
    })}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const normalizedColor = normalizeAttributeItem(data);
  clearAttributeCacheVariants(orgId, hasOrgScope);
  return normalizedColor;
};

export const fetchProcessAttributes = async (options = {}) => {
  const data = await fetchAttributes({
    ...options,
    includeColors: false,
    includeCategories: false,
    includeRoles: false,
    includeProcesses: true,
  });
  return data.processes;
};
