const STORAGE_KEYS = {
  styles: 'baro_styles_v1',
  orders: 'baro_orders_v1',
  orderDraft: 'baro_order_draft_v1',
};

const getStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const readJSON = (key, fallback) => {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
};

export const loadStyles = () => {
  const data = readJSON(STORAGE_KEYS.styles, []);
  return Array.isArray(data) ? data : [];
};

export const saveStyle = (style) => {
  if (!style || !style.id) return loadStyles();
  const list = loadStyles();
  const index = list.findIndex((item) => item.id === style.id);
  const next = index >= 0 ? list.map((item, idx) => (idx === index ? style : item)) : [...list, style];
  writeJSON(STORAGE_KEYS.styles, next);
  return next;
};

export const loadOrders = () => {
  const data = readJSON(STORAGE_KEYS.orders, []);
  return Array.isArray(data) ? data : [];
};

export const saveOrders = (orders) => {
  const safe = Array.isArray(orders) ? orders : [];
  writeJSON(STORAGE_KEYS.orders, safe);
  return safe;
};

export const loadOrderDraft = () => readJSON(STORAGE_KEYS.orderDraft, null);

export const saveOrderDraft = (draft) => {
  if (!draft) return null;
  writeJSON(STORAGE_KEYS.orderDraft, draft);
  return draft;
};

export const clearOrderDraft = () => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEYS.orderDraft);
};

export { STORAGE_KEYS };
