import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from '../../utils/workspaceDataEvents';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { SIZE_CODES } from '../../constants/productAttributes';
import { todayDateKey } from '../../utils/dateKey.mjs';

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const toNonNegativeIntOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^\d]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
};

const formatInt = (value) =>
  formatNumberWithCommas(Number(value), {
    fallback: '0',
    maximumFractionDigits: 0,
  });

const normalizeComparableText = (value) => String(value || '').trim().toLowerCase();

const parseAssignmentCardIdentity = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parts = raw.split('::');
  if (parts.length < 2) return null;
  const orderId = String(parts[0] || '').trim();
  const styleId = String(parts[1] || '').trim();
  if (!orderId || !styleId) return null;
  return { orderId, styleId };
};

const normalizeSizeKey = (value) => {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) return '';
  if (raw === 'XXL' || raw === '2X') return '2XL';
  if (raw === 'XXXL' || raw === '3X') return '3XL';
  if (raw === 'XXXXL' || raw === '4X') return '4XL';
  if (raw === 'FREE' || raw === 'FREESIZE' || raw === 'ONESIZE' || raw === 'ONESZ' || raw === 'F') {
    return 'FREE';
  }
  return raw;
};

const normalizeSizeQuantities = (value) => {
  const next = {};
  if (!value || typeof value !== 'object') return next;
  Object.entries(value).forEach(([rawKey, rawValue]) => {
    const sizeKey = normalizeSizeKey(rawKey);
    if (!sizeKey) return;
    const quantity = Math.max(0, Math.round(Number(rawValue) || 0));
    if (quantity <= 0) return;
    next[sizeKey] = quantity;
  });
  return next;
};

const sumSizeQuantityMap = (sizeMap = {}) =>
  Object.values(sizeMap).reduce((sum, value) => sum + (Number(value) || 0), 0);

const resolveSortedSizeKeys = (keys = []) => {
  const normalizedSizeOrder = SIZE_CODES.map((code) => normalizeSizeKey(code)).filter(Boolean);
  const indexBySize = new Map(normalizedSizeOrder.map((code, index) => [code, index]));
  return Array.from(new Set(keys.map((key) => normalizeSizeKey(key)).filter(Boolean))).sort((a, b) => {
    const aIndex = indexBySize.has(a) ? indexBySize.get(a) : Number.MAX_SAFE_INTEGER;
    const bIndex = indexBySize.has(b) ? indexBySize.get(b) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.localeCompare(b);
  });
};

const resolveStatusChip = (row) => {
  if (row.isCompleted) {
    return { label: '제작 완료', color: 'success', variant: 'filled' };
  }
  return { label: '검수 진행', color: 'warning', variant: 'outlined' };
};

const resolveDetailPassTotal = (detail) => {
  if (!detail || !Array.isArray(detail.variants) || !Array.isArray(detail.sizeKeys)) return 0;
  return detail.variants.reduce((rowSum, variant) => {
    const variantSum = detail.sizeKeys.reduce((sum, sizeKey) => {
      const value = toNonNegativeIntOrNull(variant?.passBySize?.[sizeKey]);
      return sum + (value || 0);
    }, 0);
    return rowSum + variantSum;
  }, 0);
};

const buildQcDetailFromOrders = ({ row, orders }) => {
  const identity =
    parseAssignmentCardIdentity(row?.cardId) || parseAssignmentCardIdentity(row?.originOrderId);
  const targetOrderId = String(identity?.orderId || '').trim();
  const targetStyleId = String(identity?.styleId || row?.styleId || '').trim();
  const targetStyleCode = String(row?.styleCode || '').trim();
  const targetOrderNo = String(row?.orderNo || '').trim();

  const matchesStyle = (item) => {
    const itemStyleId = String(item?.styleId || '').trim();
    const itemStyleCode = String(item?.styleCode || '').trim();
    if (targetStyleId && itemStyleId === targetStyleId) return true;
    if (targetStyleId && itemStyleCode === targetStyleId) return true;
    if (targetStyleCode && itemStyleCode === targetStyleCode) return true;
    return false;
  };

  let matchedOrder = null;
  if (targetOrderId) {
    matchedOrder =
      (Array.isArray(orders) ? orders : []).find(
        (order) => String(order?.id || '').trim() === targetOrderId
      ) || null;
  }
  if (!matchedOrder && targetOrderNo) {
    matchedOrder =
      (Array.isArray(orders) ? orders : []).find(
        (order) =>
          normalizeComparableText(order?.orderNumber) === normalizeComparableText(targetOrderNo) &&
          Array.isArray(order?.items) &&
          order.items.some((item) => matchesStyle(item))
      ) || null;
  }

  if (!matchedOrder) {
    return {
      matched: false,
      error: '주문 정보를 찾지 못했습니다.',
      orderNumber: targetOrderNo,
      sizeKeys: [],
      variants: [],
      orderedQuantity: 0,
    };
  }

  const matchedItems = (Array.isArray(matchedOrder?.items) ? matchedOrder.items : []).filter((item) =>
    matchesStyle(item)
  );
  if (matchedItems.length === 0) {
    return {
      matched: false,
      error: '주문에서 해당 스타일의 사이즈 정보를 찾지 못했습니다.',
      orderNumber: matchedOrder.orderNumber || targetOrderNo,
      sizeKeys: [],
      variants: [],
      orderedQuantity: 0,
    };
  }

  const variantMap = new Map();
  matchedItems.forEach((item, index) => {
    const colorName = String(item?.colorName || item?.colorCode || '미지정').trim() || '미지정';
    const gender = String(item?.gender || '').trim().toUpperCase();
    const variantKey = `${normalizeComparableText(colorName)}::${gender || '-'}::${item?.colorId || 0}`;
    const sizeQuantities = normalizeSizeQuantities(item?.sizeQuantities);
    const safeSizeQuantities = { ...sizeQuantities };
    const totalQuantityFromSizes = sumSizeQuantityMap(safeSizeQuantities);
    const totalQuantityFromItem = Math.max(0, Math.round(Number(item?.totalQuantity) || 0));
    if (totalQuantityFromSizes <= 0 && totalQuantityFromItem > 0) {
      safeSizeQuantities.FREE = totalQuantityFromItem;
    }

    const current = variantMap.get(variantKey) || {
      key: `${variantKey}::${index}`,
      colorId: toPositiveIntOrNull(item?.colorId),
      colorName,
      gender: gender || '-',
      orderedBySize: {},
      passBySize: {},
    };
    Object.entries(safeSizeQuantities).forEach(([sizeKey, quantity]) => {
      current.orderedBySize[sizeKey] = (current.orderedBySize[sizeKey] || 0) + (Number(quantity) || 0);
    });
    variantMap.set(variantKey, current);
  });

  let variants = Array.from(variantMap.values()).map((variant) => {
    const orderedBySize = { ...variant.orderedBySize };
    const passBySize = Object.keys(orderedBySize).reduce((acc, sizeKey) => {
      acc[sizeKey] = '0';
      return acc;
    }, {});
    return {
      ...variant,
      orderedBySize,
      passBySize,
      orderedQuantity: sumSizeQuantityMap(orderedBySize),
    };
  });

  if (variants.length === 0) {
    const fallbackQuantity = Math.max(0, Math.round(Number(row?.plannedQuantity) || 0));
    variants = [
      {
        key: 'fallback',
        colorId: null,
        colorName: '미지정',
        gender: '-',
        orderedBySize: { FREE: fallbackQuantity },
        passBySize: { FREE: '0' },
        orderedQuantity: fallbackQuantity,
      },
    ];
  }

  const orderedQuantity = variants.reduce((sum, variant) => sum + (Number(variant.orderedQuantity) || 0), 0);
  const resolvedSizeKeys = resolveSortedSizeKeys(
    variants.flatMap((variant) => Object.keys(variant.orderedBySize || {}))
  );
  const sizeKeys = resolvedSizeKeys.length > 0 ? resolvedSizeKeys : ['FREE'];

  variants = variants.map((variant) => {
    const passBySize = { ...variant.passBySize };
    sizeKeys.forEach((sizeKey) => {
      if (!Object.prototype.hasOwnProperty.call(passBySize, sizeKey)) {
        passBySize[sizeKey] = '0';
      }
    });
    return {
      ...variant,
      passBySize,
      orderedQuantity: sumSizeQuantityMap(variant.orderedBySize || {}),
    };
  });

  return {
    matched: true,
    error: '',
    orderId: matchedOrder.id || '',
    orderNumber: matchedOrder.orderNumber || targetOrderNo,
    styleId: targetStyleId,
    sizeKeys,
    variants,
    orderedQuantity,
  };
};

const QcReview = () => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const { showNotification } = useAppActions();
  const todayKey = useMemo(() => todayDateKey(), []);

  const [factories, setFactories] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState(toPositiveIntOrNull(activeFactoryId));
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingQcPlanId, setSavingQcPlanId] = useState(null);
  const [cancellingEventId, setCancellingEventId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [qcDetailByPlanId, setQcDetailByPlanId] = useState({});
  const [qcHistoryByPlanId, setQcHistoryByPlanId] = useState({});
  const [qcHistoryLoadingByPlanId, setQcHistoryLoadingByPlanId] = useState({});
  const [ordersCache, setOrdersCache] = useState({ loaded: false, rows: [] });
  const orderLoadPromiseRef = useRef(null);

  const lineNameById = useMemo(() => {
    const map = new Map();
    (Array.isArray(lines) ? lines : []).forEach((line) => {
      const id = toPositiveIntOrNull(line?.id);
      if (!id) return;
      map.set(id, String(line?.name || '').trim());
    });
    return map;
  }, [lines]);

  const loadFactories = useCallback(async () => {
    const query = buildQueryString({ orgId: activeOrgId });
    const response = await requestJSON(`/factories${query}`, { skipGlobalLoading: true }).catch(() => []);
    const safeRows = Array.isArray(response) ? response : [];
    const visibleRows =
      activeOrgRole === 'ADMIN' || !activeFactoryId
        ? safeRows
        : safeRows.filter((factory) => Number(factory?.id) === Number(activeFactoryId));
    setFactories(visibleRows);
    if (!toPositiveIntOrNull(selectedFactoryId) && visibleRows.length > 0) {
      setSelectedFactoryId(toPositiveIntOrNull(visibleRows[0]?.id));
    }
  }, [activeFactoryId, activeOrgId, activeOrgRole, selectedFactoryId]);

  const loadLines = useCallback(async () => {
    const factoryId = toPositiveIntOrNull(selectedFactoryId);
    if (!factoryId) {
      setLines([]);
      setSelectedLineId(null);
      return;
    }
    const query = buildQueryString({ orgId: activeOrgId, factoryId });
    const response = await requestJSON(`/lines${query}`, { skipGlobalLoading: true }).catch(() => []);
    const safeRows = Array.isArray(response) ? response : [];
    setLines(safeRows);
    setSelectedLineId((current) => {
      const currentId = toPositiveIntOrNull(current);
      if (!currentId) return null;
      const exists = safeRows.some((line) => Number(line?.id) === currentId);
      return exists ? currentId : null;
    });
  }, [activeOrgId, selectedFactoryId]);

  const loadRows = useCallback(
    async ({ forceRefresh = false } = {}) => {
      const factoryId = toPositiveIntOrNull(selectedFactoryId);
      if (!factoryId) {
        setRows([]);
        return;
      }

      setLoading(true);
      try {
        const plans = await requestJSON(
          '/assignment-plans' +
            buildQueryString({
              orgId: activeOrgId,
              factoryId,
              lineId: toPositiveIntOrNull(selectedLineId),
            }),
          { skipGlobalLoading: true, forceRefresh }
        );
        const safePlans = Array.isArray(plans) ? plans : [];
        const ids = safePlans.map((plan) => String(plan?.id || '').trim()).filter(Boolean);
        const progressRows =
          ids.length > 0
            ? await requestJSON(
                '/assignment-plan-progress' +
                  buildQueryString({
                    orgId: activeOrgId,
                    ids: ids.join(','),
                  }),
                { skipGlobalLoading: true, forceRefresh }
              ).catch(() => [])
            : [];
        const progressById = new Map(
          (Array.isArray(progressRows) ? progressRows : [])
            .map((progressRow) => [String(progressRow?.id || '').trim(), progressRow])
            .filter((entry) => entry[0])
        );

        setRows((prevRows) => {
          const draftById = new Map(
            (Array.isArray(prevRows) ? prevRows : [])
              .map((row) => [
                String(row?.id || '').trim(),
                {
                  qcPassQuantity: String(row?.qcPassQuantity || ''),
                  inspectionDate: String(row?.inspectionDate || '').trim() || todayKey,
                },
              ])
              .filter((entry) => entry[0])
          );
          return safePlans.map((plan) => {
            const id = String(plan?.id || '').trim();
            const progress = progressById.get(id) || {};
            const plannedQuantity = toNonNegativeIntOrNull(progress?.plannedQuantity ?? plan?.quantity) ?? 0;
            const producedQuantity = toNonNegativeIntOrNull(progress?.producedQuantity) ?? 0;
            const finalQuantity = toNonNegativeIntOrNull(progress?.finalQuantity ?? plan?.finalQuantity);
            const isCompleted = Boolean(progress?.isCompleted ?? plan?.isCompleted);
            const completedAt = progress?.completedAt || plan?.completedAt || null;
            const draft = draftById.get(id) || null;
            const qcPassedTotal =
              toNonNegativeIntOrNull(progress?.qcPassedTotal ?? plan?.qcPassedTotal) ??
              (isCompleted ? finalQuantity ?? 0 : 0);
            const latestQcDate =
              String(progress?.latestQcDate || plan?.latestQcDate || '').trim() || null;

            return {
              id,
              dbId: toPositiveIntOrNull(plan?.dbId),
              lineId: toPositiveIntOrNull(plan?.lineId),
              lineName:
                String(progress?.lineName || '').trim() ||
                lineNameById.get(toPositiveIntOrNull(plan?.lineId)) ||
                '-',
              cardId: String(plan?.cardId || '').trim(),
              originOrderId: String(plan?.originOrderId || '').trim(),
              orderNo: String(plan?.orderNo || progress?.orderNo || '').trim(),
              styleId: String(plan?.styleId || '').trim(),
              styleCode: String(plan?.styleCode || plan?.styleId || '').trim(),
              styleLabel: String(plan?.label || progress?.label || '').trim(),
              colorName: String(plan?.colorName || progress?.colorName || '').trim(),
              plannedQuantity,
              producedQuantity,
              finalQuantity,
              qcPassedTotal,
              latestQcDate,
              isCompleted,
              completedAt,
              qcPassQuantity: draft?.qcPassQuantity ?? '',
              inspectionDate: draft?.inspectionDate ?? todayKey,
            };
          });
        });

        const idSet = new Set(ids);
        setQcDetailByPlanId((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([planId, detail]) => {
            if (idSet.has(planId)) next[planId] = detail;
          });
          return next;
        });
        setQcHistoryByPlanId((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([planId, detail]) => {
            if (idSet.has(planId)) next[planId] = detail;
          });
          return next;
        });
        setQcHistoryLoadingByPlanId((prev) => {
          const next = {};
          Object.entries(prev || {}).forEach(([planId, value]) => {
            if (idSet.has(planId)) next[planId] = value;
          });
          return next;
        });
        if (expandedRowId && !idSet.has(expandedRowId)) {
          setExpandedRowId(null);
        }
      } catch (error) {
        setRows([]);
        showNotification(error?.message || '검수 데이터를 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, expandedRowId, lineNameById, selectedFactoryId, selectedLineId, showNotification, todayKey]
  );

  const ensureOrdersLoaded = useCallback(async () => {
    if (ordersCache.loaded && Array.isArray(ordersCache.rows)) return ordersCache.rows;
    if (orderLoadPromiseRef.current) return orderLoadPromiseRef.current;

    const requestPromise = requestJSON(`/orders${buildQueryString({ orgId: activeOrgId })}`, {
      skipGlobalLoading: true,
    })
      .then((response) => {
        const safeRows = Array.isArray(response) ? response : [];
        setOrdersCache({ loaded: true, rows: safeRows });
        return safeRows;
      })
      .catch((error) => {
        setOrdersCache({ loaded: false, rows: [] });
        throw error;
      })
      .finally(() => {
        orderLoadPromiseRef.current = null;
      });

    orderLoadPromiseRef.current = requestPromise;
    return requestPromise;
  }, [activeOrgId, ordersCache.loaded, ordersCache.rows]);

  const loadQcDetail = useCallback(
    async (row, { forceRefresh = false } = {}) => {
      const planId = String(row?.id || '').trim();
      if (!planId) return;
      const existing = qcDetailByPlanId[planId];
      if (existing?.loading) return;
      if (!forceRefresh && existing?.matched) return;

      setQcDetailByPlanId((prev) => ({
        ...prev,
        [planId]: {
          loading: true,
          matched: false,
          error: '',
          sizeKeys: [],
          variants: [],
          orderedQuantity: 0,
        },
      }));

      try {
        const orders = await ensureOrdersLoaded();
        const detail = buildQcDetailFromOrders({ row, orders });
        const normalizedDetail = { ...detail, loading: false };
        setQcDetailByPlanId((prev) => ({
          ...prev,
          [planId]: normalizedDetail,
        }));
      } catch (error) {
        setQcDetailByPlanId((prev) => ({
          ...prev,
          [planId]: {
            loading: false,
            matched: false,
            error: error?.message || '주문 데이터를 불러오지 못했습니다.',
            sizeKeys: [],
            variants: [],
            orderedQuantity: 0,
          },
        }));
      }
    },
    [ensureOrdersLoaded, qcDetailByPlanId]
  );

  const loadQcHistory = useCallback(
    async (planId, { forceRefresh = false } = {}) => {
      const normalizedPlanId = String(planId || '').trim();
      if (!normalizedPlanId) return;
      if (qcHistoryLoadingByPlanId[normalizedPlanId]) return;
      if (!forceRefresh && qcHistoryByPlanId[normalizedPlanId]) return;

      setQcHistoryLoadingByPlanId((prev) => ({
        ...prev,
        [normalizedPlanId]: true,
      }));

      try {
        const response = await requestJSON(
          `/assignment-plans/${encodeURIComponent(normalizedPlanId)}/qc-history` +
            buildQueryString({ orgId: activeOrgId }),
          {
            skipGlobalLoading: true,
            forceRefresh,
          }
        );
        const safeHistory = Array.isArray(response?.history) ? response.history : [];
        setQcHistoryByPlanId((prev) => ({
          ...prev,
          [normalizedPlanId]: {
            history: safeHistory,
            qcPassedTotal: toNonNegativeIntOrNull(response?.plan?.qcPassedTotal) ?? 0,
            latestQcDate: String(response?.plan?.latestQcDate || '').trim() || null,
          },
        }));
      } catch (error) {
        setQcHistoryByPlanId((prev) => ({
          ...prev,
          [normalizedPlanId]: {
            history: [],
            error: error?.message || '검수 이력을 불러오지 못했습니다.',
          },
        }));
      } finally {
        setQcHistoryLoadingByPlanId((prev) => ({
          ...prev,
          [normalizedPlanId]: false,
        }));
      }
    },
    [activeOrgId, qcHistoryByPlanId, qcHistoryLoadingByPlanId]
  );

  useEffect(() => {
    loadFactories();
  }, [loadFactories]);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    setOrdersCache({ loaded: false, rows: [] });
    orderLoadPromiseRef.current = null;
    setQcDetailByPlanId({});
    setQcHistoryByPlanId({});
    setQcHistoryLoadingByPlanId({});
    setExpandedRowId(null);
  }, [activeOrgId]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    onRefresh: () => loadRows({ forceRefresh: true }),
  });

  const resetDetailPassInputs = useCallback((planId) => {
    const normalizedPlanId = String(planId || '').trim();
    if (!normalizedPlanId) return;
    setQcDetailByPlanId((prev) => {
      const current = prev?.[normalizedPlanId];
      if (!current || !Array.isArray(current.variants)) return prev;
      return {
        ...prev,
        [normalizedPlanId]: {
          ...current,
          variants: current.variants.map((variant) => ({
            ...variant,
            passBySize: Object.keys(variant?.passBySize || {}).reduce((acc, sizeKey) => {
              acc[sizeKey] = '0';
              return acc;
            }, {}),
          })),
        },
      };
    });
  }, []);

  const handleAddQcEvent = useCallback(
    async (row) => {
      const inspectedOn = String(row?.inspectionDate || '').trim();
      if (!inspectedOn) {
        showNotification('검수 날짜를 입력하세요.', 'error');
        return;
      }

      const detail = qcDetailByPlanId[row.id] || null;
      const hasMatrix = Boolean(detail?.matched && detail?.sizeKeys?.length && detail?.variants?.length);
      const entries = hasMatrix
        ? (detail?.variants || []).flatMap((variant) =>
            (detail?.sizeKeys || [])
              .map((sizeKey) => {
                const passedQuantity = toNonNegativeIntOrNull(variant?.passBySize?.[sizeKey]);
                if (passedQuantity === null || passedQuantity <= 0) return null;
                return {
                  passedQuantity,
                  colorId: toPositiveIntOrNull(variant?.colorId),
                  sizeKey,
                };
              })
              .filter(Boolean)
          )
        : [];
      const passedQuantity = toNonNegativeIntOrNull(row?.qcPassQuantity);

      if (!hasMatrix && passedQuantity === null) {
        showNotification('검수 통과 수량을 입력하세요.', 'error');
        return;
      }
      if (hasMatrix && entries.length === 0) {
        showNotification('상세 검수 수량을 입력하세요.', 'error');
        return;
      }

      setSavingQcPlanId(row.id);
      try {
        await requestJSON(`/qc-pass-events${buildQueryString({ orgId: activeOrgId })}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentPlanId: row.id,
            inspectedOn,
            ...(hasMatrix ? { entries } : { passedQuantity }),
          }),
        });
        emitWorkspaceDataChanged({
          topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
          orgId: activeOrgId,
          assignmentIds: [row.id],
          source: 'qc-review',
        });
        setRows((prevRows) =>
          prevRows.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  qcPassQuantity: '',
                }
              : item
          )
        );
        resetDetailPassInputs(row.id);
        await Promise.all([
          loadRows({ forceRefresh: true }),
          loadQcHistory(row.id, { forceRefresh: true }),
        ]);
        showNotification('검수 이력을 추가했습니다.', 'success');
      } catch (error) {
        showNotification(error?.message || '검수 이력 저장에 실패했습니다.', 'error');
      } finally {
        setSavingQcPlanId(null);
      }
    },
    [activeOrgId, loadQcHistory, loadRows, qcDetailByPlanId, resetDetailPassInputs, showNotification]
  );

  const handleCancelQcEvent = useCallback(
    async (planId, eventId) => {
      const normalizedEventId = toPositiveIntOrNull(eventId);
      if (normalizedEventId === null) return;
      setCancellingEventId(normalizedEventId);
      try {
        await requestJSON(
          `/qc-pass-events/${encodeURIComponent(String(normalizedEventId))}/cancel` +
            buildQueryString({ orgId: activeOrgId }),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        emitWorkspaceDataChanged({
          topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
          orgId: activeOrgId,
          assignmentIds: [planId],
          source: 'qc-review',
        });
        await Promise.all([
          loadRows({ forceRefresh: true }),
          loadQcHistory(planId, { forceRefresh: true }),
        ]);
        showNotification('검수 이력을 취소했습니다.', 'success');
      } catch (error) {
        showNotification(error?.message || '검수 이력 취소에 실패했습니다.', 'error');
      } finally {
        setCancellingEventId(null);
      }
    },
    [activeOrgId, loadQcHistory, loadRows, showNotification]
  );

  const handleToggleExpand = useCallback(
    async (row) => {
      const rowId = String(row?.id || '').trim();
      if (!rowId) return;
      if (expandedRowId === rowId) {
        setExpandedRowId(null);
        return;
      }
      setExpandedRowId(rowId);
      await Promise.all([loadQcDetail(row), loadQcHistory(rowId)]);
    },
    [expandedRowId, loadQcDetail, loadQcHistory]
  );

  const handleVariantPassChange = useCallback((planId, variantKey, sizeKey, rawValue) => {
    const nextValue = String(rawValue || '').replace(/[^\d]/g, '');
    let nextTotal = null;
    setQcDetailByPlanId((prev) => {
      const current = prev?.[planId];
      if (!current || !Array.isArray(current.variants)) return prev;
      const nextVariants = current.variants.map((variant) => {
        if (variant.key !== variantKey) return variant;
        return {
          ...variant,
          passBySize: {
            ...variant.passBySize,
            [sizeKey]: nextValue,
          },
        };
      });
      const nextDetail = {
        ...current,
        variants: nextVariants,
      };
      nextTotal = resolveDetailPassTotal(nextDetail);
      return {
        ...prev,
        [planId]: nextDetail,
      };
    });
    if (nextTotal !== null) {
      setRows((prevRows) =>
        prevRows.map((row) =>
          row.id === planId
            ? {
                ...row,
                qcPassQuantity: String(nextTotal),
              }
            : row
        )
      );
    }
  }, []);

  const visibleRows = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'pending' && row.isCompleted) return false;
      if (statusFilter === 'completed' && !row.isCompleted) return false;
      if (!keyword) return true;
      const haystack = [row.orderNo, row.styleCode, row.styleLabel, row.colorName, row.lineName]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, searchText, statusFilter]);

  return (
    <AppPageContainer
      header={
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            검수
          </Typography>
          <Typography variant="body2" color="text.secondary">
            검수 이력을 날짜별로 추가하고 누적 상태를 확인합니다. 제작 완료 확정은 배치 진행 메뉴에서 처리합니다.
          </Typography>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                select
                size="small"
                label="공장"
                value={selectedFactoryId || ''}
                onChange={(event) => {
                  setSelectedFactoryId(toPositiveIntOrNull(event.target.value));
                  setSelectedLineId(null);
                }}
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
              >
                {(Array.isArray(factories) ? factories : []).map((factory) => (
                  <MenuItem key={factory.id} value={factory.id}>
                    {factory.name || `공장 ${factory.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="라인"
                value={selectedLineId || ''}
                onChange={(event) => setSelectedLineId(toPositiveIntOrNull(event.target.value))}
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
                SelectProps={{
                  displayEmpty: true,
                  renderValue: (value) => {
                    if (!value) return '전체';
                    const matched = (Array.isArray(lines) ? lines : []).find(
                      (line) => String(line?.id) === String(value)
                    );
                    return matched?.name || String(value);
                  },
                }}
              >
                <MenuItem value="">전체</MenuItem>
                {(Array.isArray(lines) ? lines : []).map((line) => (
                  <MenuItem key={line.id} value={line.id}>
                    {line.name || `라인 ${line.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="상태"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                sx={{ minWidth: { xs: '100%', sm: 140 } }}
              >
                <MenuItem value="pending">진행 중</MenuItem>
                <MenuItem value="completed">제작 완료</MenuItem>
                <MenuItem value="all">전체</MenuItem>
              </TextField>
              <TextField
                size="small"
                label="검색"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="주문/스타일/색상"
                sx={{ minWidth: { xs: '100%', sm: 220 } }}
              />
            </Stack>
          </Stack>
        </Paper>

        <Alert severity="info">
          QC 화면은 검수 통과 이력을 쌓는 용도입니다. 제작 완료 확정은 배치 진행 메뉴에서만 처리합니다.
        </Alert>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>상태</TableCell>
                  <TableCell>라인</TableCell>
                  <TableCell>주문</TableCell>
                  <TableCell>스타일/색상</TableCell>
                  <TableCell align="right">주문수량</TableCell>
                  <TableCell align="right">작업기록 생산수량</TableCell>
                  <TableCell align="right">검수 누적</TableCell>
                  <TableCell align="right">처리</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        표시할 검수 대상이 없습니다.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const detail = qcDetailByPlanId[row.id] || null;
                    const historyState = qcHistoryByPlanId[row.id] || null;
                    const history = Array.isArray(historyState?.history) ? historyState.history : [];
                    const historyLoading = Boolean(qcHistoryLoadingByPlanId[row.id]);
                    const hasMatrix = Boolean(detail?.matched && detail?.sizeKeys?.length && detail?.variants?.length);
                    const baselineQuantity =
                      hasMatrix && Number(detail?.orderedQuantity) > 0
                        ? Number(detail?.orderedQuantity)
                        : Number(row.plannedQuantity || 0);
                    const parsedQcPassQuantityRaw = toNonNegativeIntOrNull(row.qcPassQuantity);
                    const parsedQcPassQuantity = parsedQcPassQuantityRaw ?? 0;
                    const quantityDelta = parsedQcPassQuantity - baselineQuantity;
                    const hasOverflow = quantityDelta > 0;
                    const hasShortage = quantityDelta < 0;
                    const isSavingQc = savingQcPlanId === row.id;
                    const statusChip = resolveStatusChip(row);
                    const isExpanded = expandedRowId === row.id;
                    const qcPassedTotal =
                      toNonNegativeIntOrNull(historyState?.qcPassedTotal) ??
                      toNonNegativeIntOrNull(row.qcPassedTotal) ??
                      0;
                    const latestQcDate =
                      String(historyState?.latestQcDate || row.latestQcDate || '').trim() || null;

                    return (
                      <React.Fragment key={row.id}>
                        <TableRow
                          hover
                          onClick={() => handleToggleExpand(row)}
                          sx={{
                            cursor: 'pointer',
                            backgroundColor: isExpanded ? 'rgba(2, 136, 209, 0.04)' : undefined,
                          }}
                        >
                          <TableCell sx={{ minWidth: 110 }}>
                            <Chip
                              size="small"
                              label={statusChip.label}
                              color={statusChip.color}
                              variant={statusChip.variant}
                            />
                          </TableCell>
                          <TableCell>{row.lineName || '-'}</TableCell>
                          <TableCell sx={{ minWidth: 140 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {row.orderNo || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {row.styleCode || row.styleLabel || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[row.styleLabel, row.colorName].filter(Boolean).join(' / ') || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatInt(baselineQuantity)}</TableCell>
                          <TableCell align="right">{formatInt(row.producedQuantity)}</TableCell>
                          <TableCell align="right" sx={{ minWidth: 140 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {formatInt(qcPassedTotal)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {latestQcDate ? `최근 ${latestQcDate}` : '이력 없음'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 320 }}>
                            <Stack
                              direction="column"
                              spacing={0.75}
                              alignItems="flex-end"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75}>
                                <TextField
                                  size="small"
                                  type="date"
                                  label="검수일"
                                  value={row.inspectionDate}
                                  onChange={(event) => {
                                    const nextValue = String(event.target.value || '').trim() || todayKey;
                                    setRows((prevRows) =>
                                      prevRows.map((item) =>
                                        item.id === row.id
                                          ? {
                                              ...item,
                                              inspectionDate: nextValue,
                                            }
                                          : item
                                      )
                                    );
                                  }}
                                  InputLabelProps={{ shrink: true }}
                                  sx={{ minWidth: 148 }}
                                />
                                <TextField
                                  size="small"
                                  label="검수 통과 수량"
                                  value={row.qcPassQuantity}
                                  onChange={(event) => {
                                    if (hasMatrix) return;
                                    const nextValue = String(event.target.value || '').replace(/[^\d]/g, '');
                                    setRows((prevRows) =>
                                      prevRows.map((item) =>
                                        item.id === row.id
                                          ? {
                                              ...item,
                                              qcPassQuantity: nextValue,
                                            }
                                          : item
                                      )
                                    );
                                  }}
                                  disabled={hasMatrix}
                                  inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                                  helperText={
                                    hasMatrix
                                      ? '상세 입력 자동합계'
                                      : hasOverflow
                                        ? `초과 +${formatInt(quantityDelta)}`
                                        : hasShortage
                                          ? `부족 ${formatInt(quantityDelta)}`
                                          : ' '
                                  }
                                  FormHelperTextProps={{
                                    sx: {
                                      color: hasOverflow
                                        ? 'warning.main'
                                        : hasShortage
                                          ? 'error.main'
                                          : 'text.secondary',
                                    },
                                  }}
                                  sx={{ minWidth: 148 }}
                                />
                                <SaveButton
                                  onClick={() => handleAddQcEvent(row)}
                                  disabled={isSavingQc}
                                  loading={isSavingQc}
                                  sx={{
                                    minWidth: 92,
                                    height: 40,
                                    bgcolor: '#0d6efd',
                                    '&:hover': { bgcolor: '#0a58ca' },
                                  }}
                                >
                                  검수 추가
                                </SaveButton>
                              </Stack>
                              {row.isCompleted ? (
                                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                                  제작 완료된 배치에 검수를 추가합니다.
                                </Typography>
                              ) : null}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={8} sx={{ bgcolor: 'grey.50', py: 1.5 }}>
                              <Stack spacing={1.5}>
                                {detail?.loading ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1 }}>
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" color="text.secondary">
                                      주문 색상/사이즈 정보를 불러오는 중입니다.
                                    </Typography>
                                  </Box>
                                ) : detail?.matched ? (
                                  <Stack spacing={1.25}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      주문 {detail.orderNumber || row.orderNo || '-'} · 스타일 {row.styleCode || row.styleId || '-'}
                                    </Typography>
                                    <Table size="small" sx={{ bgcolor: 'white' }}>
                                      <TableHead>
                                        <TableRow>
                                          <TableCell sx={{ minWidth: 160 }}>색상/성별</TableCell>
                                          {(detail.sizeKeys || []).map((sizeKey) => (
                                            <TableCell key={`${row.id}:${sizeKey}`} align="right" sx={{ minWidth: 78 }}>
                                              {sizeKey === 'FREE' ? 'F' : sizeKey}
                                            </TableCell>
                                          ))}
                                          <TableCell align="right" sx={{ minWidth: 92 }}>
                                            합계
                                          </TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {(detail.variants || []).map((variant) => {
                                          const variantPassTotal = (detail.sizeKeys || []).reduce((sum, sizeKey) => {
                                            const value = toNonNegativeIntOrNull(variant?.passBySize?.[sizeKey]);
                                            return sum + (value || 0);
                                          }, 0);
                                          const variantOrderTotal = sumSizeQuantityMap(variant?.orderedBySize || {});
                                          return (
                                            <TableRow key={`${row.id}:${variant.key}`}>
                                              <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                  {variant.colorName || '미지정'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                  {variant.gender && variant.gender !== '-'
                                                    ? `성별 ${variant.gender}`
                                                    : '성별 미지정'}{' '}
                                                  · 주문 {formatInt(variantOrderTotal)}
                                                </Typography>
                                              </TableCell>
                                              {(detail.sizeKeys || []).map((sizeKey) => (
                                                <TableCell key={`${row.id}:${variant.key}:${sizeKey}`} align="right">
                                                  <TextField
                                                    size="small"
                                                    value={variant?.passBySize?.[sizeKey] ?? ''}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={(event) =>
                                                      handleVariantPassChange(row.id, variant.key, sizeKey, event.target.value)
                                                    }
                                                    inputProps={{
                                                      inputMode: 'numeric',
                                                      style: { textAlign: 'right', padding: '6px 8px', width: 54 },
                                                    }}
                                                  />
                                                </TableCell>
                                              ))}
                                              <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                {formatInt(variantPassTotal)}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                    <Typography
                                      variant="caption"
                                      color={quantityDelta === 0 ? 'text.secondary' : quantityDelta > 0 ? 'warning.main' : 'error.main'}
                                      sx={{ px: 0.5 }}
                                    >
                                      주문수량 {formatInt(baselineQuantity)} / 현재 입력합 {formatInt(parsedQcPassQuantity)} / 차이{' '}
                                      {quantityDelta > 0 ? `+${formatInt(quantityDelta)}` : formatInt(quantityDelta)}
                                    </Typography>
                                  </Stack>
                                ) : (
                                  <Alert severity="warning" sx={{ mx: 1 }}>
                                    {detail?.error || '상세 데이터를 찾지 못했습니다. 기본 검수 수량 입력으로 처리하세요.'}
                                  </Alert>
                                )}

                                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'white' }}>
                                  <Stack spacing={1}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                      검수 이력
                                    </Typography>
                                    {historyLoading ? (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                        <CircularProgress size={18} />
                                        <Typography variant="body2" color="text.secondary">
                                          검수 이력을 불러오는 중입니다.
                                        </Typography>
                                      </Box>
                                    ) : historyState?.error ? (
                                      <Alert severity="warning">{historyState.error}</Alert>
                                    ) : history.length === 0 ? (
                                      <Typography variant="body2" color="text.secondary">
                                        등록된 검수 이력이 없습니다.
                                      </Typography>
                                    ) : (
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>검수일</TableCell>
                                            <TableCell>상세</TableCell>
                                            <TableCell align="right">수량</TableCell>
                                            <TableCell>비고</TableCell>
                                            <TableCell>상태</TableCell>
                                            <TableCell align="right">처리</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {history.map((eventRow) => {
                                            const isCancelled = Boolean(eventRow?.cancelledAt);
                                            return (
                                              <TableRow key={`${row.id}:history:${eventRow.id}`}>
                                                <TableCell>{eventRow.inspectedOn || '-'}</TableCell>
                                                <TableCell>
                                                  {[eventRow.colorName, eventRow.sizeKey].filter(Boolean).join(' / ') || '총량 입력'}
                                                </TableCell>
                                                <TableCell align="right">{formatInt(eventRow.passedQuantity)}</TableCell>
                                                <TableCell>{eventRow.note || '-'}</TableCell>
                                                <TableCell>
                                                  <Chip
                                                    size="small"
                                                    label={isCancelled ? '취소됨' : '적용 중'}
                                                    color={isCancelled ? 'default' : 'success'}
                                                    variant={isCancelled ? 'outlined' : 'filled'}
                                                  />
                                                </TableCell>
                                                <TableCell align="right">
                                                  {!isCancelled ? (
                                                    <SaveButton
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleCancelQcEvent(row.id, eventRow.id);
                                                      }}
                                                      disabled={cancellingEventId === eventRow.id}
                                                      loading={cancellingEventId === eventRow.id}
                                                      sx={{
                                                        minWidth: 84,
                                                        height: 30,
                                                        bgcolor: 'grey.700',
                                                        '&:hover': { bgcolor: 'grey.800' },
                                                      }}
                                                    >
                                                      이력 취소
                                                    </SaveButton>
                                                  ) : (
                                                    <Typography variant="caption" color="text.secondary">
                                                      {eventRow.cancelledAt ? eventRow.cancelledAt.slice(0, 10) : '-'}
                                                    </Typography>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    )}
                                  </Stack>
                                </Paper>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default QcReview;
