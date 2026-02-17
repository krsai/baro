import { buildQueryString, requestJSON } from './apiClient';

export const fetchOrders = async ({ orgId = null } = {}) => {
  const query = buildQueryString({ orgId });
  const data = await requestJSON('/orders' + query);
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
