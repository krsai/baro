import { buildQueryString, requestJSON } from './apiClient';

export const fetchOrders = async ({ orgId = null, forceRefresh = false } = {}) => {
  const query = buildQueryString({ orgId });
  const data = await requestJSON('/orders' + query, {
    forceRefresh: Boolean(forceRefresh),
  });
  return Array.isArray(data) ? data : [];
};

export const createOrder = async (payload, { orgId = null } = {}) => {
  const query = buildQueryString({ orgId });
  return requestJSON('/orders' + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
};

export const updateOrder = async (orderId, payload, { orgId = null } = {}) => {
  const query = buildQueryString({ orgId });
  return requestJSON(`/orders/${encodeURIComponent(orderId)}` + query, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
};

export const deleteOrder = async (orderId, { orgId = null } = {}) => {
  const query = buildQueryString({ orgId });
  return requestJSON(`/orders/${encodeURIComponent(orderId)}` + query, {
    method: 'DELETE',
  });
};

// Lock/unlock is a pure editing-permission flag on the backend now - it no
// longer releases/detaches assignments, so there is nothing for
// releaseAssignments/confirmPastAssignmentRelease to confirm anymore.
export const toggleOrderModificationLock = async (
  orderId,
  { locked, lockedBy = '' } = {},
  { orgId = null } = {}
) => {
  const query = buildQueryString({ orgId });
  return requestJSON(`/orders/${encodeURIComponent(orderId)}/modification-lock` + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locked: Boolean(locked),
      lockedBy,
    }),
  });
};
