const STORAGE_KEY = 'baro:last-updater-by-path:v1';
const EVENT_NAME = 'baro:last-updater-changed';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const CANDIDATE_FIELD_KEYS = [
  'updatedBy',
  'updated_by',
  'ctUpdatedBy',
  'savedBy',
  'modifiedBy',
  'lastUpdatedBy',
];

export const normalizeUpdaterPath = (path) => {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0] || '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

const sanitizeUpdaterName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!text.includes('@')) return text;
  const [localPart] = text.split('@');
  return String(localPart || '').trim();
};

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const readStore = () => {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const writeStore = (nextStore) => {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
  } catch (_error) {
    // Ignore storage write errors.
  }
};

const extractUpdaterName = (value, depth = 0) => {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return sanitizeUpdaterName(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const found = extractUpdaterName(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  for (const key of CANDIDATE_FIELD_KEYS) {
    const found = extractUpdaterName(value[key], depth + 1);
    if (found) return found;
  }

  const values = Object.values(value);
  for (let index = 0; index < values.length; index += 1) {
    const nextValue = values[index];
    if (!nextValue || typeof nextValue !== 'object') continue;
    const found = extractUpdaterName(nextValue, depth + 1);
    if (found) return found;
  }

  return '';
};

export const getLastUpdaterNameForPath = (path) => {
  const store = readStore();
  const normalizedPath = normalizeUpdaterPath(path);
  return sanitizeUpdaterName(store[normalizedPath]);
};

export const setLastUpdaterNameForPath = (path, name) => {
  const normalizedPath = normalizeUpdaterPath(path);
  const normalizedName = sanitizeUpdaterName(name);
  if (!normalizedName) return '';

  const store = readStore();
  if (store[normalizedPath] === normalizedName) return normalizedName;
  const nextStore = { ...store, [normalizedPath]: normalizedName };
  writeStore(nextStore);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          path: normalizedPath,
          name: normalizedName,
        },
      })
    );
  }
  return normalizedName;
};

export const subscribeLastUpdater = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }
  const handleEvent = (event) => {
    listener(event?.detail || null);
  };
  window.addEventListener(EVENT_NAME, handleEvent);
  return () => {
    window.removeEventListener(EVENT_NAME, handleEvent);
  };
};

export const resolveUpdaterNameFromResponse = (responseData, fallbackUpdater = '') => {
  const fromResponse = extractUpdaterName(responseData);
  if (fromResponse) return fromResponse;
  return sanitizeUpdaterName(fallbackUpdater);
};

export const recordLastUpdaterForCurrentPath = ({
  method = 'GET',
  responseData = null,
  fallbackUpdater = '',
} = {}) => {
  const normalizedMethod = String(method || 'GET')
    .trim()
    .toUpperCase();
  if (!MUTATION_METHODS.has(normalizedMethod)) return;
  if (typeof window === 'undefined') return;

  const path = normalizeUpdaterPath(window.location.pathname || '/');
  const updaterName = resolveUpdaterNameFromResponse(responseData, fallbackUpdater);
  if (!updaterName) return;
  setLastUpdaterNameForPath(path, updaterName);
};
