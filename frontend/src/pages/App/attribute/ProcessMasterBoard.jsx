import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Radio,
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
import LinkOffIcon from '@mui/icons-material/LinkOff';
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
  { key: 'targets', title: '대상' },
  { key: 'targetSpecs', title: '대상 규격' },
  { key: 'actions', title: '동작' },
  { key: 'actionSpecs', title: '동작 규격' },
];

const RELATION_SECTION_KEYS = ['targetToTargetSpecs', 'actionToActionSpecs'];

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
const normalizeSearchText = (value) =>
  toTrimmedText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const findMasterRowByInput = (rows = [], inputValue = '') => {
  const normalizedInput = normalizeSearchText(inputValue);
  if (!normalizedInput) return null;
  return (
    (Array.isArray(rows) ? rows : []).find((row) => {
      const candidates = [
        row?.code,
        row?.nameKo,
        row?.nameEn,
        row?.nameVi,
      ];
      return candidates.some((candidate) => normalizeSearchText(candidate) === normalizedInput);
    }) || null
  );
};
const createMasterRowDraft = ({
  existingRows = [],
  inputValue = '',
  languageCode = 'ko',
}) => {
  const label = toTrimmedText(inputValue);
  if (!label) return null;
  const baseCode = normalizeRelationCode(label) || 'NEW_ITEM';
  const usedCodeSet = new Set(
    (Array.isArray(existingRows) ? existingRows : [])
      .map((row) => normalizeRelationCode(row?.code))
      .filter(Boolean)
  );
  let nextCode = baseCode;
  let duplicateIndex = 2;
  while (usedCodeSet.has(nextCode)) {
    nextCode = `${baseCode}_${duplicateIndex}`;
    duplicateIndex += 1;
  }
  const nameFieldByLanguage = languageCode === 'en'
    ? 'nameEn'
    : languageCode === 'vi'
      ? 'nameVi'
      : 'nameKo';
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: nextCode,
    nameKo: nameFieldByLanguage === 'nameKo' ? label : '',
    nameEn: nameFieldByLanguage === 'nameEn' ? label : '',
    nameVi: nameFieldByLanguage === 'nameVi' ? label : '',
    sortOrder: (Array.isArray(existingRows) ? existingRows : []).length + 1,
  };
};

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

const sortRelationRows = (rows = []) =>
  [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
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

const buildProcessMasterTableContainerSx = (maxHeight) => ({
  flex: maxHeight ? '0 0 auto' : 1,
  minHeight: maxHeight || 0,
  maxHeight: maxHeight || 'none',
  overflow: 'auto',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1.5,
});

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
  maxHeight = null,
  selectedRowId = null,
  onSelectRow,
  expandedRowId = null,
  renderExpandedPanel = null,
}) => {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareMasterRowsByLanguage(left, right, languageCode)),
    [languageCode, rows]
  );
  const isSelectable = typeof onSelectRow === 'function';
  const canRenderExpandedPanel = typeof renderExpandedPanel === 'function';
  const columnCount = isSelectable ? 8 : 7;
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
    <Paper
      ref={sectionRef}
      variant="outlined"
      sx={{
        p: 2,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          gap: 1,
          flexShrink: 0,
        }}
      >
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

      <TableContainer sx={buildProcessMasterTableContainerSx(maxHeight)}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {isSelectable ? (
                <TableCell sx={{ width: '7%', textAlign: 'center', fontWeight: 700 }}>선택</TableCell>
              ) : null}
              <TableCell sx={{ width: '13%', fontWeight: 700 }}>코드</TableCell>
              <TableCell sx={{ width: '21%', fontWeight: 700 }}>한국어</TableCell>
              <TableCell sx={{ width: '21%', fontWeight: 700 }}>영어</TableCell>
              <TableCell sx={{ width: '21%', fontWeight: 700 }}>베트남어</TableCell>
              <TableCell sx={{ width: '6%', textAlign: 'center', fontWeight: 700 }}>사용중</TableCell>
              <TableCell sx={{ width: '6%', textAlign: 'center', fontWeight: 700 }}>중복</TableCell>
              <TableCell sx={{ width: '5%', textAlign: 'center', fontWeight: 700 }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody onFocusCapture={handleFocusWithinTable} onBlurCapture={handleBlurWithinTable}>
            {displayRows.map((row) => {
              const normalizedCode = normalizeCodeKey(row.code);
              const isDuplicateCode =
                Boolean(normalizedCode) &&
                duplicateCodeSet.has(normalizedCode);
              const usageConflict = usageConflictMap.get(Number(row.id));
              const usageTooltipTitle = usageConflict
                ? `${PROCESS_MASTER_TYPE_TITLE_BY_CODE[usageConflict.type] || usageConflict.type} / ${
                    usageConflict.code || usageConflict.label
                  } / 스타일 공정 ${usageConflict.styleProcessCount}개 참조`
                : '';
              const isSelected = selectedRowId === row.id;
              const isExpanded = expandedRowId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    hover
                    selected={isSelected}
                    onClick={() => {
                      if (typeof onSelectRow === 'function') onSelectRow(sectionKey, row.id, { toggle: true });
                    }}
                    sx={
                      isSelectable
                        ? {
                            cursor: 'pointer',
                            '&.Mui-selected': { backgroundColor: 'rgba(25, 118, 210, 0.10)' },
                            '&.Mui-selected:hover': { backgroundColor: 'rgba(25, 118, 210, 0.14)' },
                          }
                        : undefined
                    }
                  >
                    {isSelectable ? (
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Radio
                          size="small"
                          checked={isSelected}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectRow(sectionKey, row.id, { toggle: true });
                          }}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.code || ''}
                        onChange={(event) => onRowChange(sectionKey, row.id, 'code', event.target.value)}
                        onFocus={() => {
                          if (typeof onSelectRow === 'function') onSelectRow(sectionKey, row.id, { toggle: false });
                        }}
                        placeholder="CODE"
                        inputRef={focusRowId === row.id ? focusInputRef : undefined}
                        error={
                          isDuplicateCode
                        }
                        helperText={
                          isDuplicateCode
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
                        onFocus={() => {
                          if (typeof onSelectRow === 'function') onSelectRow(sectionKey, row.id, { toggle: false });
                        }}
                        placeholder="한국어"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.nameEn || ''}
                        onChange={(event) => onRowChange(sectionKey, row.id, 'nameEn', event.target.value)}
                        onFocus={() => {
                          if (typeof onSelectRow === 'function') onSelectRow(sectionKey, row.id, { toggle: false });
                        }}
                        placeholder="English"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.nameVi || ''}
                        onChange={(event) => onRowChange(sectionKey, row.id, 'nameVi', event.target.value)}
                        onFocus={() => {
                          if (typeof onSelectRow === 'function') onSelectRow(sectionKey, row.id, { toggle: false });
                        }}
                        placeholder="Tieng Viet"
                      />
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
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: isDuplicateCode ? 700 : 400, color: isDuplicateCode ? 'error.main' : 'text.disabled' }}
                      >
                        {isDuplicateCode ? '중복' : '-'}
                      </Typography>
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
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteRow(sectionKey, row.id);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                  {canRenderExpandedPanel && isExpanded ? (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        sx={{
                          p: 0,
                          borderBottom: 0,
                          backgroundColor: 'rgba(25, 118, 210, 0.04)',
                        }}
                      >
                        <Collapse in timeout="auto" unmountOnExit>
                          <Box sx={{ p: 1.5 }}>
                            {renderExpandedPanel(row)}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }}>
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

const ProcessMasterLinkedSpecSection = ({
  title,
  description = '',
  sectionKey,
  rows,
  languageCode,
  onAddOrLinkRow,
  onUnlinkRow,
  onDeleteRow,
  onRowChange,
  focusRowId = null,
  onCodeFocusHandled,
  duplicateCodeSet = EMPTY_CODE_SET,
  usageConflictMap = new Map(),
  maxHeight = null,
  parentLabel,
  parentRow,
  relationRows = [],
}) => {
  const [addInputValue, setAddInputValue] = useState('');
  const selectedParentCode = normalizeRelationCode(parentRow?.code);
  const selectedChildCodeSet = useMemo(() => {
    if (!selectedParentCode) return new Set();
    return new Set(
      (Array.isArray(relationRows) ? relationRows : [])
        .filter((row) => normalizeRelationCode(row?.parentCode) === selectedParentCode)
        .map((row) => normalizeRelationCode(row?.childCode))
        .filter(Boolean)
    );
  }, [relationRows, selectedParentCode]);
  const linkedRows = useMemo(
    () =>
      [...(Array.isArray(rows) ? rows : [])]
        .filter((row) => selectedChildCodeSet.has(normalizeRelationCode(row?.code)))
        .sort((left, right) => compareMasterRowsByLanguage(left, right, languageCode)),
    [languageCode, rows, selectedChildCodeSet]
  );
  const sortedRows = useMemo(
    () =>
      [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
        compareMasterRowsByLanguage(left, right, languageCode)
      ),
    [languageCode, rows]
  );
  const canAdd = Boolean(selectedParentCode) && typeof onAddOrLinkRow === 'function';
  const handleCommitAdd = useCallback(
    (candidateValue) => {
      if (!canAdd) return;
      const inputText = toTrimmedText(
        typeof candidateValue === 'string'
          ? candidateValue
          : candidateValue?.code || addInputValue
      );
      if (!inputText) return;
      const matchedRow =
        (candidateValue && typeof candidateValue === 'object' ? candidateValue : null) ||
        findMasterRowByInput(rows, inputText);
      onAddOrLinkRow({
        parentCode: selectedParentCode,
        existingRow: matchedRow,
        inputText,
      });
      setAddInputValue('');
    },
    [addInputValue, canAdd, onAddOrLinkRow, rows, selectedParentCode]
  );
  const sectionRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const focusInputRef = useRef(null);
  const [frozenRowOrder, setFrozenRowOrder] = useState(null);

  const displayRows = useMemo(() => {
    if (!frozenRowOrder) return linkedRows;
    const rowMap = new Map(linkedRows.map((row) => [row.id, row]));
    const frozenRowIds = new Set(frozenRowOrder);
    const frozenRows = frozenRowOrder.map((rowId) => rowMap.get(rowId)).filter(Boolean);
    const appendedRows = linkedRows.filter((row) => !frozenRowIds.has(row.id));
    return [...frozenRows, ...appendedRows];
  }, [frozenRowOrder, linkedRows]);

  const handleFocusWithinTable = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFrozenRowOrder((previousOrder) => previousOrder || linkedRows.map((row) => row.id));
  }, [linkedRows]);

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

  useEffect(() => {
    setAddInputValue('');
  }, [selectedParentCode]);

  return (
    <Paper
      ref={sectionRef}
      variant="outlined"
      sx={{
        p: 2,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Stack spacing={0.25}>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              선택 {parentLabel}:
            </Typography>
            {parentRow ? (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={resolveLocalizedAttributeName(parentRow, languageCode) || parentRow?.code}
              />
            ) : (
              <Typography variant="caption" color="warning.main">
                왼쪽에서 {parentLabel}을 선택하세요.
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{
          mb: 1.5,
          alignItems: 'center',
        }}
      >
        <Autocomplete
          freeSolo
          autoHighlight
          forcePopupIcon
          fullWidth
          size="small"
          options={sortedRows}
          inputValue={addInputValue}
          disabled={!canAdd}
          onInputChange={(_event, value) => {
            setAddInputValue(String(value ?? ''));
          }}
          onChange={(_event, value) => {
            if (!value) return;
            handleCommitAdd(value);
          }}
          getOptionLabel={(option) => resolveLocalizedAttributeName(option, languageCode) || option?.code || ''}
          isOptionEqualToValue={(option, value) =>
            normalizeRelationCode(option?.code) === normalizeRelationCode(value?.code)
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label={`${title} 선택/등록`}
              placeholder={
                canAdd
                  ? `${title} 검색 또는 신규 입력`
                  : `${parentLabel}을 먼저 선택하세요`
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== 'NumpadEnter' && event.key !== 'Tab') return;
                const trimmed = toTrimmedText(addInputValue);
                if (!trimmed) return;
                event.preventDefault();
                event.stopPropagation();
                handleCommitAdd(trimmed);
              }}
            />
          )}
        />
        <Button
          size="small"
          variant="contained"
          onClick={() => handleCommitAdd(addInputValue)}
          disabled={!canAdd || !toTrimmedText(addInputValue)}
        >
          등록
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            setAddInputValue('');
          }}
        >
          취소
        </Button>
      </Stack>

      <TableContainer sx={buildProcessMasterTableContainerSx(maxHeight)}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '6%', textAlign: 'center', fontWeight: 700 }}>해제</TableCell>
              <TableCell sx={{ width: '14%', fontWeight: 700 }}>코드</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>한국어</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>영어</TableCell>
              <TableCell sx={{ width: '20%', fontWeight: 700 }}>베트남어</TableCell>
              <TableCell sx={{ width: '7%', textAlign: 'center', fontWeight: 700 }}>사용중</TableCell>
              <TableCell sx={{ width: '7%', textAlign: 'center', fontWeight: 700 }}>중복</TableCell>
              <TableCell sx={{ width: '6%', textAlign: 'center', fontWeight: 700 }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody onFocusCapture={handleFocusWithinTable} onBlurCapture={handleBlurWithinTable}>
            {displayRows.map((row) => {
              const normalizedCode = normalizeCodeKey(row.code);
              const isDuplicateCode =
                Boolean(normalizedCode) &&
                duplicateCodeSet.has(normalizedCode);
              const usageConflict = usageConflictMap.get(Number(row.id));
              const usageTooltipTitle = usageConflict
                ? `${PROCESS_MASTER_TYPE_TITLE_BY_CODE[usageConflict.type] || usageConflict.type} / ${
                    usageConflict.code || usageConflict.label
                  } / 스타일 공정 ${usageConflict.styleProcessCount}개 참조`
                : '';
              const childCode = normalizeRelationCode(row?.code);
              const canUnlink = Boolean(selectedParentCode && childCode && typeof onUnlinkRow === 'function');
              return (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <IconButton
                      size="small"
                      disabled={!canUnlink}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canUnlink) return;
                        onUnlinkRow(selectedParentCode, childCode);
                      }}
                    >
                      <LinkOffIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={row.code || ''}
                      onChange={(event) => onRowChange(sectionKey, row.id, 'code', event.target.value)}
                      placeholder="CODE"
                      inputRef={focusRowId === row.id ? focusInputRef : undefined}
                      error={
                        isDuplicateCode
                      }
                      helperText={
                        isDuplicateCode
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
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: isDuplicateCode ? 700 : 400, color: isDuplicateCode ? 'error.main' : 'text.disabled' }}
                    >
                      {isDuplicateCode ? '중복' : '-'}
                    </Typography>
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
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteRow(sectionKey, row.id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }}>
                  {selectedParentCode
                    ? `선택한 ${parentLabel}에 연결된 항목이 없습니다.`
                    : `${parentLabel}을 먼저 선택하세요.`}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
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
  const [selectedTargetRowId, setSelectedTargetRowId] = useState(null);
  const [selectedActionRowId, setSelectedActionRowId] = useState(null);

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
  const hasLegacyData = useMemo(
    () =>
      (Array.isArray(formData?.locations) ? formData.locations.length : 0) > 0 ||
      (Array.isArray(formData?.targetToTargets) ? formData.targetToTargets.length : 0) > 0,
    [formData.locations, formData.targetToTargets]
  );

  const isDirty = useMemo(
    () =>
      MASTER_SECTIONS.some(
        (section) => !areMasterRowsEqual(formData[section.key], originalData[section.key])
      ) ||
      RELATION_SECTION_KEYS.some(
        (key) => !areRelationRowsEqual(formData[key], originalData[key])
      ) ||
      hasLegacyData,
    [formData, hasLegacyData, originalData]
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

  useEffect(() => {
    const targetRows = Array.isArray(formData?.targets) ? formData.targets : [];
    setSelectedTargetRowId((prev) => {
      if (targetRows.length === 0) return null;
      return targetRows.some((row) => row.id === prev) ? prev : targetRows[0].id;
    });
  }, [formData.targets]);

  useEffect(() => {
    const actionRows = Array.isArray(formData?.actions) ? formData.actions : [];
    setSelectedActionRowId((prev) => {
      if (actionRows.length === 0) return null;
      return actionRows.some((row) => row.id === prev) ? prev : actionRows[0].id;
    });
  }, [formData.actions]);

  const selectedTargetRow = useMemo(
    () =>
      (Array.isArray(formData?.targets) ? formData.targets : []).find(
        (row) => row.id === selectedTargetRowId
      ) ?? null,
    [formData.targets, selectedTargetRowId]
  );
  const selectedActionRow = useMemo(
    () =>
      (Array.isArray(formData?.actions) ? formData.actions : []).find(
        (row) => row.id === selectedActionRowId
      ) ?? null,
    [formData.actions, selectedActionRowId]
  );

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
    if (sectionKey === 'targets') {
      setSelectedTargetRowId(rowId);
    }
    if (sectionKey === 'actions') {
      setSelectedActionRowId(rowId);
    }
    setPendingCodeFocus({ sectionKey, rowId });
  }, []);

  const handleSelectMasterRow = useCallback((sectionKey, rowId, options = {}) => {
    const shouldToggle = options?.toggle !== false;
    if (sectionKey === 'targets') {
      setSelectedTargetRowId((prev) => (shouldToggle && prev === rowId ? null : rowId));
    } else if (sectionKey === 'actions') {
      setSelectedActionRowId((prev) => (shouldToggle && prev === rowId ? null : rowId));
    }
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
          [relationKey]: sortRelationRows([...remainingRows, ...nextRowsForParent]),
        };
      });
    },
    []
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

  const handleToggleRelationLink = useCallback(
    ({ relationKey, relationType, parentCode, childCode, childCodeKey, linked }) => {
      const normalizedParentCode = normalizeRelationCode(parentCode);
      const normalizedChildCode = normalizeRelationCode(childCode);
      if (!normalizedParentCode || !normalizedChildCode) return;
      if (
        relationType === 'TARGET_TARGET' &&
        normalizedParentCode === normalizedChildCode
      ) {
        return;
      }

      setFormData((prev) => {
        const existingRows = Array.isArray(prev?.[relationKey]) ? prev[relationKey] : [];
        const existingIndex = existingRows.findIndex(
          (row) =>
            normalizeRelationCode(row?.parentCode) === normalizedParentCode &&
            normalizeRelationCode(row?.childCode) === normalizedChildCode
        );
        if (linked && existingIndex >= 0) return prev;
        if (!linked && existingIndex < 0) return prev;

        const nextRows = linked
          ? [
              ...existingRows,
              {
                id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: relationType,
                parentCode: normalizedParentCode,
                childCode: normalizedChildCode,
                [childCodeKey]: normalizedChildCode,
              },
            ]
          : existingRows.filter((_, index) => index !== existingIndex);

        return {
          ...prev,
          [relationKey]: sortRelationRows(nextRows),
        };
      });
    },
    []
  );

  const handleToggleTargetSpecLink = useCallback(
    (targetCode, targetSpecCode, linked) => {
      handleToggleRelationLink({
        relationKey: 'targetToTargetSpecs',
        relationType: 'TARGET_TARGET_SPEC',
        parentCode: targetCode,
        childCode: targetSpecCode,
        childCodeKey: 'targetSpecCode',
        linked,
      });
    },
    [handleToggleRelationLink]
  );

  const handleToggleActionSpecLink = useCallback(
    (actionCode, actionSpecCode, linked) => {
      handleToggleRelationLink({
        relationKey: 'actionToActionSpecs',
        relationType: 'ACTION_ACTION_SPEC',
        parentCode: actionCode,
        childCode: actionSpecCode,
        childCodeKey: 'actionSpecCode',
        linked,
      });
    },
    [handleToggleRelationLink]
  );
  const handleUnlinkTargetSpec = useCallback(
    (targetCode, targetSpecCode) => {
      handleToggleTargetSpecLink(targetCode, targetSpecCode, false);
    },
    [handleToggleTargetSpecLink]
  );
  const handleUnlinkActionSpec = useCallback(
    (actionCode, actionSpecCode) => {
      handleToggleActionSpecLink(actionCode, actionSpecCode, false);
    },
    [handleToggleActionSpecLink]
  );
  const handleAddOrLinkLinkedSpec = useCallback(
    ({
      parentCode,
      existingRow,
      inputText,
      sectionKey,
      relationKey,
      relationType,
      childCodeKey,
    }) => {
      const normalizedParentCode = normalizeRelationCode(parentCode);
      if (!normalizedParentCode) return;

      let createdRowId = null;
      let createdNewRow = false;

      setFormData((prev) => {
        const childRows = Array.isArray(prev?.[sectionKey]) ? prev[sectionKey] : [];
        const relationRows = Array.isArray(prev?.[relationKey]) ? prev[relationKey] : [];
        const matchedExistingRow =
          existingRow && normalizeRelationCode(existingRow?.code)
            ? childRows.find(
                (row) =>
                  normalizeRelationCode(row?.code) === normalizeRelationCode(existingRow?.code)
              ) || null
            : findMasterRowByInput(childRows, inputText);

        let nextChildRows = childRows;
        let resolvedRow = matchedExistingRow;
        if (!resolvedRow) {
          const draftRow = createMasterRowDraft({
            existingRows: childRows,
            inputValue: inputText,
            languageCode,
          });
          if (!draftRow) return prev;
          nextChildRows = [...childRows, draftRow];
          resolvedRow = draftRow;
          createdRowId = draftRow.id;
          createdNewRow = true;
        }

        const resolvedChildCode = normalizeRelationCode(resolvedRow?.code);
        if (!resolvedChildCode) {
          return {
            ...prev,
            [sectionKey]: nextChildRows,
          };
        }

        const linkedAlready = relationRows.some(
          (row) =>
            normalizeRelationCode(row?.parentCode) === normalizedParentCode &&
            normalizeRelationCode(row?.childCode) === resolvedChildCode
        );
        if (linkedAlready) {
          return {
            ...prev,
            [sectionKey]: nextChildRows,
          };
        }

        const nextRelationRows = sortRelationRows([
          ...relationRows,
          {
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: relationType,
            parentCode: normalizedParentCode,
            childCode: resolvedChildCode,
            [childCodeKey]: resolvedChildCode,
          },
        ]);

        return {
          ...prev,
          [sectionKey]: nextChildRows,
          [relationKey]: nextRelationRows,
        };
      });

      if (createdNewRow && createdRowId) {
        setPendingCodeFocus({ sectionKey, rowId: createdRowId });
      }
    },
    [languageCode]
  );
  const handleAddOrLinkTargetSpec = useCallback(
    ({ parentCode, existingRow, inputText }) => {
      handleAddOrLinkLinkedSpec({
        parentCode,
        existingRow,
        inputText,
        sectionKey: 'targetSpecs',
        relationKey: 'targetToTargetSpecs',
        relationType: 'TARGET_TARGET_SPEC',
        childCodeKey: 'targetSpecCode',
      });
    },
    [handleAddOrLinkLinkedSpec]
  );
  const handleAddOrLinkActionSpec = useCallback(
    ({ parentCode, existingRow, inputText }) => {
      handleAddOrLinkLinkedSpec({
        parentCode,
        existingRow,
        inputText,
        sectionKey: 'actionSpecs',
        relationKey: 'actionToActionSpecs',
        relationType: 'ACTION_ACTION_SPEC',
        childCodeKey: 'actionSpecCode',
      });
    },
    [handleAddOrLinkLinkedSpec]
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
      payload.locations = [];
      payload.parts = [];
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
        targetToTargets: [],
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
      sx={{ height: '100%', minHeight: 0 }}
      contentSx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ p: 2, flexShrink: 0 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" fontWeight={700}>
              대상·동작 다국어 등록
            </Typography>
            <Typography variant="body2" color="text.secondary">
              직접 텍스트 입력 공정은 그대로 사용하고, 이 메뉴는 대상·동작 선택형 공정에서 쓰는 다국어 항목을 관리합니다.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              스타일 공정 입력 화면에서는 대상과 동작을 각각 복수 선택할 수 있고, 선택한 항목에 연결된 규격만 함께 고를 수 있습니다.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              여기서 등록한 한국어·영어·베트남어명이 선택형 공정명 생성과 이후 표준화 기준으로 사용됩니다.
            </Typography>
          </Stack>
        </Paper>

        <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ProcessMasterSection
              sectionKey="targets"
              title="대상 등록"
              description="선택형 공정에서 조합할 대상 기본 항목의 다국어명을 관리합니다. 행을 선택하면 바로 아래에서 대상 규격을 함께 등록할 수 있습니다."
              rows={formData.targets || []}
              languageCode={languageCode}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onRowChange={handleRowChange}
              focusRowId={pendingCodeFocus?.sectionKey === 'targets' ? pendingCodeFocus.rowId : null}
              onCodeFocusHandled={(rowId) => handleCodeFocusHandled('targets', rowId)}
              duplicateCodeSet={duplicateCodeMap.targets || EMPTY_CODE_SET}
              usageConflictMap={usageConflictMap}
              selectedRowId={selectedTargetRowId}
              onSelectRow={handleSelectMasterRow}
              expandedRowId={selectedTargetRowId}
              renderExpandedPanel={() => (
                <ProcessMasterLinkedSpecSection
                  sectionKey="targetSpecs"
                  title="대상 규격"
                  description="선택한 대상에 연결할 규격 후보의 다국어명을 관리합니다. 스타일 입력에서는 연결된 규격만 선택됩니다."
                  rows={formData.targetSpecs || []}
                  languageCode={languageCode}
                  onAddOrLinkRow={handleAddOrLinkTargetSpec}
                  onUnlinkRow={handleUnlinkTargetSpec}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'targetSpecs' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('targetSpecs', rowId)}
                  duplicateCodeSet={duplicateCodeMap.targetSpecs || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={220}
                  parentLabel="대상"
                  parentRow={selectedTargetRow}
                  relationRows={formData.targetToTargetSpecs}
                />
              )}
            />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ProcessMasterSection
              sectionKey="actions"
              title="동작 등록"
              description="선택형 공정에서 조합할 동작 기본 항목의 다국어명을 관리합니다. 행을 선택하면 바로 아래에서 동작 규격을 함께 등록할 수 있습니다."
              rows={formData.actions || []}
              languageCode={languageCode}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onRowChange={handleRowChange}
              focusRowId={pendingCodeFocus?.sectionKey === 'actions' ? pendingCodeFocus.rowId : null}
              onCodeFocusHandled={(rowId) => handleCodeFocusHandled('actions', rowId)}
              duplicateCodeSet={duplicateCodeMap.actions || EMPTY_CODE_SET}
              usageConflictMap={usageConflictMap}
              selectedRowId={selectedActionRowId}
              onSelectRow={handleSelectMasterRow}
              expandedRowId={selectedActionRowId}
              renderExpandedPanel={() => (
                <ProcessMasterLinkedSpecSection
                  sectionKey="actionSpecs"
                  title="동작 규격"
                  description="선택한 동작에 연결할 규격 후보의 다국어명을 관리합니다. 스타일 입력에서는 연결된 규격만 선택됩니다."
                  rows={formData.actionSpecs || []}
                  languageCode={languageCode}
                  onAddOrLinkRow={handleAddOrLinkActionSpec}
                  onUnlinkRow={handleUnlinkActionSpec}
                  onDeleteRow={handleDeleteRow}
                  onRowChange={handleRowChange}
                  focusRowId={pendingCodeFocus?.sectionKey === 'actionSpecs' ? pendingCodeFocus.rowId : null}
                  onCodeFocusHandled={(rowId) => handleCodeFocusHandled('actionSpecs', rowId)}
                  duplicateCodeSet={duplicateCodeMap.actionSpecs || EMPTY_CODE_SET}
                  usageConflictMap={usageConflictMap}
                  maxHeight={220}
                  parentLabel="동작"
                  parentRow={selectedActionRow}
                  relationRows={formData.actionToActionSpecs}
                />
              )}
            />
          </Box>
        </Stack>
      </Stack>
    </AppPageContainer>
  );
};

export default ProcessMasterBoard;
