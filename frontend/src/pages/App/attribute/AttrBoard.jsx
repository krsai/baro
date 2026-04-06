import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AppPageContainer from '../../../components/AppPageContainer';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useAppActions } from '../../../context/AppContext';
import {
  fetchAttributes,
  fetchProcessMasterOptions,
  updateAttributes,
} from '../../../utils/attributeApi';

const initialData = {
  colors: [],
  categories: [],
  processes: [],
};

const MULTILINGUAL_NAME_COLUMNS = [
  { field: 'nameEn', label: '영어명', width: '24%' },
  { field: 'nameKo', label: '한국어명', width: '24%' },
  { field: 'nameVi', label: '베트남어명', width: '24%' },
];

const sectionConfigs = [
  {
    key: 'colors',
    title: '색상 (Color)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
  {
    key: 'categories',
    title: '카테고리 (Category)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
  {
    key: 'processes',
    title: '공정 (Process)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
];
const sectionTitleMap = {
  colors: '색상 관리',
  categories: '카테고리 관리',
  processes: '공정 관리',
};

const PROCESS_NAMING_RULE_LINES = [
  '권장 형식: 부위: 대상 - 작업 (규격)',
  '대상/작업에 여러 항목이 있으면 · 로 연결합니다.',
  '/ 또는 + 를 쓰더라도 저장 시 · 형식으로 자동 정규화됩니다.',
  '규격은 맨 끝 괄호로 통일합니다. 예: (1줄), (3실), (5mm)',
];

const PROCESS_NAMING_PLACEHOLDER_LINES = [
  '대상이 없으면 ((주대상 누락))',
  '작업이 없으면 ((작업 누락))',
  '애매한 항목도 비워두지 말고 placeholder를 남깁니다.',
];

const PROCESS_NAMING_EXAMPLES = [
  '앞여밈: 지퍼·페이싱 - 부착·상침',
  '앞목: 페이싱 - 접기 (5mm)',
  '옆선: 지퍼 가장자리 - 오버록 (3실)',
  '허리밴드: 고무줄 - 상침 (완성)',
];

const PROCESS_NAMING_XN_LINES = [
  '같은 공정을 두 번 이상 반복하는 스타일은 마스터 공정명에 x2, x3를 넣지 않습니다.',
  'xN 표시는 스타일/배정/생산계획 화면에서 수량 기준으로만 붙입니다.',
];

const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

const toTrimmedText = (value) => String(value ?? '').trim();
const sortRowsByCode = (left, right) => left.code.localeCompare(right.code);

const resolveBaseAttributeName = (item = {}) => {
  const name = toTrimmedText(item?.name);
  const nameEn = toTrimmedText(item?.nameEn);
  const nameKo = toTrimmedText(item?.nameKo);
  const nameVi = toTrimmedText(item?.nameVi);
  return nameEn || name || nameKo || nameVi || '';
};

const normalizeRows = (rows) =>
  (Array.isArray(rows) ? rows : []).map((item = {}) => ({
    id: item.id ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: toTrimmedText(item.code),
    name: resolveBaseAttributeName(item),
    nameEn: toTrimmedText(item.nameEn) || toTrimmedText(item.name),
    nameKo: toTrimmedText(item.nameKo),
    nameVi: toTrimmedText(item.nameVi),
  }));

const normalizeData = (data) => ({
  colors: normalizeRows(data?.colors),
  categories: normalizeRows(data?.categories),
  processes: normalizeRows(data?.processes),
});

const areRowsEqual = (leftRows = [], rightRows = []) => {
  if (leftRows.length !== rightRows.length) return false;

  for (let index = 0; index < leftRows.length; index += 1) {
    const left = leftRows[index] || {};
    const right = rightRows[index] || {};
    if (
      left.id !== right.id ||
      left.code !== right.code ||
      left.name !== right.name ||
      left.nameEn !== right.nameEn ||
      left.nameKo !== right.nameKo ||
      left.nameVi !== right.nameVi
    ) {
      return false;
    }
  }

  return true;
};

const PROCESS_COMPOSER_PLACEHOLDERS = {
  part: '((부위 누락))',
  target: '((주대상 누락))',
  action: '((작업 누락))',
};

const normalizeProcessTokenList = (values = []) => {
  const normalized = [];
  const used = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const token = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!token) return;
    const dedupeKey = token.toLowerCase();
    if (used.has(dedupeKey)) return;
    used.add(dedupeKey);
    normalized.push(token);
  });
  return normalized;
};

const splitProcessTokenText = (value) =>
  normalizeProcessTokenList(String(value ?? '').split(/[·/+|,]/g));

const parseProcessDisplayText = (value) => {
  const text = toTrimmedText(value);
  if (!text) {
    return { part: '', targets: [], actions: [], specs: [] };
  }

  const [leftChunkRaw = '', rightChunkRaw = ''] = text.split(/\s*-\s*/, 2);
  const leftChunk = toTrimmedText(leftChunkRaw);
  const rightChunk = toTrimmedText(rightChunkRaw);
  let part = leftChunk;
  let targetText = '';

  const colonIndex = leftChunk.indexOf(':');
  if (colonIndex >= 0) {
    part = toTrimmedText(leftChunk.slice(0, colonIndex));
    targetText = toTrimmedText(leftChunk.slice(colonIndex + 1));
  } else if (leftChunk.includes('/')) {
    const slashTokens = splitProcessTokenText(leftChunk);
    part = slashTokens[0] || leftChunk;
    targetText = slashTokens.slice(1).join('·');
  }

  const specTokens = Array.from(rightChunk.matchAll(/\(([^)]*)\)/g))
    .map((match) => match?.[1] || '')
    .flatMap((tokenText) => splitProcessTokenText(tokenText));
  const actionText = rightChunk.replace(/\([^)]*\)/g, ' ');

  return {
    part,
    targets: splitProcessTokenText(targetText),
    actions: splitProcessTokenText(actionText),
    specs: normalizeProcessTokenList(specTokens),
  };
};

const buildProcessDisplayTextFromComposer = ({
  part,
  targets,
  actions,
  specs,
}) => {
  const normalizedPart = toTrimmedText(part) || PROCESS_COMPOSER_PLACEHOLDERS.part;
  const normalizedTargets = normalizeProcessTokenList(targets);
  const normalizedActions = normalizeProcessTokenList(actions);
  const normalizedSpecs = normalizeProcessTokenList(specs);
  const leftText = `${normalizedPart}: ${
    normalizedTargets.join('·') || PROCESS_COMPOSER_PLACEHOLDERS.target
  }`;
  const rightText = normalizedActions.join('·') || PROCESS_COMPOSER_PLACEHOLDERS.action;
  const specText = normalizedSpecs.join('·');
  return specText ? `${leftText} - ${rightText} (${specText})` : `${leftText} - ${rightText}`;
};

const normalizeProcessCodeToken = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const buildProcessCodeFromComposer = ({ part, targets, actions }) => {
  const codeParts = [part, targets?.[0], actions?.[0]]
    .map((token) => normalizeProcessCodeToken(token))
    .filter(Boolean);
  return codeParts.join('_') || 'PROC';
};

const ensureUniqueProcessCode = (requestedCode, rows = []) => {
  const base = normalizeProcessCodeToken(requestedCode) || 'PROC';
  const usedCodes = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => normalizeProcessCodeToken(row?.code))
      .filter(Boolean)
  );
  if (!usedCodes.has(base)) return base;

  let suffix = 2;
  let nextCode = `${base}_${suffix}`;
  while (usedCodes.has(nextCode)) {
    suffix += 1;
    nextCode = `${base}_${suffix}`;
  }
  return nextCode;
};

const sortTextValues = (values = []) =>
  [...values].sort((left, right) => left.localeCompare(right, 'ko'));

const createProcessComposerDraft = () => ({
  part: '',
  targets: [],
  actions: [],
  specs: [],
});

const toMasterOptionLabels = (items = []) =>
  normalizeProcessTokenList(
    (Array.isArray(items) ? items : []).map((item) =>
      typeof item === 'string'
        ? item
        : item?.label || item?.name || item?.value || item?.code || ''
    )
  );

const collectProcessComposerCatalog = (_rows = [], masterOptions = null) => {
  const catalog = {
    part: new Set(toMasterOptionLabels(masterOptions?.parts)),
    target: new Set(toMasterOptionLabels(masterOptions?.targets)),
    action: new Set(toMasterOptionLabels(masterOptions?.actions)),
    spec: new Set(toMasterOptionLabels(masterOptions?.specs)),
  };

  return {
    part: sortTextValues(Array.from(catalog.part)),
    target: sortTextValues(Array.from(catalog.target)),
    action: sortTextValues(Array.from(catalog.action)),
    spec: sortTextValues(Array.from(catalog.spec)),
  };
};

const AttributeRow = memo(function AttributeRow({
  row,
  columns,
  sectionKey,
  onRowChange,
  onDeleteRow,
}) {
  return (
    <TableRow hover>
      {columns.map((col) => (
        <TableCell key={col.field}>
          <TextField
            value={row[col.field] || ''}
            onChange={(event) => onRowChange(sectionKey, row.id, col.field, event.target.value)}
            fullWidth
            size="small"
            placeholder={col.label}
          />
        </TableCell>
      ))}
      <TableCell sx={{ textAlign: 'center' }}>
        <IconButton size="small" onClick={() => onDeleteRow(sectionKey, row.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
});

const AttributeSection = memo(function AttributeSection({
  config,
  rows,
  onAddRow,
  onDeleteRow,
  onRowChange,
  onOpenGuide,
  onOpenComposer,
}) {
  const sortedRows = useMemo(() => [...rows].sort(sortRowsByCode), [rows]);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
              {config.title}
            </Typography>
            {config.key === 'processes' && onOpenGuide ? (
              <Tooltip title="공정 명명 규칙 보기">
                <IconButton
                  size="small"
                  onClick={onOpenGuide}
                  sx={{ color: 'text.secondary', p: 0.25 }}
                >
                  <InfoOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
          <Typography variant="caption" color="text.secondary">
            영어명을 기본값으로 사용하고, 한국어명/베트남어명은 다국어 표시용입니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {config.key === 'processes' && onOpenComposer ? (
            <Button size="small" variant="outlined" onClick={onOpenComposer}>
              조합 추가
            </Button>
          ) : null}
          {config.key !== 'processes' ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => onAddRow(config.key)}
            >
              직접 추가
            </Button>
          ) : null}
        </Stack>
      </Box>

      <TableContainer sx={{ maxHeight: 420, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {config.columns.map((col) => (
                <TableCell key={col.field} sx={{ fontWeight: 'bold', width: col.width }}>
                  {col.label}
                </TableCell>
              ))}
              <TableCell sx={{ width: '10%', textAlign: 'center' }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row) => (
              <AttributeRow
                key={row.id}
                row={row}
                columns={config.columns}
                sectionKey={config.key}
                onRowChange={onRowChange}
                onDeleteRow={onDeleteRow}
              />
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={config.columns.length + 1}
                  sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}
                >
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

const ProcessNamingGuideDialog = memo(function ProcessNamingGuideDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>공정 명칭 가이드</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            공정 코드는 유지하고, 텍스트는 같은 순서로 적어 중복을 줄입니다.
          </Alert>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              기본 틀
            </Typography>
            {PROCESS_NAMING_RULE_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              누락 표기
            </Typography>
            {PROCESS_NAMING_PLACEHOLDER_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              예시
            </Typography>
            {PROCESS_NAMING_EXAMPLES.map((line) => (
              <Typography
                key={line}
                variant="body2"
                sx={{ mb: 0.5, fontFamily: '"Roboto Mono", monospace' }}
              >
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              반복 수량 xN
            </Typography>
            {PROCESS_NAMING_XN_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
});

const ProcessComposerDialog = memo(function ProcessComposerDialog({
  open,
  onClose,
  catalog,
  existingRows,
  onConfirm,
}) {
  const [draft, setDraft] = useState(createProcessComposerDraft);

  useEffect(() => {
    if (!open) return;
    setDraft(createProcessComposerDraft());
  }, [open]);

  const previewName = useMemo(
    () => buildProcessDisplayTextFromComposer(draft),
    [draft]
  );
  const previewCode = useMemo(
    () => ensureUniqueProcessCode(buildProcessCodeFromComposer(draft), existingRows),
    [draft, existingRows]
  );
  const canSubmit = useMemo(
    () =>
      Boolean(
        toTrimmedText(draft.part) &&
        Array.isArray(draft.targets) &&
        draft.targets.length > 0 &&
        Array.isArray(draft.actions) &&
        draft.actions.length > 0
      ),
    [draft.actions, draft.part, draft.targets]
  );

  const handleSingleFieldChange = useCallback((field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: toTrimmedText(value),
    }));
  }, []);

  const handleMultiFieldChange = useCallback((field, values) => {
    setDraft((prev) => ({
      ...prev,
      [field]: normalizeProcessTokenList(values),
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (typeof onConfirm !== 'function') return;
    onConfirm({
      code: previewCode,
      name: previewName,
      nameEn: previewName,
      nameKo: '',
      nameVi: '',
    });
  }, [onConfirm, previewCode, previewName]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>공정 조합 생성</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            시스템 표준 후보와 업체 기존 공정에서 추출한 후보를 함께 보여줍니다.
          </Alert>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={catalog?.part || []}
                value={draft.part || null}
                onChange={(_event, value) => handleSingleFieldChange('part', value || '')}
                renderInput={(params) => <TextField {...params} label="부위" size="small" />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                filterSelectedOptions
                options={catalog?.target || []}
                value={draft.targets}
                onChange={(_event, values) => handleMultiFieldChange('targets', values)}
                renderInput={(params) => (
                  <TextField {...params} label="대상 (복수 선택)" size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                filterSelectedOptions
                options={catalog?.action || []}
                value={draft.actions}
                onChange={(_event, values) => handleMultiFieldChange('actions', values)}
                renderInput={(params) => (
                  <TextField {...params} label="작업 (복수 선택)" size="small" />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                filterSelectedOptions
                options={catalog?.spec || []}
                value={draft.specs}
                onChange={(_event, values) => handleMultiFieldChange('specs', values)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="규격 (선택, 복수 가능)"
                    size="small"
                  />
                )}
              />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">
              미리보기 코드
            </Typography>
            <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}>
              {previewCode}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              미리보기 공정 텍스트
            </Typography>
            <Typography sx={{ fontFamily: '"Roboto Mono", monospace' }}>{previewName}</Typography>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          추가
        </Button>
      </DialogActions>
    </Dialog>
  );
});

const AttrBoard = ({ sectionKey = null, orgId = null }) => {
  const { showNotification } = useAppActions();
  const [canManageProcesses, setCanManageProcesses] = useState(true);
  const [isProcessGuideOpen, setIsProcessGuideOpen] = useState(false);
  const [isProcessComposerOpen, setIsProcessComposerOpen] = useState(false);
  const enabledSectionSet = useMemo(() => {
    if (!sectionKey) return null;
    return new Set([sectionKey]);
  }, [sectionKey]);
  const visibleSectionConfigs = useMemo(
    () =>
      (canManageProcesses
        ? sectionConfigs
        : sectionConfigs.filter((section) => section.key !== 'processes')
      ).filter((section) => (enabledSectionSet ? enabledSectionSet.has(section.key) : true)),
    [canManageProcesses, enabledSectionSet]
  );
  const boardTitle = sectionTitleMap[sectionKey] || '속성 관리';
  const includeSectionOptions = useMemo(
    () => ({
      includeColors: !enabledSectionSet || enabledSectionSet.has('colors'),
      includeCategories: !enabledSectionSet || enabledSectionSet.has('categories'),
      includeProcesses: !enabledSectionSet || enabledSectionSet.has('processes'),
    }),
    [enabledSectionSet]
  );

  const [formData, setFormData] = useState(() => cloneDeep(initialData));
  const [originalData, setOriginalData] = useState(() => cloneDeep(initialData));
  const [processMasterOptions, setProcessMasterOptions] = useState({
    parts: [],
    targets: [],
    actions: [],
    specs: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = useMemo(
    () =>
      visibleSectionConfigs.some(
        (section) => !areRowsEqual(formData[section.key], originalData[section.key])
      ),
    [formData, originalData, visibleSectionConfigs]
  );
  const processComposerCatalog = useMemo(
    () => collectProcessComposerCatalog(formData.processes, processMasterOptions),
    [formData.processes, processMasterOptions]
  );

  useUnsavedChanges(isDirty);

  useEffect(() => {
    let cancelled = false;

    const loadAttributes = async () => {
      try {
        const data = await fetchAttributes({
          orgId,
          includeColors: includeSectionOptions.includeColors,
          includeCategories: includeSectionOptions.includeCategories,
          includeRoles: false,
          includeProcesses: includeSectionOptions.includeProcesses,
        });
        if (cancelled) return;

        setCanManageProcesses(data?.canManageProcesses !== false);
        const normalized = normalizeData(data);
        setFormData(normalized);
        setOriginalData(cloneDeep(normalized));
      } catch (_error) {
        if (cancelled) return;
        setCanManageProcesses(true);
        setFormData(cloneDeep(initialData));
        setOriginalData(cloneDeep(initialData));
      }
    };

    loadAttributes();
    return () => {
      cancelled = true;
    };
  }, [includeSectionOptions, orgId]);

  useEffect(() => {
    if (sectionKey !== 'processes') return () => {};
    let cancelled = false;

    fetchProcessMasterOptions({ orgId })
      .then((data) => {
        if (cancelled) return;
        setProcessMasterOptions({
          parts: Array.isArray(data?.parts) ? data.parts : [],
          targets: Array.isArray(data?.targets) ? data.targets : [],
          actions: Array.isArray(data?.actions) ? data.actions : [],
          specs: Array.isArray(data?.specs) ? data.specs : [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setProcessMasterOptions({
          parts: [],
          targets: [],
          actions: [],
          specs: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, sectionKey]);

  const handleRowChange = useCallback((sectionKey, id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }, []);

  const handleAddRow = useCallback((sectionKey) => {
    if (sectionKey === 'processes') return;
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: [
        ...prev[sectionKey],
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code: '',
          name: '',
          nameEn: '',
          nameKo: '',
          nameVi: '',
        },
      ],
    }));
  }, []);

  const handleDeleteRow = useCallback((sectionKey, id) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((item) => item.id !== id),
    }));
  }, []);

  const handleAddComposedProcess = useCallback((nextProcess) => {
    if (!nextProcess || typeof nextProcess !== 'object') return;
    setFormData((prev) => {
      const safeRows = Array.isArray(prev.processes) ? prev.processes : [];
      const resolvedCode = ensureUniqueProcessCode(nextProcess.code, safeRows);
      return {
        ...prev,
        processes: [
          ...safeRows,
          {
            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            code: resolvedCode,
            name: toTrimmedText(nextProcess.name || nextProcess.nameEn),
            nameEn: toTrimmedText(nextProcess.nameEn || nextProcess.name),
            nameKo: toTrimmedText(nextProcess.nameKo),
            nameVi: toTrimmedText(nextProcess.nameVi),
          },
        ],
      };
    });
    setIsProcessComposerOpen(false);
  }, []);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const changedPayload = {};

      visibleSectionConfigs.forEach((section) => {
        const sectionKey = section.key;
        const beforeRows = originalData[sectionKey] || [];
        const afterRows = formData[sectionKey] || [];
        if (!areRowsEqual(beforeRows, afterRows)) {
          changedPayload[sectionKey] = afterRows;
        }
      });

      if (Object.keys(changedPayload).length === 0) {
        showNotification('변경사항이 없습니다.', 'info');
        return;
      }

      const response = await updateAttributes(changedPayload, { orgId });
      const merged = normalizeData({ ...formData, ...response });
      setFormData(merged);
      setOriginalData(cloneDeep(merged));
      showNotification('속성 정보가 저장되었습니다.', 'success');
    } catch (_error) {
      showNotification('속성 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <AppPageContainer
      title={boardTitle}
      titleActions={(
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      )}
    >
      <Grid container spacing={3}>
        {visibleSectionConfigs.map((config) => (
          <Grid item xs={12} key={config.key}>
            <AttributeSection
              config={config}
              rows={formData[config.key] || []}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onRowChange={handleRowChange}
              onOpenGuide={
                config.key === 'processes' ? () => setIsProcessGuideOpen(true) : undefined
              }
              onOpenComposer={
                config.key === 'processes' ? () => setIsProcessComposerOpen(true) : undefined
              }
            />
          </Grid>
        ))}
      </Grid>
      <ProcessNamingGuideDialog
        open={isProcessGuideOpen}
        onClose={() => setIsProcessGuideOpen(false)}
      />
      <ProcessComposerDialog
        open={isProcessComposerOpen}
        onClose={() => setIsProcessComposerOpen(false)}
        catalog={processComposerCatalog}
        existingRows={formData.processes}
        onConfirm={handleAddComposedProcess}
      />
    </AppPageContainer>
  );
};

export default AttrBoard;
