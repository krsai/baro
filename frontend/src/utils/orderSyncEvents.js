const ORDER_MODIFICATION_LOCK_CHANGED_EVENT = 'baro:order-modification-lock-changed';

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

export const emitOrderModificationLockChanged = ({
  orgId = null,
  orderId = '',
  locked = false,
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
