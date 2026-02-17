import { buildQueryString, requestJSON } from './apiClient';

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeAttributeItem = (item = {}) => ({
  id: item.id ?? null,
  code: String(item.code ?? '').trim(),
  name: String(item.name ?? '').trim(),
});

const normalizeAttributes = (data = {}) => ({
  colors: normalizeArray(data?.colors).map(normalizeAttributeItem),
  categories: normalizeArray(data?.categories).map(normalizeAttributeItem),
  roles: normalizeArray(data?.roles).map(normalizeAttributeItem),
  processes: normalizeArray(data?.processes).map(normalizeAttributeItem),
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
  return normalized;
};

const normalizeAttributePayload = (payload = {}) => {
  const normalized = {};
  const keys = ['colors', 'categories', 'roles', 'processes'];
  keys.forEach((key) => {
    if (!Array.isArray(payload?.[key])) return;
    normalized[key] = payload[key].map((item = {}) => ({
      id: item.id ?? undefined,
      code: String(item.code ?? '').trim(),
      name: String(item.name ?? '').trim(),
    }));
  });
  return normalized;
};

export const fetchAttributes = async (options = {}) => {
  const orgId = Number(options?.orgId);
  const hasOrgFilter = Number.isFinite(orgId);
  const data = await requestJSON(
    `/attributes${buildQueryString({
      orgId: hasOrgFilter ? orgId : undefined,
    })}`
  );
  return normalizeAttributes(data);
};

export const updateAttributes = async (payload, options = {}) => {
  const orgId = Number(options?.orgId);
  const hasOrgFilter = Number.isFinite(orgId);
  const body = normalizeAttributePayload(payload);
  const data = await requestJSON(
    `/attributes${buildQueryString({
      orgId: hasOrgFilter ? orgId : undefined,
    })}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return normalizePartialAttributes(data);
};

export const fetchProcessAttributes = async (options = {}) => {
  const data = await fetchAttributes(options);
  return data.processes;
};
