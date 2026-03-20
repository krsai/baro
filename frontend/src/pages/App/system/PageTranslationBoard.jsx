import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
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
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../../components/AppPageContainer';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useApp } from '../../../context/AppContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const normalizePageCode = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\s+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');

const normalizeRows = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row = {}) => ({
    id: row.id ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: String(row.key ?? row.translationKey ?? '').trim(),
    textKo: String(row.textKo ?? '').trim(),
    textEn: String(row.textEn ?? '').trim(),
    textVi: String(row.textVi ?? '').trim(),
    sourceText: String(row.sourceText ?? '').trim(),
    sourceFile: String(row.sourceFile ?? '').trim(),
    sourceLine: Number.isFinite(Number(row.sourceLine)) ? Number(row.sourceLine) : null,
    needsReview: row.needsReview === true,
    isActive: row.isActive !== false,
    note: String(row.note ?? '').trim(),
  }));

const toComparableRows = (rows) =>
  normalizeRows(rows)
    .map((row) => ({
      key: row.key,
      textKo: row.textKo,
      textEn: row.textEn,
      textVi: row.textVi,
      isActive: row.isActive,
      note: row.note,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

const areRowsEqual = (leftRows, rightRows) =>
  JSON.stringify(toComparableRows(leftRows)) === JSON.stringify(toComparableRows(rightRows));

const formatCatalogLabel = (entry) => {
  const label = String(entry?.label ?? '').trim();
  const routePath = String(entry?.routePath ?? '').trim();
  if (label && routePath) return `${label} (${routePath})`;
  return label || String(entry?.pageCode ?? '').trim();
};

const PageTranslationBoard = () => {
  const { showNotification } = useApp();
  const requestIdRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pageCodes, setPageCodes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedPageCode, setSelectedPageCode] = useState('');
  const [activePageCode, setActivePageCode] = useState('');
  const [rows, setRows] = useState([]);
  const [originalRows, setOriginalRows] = useState([]);

  const normalizedSelectedPageCode = useMemo(
    () => normalizePageCode(selectedPageCode),
    [selectedPageCode]
  );

  const isDirty = useMemo(() => !areRowsEqual(rows, originalRows), [rows, originalRows]);
  useUnsavedChanges(isDirty);

  const isLatestRequest = useCallback(
    (requestId) => requestIdRef.current === requestId,
    []
  );

  const catalogByPageCode = useMemo(() => {
    const map = new Map();
    catalog.forEach((entry) => {
      const key = normalizePageCode(entry?.pageCode);
      if (!key) return;
      map.set(key, entry);
    });
    return map;
  }, [catalog]);

  const syncPageCodes = useCallback((incoming) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(incoming) ? incoming : [])
          .map((item) => normalizePageCode(item))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
    setPageCodes(normalized);
    return normalized;
  }, []);

  const fetchPageTranslationIndex = useCallback(
    async (forceRefresh = false) => {
      const data = await requestJSON(
        `/system/page-translations${buildQueryString({ includeInactive: 1 })}`,
        { forceRefresh }
      );
      const nextCatalog = Array.isArray(data?.catalog) ? data.catalog : [];
      setCatalog(nextCatalog);
      const mergedPageCodes = Array.from(
        new Set([
          ...(Array.isArray(data?.pageCodes) ? data.pageCodes : []),
          ...nextCatalog.map((item) => item?.pageCode),
        ])
      );
      return syncPageCodes(mergedPageCodes);
    },
    [syncPageCodes]
  );

  const loadPageRows = useCallback(
    async (pageCode, options = {}) => {
      const normalizedPageCode = normalizePageCode(pageCode);
      const requestId = Number(options?.requestId ?? 0);

      if (!normalizedPageCode) {
        if (isLatestRequest(requestId)) {
          setActivePageCode('');
          setRows([]);
          setOriginalRows([]);
          setLoading(false);
        }
        return;
      }

      if (options?.setLoading !== false) {
        setLoading(true);
      }
      try {
        const data = await requestJSON(
          `/system/page-translations${buildQueryString({
            pageCode: normalizedPageCode,
            includeInactive: 1,
          })}`,
          { forceRefresh: Boolean(options.forceRefresh) }
        );
        if (!isLatestRequest(requestId)) return;
        if (Array.isArray(data?.catalog)) {
          setCatalog(data.catalog);
        }
        if (Array.isArray(data?.pageCodes)) {
          syncPageCodes(data.pageCodes);
        }
        const nextRows = normalizeRows(data?.rows);
        setActivePageCode(normalizedPageCode);
        setRows(nextRows);
        setOriginalRows(nextRows);
      } finally {
        if (options?.setLoading !== false && isLatestRequest(requestId)) {
          setLoading(false);
        }
      }
    },
    [isLatestRequest, syncPageCodes]
  );

  const syncPageTexts = useCallback(
    async (pageCode, options = {}) => {
      const normalizedPageCode = normalizePageCode(pageCode);
      const requestId = Number(options?.requestId ?? 0);
      if (!normalizedPageCode) {
        throw new Error('pageCode is required');
      }

      setSyncing(true);
      try {
        const data = await requestJSON('/system/page-translations/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageCode: normalizedPageCode }),
        });
        if (!isLatestRequest(requestId)) return data;
        if (Array.isArray(data?.rows)) {
          const nextRows = normalizeRows(data.rows);
          setRows(nextRows);
          setOriginalRows(nextRows);
          setActivePageCode(normalizedPageCode);
        }
        return data;
      } finally {
        if (isLatestRequest(requestId)) {
          setSyncing(false);
        }
      }
    },
    [isLatestRequest]
  );

  const clearPageSelection = useCallback(() => {
    requestIdRef.current += 1;
    setSelectedPageCode('');
    setActivePageCode('');
    setRows([]);
    setOriginalRows([]);
    setLoading(false);
    setSyncing(false);
  }, []);

  const openPageWithSync = useCallback(
    (pageCode) => {
      const normalizedPageCode = normalizePageCode(pageCode);
      if (!normalizedPageCode) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setSelectedPageCode(normalizedPageCode);
      setActivePageCode(normalizedPageCode);
      setRows([]);
      setOriginalRows([]);

      loadPageRows(normalizedPageCode, {
        requestId,
        forceRefresh: true,
        setLoading: true,
      }).catch((error) => {
        if (!isLatestRequest(requestId)) return;
        showNotification(error?.message || '페이지 데이터를 불러오지 못했습니다.', 'error');
      });

      syncPageTexts(normalizedPageCode, { requestId })
        .then(() => {
          if (!isLatestRequest(requestId)) return;
          return fetchPageTranslationIndex(true);
        })
        .catch((error) => {
          if (!isLatestRequest(requestId)) return;
          showNotification(error?.message || '페이지 텍스트 수집에 실패했습니다.', 'error');
        });
    },
    [
      fetchPageTranslationIndex,
      isLatestRequest,
      loadPageRows,
      showNotification,
      syncPageTexts,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const bootstrap = async () => {
      setLoading(true);
      try {
        await fetchPageTranslationIndex();
        if (cancelled || !isLatestRequest(requestId)) return;
        setSelectedPageCode('');
        setRows([]);
        setOriginalRows([]);
        setActivePageCode('');
      } catch (error) {
        if (cancelled || !isLatestRequest(requestId)) return;
        showNotification(
          error?.message || '페이지 번역 목록을 불러오지 못했습니다.',
          'error'
        );
        setRows([]);
        setOriginalRows([]);
        setActivePageCode('');
      } finally {
        if (!cancelled && isLatestRequest(requestId)) {
          setLoading(false);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fetchPageTranslationIndex, isLatestRequest, showNotification]);

  const visibleRows = useMemo(
    () => [...rows].sort((left, right) => left.key.localeCompare(right.key)),
    [rows]
  );

  const changedCount = useMemo(
    () => rows.filter((row) => row.needsReview === true).length,
    [rows]
  );

  const handleSelectPage = useCallback(
    (event) => {
      const nextPageCode = normalizePageCode(event.target.value);
      if (!nextPageCode) {
        clearPageSelection();
        return;
      }
      openPageWithSync(nextPageCode);
    },
    [clearPageSelection, openPageWithSync]
  );

  const handleDeleteRow = useCallback((targetId) => {
    setRows((prev) => prev.filter((row) => row.id !== targetId));
  }, []);

  const handleRowChange = useCallback((targetId, field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== targetId) return row;
        return {
          ...row,
          [field]: field === 'isActive' ? value !== false : value,
        };
      })
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const targetPageCode = normalizePageCode(activePageCode || normalizedSelectedPageCode);
    if (!targetPageCode) {
      showNotification('페이지를 먼저 선택해주세요.', 'error');
      return;
    }

    const payloadRows = normalizeRows(rows);
    const missingKeyRow = payloadRows.find((row) => !row.key);
    if (missingKeyRow) {
      showNotification('모든 행에 key를 입력해주세요.', 'error');
      return;
    }

    const uniqueKeySet = new Set();
    for (const row of payloadRows) {
      if (uniqueKeySet.has(row.key)) {
        showNotification(`중복 key가 있습니다: ${row.key}`, 'error');
        return;
      }
      uniqueKeySet.add(row.key);
    }

    setSaving(true);
    try {
      const response = await requestJSON('/system/page-translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageCode: targetPageCode,
          rows: payloadRows.map((row) => ({
            key: row.key,
            textKo: row.textKo,
            textEn: row.textEn,
            textVi: row.textVi,
            isActive: row.isActive,
            note: row.note,
          })),
        }),
      });

      const savedRows = normalizeRows(response?.rows);
      const savedPageCode = normalizePageCode(response?.pageCode || targetPageCode);
      setRows(savedRows);
      setOriginalRows(savedRows);
      setActivePageCode(savedPageCode);
      setSelectedPageCode(savedPageCode);
      syncPageCodes([...pageCodes, savedPageCode]);
      showNotification('페이지 번역이 저장되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    activePageCode,
    normalizedSelectedPageCode,
    pageCodes,
    rows,
    saving,
    showNotification,
    syncPageCodes,
  ]);

  return (
    <AppPageContainer
      header={
        <>
          <Typography component="h1" variant="h4">
            페이지 번역 관리
          </Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary' }}>
            페이지를 선택하면 해당 페이지 텍스트를 자동 수집하고 바로 번역을 편집할 수 있습니다.
          </Typography>
        </>
      }
    >
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              select
              label="페이지 선택"
              value={pageCodes.includes(selectedPageCode) ? selectedPageCode : ''}
              onChange={handleSelectPage}
              size="small"
              sx={{ minWidth: 360, flexGrow: 1 }}
              disabled={loading || saving}
              SelectProps={{ displayEmpty: true }}
            >
              {pageCodes.length === 0 ? (
                <MenuItem value="" disabled>
                  선택 가능한 페이지 없음
                </MenuItem>
              ) : (
                <>
                  <MenuItem value="" disabled>
                    페이지를 선택해주세요
                  </MenuItem>
                  {pageCodes.map((pageCode) => (
                    <MenuItem key={pageCode} value={pageCode}>
                      {formatCatalogLabel(catalogByPageCode.get(pageCode) || { pageCode })}
                    </MenuItem>
                  ))}
                </>
              )}
            </TextField>

            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={loading || saving || syncing || !isDirty || !activePageCode}
              sx={{ minWidth: 120 }}
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              현재 페이지: {activePageCode || '-'}
            </Typography>
            {syncing && <Chip size="small" color="info" label="페이지 스캔 중" />}
            {changedCount > 0 && (
              <Chip color="warning" size="small" label={`변경감지 ${changedCount}건`} />
            )}
          </Stack>

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 560, border: '1px solid #e0e0e0' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '18%', fontWeight: 700 }}>key</TableCell>
                    <TableCell sx={{ width: '20%', fontWeight: 700 }}>원문(자동수집)</TableCell>
                    <TableCell sx={{ width: '14%', fontWeight: 700 }}>한국어</TableCell>
                    <TableCell sx={{ width: '14%', fontWeight: 700 }}>영어</TableCell>
                    <TableCell sx={{ width: '14%', fontWeight: 700 }}>베트남어</TableCell>
                    <TableCell sx={{ width: '8%', fontWeight: 700 }}>변경</TableCell>
                    <TableCell sx={{ width: '8%', fontWeight: 700 }}>상태</TableCell>
                    <TableCell sx={{ width: '2%', textAlign: 'center', fontWeight: 700 }}>
                      삭제
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <TextField
                          size="small"
                          value={row.key}
                          onChange={(event) =>
                            handleRowChange(row.id, 'key', event.target.value)
                          }
                          fullWidth
                          placeholder="auto.order.orderlist.l120c18"
                        />
                        {!!row.sourceFile && (
                          <Typography variant="caption" color="text.secondary">
                            {row.sourceFile}
                            {row.sourceLine ? `:${row.sourceLine}` : ''}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.sourceText || '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={row.textKo}
                          onChange={(event) =>
                            handleRowChange(row.id, 'textKo', event.target.value)
                          }
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={row.textEn}
                          onChange={(event) =>
                            handleRowChange(row.id, 'textEn', event.target.value)
                          }
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={row.textVi}
                          onChange={(event) =>
                            handleRowChange(row.id, 'textVi', event.target.value)
                          }
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        {row.needsReview ? (
                          <Chip size="small" color="warning" label="검토필요" />
                        ) : (
                          <Chip size="small" color="success" label="정상" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={row.isActive ? 'active' : 'inactive'}
                          onChange={(event) =>
                            handleRowChange(row.id, 'isActive', event.target.value === 'active')
                          }
                          fullWidth
                        >
                          <MenuItem value="active">활성</MenuItem>
                          <MenuItem value="inactive">비활성</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteRow(row.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}
                      >
                        표시할 번역 key가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>
    </AppPageContainer>
  );
};

export default PageTranslationBoard;
