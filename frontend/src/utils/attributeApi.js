const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const toQuery = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

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

const requestJSON = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
};

export const fetchAttributes = async (options = {}) => {
  const orgId = Number(options?.orgId);
  const hasOrgFilter = Number.isFinite(orgId);
  const data = await requestJSON(
    `/attributes${toQuery({
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
    `/attributes${toQuery({
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
