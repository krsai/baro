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

const mergeAttributeItem = (items = [], nextItem) => {
  const nextId = Number(nextItem?.id);
  const nextCode = String(nextItem?.code || '').trim();
  let replaced = false;

  const mergedItems = normalizeArray(items).map((item) => {
    const itemId = Number(item?.id);
    const sameId =
      Number.isInteger(nextId) &&
      nextId > 0 &&
      Number.isInteger(itemId) &&
      itemId === nextId;
    const sameCode = Boolean(nextCode) && String(item?.code || '').trim() === nextCode;
    if (!sameId && !sameCode) return item;
    replaced = true;
    return { ...item, ...nextItem };
  });

  if (replaced) return mergedItems;
  return [...mergedItems, nextItem];
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

const toAttributeCacheKey = (orgId, hasOrgFilter) =>
  hasOrgFilter ? `org:${orgId}` : 'global';

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

export const fetchAttributes = async (options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const forceRefresh = Boolean(options?.forceRefresh);
  const skipGlobalLoading = Boolean(options?.skipGlobalLoading);
  const requestScheduler = options?.requestScheduler ?? null;
  const cacheKey = toAttributeCacheKey(orgId, hasOrgScope);
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
      })}`,
      { skipGlobalLoading, requestScheduler }
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
  const cacheKey = toAttributeCacheKey(orgId, hasOrgScope);
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
  const previous = readFreshAttributesCache(cacheKey);
  if (previous) {
    const merged = {
      ...previous,
      ...data,
    };
    writeAttributesCache(cacheKey, merged);
  } else {
    attributesCache.delete(cacheKey);
  }
  attributesInFlight.delete(cacheKey);
  return normalizedPartial;
};

export const createColorAttribute = async (payload, options = {}) => {
  const orgId = getEffectiveAttributeOrgId(options?.orgId);
  const hasOrgScope = orgId !== null;
  const cacheKey = toAttributeCacheKey(orgId, hasOrgScope);
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
  const previous = readFreshAttributesCache(cacheKey);
  if (previous) {
    writeAttributesCache(cacheKey, {
      ...previous,
      colors: mergeAttributeItem(previous.colors, data),
    });
  } else {
    attributesCache.delete(cacheKey);
  }
  attributesInFlight.delete(cacheKey);
  return normalizedColor;
};

export const fetchProcessAttributes = async (options = {}) => {
  const data = await fetchAttributes(options);
  return data.processes;
};
