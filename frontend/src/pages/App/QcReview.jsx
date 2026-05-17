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
    return { label: '마감완료', color: 'success', variant: 'filled' };
  }
  return { label: '검수대기', color: 'warning', variant: 'outlined' };
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
      error: '주문에서 해당 스타일의 사이즈 데이터를 찾지 못했습니다.',
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
    const variantKey = `${normalizeComparableText(colorName)}::${gender || '-'}`;
    const sizeQuantities = normalizeSizeQuantities(item?.sizeQuantities);
    const safeSizeQuantities = { ...sizeQuantities };
    const totalQuantityFromSizes = sumSizeQuantityMap(safeSizeQuantities);
    const totalQuantityFromItem = Math.max(0, Math.round(Number(item?.totalQuantity) || 0));
    if (totalQuantityFromSizes <= 0 && totalQuantityFromItem > 0) {
      safeSizeQuantities.FREE = totalQuantityFromItem;
    }

    const current = variantMap.get(variantKey) || {
      key: `${variantKey}::${index}`,
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

  const [factories, setFactories] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState(toPositiveIntOrNull(activeFactoryId));
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingDraftPlanId, setSavingDraftPlanId] = useState(null);
  const [completingPlanId, setCompletingPlanId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [qcDetailByPlanId, setQcDetailByPlanId] = useState({});
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
              .map((row) => [String(row?.id || '').trim(), String(row?.qcPassQuantity || '')])
              .filter((entry) => entry[0])
          );
          return safePlans.map((plan) => {
            const id = String(plan?.id || '').trim();
            const progress = progressById.get(id) || {};
            const plannedQuantity = toNonNegativeIntOrNull(progress?.plannedQuantity ?? plan?.quantity);
            const producedQuantity = toNonNegativeIntOrNull(progress?.producedQuantity) ?? 0;
            const finalQuantity = toNonNegativeIntOrNull(progress?.finalQuantity ?? plan?.finalQuantity);
            const isCompleted = Boolean(progress?.isCompleted ?? plan?.isCompleted);
            const completedAt = progress?.completedAt || plan?.completedAt || null;
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
              plannedQuantity: plannedQuantity ?? 0,
              producedQuantity,
              finalQuantity,
              isCompleted,
              completedAt,
              qcPassQuantity:
                draftById.get(id) ??
                (finalQuantity !== null && finalQuantity !== undefined
                  ? String(finalQuantity)
                  : ''),
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
    [activeOrgId, expandedRowId, lineNameById, selectedFactoryId, selectedLineId, showNotification]
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
    async (row) => {
      const planId = String(row?.id || '').trim();
      if (!planId) return;
      const existing = qcDetailByPlanId[planId];
      if (existing?.loading) return;
      if (existing?.matched) return;

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
    setExpandedRowId(null);
  }, [activeOrgId]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    onRefresh: () => loadRows({ forceRefresh: true }),
  });

  const handleSaveQcQuantity = useCallback(
    async (row) => {
      const finalQuantity = toNonNegativeIntOrNull(row?.qcPassQuantity);
      if (finalQuantity === null) {
        showNotification('검수 통과 수량을 입력해 주세요.', 'error');
        return;
      }
      if (row?.isCompleted) {
        showNotification('이미 마감완료된 건입니다.', 'warning');
        return;
      }

      setSavingDraftPlanId(row.id);
      try {
        await requestJSON(
          `/assignment-plans/${encodeURIComponent(String(row.id || ''))}/final-quantity` +
            buildQueryString({ orgId: activeOrgId }),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalQuantity }),
          }
        );
        showNotification('검수 수량을 저장했습니다.', 'success');
        await loadRows({ forceRefresh: true });
      } catch (error) {
        showNotification(error?.message || '검수 수량 저장에 실패했습니다.', 'error');
      } finally {
        setSavingDraftPlanId(null);
      }
    },
    [activeOrgId, loadRows, showNotification]
  );

  const handleComplete = useCallback(
    async (row) => {
      const finalQuantity = toNonNegativeIntOrNull(row?.qcPassQuantity);
      if (finalQuantity === null) {
        showNotification('검수 통과 수량을 입력해 주세요.', 'error');
        return;
      }
      if (row?.isCompleted) {
        showNotification('이미 마감완료된 건입니다.', 'warning');
        return;
      }

      setCompletingPlanId(row.id);
      try {
        await requestJSON(
          `/assignment-plans/${encodeURIComponent(String(row.id || ''))}/complete` +
            buildQueryString({ orgId: activeOrgId }),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalQuantity }),
          }
        );
        emitWorkspaceDataChanged({
          topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
          orgId: activeOrgId,
          assignmentIds: [row.id],
          source: 'qc-review',
        });
        showNotification('검수 마감을 완료했습니다.', 'success');
        await loadRows({ forceRefresh: true });
      } catch (error) {
        showNotification(error?.message || '검수 마감 처리에 실패했습니다.', 'error');
      } finally {
        setCompletingPlanId(null);
      }
    },
    [activeOrgId, loadRows, showNotification]
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
      await loadQcDetail(row);
    },
    [expandedRowId, loadQcDetail]
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
            주문/스타일/색상별 검수 통과 수량을 입력하고 마감완료 처리합니다.
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
                <MenuItem value="pending">검수대기</MenuItem>
                <MenuItem value="completed">마감완료</MenuItem>
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
          검수는 먼저 저장하고, 작업기록이 검수수량까지 반영되면 마감완료할 수 있습니다.
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
                  <TableCell align="right">제품생산량(공정최소)</TableCell>
                  <TableCell align="right">검수통과수량</TableCell>
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
                    const hasMatrix = Boolean(detail?.matched && detail?.sizeKeys?.length && detail?.variants?.length);
                    const baselineQuantity =
                      hasMatrix && Number(detail?.orderedQuantity) > 0
                        ? Number(detail?.orderedQuantity)
                        : Number(row.plannedQuantity || 0);
                    const quantityDelta = Number(row.qcPassQuantity || 0) - baselineQuantity;
                    const hasOverflow = quantityDelta > 0;
                    const hasShortage = quantityDelta < 0;
                    const isSavingDraft = savingDraftPlanId === row.id;
                    const isCompleting = completingPlanId === row.id;
                    const parsedQcPassQuantityRaw = toNonNegativeIntOrNull(row.qcPassQuantity);
                    const hasQcPassQuantity = parsedQcPassQuantityRaw !== null;
                    const parsedQcPassQuantity = parsedQcPassQuantityRaw ?? 0;
                    const producedQuantity = toNonNegativeIntOrNull(row.producedQuantity) ?? 0;
                    const missingWorkLogQuantity = Math.max(0, parsedQcPassQuantity - producedQuantity);
                    const canComplete = hasQcPassQuantity;
                    const hasWorkLogGapWarning = hasQcPassQuantity && missingWorkLogQuantity > 0;
                    const statusChip = resolveStatusChip(row);
                    const isExpanded = expandedRowId === row.id;

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
                          <TableCell align="right">{formatInt(producedQuantity)}</TableCell>
                          <TableCell align="right" sx={{ minWidth: 150 }}>
                            <TextField
                              size="small"
                              value={row.qcPassQuantity}
                              onClick={(event) => event.stopPropagation()}
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
                              disabled={row.isCompleted || hasMatrix}
                              inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                              helperText={
                                hasMatrix
                                  ? '상세입력합 자동'
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
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 220 }}>
                            {row.isCompleted ? (
                              <Typography variant="caption" color="text.secondary">
                                {row.completedAt ? new Date(row.completedAt).toLocaleString() : '-'}
                              </Typography>
                            ) : (
                              <Stack
                                direction="column"
                                spacing={0.75}
                                alignItems="flex-end"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end' }}>
                                  <SaveButton
                                    onClick={() => handleSaveQcQuantity(row)}
                                    disabled={isSavingDraft || isCompleting}
                                    loading={isSavingDraft}
                                    sx={{
                                      minWidth: 92,
                                      height: 32,
                                      bgcolor: 'grey.700',
                                      '&:hover': { bgcolor: 'grey.800' },
                                    }}
                                  >
                                    검수저장
                                  </SaveButton>
                                  <SaveButton
                                    onClick={() => handleComplete(row)}
                                    disabled={isSavingDraft || isCompleting || !canComplete}
                                    loading={isCompleting}
                                    sx={{
                                      minWidth: 92,
                                      height: 32,
                                      bgcolor: '#0d6efd',
                                      '&:hover': { bgcolor: '#0a58ca' },
                                    }}
                                  >
                                    마감완료
                                  </SaveButton>
                                </Box>
                                {!hasQcPassQuantity || hasWorkLogGapWarning ? (
                                  <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                                    {hasQcPassQuantity
                                      ? `작업기록 부족 ${formatInt(missingWorkLogQuantity)}`
                                      : '검수수량 입력 필요'}
                                  </Typography>
                                ) : null}
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={8} sx={{ bgcolor: 'grey.50', py: 1.5 }}>
                              {detail?.loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1 }}>
                                  <CircularProgress size={18} />
                                  <Typography variant="body2" color="text.secondary">
                                    주문 색상/사이즈 상세를 불러오는 중입니다.
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
                                                  disabled={row.isCompleted}
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
                                    주문수량 {formatInt(baselineQuantity)} / 검수입력합 {formatInt(row.qcPassQuantity)} / 차이{' '}
                                    {quantityDelta > 0 ? `+${formatInt(quantityDelta)}` : formatInt(quantityDelta)}
                                  </Typography>
                                </Stack>
                              ) : (
                                <Alert severity="warning" sx={{ mx: 1 }}>
                                  {detail?.error || '상세 데이터를 찾지 못했습니다. 기본 검수 수량 입력으로 처리해 주세요.'}
                                </Alert>
                              )}
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
