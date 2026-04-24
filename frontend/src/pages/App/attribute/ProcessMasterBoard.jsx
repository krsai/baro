import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { resolveLocalizedAttributeName } from '../../../utils/appLanguage';
import {
  fetchProcessMasterOptions,
  updateProcessMasterOptions,
} from '../../../utils/attributeApi';

const MASTER_SECTIONS = [
  { key: 'locations', title: '위치' },
  { key: 'targets', title: '대상' },
  { key: 'targetSpecs', title: '대상 규격' },
  { key: 'actions', title: '동작' },
  { key: 'actionSpecs', title: '동작 규격' },
];

const RELATION_SECTION_KEYS = ['targetToTargetSpecs', 'actionToActionSpecs', 'targetToTargets'];

const createEmptyMasterData = () => ({
  locations: [],
  targets: [],
  actions: [],
  targetSpecs: [],
  actionSpecs: [],
  targetToTargetSpecs: [],
  actionToActionSpecs: [],
  targetToTargets: [],
});

const toTrimmedText = (value) => String(value ?? '').trim();
const normalizeCodeKey = (value) => toTrimmedText(value).toUpperCase();
const EMPTY_CODE_SET = new Set();
const normalizeRelationCode = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const collectDuplicateCodeSet = (rows = []) => {
  const codeCountMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const codeKey = normalizeCodeKey(row?.code);
    if (!codeKey) return;
    codeCountMap.set(codeKey, (codeCountMap.get(codeKey) || 0) + 1);
  });

  return new Set(
    Array.from(codeCountMap.entries())
      .filter(([, count]) => count > 1)
      .map(([codeKey]) => codeKey)
  );
};

const LANGUAGE_SORT_LOCALE_BY_CODE = {
  ko: 'ko-KR',
  en: 'en-US',
  vi: 'vi-VN',
};

const compareMasterRowsByLanguage = (leftRow, rightRow, languageCode) => {
  const locale = LANGUAGE_SORT_LOCALE_BY_CODE[languageCode] || 'en-US';
  const leftLabel = toTrimmedText(resolveLocalizedAttributeName(leftRow, languageCode));
  const rightLabel = toTrimmedText(resolveLocalizedAttributeName(rightRow, languageCode));

  const labelCompare = leftLabel.localeCompare(rightLabel, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (labelCompare !== 0) return labelCompare;

  const leftCode = toTrimmedText(leftRow?.code);
  const rightCode = toTrimmedText(rightRow?.code);
  const codeCompare = leftCode.localeCompare(rightCode, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (codeCompare !== 0) return codeCompare;

  return Number(leftRow?.sortOrder || 0) - Number(rightRow?.sortOrder || 0);
};

const normalizeMasterRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((item, index) => ({
    id: item.id ?? `new-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    code: toTrimmedText(item.code),
    nameKo: toTrimmedText(item.nameKo ?? item.label),
    nameEn: toTrimmedText(item.nameEn),
    nameVi: toTrimmedText(item.nameVi),
    sortOrder: Number(item.sortOrder) || index + 1,
  }));

const normalizeRelationRows = (
  rows = [],
  {
    type,
    parentCodeKey,
    childCodeKey,
  }
) =>
  (Array.isArray(rows) ? rows : [])
    .map((item, index) => {
      const parentCode = normalizeRelationCode(item?.parentCode ?? item?.[parentCodeKey]);
      const childCode = normalizeRelationCode(item?.childCode ?? item?.[childCodeKey]);
      return {
        id: item.id ?? `rel-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        parentCode,
        childCode,
      };
    })
    .filter((item) => item.parentCode && item.childCode)
    .sort((left, right) => {
      const parentCompare = left.parentCode.localeCompare(right.parentCode, 'en-US', {
        sensitivity: 'base',
        numeric: true,
      });
      if (parentCompare !== 0) return parentCompare;
      return left.childCode.localeCompare(right.childCode, 'en-US', {
        sensitivity: 'base',
        numeric: true,
      });
    });

const normalizeMasterData = (data = {}) => ({
  locations: normalizeMasterRows(data?.locations ?? data?.parts),
  targets: normalizeMasterRows(data?.targets),
  actions: normalizeMasterRows(data?.actions),
  targetSpecs: normalizeMasterRows(data?.targetSpecs ?? data?.specs),
  actionSpecs: normalizeMasterRows(data?.actionSpecs),
  targetToTargetSpecs: normalizeRelationRows(
    data?.relations?.targetToTargetSpecs ?? data?.targetToTargetSpecs,
    {
      type: 'TARGET_TARGET_SPEC',
      parentCodeKey: 'targetCode',
      childCodeKey: 'targetSpecCode',
    }
  ),
  actionToActionSpecs: normalizeRelationRows(
    data?.relations?.actionToActionSpecs ?? data?.actionToActionSpecs,
    {
      type: 'ACTION_ACTION_SPEC',
      parentCodeKey: 'actionCode',
      childCodeKey: 'actionSpecCode',
    }
  ),
  targetToTargets: normalizeRelationRows(
    data?.relations?.targetToTargets ?? data?.targetToTargets,
    {
      type: 'TARGET_TARGET',
      parentCodeKey: 'targetCode',
      childCodeKey: 'linkedTargetCode',
    }
  ),
});

const areMasterRowsEqual = (leftRows = [], rightRows = []) => {
  if (leftRows.length !== rightRows.length) return false;
  for (let index = 0; index < leftRows.length; index += 1) {
    const left = leftRows[index] || {};
    const right = rightRows[index] || {};
    if (
      left.id !== right.id ||
      left.code !== right.code ||
      left.nameKo !== right.nameKo ||
      left.nameEn !== right.nameEn ||
      left.nameVi !== right.nameVi ||
      left.sortOrder !== right.sortOrder
    ) {
      return false;
    }
  }
  return true;
};

const areRelationRowsEqual = (leftRows = [], rightRows = []) => {
  if (leftRows.length !== rightRows.length) return false;
  for (let index = 0; index < leftRows.length; index += 1) {
    const left = leftRows[index] || {};
    const right = rightRows[index] || {};
    if (
      left.id !== right.id ||
      left.type !== right.type ||
      left.parentCode !== right.parentCode ||
      left.childCode !== right.childCode
    ) {
      return false;
    }
  }
  return true;
};

const PROCESS_MASTER_TYPE_TITLE_BY_CODE = {
  LOCATION: '위치',
  TARGET: '대상',
  TARGET_SPEC: '대상 규격',
  ACTION: '동작',
  ACTION_SPEC: '동작 규격',
};

const normalizeUsageConflictRow = (item = {}) => ({
  id: Number(item?.id) || null,
  type: toTrimmedText(item?.type).toUpperCase(),
  code: toTrimmedText(item?.code),
  label: toTrimmedText(item?.label ?? item?.nameKo ?? item?.nameEn ?? item?.nameVi),
  nameKo: toTrimmedText(item?.nameKo),
  nameEn: toTrimmedText(item?.nameEn),
  nameVi: toTrimmedText(item?.nameVi),
  styleProcessCount: Number(item?.styleProcessCount) || 0,
  referenceCount: Number(item?.referenceCount) || 0,
  sampleStyleProcessIds: Array.isArray(item?.sampleStyleProcessIds)
    ? item.sampleStyleProcessIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [],
});

const shouldReviewActionRow = (sectionKey, row = {}) => {
  if (sectionKey !== 'actions') return false;
  const values = [row?.nameKo, row?.nameEn, row?.nameVi]
    .map((value) => toTrimmedText(value))
    .filter(Boolean);
  if (values.length === 0) return false;
  return new Set(values.map((value) => value.toLowerCase())).size === 1;
};

const ProcessMasterSection = ({
  title,
  description = '',
  rows,
  languageCode,
  sectionKey,
  onAddRow,
  onDeleteRow,
  onRowChange,
  focusRowId = null,
  onCodeFocusHandled,
  duplicateCodeSet = EMPTY_CODE_SET,
  usageConflictMap = new Map(),
  maxHeight = 320,
}) => {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareMasterRowsByLanguage(left, right, languageCode)),
    [languageCode, rows]
  );
  const sectionRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const focusInputRef = useRef(null);
  const [frozenRowOrder, setFrozenRowOrder] = useState(null);

  const displayRows = useMemo(() => {
    if (!frozenRowOrder) return sortedRows;
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const frozenRowIds = new Set(frozenRowOrder);
    const frozenRows = frozenRowOrder.map((rowId) => rowMap.get(rowId)).filter(Boolean);
    const appendedRows = rows.filter((row) => !frozenRowIds.has(row.id));
    return [...frozenRows, ...appendedRows];
  }, [frozenRowOrder, rows, sortedRows]);

  const handleFocusWithinTable = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFrozenRowOrder((previousOrder) => previousOrder || sortedRows.map((row) => row.id));
  }, [sortedRows]);

  const handleBlurWithinTable = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (sectionRef.current && activeElement && sectionRef.current.contains(activeElement)) return;
      setFrozenRowOrder(null);
      blurTimeoutRef.current = null;
    }, 0);
  }, []);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!focusRowId) return undefined;
    const inputElement = focusInputRef.current;
    if (!inputElement) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      inputElement.focus();
      if (typeof inputElement.select === 'function') inputElement.select();
      if (typeof onCodeFocusHandled === 'function') onCodeFocusHandled(focusRowId);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [displayRows, focusRowId, onCodeFocusHandled]);

  return (
    <Paper ref={sectionRef} variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Stack spacing={0.25}>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          ) : null}
        </Stack>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => onAddRow(sectionKey)}
        >
          추가
        </Button>
      </Box>

      <TableContainer sx={{ maxHeight }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '15%', fontWeight: 700 }}>코드</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>한국어</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>영어</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>베트남어</TableCell>
              <TableCell sx={{ width: '8%', textAlign: 'center', fontWeight: 700 }}>검토</TableCell>
              <TableCell sx={{ width: '8%', textAlign: 'center', fontWeight: 700 }}>사용중</TableCell>
              <TableCell sx={{ width: '9%', textAlign: 'center', fontWeight: 700 }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody onFocusCapture={handleFocusWithinTable} onBlurCapture={handleBlurWithinTable}>
            {displayRows.map((row) => {
              const usageConflict = usageConflictMap.get(Number(row.id));
              const usageLabel = usageConflict ? `사용중 ${usageConflict.referenceCount}건` : null;
              const usageTooltipTitle = usageConflict
                ? `${PROCESS_MASTER_TYPE_TITLE_BY_CODE[usageConflict.type] || usageConflict.type} / ${
                    usageConflict.code || usageConflict.label
                  } / 스타일 공정 ${usageConflict.styleProcessCount}개 참조`
                : '';
              return (
                <TableRow key={row.id} hover>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.code || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'code', event.target.value)}
                    placeholder="CODE"
                    inputRef={focusRowId === row.id ? focusInputRef : undefined}
                    error={
                      Boolean(normalizeCodeKey(row.code)) &&
                      duplicateCodeSet.has(normalizeCodeKey(row.code))
                    }
                    helperText={
                      Boolean(normalizeCodeKey(row.code)) &&
                      duplicateCodeSet.has(normalizeCodeKey(row.code))
                        ? '중복 코드'
                        : undefined
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameKo || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameKo', event.target.value)}
                    placeholder="한국어"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameEn || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameEn', event.target.value)}
                    placeholder="English"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameVi || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameVi', event.target.value)}
                    placeholder="Tieng Viet"
                  />
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  {usageConflict ? (
                    <Tooltip title={usageTooltipTitle}>
                      <Chip size="small" color="error" variant="outlined" label={usageLabel} />
                    </Tooltip>
                  ) : shouldReviewActionRow(sectionKey, row) ? (
                    <Chip size="small" color="warning" variant="outlined" label="검토" />
                  ) : null}
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  {usageConflict ? (
                    <Tooltip title={usageTooltipTitle}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                        {usageConflict.styleProcessCount}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      0
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  {usageConflict ? (
                    <Tooltip title="사용 중인 항목은 삭제할 수 없습니다.">
                      <span>
                        <IconButton size="small" disabled>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : (
                    <IconButton size="small" onClick={() => onDeleteRow(sectionKey, row.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
                </TableRow>
              );
            })}
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }}>
                  항목이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

const ProcessMasterRelationTreeSection = ({
  title,
  description,
  parentLabel,
  childLabel,
  parentRows,
  childRows,
  relationRows,
  languageCode,
  onChangeRelations,
}) => {
  const sortedParents = useMemo(
    () =>
      [...(Array.isArray(parentRows) ? parentRows : [])].sort((left, right) =>
        compareMasterRowsByLanguage(left, right, languageCode)
      ),
    [languageCode, parentRows]
  );
  const sortedChildren = useMemo(
    () =>
      [...(Array.isArray(childRows) ? childRows : [])].sort((left, right) =>
        compareMasterRowsByLanguage(left, right, languageCode)
      ),
    [childRows, languageCode]
  );
  const childByCode = useMemo(
    () =>
      new Map(
        sortedChildren
          .map((row) => [normalizeRelationCode(row?.code), row])
          .filter(([, row]) => Boolean(row))
      ),
    [sortedChildren]
  );
  const selectedChildCodesByParent = useMemo(() => {
    const map = new Map();
    (Array.isArray(relationRows) ? relationRows : []).forEach((row) => {
      const parentCode = normalizeRelationCode(row?.parentCode);
      const childCode = normalizeRelationCode(row?.childCode);
      if (!parentCode || !childCode) return;
      const existing = map.get(parentCode);
      if (existing) {
        existing.add(childCode);
      } else {
        map.set(parentCode, new Set([childCode]));
      }
    });
    return map;
  }, [relationRows]);
  const isSameDomain = parentRows === childRows;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Stack>

      <Stack spacing={1.25} sx={{ maxHeight: 480, overflow: 'auto', pr: 0.5 }}>
        {sortedParents.map((parentRow) => {
          const parentCode = normalizeRelationCode(parentRow?.code);
          const selectedCodeSet = selectedChildCodesByParent.get(parentCode) ?? new Set();
          const availableChildren = isSameDomain
            ? sortedChildren.filter(
                (childRow) => normalizeRelationCode(childRow?.code) !== parentCode
              )
            : sortedChildren;
          const selectedChildren = Array.from(selectedCodeSet)
            .map((childCode) => childByCode.get(childCode))
            .filter(Boolean);
          return (
            <Box
              key={parentRow.id}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 1.25,
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {resolveLocalizedAttributeName(parentRow, languageCode) || parentRow?.code}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${selectedChildren.length} linked`}
                  />
                </Stack>
                <Autocomplete
                  multiple
                  size="small"
                  options={availableChildren}
                  value={selectedChildren}
                  onChange={(_event, nextChildren) => {
                    onChangeRelations(parentCode, nextChildren);
                  }}
                  getOptionLabel={(option) =>
                    resolveLocalizedAttributeName(option, languageCode) || option?.code || ''
                  }
                  isOptionEqualToValue={(option, value) =>
                    normalizeRelationCode(option?.code) === normalizeRelationCode(value?.code)
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={`${childLabel} 연결`}
                      placeholder={`${childLabel} 선택`}
                    />
                  )}
                />
              </Stack>
            </Box>
          );
        })}
        {sortedParents.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {parentLabel} 항목이 없습니다.
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
};

const ProcessMasterBoard = () => {
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();
  const [formData, setFormData] = useState(() => createEmptyMasterData());
  const [originalData, setOriginalData] = useState(() => createEmptyMasterData());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCodeFocus, setPendingCodeFocus] = useState(null);
  const [usageConflicts, setUsageConflicts] = useState([]);

  const usageConflictMap = useMemo(
    () =>
      new Map(
        (Array.isArray(usageConflicts) ? usageConflicts : [])
          .filter((item) => Number(item?.id) > 0)
          .map((item) => [Number(item.id), item])
      ),
    [usageConflicts]
  );

  const duplicateCodeMap = useMemo(
    () =>
      MASTER_SECTIONS.reduce((acc, section) => {
        acc[section.key] = collectDuplicateCodeSet(formData[section.key]);
        return acc;
      }, {}),
    [formData]
  );

  const isDirty = useMemo(
    () =>
      MASTER_SECTIONS.some(
        (section) => !areMasterRowsEqual(formData[section.key], originalData[section.key])
      ) ||
      RELATION_SECTION_KEYS.some(
        (key) => !areRelationRowsEqual(formData[key], originalData[key])
      ),
    [formData, originalData]
  );

  useUnsavedChanges(isDirty);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchProcessMasterOptions()
      .then((data) => {
        if (cancelled) return;
        const normalized = normalizeMasterData(data);
        setFormData(normalized);
        setOriginalData(normalized);
        setUsageConflicts(
          Array.isArray(data?.usageConflicts)
            ? data.usageConflicts.map(normalizeUsageConflictRow).filter((item) => item.id)
            : []
        );
      })
      .catch(() => {
        if (cancelled) return;
        const empty = createEmptyMasterData();
        setFormData(empty);
        setOriginalData(empty);
        setUsageConflicts([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRowChange = useCallback((sectionKey, rowId, field, value) => {
    setFormData((prev) => {
      const currentRows = Array.isArray(prev?.[sectionKey]) ? prev[sectionKey] : [];
      const previousRow = currentRows.find((row) => row.id === rowId) || null;
      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      );
      if (field !== 'code' || !previousRow) {
        return {
          ...prev,
          [sectionKey]: updatedRows,
        };
      }

      const prevCode = normalizeRelationCode(previousRow?.code);
      const nextCode = normalizeRelationCode(value);
      if (!prevCode || prevCode === nextCode) {
        return {
          ...prev,
          [sectionKey]: updatedRows,
        };
      }

      const remapRelationRows = (rows = [], key) =>
        (Array.isArray(rows) ? rows : [])
          .map((row) => {
            if (normalizeRelationCode(row?.[key]) !== prevCode) return row;
            if (!nextCode) return null;
            return { ...row, [key]: nextCode };
          })
          .filter(Boolean);

      return {
        ...prev,
        [sectionKey]: updatedRows,
        targetToTargetSpecs:
          sectionKey === 'targets'
            ? remapRelationRows(prev.targetToTargetSpecs, 'parentCode')
            : sectionKey === 'targetSpecs'
              ? remapRelationRows(prev.targetToTargetSpecs, 'childCode')
              : prev.targetToTargetSpecs,
        actionToActionSpecs:
          sectionKey === 'actions'
            ? remapRelationRows(prev.actionToActionSpecs, 'parentCode')
            : sectionKey === 'actionSpecs'
              ? remapRelationRows(prev.actionToActionSpecs, 'childCode')
              : prev.actionToActionSpecs,
        targetToTargets:
          sectionKey === 'targets'
            ? remapRelationRows(
                remapRelationRows(prev.targetToTargets, 'parentCode'),
                'childCode'
              )
            : prev.targetToTargets,
      };
    });
  }, []);

  const handleAddRow = useCallback((sectionKey) => {
    const rowId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: [
        ...(prev[sectionKey] || []),
        {
          id: rowId,
          code: '',
          nameKo: '',
          nameEn: '',
          nameVi: '',
          sortOrder: (prev[sectionKey] || []).length + 1,
        },
      ],
    }));
    setPendingCodeFocus({ sectionKey, rowId });
  }, []);

  const handleCodeFocusHandled = useCallback((resolvedSectionKey, rowId) => {
    setPendingCodeFocus((prev) => {
      if (!prev) return null;
      if (prev.sectionKey !== resolvedSectionKey || prev.rowId !== rowId) return prev;
      return null;
    });
  }, []);

  const handleDeleteRow = useCallback((sectionKey, rowId) => {
    setFormData((prev) => {
      const currentRows = Array.isArray(prev?.[sectionKey]) ? prev[sectionKey] : [];
      const deletingRow = currentRows.find((row) => row.id === rowId) || null;
      const deletingCode = normalizeRelationCode(deletingRow?.code);

      const nextData = {
        ...prev,
        [sectionKey]: currentRows.filter((row) => row.id !== rowId),
      };
      if (!deletingCode) return nextData;

      if (sectionKey === 'targets' || sectionKey === 'targetSpecs') {
        const key = sectionKey === 'targets' ? 'parentCode' : 'childCode';
        nextData.targetToTargetSpecs = (Array.isArray(prev.targetToTargetSpecs)
          ? prev.targetToTargetSpecs
        : []
        ).filter((row) => normalizeRelationCode(row?.[key]) !== deletingCode);
      }
      if (sectionKey === 'targets') {
        nextData.targetToTargets = (Array.isArray(prev.targetToTargets)
          ? prev.targetToTargets
          : []
        ).filter(
          (row) =>
            normalizeRelationCode(row?.parentCode) !== deletingCode &&
            normalizeRelationCode(row?.childCode) !== deletingCode
        );
      }
      if (sectionKey === 'actions' || sectionKey === 'actionSpecs') {
        const key = sectionKey === 'actions' ? 'parentCode' : 'childCode';
        nextData.actionToActionSpecs = (Array.isArray(prev.actionToActionSpecs)
          ? prev.actionToActionSpecs
          : []
        ).filter((row) => normalizeRelationCode(row?.[key]) !== deletingCode);
      }
      return nextData;
    });
  }, []);

  const updateRelationRowsForParent = useCallback(
    ({ relationKey, relationType, parentCode, selectedChildRows, childCodeKey }) => {
      const normalizedParentCode = normalizeRelationCode(parentCode);
      if (!normalizedParentCode) return;

      setFormData((prev) => {
        const existingRows = Array.isArray(prev?.[relationKey]) ? prev[relationKey] : [];
        const remainingRows = existingRows.filter(
          (row) => normalizeRelationCode(row?.parentCode) !== normalizedParentCode
        );

        const nextRowsForParent = [];
        const childCodeSet = new Set();
        (Array.isArray(selectedChildRows) ? selectedChildRows : []).forEach((childRow) => {
          const normalizedChildCode = normalizeRelationCode(childRow?.code);
          if (!normalizedChildCode || childCodeSet.has(normalizedChildCode)) return;
          childCodeSet.add(normalizedChildCode);
          const existingMatch = existingRows.find(
            (row) =>
              normalizeRelationCode(row?.parentCode) === normalizedParentCode &&
              normalizeRelationCode(row?.childCode) === normalizedChildCode
          );
          nextRowsForParent.push({
            id: existingMatch?.id ?? null,
            type: relationType,
            parentCode: normalizedParentCode,
            childCode: normalizedChildCode,
            [childCodeKey]: normalizedChildCode,
          });
        });

        return {
          ...prev,
          [relationKey]: [...remainingRows, ...nextRowsForParent].sort((left, right) => {
            const parentCompare = normalizeRelationCode(left?.parentCode).localeCompare(
              normalizeRelationCode(right?.parentCode),
              'en-US',
              { sensitivity: 'base', numeric: true }
            );
            if (parentCompare !== 0) return parentCompare;
            return normalizeRelationCode(left?.childCode).localeCompare(
              normalizeRelationCode(right?.childCode),
              'en-US',
              { sensitivity: 'base', numeric: true }
            );
          }),
        };
      });
    },
    []
  );

  const handleTargetSpecRelationsChange = useCallback(
    (targetCode, selectedTargetSpecs) => {
      updateRelationRowsForParent({
        relationKey: 'targetToTargetSpecs',
        relationType: 'TARGET_TARGET_SPEC',
        parentCode: targetCode,
        selectedChildRows: selectedTargetSpecs,
        childCodeKey: 'targetSpecCode',
      });
    },
    [updateRelationRowsForParent]
  );

  const handleActionSpecRelationsChange = useCallback(
    (actionCode, selectedActionSpecs) => {
      updateRelationRowsForParent({
        relationKey: 'actionToActionSpecs',
        relationType: 'ACTION_ACTION_SPEC',
        parentCode: actionCode,
        selectedChildRows: selectedActionSpecs,
        childCodeKey: 'actionSpecCode',
      });
    },
    [updateRelationRowsForParent]
  );

  const handleTargetTargetRelationsChange = useCallback(
    (targetCode, selectedTargets) => {
      updateRelationRowsForParent({
        relationKey: 'targetToTargets',
        relationType: 'TARGET_TARGET',
        parentCode: targetCode,
        selectedChildRows: selectedTargets,
        childCodeKey: 'linkedTargetCode',
      });
    },
    [updateRelationRowsForParent]
  );

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    const duplicateSection = MASTER_SECTIONS.find(
      (section) => (duplicateCodeMap[section.key] || EMPTY_CODE_SET).size > 0
    );
    if (duplicateSection) {
      showNotification(`${duplicateSection.title}에 중복 코드가 있습니다.`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = MASTER_SECTIONS.reduce((acc, section) => {
        acc[section.key] = (formData[section.key] || []).map((row, index) => ({
          id: row.id,
          code: toTrimmedText(row.code),
          nameKo: toTrimmedText(row.nameKo),
          nameEn: toTrimmedText(row.nameEn),
          nameVi: toTrimmedText(row.nameVi),
          sortOrder: index + 1,
        }));
        return acc;
      }, {});
      payload.relations = {
        targetToTargetSpecs: (formData.targetToTargetSpecs || []).map((row) => ({
          id: row.id ?? undefined,
          type: 'TARGET_TARGET_SPEC',
          parentCode: normalizeRelationCode(row.parentCode),
          childCode: normalizeRelationCode(row.childCode),
          targetCode: normalizeRelationCode(row.parentCode),
          targetSpecCode: normalizeRelationCode(row.childCode),
        })),
        actionToActionSpecs: (formData.actionToActionSpecs || []).map((row) => ({
          id: row.id ?? undefined,
          type: 'ACTION_ACTION_SPEC',
          parentCode: normalizeRelationCode(row.parentCode),
          childCode: normalizeRelationCode(row.childCode),
          actionCode: normalizeRelationCode(row.parentCode),
          actionSpecCode: normalizeRelationCode(row.childCode),
        })),
        targetToTargets: (formData.targetToTargets || [])
          .map((row) => ({
            id: row.id ?? undefined,
            type: 'TARGET_TARGET',
            parentCode: normalizeRelationCode(row.parentCode),
            childCode: normalizeRelationCode(row.childCode),
            targetCode: normalizeRelationCode(row.parentCode),
            linkedTargetCode: normalizeRelationCode(row.childCode),
          }))
          .filter(
            (row) => row.parentCode && row.childCode && row.parentCode !== row.childCode
          ),
      };

      const data = await updateProcessMasterOptions(payload);
      const normalized = normalizeMasterData(data);
      setFormData(normalized);
      setOriginalData(normalized);
      setUsageConflicts(
        Array.isArray(data?.usageConflicts)
          ? data.usageConflicts.map(normalizeUsageConflictRow).filter((item) => item.id)
          : []
      );
      showNotification('공정 마스터가 저장되었습니다.', 'success');
    } catch (error) {
      const status = Number(error?.status || 0);
      const reason = String(error?.details?.reason || '').trim().toUpperCase();
      if (status === 409 && reason === 'PROCESS_MASTER_OPTION_IN_USE') {
        try {
          const latest = await fetchProcessMasterOptions({ skipGlobalLoading: true });
          const normalizedLatest = normalizeMasterData(latest);
          setFormData(normalizedLatest);
          setOriginalData(normalizedLatest);
          setUsageConflicts(
            Array.isArray(latest?.usageConflicts)
              ? latest.usageConflicts.map(normalizeUsageConflictRow).filter((item) => item.id)
              : []
          );
        } catch (_refreshError) {
          const conflicts = Array.isArray(error?.details?.conflicts)
            ? error.details.conflicts.map(normalizeUsageConflictRow).filter((item) => item.id)
            : [];
          setUsageConflicts(conflicts);
        }
        return;
      }
      setUsageConflicts([]);
      showNotification(error?.message || '공정 마스터 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [duplicateCodeMap, formData, isSaving, showNotification]);

  return (
    <AppPageContainer
      title="공정 관리"
      titleActions={(
        <SaveButton
          onClick={handleSave}
          disabled={!isDirty || isSaving || isLoading}
          loading={isSaving}
        />
      )}
    >
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" fontWeight={700}>
              공정 표준 구조
            </Typography>
            <Typography variant="body2" color="text.secondary">
              위치 / 대상 / 대상 규격 / 동작 / 동작 규격 5축과 부모-자식 연결을 함께 관리합니다.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              사용 중인 항목은 행의 `사용중` 칩으로 표시되며 삭제 버튼이 비활성화됩니다.
            </Typography>
          </Stack>
        </Paper>

        <ProcessMasterSection
          sectionKey="locations"
          title="위치"
          description="공정이 수행되는 기준 위치를 관리합니다."
          rows={formData.locations || []}
          languageCode={languageCode}
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onRowChange={handleRowChange}
          focusRowId={pendingCodeFocus?.sectionKey === 'locations' ? pendingCodeFocus.rowId : null}
          onCodeFocusHandled={(rowId) => handleCodeFocusHandled('locations', rowId)}
          duplicateCodeSet={duplicateCodeMap.locations || EMPTY_CODE_SET}
          usageConflictMap={usageConflictMap}
          maxHeight={260}
        />

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              대상 체계
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <ProcessMasterSection
                  sectionKey="targets"
                  title="대상"
                  description="부착/봉제 대상이 되는 기본 단위를 관리합니다."
                  rows={formData.targets || []}
                  languageCode={languageCode}
                  onAddRow={handleAddRow}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'targets' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('targets', rowId)}
                  duplicateCodeSet={duplicateCodeMap.targets || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={280}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <ProcessMasterSection
                  sectionKey="targetSpecs"
                  title="대상 규격"
                  description="대상의 하위 규격(예: 가슴주머니, 메인라벨)을 관리합니다."
                  rows={formData.targetSpecs || []}
                  languageCode={languageCode}
                  onAddRow={handleAddRow}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'targetSpecs' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('targetSpecs', rowId)}
                  duplicateCodeSet={duplicateCodeMap.targetSpecs || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={280}
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <ProcessMasterRelationTreeSection
                  title="대상 연결"
                  description="각 대상(부모)에 함께 연결 가능한 대상(자식)을 설정합니다."
                  parentLabel="대상"
                  childLabel="연결 대상"
                  parentRows={formData.targets}
                  childRows={formData.targets}
                  relationRows={formData.targetToTargets}
                  languageCode={languageCode}
                  onChangeRelations={handleTargetTargetRelationsChange}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <ProcessMasterRelationTreeSection
                  title="대상-대상규격 연결"
                  description="각 대상(부모)에 허용할 대상 규격(자식)을 연결합니다."
                  parentLabel="대상"
                  childLabel="대상 규격"
                  parentRows={formData.targets}
                  childRows={formData.targetSpecs}
                  relationRows={formData.targetToTargetSpecs}
                  languageCode={languageCode}
                  onChangeRelations={handleTargetSpecRelationsChange}
                />
              </Grid>
            </Grid>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              동작 체계
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <ProcessMasterSection
                  sectionKey="actions"
                  title="동작"
                  description="봉제/부착/오버록 등 작업 동작을 관리합니다."
                  rows={formData.actions || []}
                  languageCode={languageCode}
                  onAddRow={handleAddRow}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'actions' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('actions', rowId)}
                  duplicateCodeSet={duplicateCodeMap.actions || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={280}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <ProcessMasterSection
                  sectionKey="actionSpecs"
                  title="동작 규격"
                  description="동작의 하위 규격(예: 오버록 3실/5실)을 관리합니다."
                  rows={formData.actionSpecs || []}
                  languageCode={languageCode}
                  onAddRow={handleAddRow}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'actionSpecs' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('actionSpecs', rowId)}
                  duplicateCodeSet={duplicateCodeMap.actionSpecs || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={280}
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <ProcessMasterRelationTreeSection
                  title="동작-동작규격 연결"
                  description="각 동작(부모)에 허용할 동작 규격(자식)을 연결합니다."
                  parentLabel="동작"
                  childLabel="동작 규격"
                  parentRows={formData.actions}
                  childRows={formData.actionSpecs}
                  relationRows={formData.actionToActionSpecs}
                  languageCode={languageCode}
                  onChangeRelations={handleActionSpecRelationsChange}
                />
              </Grid>
            </Grid>
          </Stack>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default ProcessMasterBoard;
