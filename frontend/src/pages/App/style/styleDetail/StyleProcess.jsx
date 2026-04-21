import React, { useEffect, useMemo, useState } from 'react';
import { useCallback, useDeferredValue } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SaveButton from '../../../../components/SaveButton';
import { useLanguage } from '../../../../context/LanguageContext';
import { fetchProcessMasterOptions } from '../../../../utils/attributeApi';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  formatStBucketQuantityLabel,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcess,
  normalizeProcesses,
  parseOptionalSecondsInput,
  resolveProcessAtPerPieceSeconds,
  resolveProcessExactStPerPieceSeconds,
  resolveStBucketQuantity,
  resolveStyleAtReliability,
  resolveProcessStPerPieceSeconds,
} from '../../../../utils/processTime';
import {
  TIME_DIVERGENCE_SEVERITY,
  calculateDivergencePercent,
  formatDivergencePercentLabel,
  resolveDivergenceMeta,
} from '../../../../utils/timeDivergence';
import {
  formatProcessNameWithQuantity,
  resolveLocalizedProcessName,
} from '../../../../utils/processDisplay';

const createEmptyDraft = () => ({
  parts: [],
  targets: [],
  actions: [],
  spec: null,
  pt: '',
  st: '',
  needsReview: false,
  reviewComment: '',
});
const PT_REFERENCE_QUANTITY = DEFAULT_TIME_REF_QUANTITY;
const PROCESS_TIME_COLUMN_WIDTH = 140;
const PROCESS_ACTION_COLUMN_WIDTH = 120;

const STYLE_PROCESS_MESSAGES = {
  ko: {
    title: '스타일 공정 목록',
    addRow: '공정 추가',
    addingTitle: '새 공정 추가',
    loadingOptions: '공정 조합 사전을 불러오는 중입니다.',
    missingMasterOptions: '공정 사전에서 부위를 먼저 등록해주세요.',
    partLabel: '부위',
    targetLabel: '대상',
    actionLabel: '작업',
    actionCustomNotice:
      '작업은 사용자가 직접 추가할 수 있으나, 작업(행위)을 의미하지 않으면 관리자에 의해 삭제 될 수 있습니다.',
    specLabel: '규격',
    specPlaceholder: '예: 3선',
    previewLabel: '미리보기',
    previewEmpty: '부위와 작업을 선택하면 공정명이 만들어집니다. 대상/규격은 선택입니다.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    save: '저장',
    cancel: '취소',
    edit: '수정',
    reviewRequiredLabel: '공정 검토 필요',
    reviewCommentLabel: '검토 코멘트',
    reviewCommentPlaceholder: '예: 주머니 입구 접기와 부착은 묶음 공정으로 재검토 필요',
    reviewBadge: '검토',
    delete: '삭제',
    editingTitle: '공정 수정',
    orderColumn: '순서',
    processColumn: '공정명',
    actionColumn: '작업',
    empty: '등록된 공정이 없습니다. 상단의 공정 추가로 바로 입력해보세요.',
    total: '개당 시간 합계',
    newRow: '신규',
    timeRefLabel: '기준 수량 q',
    timeRefTooltip:
      'PT는 항상 1,000장 주문 기준의 개당 시간으로 입력하고, 기준 수량 q는 AT/ST 확인 문맥으로 사용합니다.',
    ptTooltip: 'PT({quantity}): 항상 1,000장 주문 기준의 개당 예상 시간(초)입니다.',
    atTooltip: 'AT({quantity}): {quantity}장 주문 기준의 개당 실측 시간(초)입니다.',
    stTooltip: 'ST({quantity}): {quantity}장 주문은 해당 구간 기준의 개당 표준 시간(초)입니다.',
    validatePart: '부위를 선택해주세요.',
    validateTarget: '대상을 선택해주세요.',
    validateAction: '작업을 하나 이상 선택해주세요.',
    validateInvalid: '유효한 공정 조합을 입력해주세요.',
    validateDuplicate: '이미 등록된 공정입니다.',
    stGapReview: 'AT와 ST 차이가 {label}로 커서 ST 조정 검토가 필요합니다.',
    stGapNormal: 'AT와 ST 차이율 {label}',
  },
  en: {
    title: 'Style Process List',
    addRow: 'Add Process',
    addingTitle: 'New Process',
    loadingOptions: 'Loading process composition options...',
    missingMasterOptions: 'Register part options first.',
    partLabel: 'Part',
    targetLabel: 'Target',
    actionLabel: 'Action',
    actionCustomNotice:
      'Users can add actions directly, but entries that do not represent an action may be removed by an administrator.',
    specLabel: 'Spec',
    specPlaceholder: 'e.g. 3-line',
    previewLabel: 'Preview',
    previewEmpty: 'Select part and action to build the process name. Target/spec are optional.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    reviewRequiredLabel: 'Needs review',
    reviewCommentLabel: 'Review comment',
    reviewCommentPlaceholder: 'e.g. Folded pocket opening should be merged with pocket attach',
    reviewBadge: 'Review',
    delete: 'Delete',
    editingTitle: 'Edit Process',
    orderColumn: 'Order',
    processColumn: 'Process',
    actionColumn: 'Action',
    empty: 'No processes yet. Add one from the panel above.',
    total: 'Per-piece Total',
    newRow: 'New',
    timeRefLabel: 'Ref qty q',
    timeRefTooltip:
      'PT is always entered as per-piece expected seconds at 1,000 pcs. q is used for the AT/ST viewing context.',
    ptTooltip: 'PT({quantity}): per-piece expected seconds at 1,000 pcs.',
    atTooltip: 'AT({quantity}): per-piece actual seconds at order qty {quantity}.',
    stTooltip: 'ST({quantity}): per-piece standard seconds for the matched quantity bucket.',
    validatePart: 'Select a part.',
    validateTarget: 'Select a target.',
    validateAction: 'Select at least one action.',
    validateInvalid: 'Enter a valid process composition.',
    validateDuplicate: 'This process is already registered.',
    stGapReview: 'AT and ST differ by {label}, so ST review is recommended.',
    stGapNormal: 'AT/ST gap {label}',
  },
  vi: {
    title: 'Danh sach cong doan style',
    addRow: 'Them cong doan',
    addingTitle: 'Cong doan moi',
    loadingOptions: 'Dang tai tu dien to hop cong doan...',
    missingMasterOptions: 'Hay dang ky truoc bo phan.',
    partLabel: 'Bo phan',
    targetLabel: 'Doi tuong',
    actionLabel: 'Thao tac',
    actionCustomNotice:
      'Nguoi dung co the tu them thao tac, nhung neu khong mang y nghia thao tac (hanh vi) thi co the bi quan tri vien xoa.',
    specLabel: 'Quy cach',
    specPlaceholder: 'vi du: 3 kim',
    previewLabel: 'Xem truoc',
    previewEmpty: 'Chon bo phan va thao tac de tao ten cong doan. Doi tuong/quy cach la tuy chon.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    save: 'Luu',
    cancel: 'Huy',
    edit: 'Sua',
    reviewRequiredLabel: 'Can xem lai cong doan',
    reviewCommentLabel: 'Ghi chu xem lai',
    reviewCommentPlaceholder: 'vi du: can gop cong doan gap mieng tui va rap tui',
    reviewBadge: 'Can xem',
    delete: 'Xoa',
    editingTitle: 'Sua cong doan',
    orderColumn: 'Thu tu',
    processColumn: 'Ten cong doan',
    actionColumn: 'Tac vu',
    empty: 'Chua co cong doan nao. Hay them o khung ben tren.',
    total: 'Tong thoi gian moi san pham',
    newRow: 'Moi',
    timeRefLabel: 'So luong q',
    timeRefTooltip:
      'PT luon duoc nhap theo thoi gian du kien moi san pham o moc 1.000 san pham. q duoc dung de xem AT/ST.',
    ptTooltip: 'PT({quantity}): giay du kien moi san pham tai 1.000 san pham.',
    atTooltip: 'AT({quantity}): giay thuc te moi san pham tai don hang {quantity}.',
    stTooltip: 'ST({quantity}): giay chuan moi san pham theo nhom so luong phu hop.',
    validatePart: 'Hay chon bo phan.',
    validateTarget: 'Hay chon doi tuong.',
    validateAction: 'Hay chon it nhat mot thao tac.',
    validateInvalid: 'Hay nhap mot to hop cong doan hop le.',
    validateDuplicate: 'Cong doan nay da duoc dang ky.',
    stGapReview: 'AT va ST lech {label}, nen xem lai ST.',
    stGapNormal: 'Do lech AT/ST {label}',
  },
};

const getStyleProcessMessage = (languageCode, key, params = {}) => {
  const locale =
    languageCode === 'ko' || languageCode === 'vi' || languageCode === 'en'
      ? languageCode
      : 'en';
  const template =
    STYLE_PROCESS_MESSAGES[locale]?.[key] ??
    STYLE_PROCESS_MESSAGES.en[key] ??
    '';
  return Object.entries(params).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value ?? '')),
    template
  );
};

const REVIEW_DESCRIPTION_PREFIX = '[REVIEW]';
const hasReviewCommentText = (value) => String(value ?? '').trim().length > 0;
const formatAtSecondsOrBlank = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return formatSeconds(parsed);
};

const parseProcessReviewMeta = (process) => {
  const explicitNeedsReview =
    typeof process?.needsReview === 'boolean' ? process.needsReview : null;
  const explicitComment =
    typeof process?.reviewComment === 'string' ? process.reviewComment.trim() : '';
  const rawDescription =
    typeof process?.description === 'string' ? process.description.trim() : '';

  if (explicitNeedsReview !== null || explicitComment) {
    const comment = explicitComment || rawDescription;
    return {
      needsReview: hasReviewCommentText(comment),
      reviewComment: comment,
    };
  }

  if (rawDescription.startsWith(REVIEW_DESCRIPTION_PREFIX)) {
    const comment = rawDescription.slice(REVIEW_DESCRIPTION_PREFIX.length).trim();
    return {
      needsReview: hasReviewCommentText(comment),
      reviewComment: comment,
    };
  }

  return {
    needsReview: hasReviewCommentText(rawDescription),
    reviewComment: rawDescription,
  };
};

const buildReviewDescription = (needsReview, reviewComment) => {
  const comment = String(reviewComment ?? '').trim();
  if (!needsReview) return comment;
  return comment ? `${REVIEW_DESCRIPTION_PREFIX} ${comment}` : REVIEW_DESCRIPTION_PREFIX;
};

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const roundToScale = (value, digits = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const toOptionalSeconds = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed === 0) return 0;
  return Math.max(0, Math.round(parsed));
};

const toDraftNumberText = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(roundToScale(parsed, 4));
};

// 생산계획 카드 상태 라벨과 동일한 커스텀 팔레트 사용 (공유 팔레트 — agent.md 참조)
const AT_RELIABILITY_PALETTE = {
  [AT_RELIABILITY_STATUS.COLLECTING]:     { bg: '#EBEBF0', text: '#747484' },
  [AT_RELIABILITY_STATUS.UNRELIABLE]:     { bg: '#F5D0D5', text: '#B42318' },
  [AT_RELIABILITY_STATUS.INSUFFICIENT]:   { bg: '#F7DCC8', text: '#AC6424' },
  [AT_RELIABILITY_STATUS.USABLE]:         { bg: '#F5E7B2', text: '#8A6100' },
  [AT_RELIABILITY_STATUS.TRUSTED]:        { bg: '#BFEAD0', text: '#268444' },
  [AT_RELIABILITY_STATUS.VERIFIED]:       { bg: '#C8DFF7', text: '#3674B4' },
};

const AT_RELIABILITY_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': {
    px: 0.75,
    fontSize: '0.65rem',
    lineHeight: 1.1,
  },
};

const resolveAtReliabilityPalette = (reliability) =>
  AT_RELIABILITY_PALETTE[reliability?.status] ||
  AT_RELIABILITY_PALETTE[AT_RELIABILITY_STATUS.COLLECTING];

const ST_AT_GAP_PALETTE = {
  [TIME_DIVERGENCE_SEVERITY.NORMAL]: { bg: '#DCEAF8', text: '#245A95' },
  [TIME_DIVERGENCE_SEVERITY.REVIEW]: { bg: '#F7DCC8', text: '#AC6424' },
  [TIME_DIVERGENCE_SEVERITY.CRITICAL]: { bg: '#F5D0D5', text: '#B42318' },
};

const ST_AT_GAP_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': {
    px: 0.75,
    fontSize: '0.65rem',
    lineHeight: 1.1,
    fontWeight: 700,
  },
};

const resolveAtReliabilityPercentLabel = (reliability) => {
  const percent = Number(reliability?.percent);
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
};

const resolveStAtGapPalette = (meta) =>
  ST_AT_GAP_PALETTE[meta?.severity] || ST_AT_GAP_PALETTE[TIME_DIVERGENCE_SEVERITY.NORMAL];

const normalizeStyleProcessCodeSegment = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const hashStyleProcessText = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase();
};

const buildCustomStyleSpecCode = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '').toLowerCase();
  const numberMatch = compact.match(/\d+(?:\.\d+)?/);
  const numericToken = numberMatch ? numberMatch[0].replace(/\./g, '_') : '';
  if (numericToken) {
    if (/(mm)/i.test(compact)) return `${numericToken}MM`;
    if (/(cm)/i.test(compact)) return `${numericToken}CM`;
    if (/(line|needle|ly|줄|선)/i.test(compact)) return `${numericToken}N`;
    if (/(thread|chi|실|soi)/i.test(compact)) return `${numericToken}T`;
  }
  const normalized = normalizeStyleProcessCodeSegment(text);
  if (normalized) return normalized;
  return `SPEC_${hashStyleProcessText(text).slice(0, 6)}`;
};

const normalizeProcessMasterOption = (item, defaultType = '') => {
  if (item === null || item === undefined) return null;
  const label =
    typeof item === 'string'
      ? item.trim()
      : String(
          item?.label ??
            item?.nameKo ??
            item?.nameEn ??
            item?.nameVi ??
            item?.name ??
            item?.value ??
            ''
        ).trim();
  const type = String(item?.type ?? defaultType).trim().toUpperCase();
  const codeSource = typeof item === 'string' ? '' : item?.code;
  const code =
    normalizeStyleProcessCodeSegment(codeSource) ||
    (type === 'SPEC' ? buildCustomStyleSpecCode(label) : '');
  if (!label && !code) return null;

  return {
    id: typeof item === 'object' && !Array.isArray(item) ? item?.id ?? null : null,
    type,
    code: code || null,
    label: label || code,
    nameKo:
      (typeof item === 'object' && !Array.isArray(item) ? String(item?.nameKo ?? '').trim() : '') ||
      label ||
      code,
    nameEn:
      (typeof item === 'object' && !Array.isArray(item) ? String(item?.nameEn ?? '').trim() : '') ||
      label ||
      code,
    nameVi:
      (typeof item === 'object' && !Array.isArray(item) ? String(item?.nameVi ?? '').trim() : '') ||
      label ||
      code,
    sortOrder:
      typeof item === 'object' && !Array.isArray(item) && Number.isFinite(Number(item?.sortOrder))
        ? Number(item.sortOrder)
        : 0,
    isCustom:
      Boolean(typeof item === 'object' && !Array.isArray(item) && item?.isCustom) ||
      (type === 'SPEC' && !codeSource),
  };
};

const getProcessMasterOptionIdentity = (item, defaultType = '') => {
  const normalized = normalizeProcessMasterOption(item, defaultType);
  if (!normalized) return '';
  return `${normalized.type}:${normalized.code ?? ''}:${String(normalized.label ?? '')
    .trim()
    .toLowerCase()}`;
};

const LANGUAGE_SORT_LOCALE_BY_CODE = {
  ko: 'ko-KR',
  en: 'en-US',
  vi: 'vi-VN',
};

const resolveProcessMasterSortLabel = (item, languageCode) => {
  if (!item || typeof item !== 'object') return '';
  if (languageCode === 'ko') {
    return String(item?.nameKo ?? item?.label ?? item?.code ?? '').trim();
  }
  if (languageCode === 'vi') {
    return String(item?.nameVi ?? item?.label ?? item?.code ?? '').trim();
  }
  return String(item?.nameEn ?? item?.label ?? item?.code ?? '').trim();
};

const compareProcessMasterOptionAsc = (left, right, languageCode = 'en') => {
  const locale = LANGUAGE_SORT_LOCALE_BY_CODE[languageCode] || 'en-US';
  const leftLabel = resolveProcessMasterSortLabel(left, languageCode);
  const rightLabel = resolveProcessMasterSortLabel(right, languageCode);

  const labelCompare = leftLabel.localeCompare(rightLabel, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (labelCompare !== 0) return labelCompare;

  const leftCode = String(left?.code ?? '').trim();
  const rightCode = String(right?.code ?? '').trim();
  const codeCompare = leftCode.localeCompare(rightCode, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (codeCompare !== 0) return codeCompare;

  const leftSort = Number.isFinite(Number(left?.sortOrder)) ? Number(left.sortOrder) : 0;
  const rightSort = Number.isFinite(Number(right?.sortOrder)) ? Number(right.sortOrder) : 0;
  return leftSort - rightSort;
};

const normalizeProcessCompositionEntry = (value, kind) => {
  const normalized = normalizeProcessMasterOption(value, kind.toUpperCase());
  if (!normalized) return null;
  const code =
    normalizeStyleProcessCodeSegment(normalized.code) ||
    (kind === 'spec'
      ? buildCustomStyleSpecCode(normalized.label)
      : normalizeStyleProcessCodeSegment(normalized.label));
  const label = String(normalized.label ?? code ?? '').trim();
  if (!label && !code) return null;

  return {
    code: code || null,
    label: label || code,
    nameKo: normalized.nameKo || label || code,
    nameEn: normalized.nameEn || label || code,
    nameVi: normalized.nameVi || label || code,
    isCustom: Boolean(normalized.isCustom),
  };
};

const normalizeProcessCompositionEntries = (values, kind) => {
  const entries = (Array.isArray(values) ? values : [])
    .map((value) => normalizeProcessCompositionEntry(value, kind))
    .filter(Boolean);
  const used = new Set();

  return entries.filter((entry) => {
    const dedupeKey = `${String(entry?.code ?? '')}::${String(entry?.label ?? '')
      .trim()
      .toLowerCase()}`;
    if (!dedupeKey || used.has(dedupeKey)) return false;
    used.add(dedupeKey);
    return true;
  });
};

const buildProcessComposition = (draft) => {
  const partInputs = Array.isArray(draft?.parts)
    ? draft.parts
    : draft?.part
      ? [draft.part]
      : [];
  const parts = normalizeProcessCompositionEntries(partInputs, 'part');
  const part = parts[0] ?? null;
  const targetInputs = Array.isArray(draft?.targets)
    ? draft.targets
    : draft?.target
      ? [draft.target]
      : [];
  const targets = normalizeProcessCompositionEntries(targetInputs, 'target');
  const actions = normalizeProcessCompositionEntries(draft?.actions, 'action');
  const spec = normalizeProcessCompositionEntry(draft?.spec, 'spec');
  const specs = spec ? [spec] : [];

  if (parts.length === 0 && targets.length === 0 && actions.length === 0 && specs.length === 0) {
    return null;
  }

  return { part, parts, targets, actions, specs };
};

const resolveProcessCompositionText = (entry, languageCode) => {
  if (!entry || typeof entry !== 'object') return '';
  if (languageCode === 'ko') {
    return String(entry?.nameKo ?? entry?.label ?? entry?.code ?? '').trim();
  }
  if (languageCode === 'vi') {
    return String(entry?.nameVi ?? entry?.label ?? entry?.code ?? '').trim();
  }
  return String(entry?.nameEn ?? entry?.label ?? entry?.code ?? '').trim();
};

const buildProcessNameFromComposition = (composition, languageCode, fallback = '') => {
  if (!composition || typeof composition !== 'object') {
    return String(fallback ?? '').trim();
  }

  const partEntries = Array.isArray(composition.parts)
    ? composition.parts
    : composition.part
      ? [composition.part]
      : [];
  const partText = partEntries
    .map((entry) => resolveProcessCompositionText(entry, languageCode))
    .filter(Boolean)
    .join('·');
  const targetText = (Array.isArray(composition.targets) ? composition.targets : [])
    .map((entry) => resolveProcessCompositionText(entry, languageCode))
    .filter(Boolean)
    .join('·');
  const actionText = (Array.isArray(composition.actions) ? composition.actions : [])
    .map((entry) => resolveProcessCompositionText(entry, languageCode))
    .filter(Boolean)
    .join(' + ');
  const specText = (Array.isArray(composition.specs) ? composition.specs : [])
    .map((entry) => resolveProcessCompositionText(entry, languageCode))
    .filter(Boolean)
    .join('·');

  const targetWithSpec = targetText
    ? `${targetText}${specText ? `(${specText})` : ''}`
    : specText
      ? `(${specText})`
      : '';
  const leftText = partText && targetWithSpec ? `${partText}: ${targetWithSpec}` : partText || targetWithSpec;
  const baseText = leftText && actionText ? `${leftText} - ${actionText}` : leftText || actionText;
  if (!baseText) return String(fallback ?? '').trim();
  return baseText;
};

const buildProcessLocalizedNamesFromComposition = (composition, fallback = {}) => ({
  nameKo: buildProcessNameFromComposition(composition, 'ko', fallback.nameKo ?? fallback.name),
  nameEn: buildProcessNameFromComposition(composition, 'en', fallback.nameEn ?? fallback.name),
  nameVi: buildProcessNameFromComposition(composition, 'vi', fallback.nameVi ?? fallback.name),
});

const buildProcessCodeFromComposition = (composition, fallback = null) => {
  if (!composition || typeof composition !== 'object') {
    return normalizeStyleProcessCodeSegment(fallback);
  }

  const tokens = [
    ...(Array.isArray(composition?.parts)
      ? composition.parts
      : composition?.part
        ? [composition.part]
        : []
    ).map((entry) => entry?.code),
    ...(Array.isArray(composition?.targets) ? composition.targets : []).map((entry) => entry?.code),
    ...(Array.isArray(composition?.actions) ? composition.actions : []).map((entry) => entry?.code),
    ...(Array.isArray(composition?.specs) ? composition.specs : []).map(
      (entry) => entry?.code || buildCustomStyleSpecCode(entry?.label)
    ),
  ]
    .map((token) => normalizeStyleProcessCodeSegment(token))
    .filter(Boolean);

  if (tokens.length > 0) return tokens.join('_');
  return normalizeStyleProcessCodeSegment(fallback);
};

const resolveProcessMasterLabel = (value, languageCode) => {
  if (typeof value === 'string') return value.trim();
  const normalized = normalizeProcessMasterOption(value);
  return resolveProcessCompositionText(normalized, languageCode);
};

const resolveLocalizedProcessDisplayLabel = (process, languageCode, fallback = 'Process') => {
  const composedName = buildProcessNameFromComposition(process?.processComposition, languageCode, '');
  const localizedName =
    composedName ||
    resolveLocalizedProcessName(
      {
        code: process?.code,
        name: process?.name,
        nameKo: process?.nameKo,
        nameEn: process?.nameEn,
        nameVi: process?.nameVi,
      },
      languageCode
    );
  return formatProcessNameWithQuantity(localizedName || process?.name || process?.code, process?.quantity) || fallback;
};

const getProcessIdentity = (process) => {
  if (!process || typeof process !== 'object') return '';
  const code = String(process.code ?? '')
    .trim()
    .toUpperCase();
  if (code) return `code:${code}`;
  if (process.id !== null && process.id !== undefined && process.id !== '') {
    return `id:${String(process.id)}`;
  }
  const name = String(process.name ?? '')
    .trim()
    .toLowerCase();
  return name ? `name:${name}` : '';
};

const createInstanceId = (process) =>
  `${process?.code || process?.name || 'PROC'}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const normalizeStValues = (process) => {
  const normalized = normalizeProcess(process);
  return Array.isArray(normalized?.stValues) ? normalized.stValues : [];
};

const resolveExactStPerPiece = (process, quantity) =>
  resolveProcessExactStPerPieceSeconds(process, quantity);

const upsertProcessStValues = (process, quantity, seconds, setBy = 'MANUAL') => {
  const normalized = normalizeProcess(process);
  const resolvedQuantity = resolveStBucketQuantity(quantity);
  const nextSeconds = toOptionalSeconds(seconds);
  const nextValues = normalizeStValues(normalized).filter(
    (value) => toPositiveInt(value?.quantity, 0) !== resolvedQuantity
  );
  if (nextSeconds != null) {
    nextValues.push({
      quantity: resolvedQuantity,
      seconds: roundToScale(nextSeconds, 4),
      setBy,
      setAt: null,
      updatedAt: null,
    });
  }
  nextValues.sort((left, right) => left.quantity - right.quantity);
  return normalizeProcess({
    ...normalized,
    stValues: nextValues,
    timeRefQuantity: normalized?.timeRefQuantity ?? DEFAULT_TIME_REF_QUANTITY,
    ct: null,
    stManual: false,
  });
};

const resolveDraftStInputValue = (draft) => String(draft?.st ?? '').trim();

const buildProcessPayload = (
  draft,
  existingProcess = null,
  timeRefQuantity = DEFAULT_TIME_REF_QUANTITY
) => {
  const composition = buildProcessComposition(draft);
  const localizedNames = buildProcessLocalizedNamesFromComposition(composition, {
    name: existingProcess?.name,
    nameKo: existingProcess?.nameKo,
    nameEn: existingProcess?.nameEn,
    nameVi: existingProcess?.nameVi,
  });
  const processCode = buildProcessCodeFromComposition(
    composition,
    localizedNames.nameEn || localizedNames.nameKo || existingProcess?.code || existingProcess?.name
  );
  const resolvedTimeRefQuantity = toPositiveInt(
    timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const resolvedStBucketQuantity = resolveStBucketQuantity(resolvedTimeRefQuantity);
  const processQuantity = toPositiveInt(existingProcess?.quantity, 1);
  const ptTotalForDisplay = parseOptionalSecondsInput(draft.pt);
  const stTotalForDisplay = parseOptionalSecondsInput(draft.st);
  const reviewComment = String(draft?.reviewComment ?? '').trim();
  const reviewNeedsCheck = hasReviewCommentText(reviewComment);
  const reviewDescription = buildReviewDescription(reviewNeedsCheck, reviewComment);
  const ptPerPiece =
    ptTotalForDisplay == null
      ? null
      : toOptionalSeconds(roundToScale(ptTotalForDisplay / processQuantity, 4));
  const exactStPerPiece =
    stTotalForDisplay == null
      ? null
      : toOptionalSeconds(roundToScale(stTotalForDisplay / processQuantity, 4));
  const existingStValues = normalizeStValues(existingProcess);
  const nextStValues = existingStValues.filter(
    (value) => toPositiveInt(value?.quantity, 0) !== resolvedStBucketQuantity
  );
  if (exactStPerPiece != null) {
    nextStValues.push({
      quantity: resolvedStBucketQuantity,
      seconds: exactStPerPiece,
      setBy: 'MANUAL',
      setAt: null,
      updatedAt: null,
    });
  } else if (resolvedStBucketQuantity === PT_REFERENCE_QUANTITY && ptPerPiece != null) {
    nextStValues.push({
      quantity: PT_REFERENCE_QUANTITY,
      seconds: ptPerPiece,
      setBy: 'PT_DERIVED',
      setAt: null,
      updatedAt: null,
    });
  }
  nextStValues.sort((left, right) => left.quantity - right.quantity);

  return normalizeProcess({
    ...(existingProcess || {}),
    id: existingProcess?.id ?? null,
    code: processCode || existingProcess?.code,
    name: localizedNames.nameEn || existingProcess?.name || processCode,
    nameKo: localizedNames.nameKo || existingProcess?.nameKo || processCode,
    nameEn: localizedNames.nameEn || existingProcess?.nameEn || processCode,
    nameVi: localizedNames.nameVi || existingProcess?.nameVi || processCode,
    processComposition: composition,
    description: reviewDescription || null,
    needsReview: reviewNeedsCheck,
    reviewComment: reviewComment || '',
    quantity: processQuantity,
    timeRefQuantity: resolvedTimeRefQuantity,
    pt: ptPerPiece,
    stValues: nextStValues,
    ct: null,
    stManual: false,
    atParams: existingProcess?.atParams ?? null,
    instanceId:
      existingProcess?.instanceId ||
      createInstanceId({
        code: processCode,
        name: localizedNames.nameEn || localizedNames.nameKo || processCode,
      }),
  });
};

const buildDraftFromProcess = (process, timeRefQuantity = DEFAULT_TIME_REF_QUANTITY) => {
  const safeProcess = normalizeProcess(process);
  const composition = safeProcess?.processComposition || {};
  const processQuantity = toPositiveInt(safeProcess?.quantity, 1);
  const ptPerPiece = toOptionalSeconds(safeProcess?.pt);
  const exactStPerPiece = resolveExactStPerPiece(safeProcess, timeRefQuantity);
  const reviewMeta = parseProcessReviewMeta(safeProcess);
  const existingTargets = Array.isArray(composition?.targets)
    ? composition.targets
    : composition?.target
      ? [composition.target]
      : [];
  const existingParts = Array.isArray(composition?.parts)
    ? composition.parts
    : composition?.part
      ? [composition.part]
      : [];

  return {
    parts: normalizeProcessCompositionEntries(existingParts, 'part'),
    targets: normalizeProcessCompositionEntries(existingTargets, 'target'),
    actions: normalizeProcessCompositionEntries(composition?.actions, 'action'),
    spec: normalizeProcessCompositionEntry(
      Array.isArray(composition?.specs) ? composition.specs[0] : null,
      'spec'
    ),
    pt:
      ptPerPiece == null
        ? ''
        : toDraftNumberText(roundToScale(ptPerPiece * processQuantity, 4)),
    st:
      exactStPerPiece == null
        ? ''
        : toDraftNumberText(roundToScale(exactStPerPiece * processQuantity, 4)),
    needsReview: hasReviewCommentText(reviewMeta.reviewComment),
    reviewComment: reviewMeta.reviewComment || '',
  };
};

const StyleProcess = ({
  processes = [],
  onProcessesChange,
}) => {
  const { languageCode } = useLanguage();
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [timeRefQuantity, setTimeRefQuantity] = useState(DEFAULT_TIME_REF_QUANTITY);
  const [timeRefQuantityInput, setTimeRefQuantityInput] = useState('');
  const [isTimeRefQuantityEditing, setIsTimeRefQuantityEditing] = useState(false);
  const [processMasterOptions, setProcessMasterOptions] = useState({
    parts: [],
    targets: [],
    actions: [],
    specs: [],
  });
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProcessMasterOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError('');
      try {
        const data = await fetchProcessMasterOptions();
        if (!active) return;
        setProcessMasterOptions({
          parts: Array.isArray(data?.parts) ? data.parts : [],
          targets: Array.isArray(data?.targets) ? data.targets : [],
          actions: Array.isArray(data?.actions) ? data.actions : [],
          specs: Array.isArray(data?.specs) ? data.specs : [],
        });
      } catch (_error) {
        if (!active) return;
        setProcessMasterOptions({
          parts: [],
          targets: [],
          actions: [],
          specs: [],
        });
        setOptionsError(
          languageCode === 'ko'
            ? '공정 조합 사전을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
            : languageCode === 'vi'
              ? 'Khong the tai tu dien to hop cong doan. Hay thu lai sau.'
              : 'Failed to load process composition options. Please try again later.'
        );
      } finally {
        if (active) {
          setIsLoadingOptions(false);
        }
      }
    };

    loadProcessMasterOptions();

    return () => {
      active = false;
    };
  }, [languageCode]);

  const partOptions = useMemo(
    () =>
      (Array.isArray(processMasterOptions.parts) ? processMasterOptions.parts : [])
        .map((item) => normalizeProcessMasterOption(item, 'PART'))
        .filter(Boolean)
        .sort((left, right) => compareProcessMasterOptionAsc(left, right, languageCode)),
    [languageCode, processMasterOptions.parts]
  );
  const targetOptions = useMemo(
    () =>
      (Array.isArray(processMasterOptions.targets) ? processMasterOptions.targets : [])
        .map((item) => normalizeProcessMasterOption(item, 'TARGET'))
        .filter(Boolean)
        .sort((left, right) => compareProcessMasterOptionAsc(left, right, languageCode)),
    [languageCode, processMasterOptions.targets]
  );
  const actionOptions = useMemo(
    () =>
      (Array.isArray(processMasterOptions.actions) ? processMasterOptions.actions : [])
        .map((item) => normalizeProcessMasterOption(item, 'ACTION'))
        .filter(Boolean)
        .sort((left, right) => compareProcessMasterOptionAsc(left, right, languageCode)),
    [languageCode, processMasterOptions.actions]
  );
  const specOptions = useMemo(
    () =>
      (Array.isArray(processMasterOptions.specs) ? processMasterOptions.specs : [])
        .map((item) => normalizeProcessMasterOption(item, 'SPEC'))
        .filter(Boolean)
        .sort((left, right) => compareProcessMasterOptionAsc(left, right, languageCode)),
    [languageCode, processMasterOptions.specs]
  );

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState(null);
  const [addDraft, setAddDraft] = useState(createEmptyDraft);
  const deferredAddDraft = useDeferredValue(addDraft);
  const [addError, setAddError] = useState('');
  const displayOrderQuantity = useMemo(
    () => toPositiveInt(timeRefQuantity, DEFAULT_TIME_REF_QUANTITY),
    [timeRefQuantity]
  );

  const totalPT = useMemo(
    () => {
      return safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const ptPerPiece = toOptionalSeconds(process?.pt);
        if (ptPerPiece == null) return acc;
        return acc + processQuantity * ptPerPiece;
      }, 0);
    },
    [safeProcesses]
  );
  const totalAT = useMemo(
    () => {
      return safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const atPerPiece = resolveProcessAtPerPieceSeconds(process, displayOrderQuantity);
        if (atPerPiece == null) return acc;
        return acc + processQuantity * atPerPiece;
      }, 0);
    },
    [safeProcesses, displayOrderQuantity]
  );
  const totalST = useMemo(
    () =>
      safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const value = resolveProcessStPerPieceSeconds(
          process,
          displayOrderQuantity
        );
        return value == null ? acc : acc + processQuantity * value;
      }, 0),
    [safeProcesses, displayOrderQuantity]
  );
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(() => hasAnyProcessTime(safeProcesses, 'at'), [safeProcesses]);
  const hasST = useMemo(
    () =>
      safeProcesses.some(
        (process) =>
          resolveProcessStPerPieceSeconds(
            process,
            displayOrderQuantity
          ) != null
      ),
    [safeProcesses, displayOrderQuantity]
  );
  const timeRefQuantityLabel = useMemo(
    () => displayOrderQuantity.toLocaleString('ko-KR'),
    [displayOrderQuantity]
  );
  const stBucketQuantity = useMemo(
    () => resolveStBucketQuantity(displayOrderQuantity),
    [displayOrderQuantity]
  );
  const stBucketQuantityLabel = useMemo(
    () => formatStBucketQuantityLabel(stBucketQuantity, 'ko-KR'),
    [stBucketQuantity]
  );
  const ptTimeRefQuantityLabel = useMemo(
    () => PT_REFERENCE_QUANTITY.toLocaleString('ko-KR'),
    []
  );
  const styleAtReliability = useMemo(() => {
    return resolveStyleAtReliability(safeProcesses);
  }, [safeProcesses]);
  const totalStGapPercent = useMemo(
    () => (hasAT && hasST ? calculateDivergencePercent(totalAT, totalST) : null),
    [hasAT, hasST, totalAT, totalST]
  );

  const hasRequiredMasterOptions = partOptions.length > 0;
  const canStartAdd = !isLoadingOptions && !optionsError && hasRequiredMasterOptions;
  const isEditingRow = Boolean(editingInstanceId);
  const isDraftOpen = isAddingRow || isEditingRow;
  const editingProcess = useMemo(
    () =>
      isEditingRow
        ? safeProcesses.find((process) => process.instanceId === editingInstanceId) || null
        : null,
    [editingInstanceId, isEditingRow, safeProcesses]
  );

  // 입력 중: raw 문자열만 저장 (파싱하지 않음)
  const handleTimeRefQuantityChange = (event) => {
    setTimeRefQuantityInput(event.target.value);
  };

  const handleTimeRefQuantityFocus = () => {
    if (isTimeRefQuantityEditing) return;
    setTimeRefQuantityInput('');
    setIsTimeRefQuantityEditing(true);
  };

  const commitTimeRefQuantity = () => {
    const rawValue = String(timeRefQuantityInput).replace(/,/g, '').trim();
    const nextValue = rawValue
      ? toPositiveInt(rawValue, timeRefQuantity)
      : timeRefQuantity;

    setTimeRefQuantity(nextValue);
    setTimeRefQuantityInput('');
    setIsTimeRefQuantityEditing(false);
  };

  const handleTimeRefQuantityBlur = () => {
    commitTimeRefQuantity();
  };

  const handleTimeRefQuantityKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      commitTimeRefQuantity();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setTimeRefQuantityInput('');
      setIsTimeRefQuantityEditing(false);
      event.currentTarget.blur();
    }
  };
  const handleNumberInputEnterKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }, []);

  const validateDraft = (draft, options = {}) => {
    const { ignoreInstanceId = null } = options;
    if (!Array.isArray(draft.parts) || draft.parts.length === 0) {
      return getStyleProcessMessage(languageCode, 'validatePart');
    }
    if (!Array.isArray(draft.actions) || draft.actions.length === 0) {
      return getStyleProcessMessage(languageCode, 'validateAction');
    }

    const previewProcess = buildProcessPayload(draft, null, timeRefQuantity);
    const identity = getProcessIdentity(previewProcess);
    if (!identity) return getStyleProcessMessage(languageCode, 'validateInvalid');

    const duplicated = safeProcesses.some((process) => {
      if (ignoreInstanceId && process.instanceId === ignoreInstanceId) return false;
      return getProcessIdentity(process) === identity;
    });
    if (duplicated) return getStyleProcessMessage(languageCode, 'validateDuplicate');
    return '';
  };

  const handleStartAddRow = () => {
    if (!canStartAdd) return;
    setEditingInstanceId(null);
    setIsAddingRow(true);
    setAddDraft(createEmptyDraft());
    setAddError('');
  };

  const handleCancelAddRow = () => {
    setIsAddingRow(false);
    setEditingInstanceId(null);
    setAddDraft(createEmptyDraft());
    setAddError('');
  };

  const handleStartEditRow = useCallback((process) => {
    if (!process) return;
    setIsAddingRow(false);
    setEditingInstanceId(process.instanceId);
    setAddDraft(buildDraftFromProcess(process, displayOrderQuantity));
    setAddError('');
  }, [displayOrderQuantity]);

  const handleSaveAddRow = () => {
    const errorMessage = validateDraft(addDraft, {
      ignoreInstanceId: isEditingRow ? editingInstanceId : null,
    });
    if (errorMessage) {
      setAddError(errorMessage);
      return;
    }
    const nextProcess = buildProcessPayload(addDraft, editingProcess, timeRefQuantity);
    if (isEditingRow) {
      onProcessesChange(
        safeProcesses.map((process) =>
          process.instanceId === editingInstanceId ? nextProcess : process
        )
      );
    } else {
      onProcessesChange([...safeProcesses, nextProcess]);
    }
    handleCancelAddRow();
  };

  const handleInlineChange = useCallback((process, field, rawValue) => {
    let updatedProcess;
    if (field === 'pt') {
      const parsed = parseOptionalSecondsInput(rawValue);
      updatedProcess = normalizeProcess({ ...process, pt: parsed });
      if (
        toPositiveInt(displayOrderQuantity, DEFAULT_TIME_REF_QUANTITY) === PT_REFERENCE_QUANTITY &&
        resolveExactStPerPiece(process, PT_REFERENCE_QUANTITY) == null &&
        parsed != null
      ) {
        updatedProcess = upsertProcessStValues(
          updatedProcess,
          PT_REFERENCE_QUANTITY,
          parsed,
          'PT_DERIVED'
        );
      }
    } else if (field === 'st') {
      const parsed = parseOptionalSecondsInput(rawValue);
      updatedProcess = upsertProcessStValues(
        process,
        displayOrderQuantity,
        parsed,
        'MANUAL'
      );
    } else {
      return;
    }
    onProcessesChange(safeProcesses.map((p) => p.instanceId === process.instanceId ? updatedProcess : p));
  }, [displayOrderQuantity, onProcessesChange, safeProcesses]);

  const handleRemoveProcess = useCallback((instanceId) => {
    onProcessesChange(safeProcesses.filter((process) => process.instanceId !== instanceId));
  }, [onProcessesChange, safeProcesses]);

  const onDragEnd = useCallback((result) => {
    if (isDraftOpen) return;
    if (!result.destination) return;

    const nextProcesses = Array.from(safeProcesses);
    const [reorderedItem] = nextProcesses.splice(result.source.index, 1);
    nextProcesses.splice(result.destination.index, 0, reorderedItem);
    onProcessesChange(nextProcesses);
  }, [isDraftOpen, onProcessesChange, safeProcesses]);

  const renderRowActions = useCallback((process) => (
    <Stack direction="row" spacing={0.25} justifyContent="center">
      <Tooltip title={getStyleProcessMessage(languageCode, 'edit')}>
        <span>
          <IconButton
            size="small"
            onClick={() => handleStartEditRow(process)}
            disabled={isAddingRow}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={getStyleProcessMessage(languageCode, 'delete')}>
        <IconButton size="small" onClick={() => handleRemoveProcess(process.instanceId)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  ), [handleRemoveProcess, handleStartEditRow, isAddingRow, languageCode]);

  const addPreviewProcess = isDraftOpen
    ? buildProcessPayload(deferredAddDraft, editingProcess, timeRefQuantity)
    : null;
  const addPreviewAtTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessAtPerPieceSeconds(
          addPreviewProcess,
          displayOrderQuantity
        );
  const addPreviewStTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessStPerPieceSeconds(
          addPreviewProcess,
          displayOrderQuantity
        );
  const processRows = useMemo(
    () =>
      safeProcesses.map((process, index) => (
        <Draggable
          key={process.instanceId}
          draggableId={process.instanceId}
          index={index}
          isDragDisabled={Boolean(isDraftOpen)}
        >
          {(dragProvided) => {
            const previewAtTotalSeconds =
              resolveProcessAtPerPieceSeconds(process, displayOrderQuantity);
            const previewStTotalSeconds =
              resolveProcessStPerPieceSeconds(process, displayOrderQuantity);
            const reviewMeta = parseProcessReviewMeta(process);

            return (
              <TableRow
                ref={dragProvided.innerRef}
                {...dragProvided.draggableProps}
                hover
              >
                <TableCell
                  align="center"
                  {...dragProvided.dragHandleProps}
                    sx={{
                      cursor: isDraftOpen ? 'not-allowed' : 'grab',
                      color: 'text.secondary',
                    }}
                >
                  <Stack
                    direction="row"
                    spacing={0.25}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <DragIndicatorIcon fontSize="small" />
                    <Typography variant="caption">{index + 1}</Typography>
                  </Stack>
                </TableCell>

                <TableCell>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <span>
                      {resolveLocalizedProcessDisplayLabel(
                        process,
                        languageCode,
                        getStyleProcessMessage(languageCode, 'processColumn')
                      )}
                    </span>
                    {reviewMeta.needsReview ? (
                      <Tooltip
                        title={
                          reviewMeta.reviewComment ||
                          getStyleProcessMessage(languageCode, 'reviewRequiredLabel')
                        }
                      >
                        <Chip
                          size="small"
                          label={getStyleProcessMessage(languageCode, 'reviewBadge')}
                          color="warning"
                          variant="outlined"
                        />
                      </Tooltip>
                    ) : null}
                  </Stack>
                </TableCell>

                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  <TextField
                    key={process.instanceId + '_pt'}
                    size="small"
                    type="number"
                    defaultValue={toDraftNumberText(process.pt)}
                    onBlur={(e) => handleInlineChange(process, 'pt', e.target.value)}
                    onKeyDown={handleNumberInputEnterKeyDown}
                    onWheel={(e) => e.target.blur()}
                    inputProps={{ min: 0 }}
                    placeholder="-"
                    sx={{ width: 86 }}
                  />
                </TableCell>

                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  {formatAtSecondsOrBlank(previewAtTotalSeconds)}
                </TableCell>
                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  <TextField
                    key={process.instanceId + '_st'}
                    size="small"
                    type="number"
                    defaultValue={
                      resolveExactStPerPiece(process, displayOrderQuantity) == null
                        ? ''
                        : toDraftNumberText(
                            resolveExactStPerPiece(
                              process,
                              displayOrderQuantity
                            )
                          )
                    }
                    onBlur={(e) => handleInlineChange(process, 'st', e.target.value)}
                    onKeyDown={handleNumberInputEnterKeyDown}
                    onWheel={(e) => e.target.blur()}
                    inputProps={{ min: 0 }}
                    placeholder={
                      previewStTotalSeconds == null
                        ? '-'
                        : toDraftNumberText(previewStTotalSeconds)
                    }
                    sx={{
                      width: 86,
                      '& input': {
                        fontWeight:
                          resolveExactStPerPiece(process, displayOrderQuantity) != null
                            ? 700
                            : 400,
                      },
                    }}
                  />
                </TableCell>
                <TableCell align="center" sx={{ width: PROCESS_ACTION_COLUMN_WIDTH }}>
                  {renderRowActions(process)}
                </TableCell>
              </TableRow>
            );
          }}
        </Draggable>
      )),
    [
      displayOrderQuantity,
      handleInlineChange,
      isDraftOpen,
      languageCode,
      renderRowActions,
      safeProcesses,
    ]
  );
  const renderStGapChip = (percent) => {
    if (percent == null) return null;
    const gapMeta = resolveDivergenceMeta(percent);
    const palette = resolveStAtGapPalette(gapMeta);
    const label = formatDivergencePercentLabel(percent);
    const tooltipTitle = gapMeta.needsReview
      ? getStyleProcessMessage(languageCode, 'stGapReview', { label })
      : getStyleProcessMessage(languageCode, 'stGapNormal', { label });

    return (
      <Tooltip title={tooltipTitle}>
        <Chip
          size="small"
          label={label}
          sx={{
            ...ST_AT_GAP_CHIP_SX,
            backgroundColor: palette.bg,
            color: palette.text,
          }}
        />
      </Tooltip>
    );
  };

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 1.25 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Typography variant="h6">{getStyleProcessMessage(languageCode, 'title')}</Typography>
          <Tooltip title={getStyleProcessMessage(languageCode, 'timeRefTooltip')}>
            <TextField
              size="small"
              type="text"
              inputMode="numeric"
              label={getStyleProcessMessage(languageCode, 'timeRefLabel')}
              value={isTimeRefQuantityEditing ? timeRefQuantityInput : ''}
              onChange={handleTimeRefQuantityChange}
              onFocus={handleTimeRefQuantityFocus}
              onBlur={handleTimeRefQuantityBlur}
              onKeyDown={handleTimeRefQuantityKeyDown}
              placeholder={timeRefQuantityLabel}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 140 }}
            />
          </Tooltip>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleStartAddRow}
          disabled={isDraftOpen || !canStartAdd}
          sx={{
            minWidth: 108,
            height: 36,
            px: 1.5,
            boxShadow: 'none',
            borderRadius: 1.5,
          }}
        >
          {getStyleProcessMessage(languageCode, 'addRow')}
        </Button>
      </Stack>

      {isLoadingOptions && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {getStyleProcessMessage(languageCode, 'loadingOptions')}
        </Typography>
      )}
      {!isLoadingOptions && optionsError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {optionsError}
        </Typography>
      )}
      {!isLoadingOptions && !optionsError && !hasRequiredMasterOptions && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {getStyleProcessMessage(languageCode, 'missingMasterOptions')}
        </Typography>
      )}

      {isDraftOpen && (
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 2,
            p: 2,
            mb: 1.5,
            backgroundColor: '#f8fafc',
          }}
        >
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {getStyleProcessMessage(
                languageCode,
                isEditingRow ? 'editingTitle' : 'addingTitle'
              )}
            </Typography>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1}
              sx={{ alignItems: { xs: 'stretch', lg: 'flex-start' } }}
            >
              <Autocomplete
                multiple
                size="small"
                options={partOptions}
                value={Array.isArray(addDraft.parts) ? addDraft.parts : []}
                disableCloseOnSelect
                onChange={(_event, value) => {
                  setAddDraft((prev) => ({
                    ...prev,
                    parts: normalizeProcessCompositionEntries(value, 'part'),
                  }));
                  setAddError('');
                }}
                getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                isOptionEqualToValue={(option, value) =>
                  getProcessMasterOptionIdentity(option, 'PART') ===
                  getProcessMasterOptionIdentity(value, 'PART')
                }
                filterSelectedOptions
                renderInput={(params) => (
                  <TextField {...params} label={getStyleProcessMessage(languageCode, 'partLabel')} />
                )}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <Autocomplete
                multiple
                size="small"
                options={targetOptions}
                value={Array.isArray(addDraft.targets) ? addDraft.targets : []}
                disableCloseOnSelect
                onChange={(_event, value) => {
                  setAddDraft((prev) => ({
                    ...prev,
                    targets: normalizeProcessCompositionEntries(value, 'target'),
                  }));
                  setAddError('');
                }}
                getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                isOptionEqualToValue={(option, value) =>
                  getProcessMasterOptionIdentity(option, 'TARGET') ===
                  getProcessMasterOptionIdentity(value, 'TARGET')
                }
                filterSelectedOptions
                renderInput={(params) => (
                  <TextField {...params} label={getStyleProcessMessage(languageCode, 'targetLabel')} />
                )}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <Autocomplete
                freeSolo
                forcePopupIcon
                size="small"
                options={specOptions}
                value={addDraft.spec}
                onChange={(_event, value) => {
                  setAddDraft((prev) => ({
                    ...prev,
                    spec: normalizeProcessCompositionEntry(value, 'spec'),
                  }));
                  setAddError('');
                }}
                getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                isOptionEqualToValue={(option, value) =>
                  getProcessMasterOptionIdentity(option, 'SPEC') ===
                  getProcessMasterOptionIdentity(value, 'SPEC')
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={getStyleProcessMessage(languageCode, 'specLabel')}
                    placeholder={getStyleProcessMessage(languageCode, 'specPlaceholder')}
                  />
                )}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={actionOptions}
                value={addDraft.actions}
                disableCloseOnSelect
                onChange={(_event, value) => {
                  setAddDraft((prev) => ({
                    ...prev,
                    actions: normalizeProcessCompositionEntries(value, 'action'),
                  }));
                  setAddError('');
                }}
                getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                isOptionEqualToValue={(option, value) =>
                  getProcessMasterOptionIdentity(option, 'ACTION') ===
                  getProcessMasterOptionIdentity(value, 'ACTION')
                }
                filterSelectedOptions
                renderInput={(params) => (
                  <TextField {...params} label={getStyleProcessMessage(languageCode, 'actionLabel')} />
                )}
                sx={{ flex: 1, minWidth: 220 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {getStyleProcessMessage(languageCode, 'actionCustomNotice')}
            </Typography>

            <Stack
              direction={{ xs: 'column', xl: 'row' }}
              spacing={1}
              sx={{ alignItems: { xs: 'stretch', xl: 'center' } }}
            >
              <Box
                sx={{
                  flex: 1,
                  minHeight: 56,
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: 'common.white',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                  {getStyleProcessMessage(languageCode, 'previewLabel')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {addPreviewProcess
                    ? resolveLocalizedProcessDisplayLabel(
                        addPreviewProcess,
                        languageCode,
                        getStyleProcessMessage(languageCode, 'processColumn')
                      )
                    : getStyleProcessMessage(languageCode, 'previewEmpty')}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  type="number"
                  label={`${getStyleProcessMessage(languageCode, 'ptLabel')}(${ptTimeRefQuantityLabel})`}
                  value={addDraft.pt}
                  onChange={(event) => {
                    setAddDraft((prev) => ({ ...prev, pt: event.target.value }));
                  }}
                  onKeyDown={handleNumberInputEnterKeyDown}
                  onWheel={(e) => e.target.blur()}
                  inputProps={{ min: 0 }}
                  placeholder="-"
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label={`${getStyleProcessMessage(languageCode, 'stLabel')}(${stBucketQuantityLabel})`}
                  value={resolveDraftStInputValue(addDraft)}
                  onChange={(event) => {
                    setAddDraft((prev) => ({
                      ...prev,
                      st: event.target.value,
                    }));
                  }}
                  onKeyDown={handleNumberInputEnterKeyDown}
                  onWheel={(e) => e.target.blur()}
                  inputProps={{ min: 0 }}
                  placeholder={
                    addPreviewStTotalSeconds == null
                      ? '-'
                      : toDraftNumberText(addPreviewStTotalSeconds)
                  }
                  sx={{ width: 132 }}
                />
                <TextField
                  size="small"
                  label={`${getStyleProcessMessage(languageCode, 'atLabel')}(${timeRefQuantityLabel})`}
                  value={formatAtSecondsOrBlank(addPreviewAtTotalSeconds)}
                  InputProps={{ readOnly: true }}
                  inputProps={{ tabIndex: -1 }}
                  sx={{ width: 132 }}
                />
                <Stack spacing={0.25} sx={{ minWidth: 260 }}>
                  <FormControlLabel
                    sx={{ m: 0, '.MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={hasReviewCommentText(addDraft.reviewComment)}
                        onChange={(event) => {
                          setAddDraft((prev) => ({
                            ...prev,
                            needsReview: event.target.checked,
                            reviewComment: event.target.checked
                              ? prev.reviewComment
                              : '',
                          }));
                        }}
                      />
                    )}
                    label={getStyleProcessMessage(languageCode, 'reviewRequiredLabel')}
                  />
                  <TextField
                    size="small"
                    value={addDraft.reviewComment || ''}
                    onChange={(event) => {
                      setAddDraft((prev) => ({
                        ...prev,
                        reviewComment: event.target.value,
                        needsReview: hasReviewCommentText(event.target.value),
                      }));
                    }}
                    onBlur={() => setAddError('')}
                    label={getStyleProcessMessage(languageCode, 'reviewCommentLabel')}
                    placeholder={getStyleProcessMessage(languageCode, 'reviewCommentPlaceholder')}
                    sx={{ minWidth: 240 }}
                  />
                </Stack>
                <Stack direction="row" spacing={0.75}>
                  <SaveButton onClick={handleSaveAddRow} />
                  <Button variant="outlined" onClick={handleCancelAddRow}>
                    {getStyleProcessMessage(languageCode, 'cancel')}
                  </Button>
                </Stack>
              </Stack>
            </Stack>

            {addError && (
              <Typography variant="caption" color="error">
                {addError}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <DragDropContext onDragEnd={onDragEnd}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 70 }}>{getStyleProcessMessage(languageCode, 'orderColumn')}</TableCell>
                  <TableCell sx={{ minWidth: 250 }}>{getStyleProcessMessage(languageCode, 'processColumn')}</TableCell>
                  <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                    <Tooltip
                      title={getStyleProcessMessage(languageCode, 'ptTooltip', {
                        quantity: ptTimeRefQuantityLabel,
                      })}
                      placement="top"
                    >
                      <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                        {`PT(${ptTimeRefQuantityLabel})`}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.75}>
                      <Tooltip
                        title={getStyleProcessMessage(languageCode, 'atTooltip', {
                          quantity: timeRefQuantityLabel,
                        })}
                        placement="top"
                      >
                        <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                          {`AT(${timeRefQuantityLabel})`}
                        </Box>
                      </Tooltip>
                      {styleAtReliability && (
                        <Chip
                          size="small"
                          label={resolveAtReliabilityPercentLabel(styleAtReliability)}
                          sx={{
                            ...AT_RELIABILITY_CHIP_SX,
                            backgroundColor: resolveAtReliabilityPalette(styleAtReliability).bg,
                            color: resolveAtReliabilityPalette(styleAtReliability).text,
                          }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.75}>
                      <Tooltip
                        title={getStyleProcessMessage(languageCode, 'stTooltip', {
                          quantity: stBucketQuantityLabel,
                        })}
                        placement="top"
                      >
                        <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                          {`ST(${stBucketQuantityLabel})`}
                        </Box>
                      </Tooltip>
                      {hasAT && hasST && totalStGapPercent != null ? renderStGapChip(totalStGapPercent) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="center" sx={{ width: PROCESS_ACTION_COLUMN_WIDTH }}>
                    {getStyleProcessMessage(languageCode, 'actionColumn')}
                  </TableCell>
                </TableRow>
              </TableHead>

              <Droppable droppableId="style-processes">
                {(provided) => (
                  <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                    {safeProcesses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                          {getStyleProcessMessage(languageCode, 'empty')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      processRows
                    )}
                    {provided.placeholder}
                  </TableBody>
                )}
              </Droppable>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {getStyleProcessMessage(languageCode, 'total')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasAT ? formatAtSecondsOrBlank(totalAT) : ''}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'primary.main' }}>
                    {hasST ? formatSeconds(totalST) : '-'}
                  </TableCell>
                  <TableCell sx={{ width: PROCESS_ACTION_COLUMN_WIDTH }} />
                </TableRow>
              </TableFooter>
            </Table>
          </DragDropContext>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default StyleProcess;

