const ORDER_MODIFICATION_LOCK_CHANGED_EVENT = 'baro:order-modification-lock-changed';
const ORDER_DELETED_EVENT = 'baro:order-deleted';

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

export const emitOrderModificationLockChanged = ({
  orgId = null,
  orderId = '',
  locked = false,
  source = '',
} = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return;

  window.dispatchEvent(
    new CustomEvent(ORDER_MODIFICATION_LOCK_CHANGED_EVENT, {
      detail: {
        orgId: toPositiveIntOrNull(orgId),
        orderId: normalizedOrderId,
        locked: Boolean(locked),
        source: String(source || '').trim(),
        at: Date.now(),
      },
    })
  );
};

export const subscribeOrderModificationLockChanged = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }
  const handleEvent = (event) => {
    listener(event?.detail || null);
  };
  window.addEventListener(ORDER_MODIFICATION_LOCK_CHANGED_EVENT, handleEvent);
  return () => {
    window.removeEventListener(ORDER_MODIFICATION_LOCK_CHANGED_EVENT, handleEvent);
  };
};

export const emitOrderDeleted = ({
  orgId = null,
  orderId = '',
  source = '',
} = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return;

  window.dispatchEvent(
    new CustomEvent(ORDER_DELETED_EVENT, {
      detail: {
        orgId: toPositiveIntOrNull(orgId),
        orderId: normalizedOrderId,
        source: String(source || '').trim(),
        at: Date.now(),
      },
    })
  );
};

export const subscribeOrderDeleted = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }
  const handleEvent = (event) => {
    listener(event?.detail || null);
  };
  window.addEventListener(ORDER_DELETED_EVENT, handleEvent);
  return () => {
    window.removeEventListener(ORDER_DELETED_EVENT, handleEvent);
  };
};
