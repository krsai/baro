import React, { useEffect, useMemo, useState } from 'react';
import { useCallback, useDeferredValue } from 'react';
import {
  Avatar,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveButton from '../../../../components/SaveButton';
import { useLanguage } from '../../../../context/LanguageContext';
import { fetchProcessMasterOptions } from '../../../../utils/attributeApi';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  ST_STANDARD_BUCKETS,
  calculateProcessDisplayAtTotalForOrderQuantity,
  formatStBucketQuantityLabel,
  formatSeconds,
  hasCompleteDisplayableProcessAtTime,
  hasAnyProcessTime,
  normalizeProcess,
  normalizeProcesses,
  parseOptionalSecondsInput,
  resolveProcessAtDisplayPerPieceSeconds,
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
  processText: '',
  part: null,
  target: null,
  targetSpec: null,
  target2: null,
  targetSpec2: null,
  target3: null,
  targetSpec3: null,
  action: null,
  actionSpec: null,
  action2: null,
  actionSpec2: null,
  action3: null,
  actionSpec3: null,
  processCode: '',
  repeatCount: '1',
  pt: '',
  needsReview: false,
  reviewComment: '',
});
const PT_REFERENCE_QUANTITY = DEFAULT_TIME_REF_QUANTITY;
const PROCESS_CODE_COLUMN_WIDTH = '16ch';
const PROCESS_TIME_COLUMN_WIDTH = 140;
const PROCESS_ACTION_COLUMN_WIDTH = 120;
const DRAFT_TARGET_SLOT_FIELDS = [
  ['target', 'targetSpec'],
  ['target2', 'targetSpec2'],
  ['target3', 'targetSpec3'],
];
const DRAFT_ACTION_SLOT_FIELDS = [
  ['action', 'actionSpec'],
  ['action2', 'actionSpec2'],
  ['action3', 'actionSpec3'],
];
const TARGET_SPEC_NONE_OPTION_CODE = '__NONE__';
const ACTION_SPEC_NONE_OPTION_CODE = '__NONE_ACTION_SPEC__';

const STYLE_PROCESS_MESSAGES = {
  ko: {
    title: '스타일 공정 목록',
    addRow: '공정 추가',
    addingTitle: '새 공정 추가',
    textProcessLabel: '공정(텍스트)',
    textProcessPlaceholder: '예: 앞판 어깨 봉제',
    selectionComposerTitle: '선택 방식(대상/동작)',
    selectionComposerExpand: '선택 방식 펼치기',
    selectionComposerCollapse: '선택 방식 접기',
    selectionComposerHint:
      '저장은 위 텍스트를 기준으로 처리됩니다. 아래 조합 방식은 보관 및 장기 전환 개발용입니다.',
    loadingOptions: '공정 조합 사전을 불러오는 중입니다.',
    missingMasterOptions: '공정 사전에서 대상/동작을 먼저 등록해주세요.',
    partLabel: '위치',
    targetLabel: '대상',
    targetSpecLabel: '대상 규격',
    noSpecOption: '없음',
    addTargetBadge: '대상 등록',
    selectedTargetLabel: '선택된 대상',
    actionLabel: '동작',
    actionSpecLabel: '동작 규격',
    addActionBadge: '동작 등록',
    selectedActionLabel: '선택된 동작',
    actionInputHint: '직접 입력 후 엔터로 추가가 가능합니다.',
    specLabel: '대상 규격',
    specPlaceholder: '예: 3선',
    processCodeLabel: '공정코드',
    processCodePlaceholder: '예: PROC-001',
    repeatCountLabel: '반복횟수',
    previewLabel: '미리보기',
    previewEmpty: '대상과 동작을 등록하면 공정명이 만들어집니다.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    add: '추가',
    save: '저장',
    cancel: '취소',
    edit: '수정',
    reviewRequiredLabel: '공정 검토 필요',
    reviewCommentLabel: '검토 코멘트',
    reviewCommentPlaceholder: '예: 주머니 입구 접기와 부착은 묶음 공정으로 재검토 필요',
    reviewBadge: '검토',
    delete: '삭제',
    deleteBlocked: '작업기록이 연결된 공정은 삭제할 수 없습니다.',
    editingTitle: '공정 수정',
    orderColumn: '순서',
    codeColumn: '코드',
    processColumn: '공정명',
    selectionSummaryLabel: '선택 조합',
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
    ptChangeDialogTitle: 'PT 변경 확인',
    ptChangeMessage:
      'PT가 변경되었습니다. 기존 ST(q)는 자동으로 변경되지 않습니다. 새 PT 값으로 전체 ST(q)를 일괄 업데이트하시겠습니까?',
    ptChangeNoRecordsMessage:
      'ST 유지를 선택하면 PT만 변경됩니다.',
    ptChangeHasRecordsMessage:
      '이미 작업기록이 연결된 공정입니다. ST 전체 업데이트는 기존/현재 계획 및 생산 지표에 영향을 줄 수 있습니다.',
    ptChangeSummary: '{processName}: {previousPt} -> {nextPt}',
    keepStOnPtChange: 'ST 유지',
    updateAllStOnPtChange: 'ST 전체 업데이트',
    updateAllStDisabled: '새 PT 값이 비어 있거나 0이면 ST(q)를 일괄 업데이트할 수 없습니다.',
    validatePart: '대상을 선택해주세요.',
    validateTarget: '대상을 선택해주세요.',
    validateAction: '동작을 선택해주세요.',
    validateTargetDuplicate: '이미 등록된 대상입니다.',
    validateActionDuplicate: '이미 등록된 동작입니다.',
    validateTargetLimit: '대상은 최대 3개까지 등록할 수 있습니다.',
    validateActionLimit: '동작은 최대 3개까지 등록할 수 있습니다.',
    validateTargetRequiredForSpec: '대상 규격을 등록하려면 대상을 먼저 선택해주세요.',
    validateActionRequiredForSpec: '동작 규격을 등록하려면 동작을 먼저 선택해주세요.',
    validateTextRequired: '공정 텍스트를 입력해주세요.',
    validateCodeRequired: '공정코드를 입력해주세요.',
    validateInvalid: '유효한 공정 조합을 입력해주세요.',
    validateDuplicate: '이미 등록된 공정입니다.',
    validateDuplicateCode: '이미 사용 중인 공정코드입니다.',
    stGapReview: 'AT와 ST 차이가 {label}로 커서 ST 조정 검토가 필요합니다.',
    stGapNormal: 'AT와 ST 차이율 {label}',
  },
  en: {
    title: 'Style Process List',
    addRow: 'Add Process',
    addingTitle: 'New Process',
    textProcessLabel: 'Process Text',
    textProcessPlaceholder: 'e.g. Front panel shoulder join',
    selectionComposerTitle: 'Selection mode (target/action)',
    selectionComposerExpand: 'Expand selection mode',
    selectionComposerCollapse: 'Collapse selection mode',
    selectionComposerHint:
      'Saving uses the text field above as primary. Use this composer for preservation and future migration.',
    loadingOptions: 'Loading process composition options...',
    missingMasterOptions: 'Register target/action options first.',
    partLabel: 'Location',
    targetLabel: 'Target',
    targetSpecLabel: 'Target Spec',
    noSpecOption: 'None',
    addTargetBadge: 'Add Target',
    selectedTargetLabel: 'Selected targets',
    actionLabel: 'Action',
    actionSpecLabel: 'Action Spec',
    addActionBadge: 'Add Action',
    selectedActionLabel: 'Selected actions',
    actionInputHint: 'Type directly and press Enter to add.',
    specLabel: 'Target Spec',
    specPlaceholder: 'e.g. 3-line',
    processCodeLabel: 'Process Code',
    processCodePlaceholder: 'e.g. PROC-001',
    repeatCountLabel: 'Repeat Count',
    previewLabel: 'Preview',
    previewEmpty: 'Register targets and actions to build the process name.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    reviewRequiredLabel: 'Needs review',
    reviewCommentLabel: 'Review comment',
    reviewCommentPlaceholder: 'e.g. Folded pocket opening should be merged with pocket attach',
    reviewBadge: 'Review',
    delete: 'Delete',
    deleteBlocked: 'Processes linked to work records cannot be deleted.',
    editingTitle: 'Edit Process',
    orderColumn: 'Order',
    codeColumn: 'Code',
    processColumn: 'Process',
    selectionSummaryLabel: 'Selection',
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
    ptChangeDialogTitle: 'Confirm PT Change',
    ptChangeMessage:
      'PT has changed. Existing ST(q) standards are not changed automatically. Update every ST(q) bucket to the new PT value?',
    ptChangeNoRecordsMessage:
      'Choose Keep ST to update PT only.',
    ptChangeHasRecordsMessage:
      'This process is already linked to work records. Updating every ST bucket can affect existing/current planning and production metrics.',
    ptChangeSummary: '{processName}: {previousPt} -> {nextPt}',
    keepStOnPtChange: 'Keep ST',
    updateAllStOnPtChange: 'Update All ST',
    updateAllStDisabled: 'ST(q) cannot be updated in bulk when the new PT value is empty or 0.',
    validatePart: 'Select a target.',
    validateTarget: 'Select a target.',
    validateAction: 'Select an action.',
    validateTargetDuplicate: 'This target is already added.',
    validateActionDuplicate: 'This action is already added.',
    validateTargetLimit: 'You can add up to 3 targets.',
    validateActionLimit: 'You can add up to 3 actions.',
    validateTargetRequiredForSpec: 'Select a target first before adding target spec.',
    validateActionRequiredForSpec: 'Select an action first before adding action spec.',
    validateTextRequired: 'Enter process text.',
    validateCodeRequired: 'Enter a process code.',
    validateInvalid: 'Enter a valid process composition.',
    validateDuplicate: 'This process is already registered.',
    validateDuplicateCode: 'This process code is already in use.',
    stGapReview: 'AT and ST differ by {label}, so ST review is recommended.',
    stGapNormal: 'AT/ST gap {label}',
  },
  vi: {
    title: 'Danh sach cong doan style',
    addRow: 'Them cong doan',
    addingTitle: 'Cong doan moi',
    textProcessLabel: 'Cong doan (van ban)',
    textProcessPlaceholder: 'vi du: may noi vai than truoc',
    selectionComposerTitle: 'Che do chon (doi tuong/thao tac)',
    selectionComposerExpand: 'Mo rong che do chon',
    selectionComposerCollapse: 'Thu gon che do chon',
    selectionComposerHint:
      'He thong luu theo text o tren. Khuon duoi duoc giu de bao ton va chuyen doi dai han.',
    loadingOptions: 'Dang tai tu dien to hop cong doan...',
    missingMasterOptions: 'Hay dang ky truoc doi tuong va thao tac.',
    partLabel: 'Vi tri',
    targetLabel: 'Doi tuong',
    targetSpecLabel: 'Quy cach doi tuong',
    noSpecOption: 'Khong co',
    addTargetBadge: 'Them doi tuong',
    selectedTargetLabel: 'Doi tuong da chon',
    actionLabel: 'Thao tac',
    actionSpecLabel: 'Quy cach thao tac',
    addActionBadge: 'Them thao tac',
    selectedActionLabel: 'Thao tac da chon',
    actionInputHint: 'Co the nhap truc tiep va nhan Enter de them.',
    specLabel: 'Quy cach doi tuong',
    specPlaceholder: 'vi du: 3 kim',
    processCodeLabel: 'Ma cong doan',
    processCodePlaceholder: 'vi du: PROC-001',
    repeatCountLabel: 'So lan lap',
    previewLabel: 'Xem truoc',
    previewEmpty: 'Dang ky doi tuong va thao tac de tao ten cong doan.',
    ptLabel: 'PT',
    stLabel: 'ST',
    atLabel: 'AT',
    add: 'Them',
    save: 'Luu',
    cancel: 'Huy',
    edit: 'Sua',
    reviewRequiredLabel: 'Can xem lai cong doan',
    reviewCommentLabel: 'Ghi chu xem lai',
    reviewCommentPlaceholder: 'vi du: can gop cong doan gap mieng tui va rap tui',
    reviewBadge: 'Can xem',
    delete: 'Xoa',
    deleteBlocked: 'Khong the xoa cong doan da lien ket voi ban ghi lam viec.',
    editingTitle: 'Sua cong doan',
    orderColumn: 'Thu tu',
    codeColumn: 'Ma',
    processColumn: 'Ten cong doan',
    selectionSummaryLabel: 'Lua chon',
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
    ptChangeDialogTitle: 'Xac nhan doi PT',
    ptChangeMessage:
      'PT da thay doi. ST(q) hien co khong tu dong thay doi. Ban co muon cap nhat tat ca ST(q) theo PT moi khong?',
    ptChangeNoRecordsMessage:
      'Chon Giu ST de chi thay doi PT.',
    ptChangeHasRecordsMessage:
      'Cong doan nay da co ban ghi lam viec. Cap nhat tat ca ST co the anh huong den chi so ke hoach va san xuat hien co.',
    ptChangeSummary: '{processName}: {previousPt} -> {nextPt}',
    keepStOnPtChange: 'Giu ST',
    updateAllStOnPtChange: 'Cap nhat tat ca ST',
    updateAllStDisabled: 'Khong the cap nhat hang loat ST(q) khi PT moi bi trong hoac bang 0.',
    validatePart: 'Hay chon doi tuong.',
    validateTarget: 'Hay chon doi tuong.',
    validateAction: 'Hay chon thao tac.',
    validateTargetDuplicate: 'Doi tuong nay da duoc them.',
    validateActionDuplicate: 'Thao tac nay da duoc them.',
    validateTargetLimit: 'Chi co the them toi da 3 doi tuong.',
    validateActionLimit: 'Chi co the them toi da 3 thao tac.',
    validateTargetRequiredForSpec: 'Can chon doi tuong truoc khi them quy cach doi tuong.',
    validateActionRequiredForSpec: 'Can chon thao tac truoc khi them quy cach thao tac.',
    validateTextRequired: 'Hay nhap text cong doan.',
    validateCodeRequired: 'Hay nhap ma cong doan.',
    validateInvalid: 'Hay nhap mot to hop cong doan hop le.',
    validateDuplicate: 'Cong doan nay da duoc dang ky.',
    validateDuplicateCode: 'Ma cong doan nay da duoc su dung.',
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

const parseProcessReviewMeta = (process) => {
  const explicitNeedsReview =
    typeof process?.needsReview === 'boolean' ? process.needsReview : null;
  const explicitComment =
    typeof process?.reviewComment === 'string' ? process.reviewComment.trim() : '';
  const rawDescription =
    typeof process?.description === 'string' ? process.description.trim() : '';

  if (explicitNeedsReview !== null) {
    const comment = explicitComment || rawDescription;
    return {
      needsReview: explicitNeedsReview,
      reviewComment: comment,
    };
  }

  if (explicitComment) {
    return {
      needsReview: hasReviewCommentText(explicitComment),
      reviewComment: explicitComment,
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

const normalizeOptionalSecondsForCompare = (value) => {
  const parsed = toOptionalSeconds(value);
  return parsed == null ? null : roundToScale(parsed, 4);
};

const areOptionalSecondsEqual = (left, right) =>
  normalizeOptionalSecondsForCompare(left) === normalizeOptionalSecondsForCompare(right);

const hasProcessWorkRecords = (process) => {
  const count = Number(
    process?.workRecordCount ??
      process?.workRecordsCount ??
      process?._count?.workRecords ??
      0
  );
  return Number.isFinite(count) && count > 0;
};

const buildPtDerivedStBuckets = (ptSeconds) => {
  const normalizedPt = toOptionalSeconds(ptSeconds);
  if (normalizedPt == null || normalizedPt <= 0) return [];
  return ST_STANDARD_BUCKETS.map((bucketQuantity) => ({
    bucketQuantity,
    bucketStSeconds: normalizedPt,
    setBy: 'PT_DERIVED',
    setAt: null,
    updatedAt: null,
  }));
};

const buildProcessWithPtDerivedStUpdate = (process) => {
  const normalized = normalizeProcess(process);
  const nextStBuckets = buildPtDerivedStBuckets(normalized?.pt);
  if (nextStBuckets.length === 0) return normalized;
  return normalizeProcess({
    ...normalized,
    stBuckets: nextStBuckets,
    stBucketWriteMode: 'MANUAL_EDIT',
    stBucketUpdateQuantities: ST_STANDARD_BUCKETS,
    ct: null,
    stManual: false,
  });
};

const formatSecondsOrDash = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '-';
  return formatSeconds(parsed);
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
  const isSpecType = type === 'SPEC' || type === 'TARGET_SPEC' || type === 'ACTION_SPEC';
  const codeSource = typeof item === 'string' ? '' : item?.code;
  const code =
    normalizeStyleProcessCodeSegment(codeSource) ||
    (isSpecType ? buildCustomStyleSpecCode(label) : '');
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
      !codeSource,
  };
};

const getProcessMasterOptionIdentity = (item, defaultType = '') => {
  const normalized = normalizeProcessMasterOption(item, defaultType);
  if (!normalized) return '';
  const normalizedCode = normalizeStyleProcessCodeSegment(normalized.code);
  if (normalizedCode) return `${normalized.type}:CODE:${normalizedCode}`;
  return `${normalized.type}:LABEL:${String(normalized.label ?? '')
    .trim()
    .toLowerCase()}`;
};

const buildProcessMasterLookupByCode = (options = []) =>
  (Array.isArray(options) ? options : []).reduce((map, option) => {
    const codeKey = normalizeStyleProcessCodeSegment(option?.code);
    if (!codeKey) return map;
    map.set(codeKey, option);
    return map;
  }, new Map());

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

const normalizeProcessMasterMatchText = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const buildProcessMasterMatchCandidates = (option, languageCode) => {
  const normalized = normalizeProcessMasterOption(option);
  if (!normalized) return [];
  return Array.from(
    new Set(
      [
        resolveProcessMasterLabel(normalized, languageCode),
        normalized.label,
        normalized.nameKo,
        normalized.nameEn,
        normalized.nameVi,
        normalized.code,
      ]
        .map((value) => normalizeProcessMasterMatchText(value))
        .filter(Boolean)
    )
  );
};

const findProcessMasterOptionByInput = (options, inputText, languageCode) => {
  const normalizedInput = normalizeProcessMasterMatchText(inputText);
  if (!normalizedInput) return null;
  return (
    (Array.isArray(options) ? options : []).find((option) =>
      buildProcessMasterMatchCandidates(option, languageCode).includes(normalizedInput)
    ) || null
  );
};

const normalizeCompositionKind = (kind) => {
  if (kind === 'location') return 'part';
  if (kind === 'targetSpec' || kind === 'actionSpec') return 'spec';
  return kind;
};

const normalizeProcessCompositionEntry = (value, kind) => {
  const resolvedKind = normalizeCompositionKind(kind);
  const normalized = normalizeProcessMasterOption(value, resolvedKind.toUpperCase());
  if (!normalized) return null;
  const code =
    normalizeStyleProcessCodeSegment(normalized.code) ||
    (resolvedKind === 'spec'
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
    isCustom: Boolean(normalized.isCustom) || !normalized.code,
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

const resolveCompositionLocations = (composition) => {
  if (!composition || typeof composition !== 'object') return [];
  const locationInputs = [
    ...(Array.isArray(composition?.locations) ? composition.locations : []),
    ...(Array.isArray(composition?.parts) ? composition.parts : []),
    ...(composition?.location ? [composition.location] : []),
    ...(composition?.part ? [composition.part] : []),
  ];
  return normalizeProcessCompositionEntries(locationInputs, 'part');
};

const resolveCompositionTargetPairs = (composition) => {
  if (!composition || typeof composition !== 'object') return [];

  const directPairs = (Array.isArray(composition?.targetPairs) ? composition.targetPairs : [])
    .map((pair) => {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return null;
      const target = normalizeProcessCompositionEntry(
        pair?.target ?? pair?.targetItem,
        'target'
      );
      const targetSpec = normalizeProcessCompositionEntry(
        pair?.targetSpec ?? pair?.spec ?? pair?.targetSpecItem,
        'targetSpec'
      );
      if (!target && !targetSpec) return null;
      if (!target) return null;
      return {
        target,
        targetSpec: targetSpec ?? null,
      };
    })
    .filter(Boolean);
  if (directPairs.length > 0) return directPairs;

  const targets = normalizeProcessCompositionEntries(
    [
      ...(Array.isArray(composition?.targets) ? composition.targets : []),
      ...(composition?.target ? [composition.target] : []),
    ],
    'target'
  );
  const targetSpecs = normalizeProcessCompositionEntries(
    [
      ...(Array.isArray(composition?.targetSpecs) ? composition.targetSpecs : []),
      ...(composition?.targetSpec ? [composition.targetSpec] : []),
      ...(Array.isArray(composition?.specs) ? composition.specs : []),
    ],
    'targetSpec'
  );
  const pairCount = Math.max(targets.length, targetSpecs.length);
  const pairs = [];
  for (let index = 0; index < pairCount; index += 1) {
    const target = targets[index] ?? null;
    const targetSpec = targetSpecs[index] ?? null;
    if (!target && !targetSpec) continue;
    if (!target) continue;
    pairs.push({
      target,
      targetSpec: targetSpec ?? null,
    });
  }
  return pairs;
};

const resolveCompositionActionPairs = (composition) => {
  if (!composition || typeof composition !== 'object') return [];

  const directPairs = (Array.isArray(composition?.actionPairs) ? composition.actionPairs : [])
    .map((pair) => {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return null;
      const action = normalizeProcessCompositionEntry(
        pair?.action ?? pair?.actionItem,
        'action'
      );
      const actionSpec = normalizeProcessCompositionEntry(
        pair?.actionSpec ?? pair?.spec ?? pair?.actionSpecItem,
        'actionSpec'
      );
      if (!action && !actionSpec) return null;
      if (!action) return null;
      return {
        action,
        actionSpec: actionSpec ?? null,
      };
    })
    .filter(Boolean);
  if (directPairs.length > 0) return directPairs;

  const actions = normalizeProcessCompositionEntries(
    [
      ...(Array.isArray(composition?.actions) ? composition.actions : []),
      ...(composition?.action ? [composition.action] : []),
    ],
    'action'
  );
  const actionSpecs = normalizeProcessCompositionEntries(
    [
      ...(Array.isArray(composition?.actionSpecs) ? composition.actionSpecs : []),
      ...(composition?.actionSpec ? [composition.actionSpec] : []),
    ],
    'actionSpec'
  );
  const pairCount = Math.max(actions.length, actionSpecs.length);
  const pairs = [];
  for (let index = 0; index < pairCount; index += 1) {
    const action = actions[index] ?? null;
    const actionSpec = actionSpecs[index] ?? null;
    if (!action && !actionSpec) continue;
    if (!action) continue;
    pairs.push({
      action,
      actionSpec: actionSpec ?? null,
    });
  }
  return pairs;
};

const buildProcessComposition = (draft) => {
  const location = normalizeProcessCompositionEntry(draft?.part, 'part');
  const locations = location ? [location] : [];
  const targetPairs = getDraftTargetPairs(draft);
  const actionPairs = getDraftActionPairs(draft);

  if (
    locations.length === 0 &&
    targetPairs.length === 0 &&
    actionPairs.length === 0
  ) {
    return null;
  }

  return {
    locations,
    targetPairs,
    actionPairs,
  };
};

const hasStructuredProcessComposition = (composition) => {
  if (!composition || typeof composition !== 'object') return false;
  return (
    resolveCompositionLocations(composition).length > 0 ||
    resolveCompositionTargetPairs(composition).length > 0 ||
    resolveCompositionActionPairs(composition).length > 0
  );
};

const resolveProcessCompositionText = (entry, languageCode, masterLookupByCode = null) => {
  if (!entry || typeof entry !== 'object') return '';
  const codeKey = normalizeStyleProcessCodeSegment(entry?.code);
  const masterOption = codeKey && masterLookupByCode instanceof Map
    ? masterLookupByCode.get(codeKey)
    : null;
  const baseEntry = masterOption || entry;
  if (languageCode === 'ko') {
    return String(baseEntry?.nameKo ?? baseEntry?.label ?? baseEntry?.code ?? '').trim();
  }
  if (languageCode === 'vi') {
    return String(baseEntry?.nameVi ?? baseEntry?.label ?? baseEntry?.code ?? '').trim();
  }
  return String(baseEntry?.nameEn ?? baseEntry?.label ?? baseEntry?.code ?? '').trim();
};

const buildProcessNameFromComposition = (
  composition,
  languageCode,
  fallback = '',
  masterLookupByKind = null
) => {
  if (!composition || typeof composition !== 'object') {
    return String(fallback ?? '').trim();
  }

  const locationEntries = resolveCompositionLocations(composition);
  const locationText = locationEntries
    .map((entry) =>
      resolveProcessCompositionText(
        entry,
        languageCode,
        masterLookupByKind?.location ?? masterLookupByKind?.part
      )
    )
    .filter(Boolean)
    .join('·');
  const targetPairs = resolveCompositionTargetPairs(composition);
  const targetWithSpec = targetPairs
    .map((pair) => {
      const targetText = resolveProcessCompositionText(
        pair?.target,
        languageCode,
        masterLookupByKind?.target
      );
      const targetSpecText = resolveProcessCompositionText(
        pair?.targetSpec,
        languageCode,
        masterLookupByKind?.targetSpec
      );
      if (targetText) return `${targetText}${targetSpecText ? `(${targetSpecText})` : ''}`;
      if (targetSpecText) return `(${targetSpecText})`;
      return '';
    })
    .filter(Boolean)
    .join(' + ');
  const actionPairs = resolveCompositionActionPairs(composition);
  const actionWithSpec = actionPairs
    .map((pair) => {
      const actionText = resolveProcessCompositionText(
        pair?.action,
        languageCode,
        masterLookupByKind?.action
      );
      const actionSpecText = resolveProcessCompositionText(
        pair?.actionSpec,
        languageCode,
        masterLookupByKind?.actionSpec
      );
      if (actionText) return `${actionText}${actionSpecText ? `(${actionSpecText})` : ''}`;
      if (actionSpecText) return `(${actionSpecText})`;
      return '';
    })
    .filter(Boolean)
    .join(' + ');
  const leftText = locationText && targetWithSpec
    ? `${locationText}: ${targetWithSpec}`
    : locationText || targetWithSpec;
  const baseText = leftText && actionWithSpec
    ? `${leftText} - ${actionWithSpec}`
    : leftText || actionWithSpec;
  if (!baseText) return String(fallback ?? '').trim();
  return baseText;
};

const buildProcessLocalizedNamesFromComposition = (composition, fallback = {}) => ({
  nameKo: buildProcessNameFromComposition(composition, 'ko', fallback.nameKo ?? fallback.name),
  nameEn: buildProcessNameFromComposition(composition, 'en', fallback.nameEn ?? fallback.name),
  nameVi: buildProcessNameFromComposition(composition, 'vi', fallback.nameVi ?? fallback.name),
});

const resolveProcessMasterLabel = (value, languageCode) => {
  if (typeof value === 'string') return value.trim();
  const normalized = normalizeProcessMasterOption(value);
  return resolveProcessCompositionText(normalized, languageCode);
};

const resolveLocalizedProcessDisplayLabel = (
  process,
  languageCode,
  fallback = 'Process',
  masterLookupByKind = null
) => {
  const manualName = String(process?.manualName ?? '').trim();
  const composedName = buildProcessNameFromComposition(
    process?.processComposition,
    languageCode,
    '',
    masterLookupByKind
  );
  const localizedName =
    manualName ||
    resolveLocalizedProcessName(
      {
        code: process?.code,
        name: process?.name,
        nameKo: process?.nameKo,
        nameEn: process?.nameEn,
        nameVi: process?.nameVi,
      },
      languageCode
    ) ||
    composedName;
  return (
    formatProcessNameWithQuantity(
      localizedName || process?.name || process?.code,
      process?.timesPerPiece ?? process?.quantity
    ) || fallback
  );
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
  const quantity = toPositiveInt(process?.timesPerPiece ?? process?.quantity, 1);
  return name ? `name:${name}|qty:${quantity}` : '';
};

const createInstanceId = (process) =>
  `${process?.code || process?.name || 'PROC'}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const normalizeStBuckets = (process) => {
  const normalized = normalizeProcess(process);
  return Array.isArray(normalized?.stBuckets) ? normalized.stBuckets : [];
};

const resolveDraftProcessText = (draft) => String(draft?.processText ?? '').trim();
const normalizeProcessCodeKey = (value) => String(value ?? '').trim().toUpperCase();

const getDraftTargetPairs = (draft) =>
  DRAFT_TARGET_SLOT_FIELDS
    .map(([targetField, specField]) => ({
      target: normalizeProcessCompositionEntry(draft?.[targetField], 'target'),
      targetSpec: normalizeProcessCompositionEntry(draft?.[specField], 'targetSpec'),
    }))
    .filter((pair) => pair?.target);

const applyDraftTargetPairs = (draft, pairs = []) => {
  const nextDraft = { ...draft };
  DRAFT_TARGET_SLOT_FIELDS.forEach(([targetField, specField], index) => {
    const pair = pairs[index] ?? null;
    nextDraft[targetField] = pair?.target ?? null;
    nextDraft[specField] = pair?.targetSpec ?? null;
  });
  return nextDraft;
};

const getDraftActionPairs = (draft) =>
  DRAFT_ACTION_SLOT_FIELDS
    .map(([actionField, specField]) => ({
      action: normalizeProcessCompositionEntry(draft?.[actionField], 'action'),
      actionSpec: normalizeProcessCompositionEntry(draft?.[specField], 'actionSpec'),
    }))
    .filter((pair) => pair?.action);

const applyDraftActionPairs = (draft, pairs = []) => {
  const nextDraft = { ...draft };
  DRAFT_ACTION_SLOT_FIELDS.forEach(([actionField, specField], index) => {
    const pair = pairs[index] ?? null;
    nextDraft[actionField] = pair?.action ?? null;
    nextDraft[specField] = pair?.actionSpec ?? null;
  });
  return nextDraft;
};

const buildProcessPayload = (
  draft,
  existingProcess = null,
  timeRefQuantity = DEFAULT_TIME_REF_QUANTITY
) => {
  const processText = resolveDraftProcessText(draft);
  const existingManualName = String(existingProcess?.manualName ?? '').trim();
  const manualName = processText || existingManualName;
  const composition = buildProcessComposition(draft);
  const localizedNames = buildProcessLocalizedNamesFromComposition(composition, {
    name: manualName || existingProcess?.name,
    nameKo: manualName || existingProcess?.nameKo,
    nameEn: manualName || existingProcess?.nameEn,
    nameVi: manualName || existingProcess?.nameVi,
  });
  const enteredProcessCode = String(draft?.processCode ?? '').trim();
  // Keep process code blank when user leaves it empty.
  const resolvedProcessCode = enteredProcessCode;
  const resolvedTimeRefQuantity = toPositiveInt(
    timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const timesPerPiece = hasStructuredProcessComposition(composition)
    ? toPositiveInt(
        draft?.repeatCount ?? existingProcess?.timesPerPiece ?? existingProcess?.quantity,
        1
      )
    : 1;
  const ptTotalForDisplay = parseOptionalSecondsInput(draft.pt);
  const reviewComment = String(draft?.reviewComment ?? '').trim();
  const reviewNeedsCheck =
    Boolean(draft?.needsReview) || hasReviewCommentText(reviewComment);
  const reviewDescription = buildReviewDescription(reviewNeedsCheck, reviewComment);
  const ptPerPiece = ptTotalForDisplay == null ? null : toOptionalSeconds(ptTotalForDisplay);
  const existingStBuckets = normalizeStBuckets(existingProcess);
  const shouldInitializeStFromPt = !existingProcess;
  const nextStBuckets = shouldInitializeStFromPt
    ? buildPtDerivedStBuckets(ptPerPiece)
    : existingStBuckets;

  return normalizeProcess({
    ...(existingProcess || {}),
    id: existingProcess?.id ?? null,
    code: resolvedProcessCode || null,
    manualName: manualName || null,
    name:
      manualName ||
      localizedNames.nameEn ||
      existingProcess?.name ||
      resolvedProcessCode,
    nameKo:
      manualName ||
      localizedNames.nameKo ||
      existingProcess?.nameKo ||
      resolvedProcessCode,
    nameEn:
      manualName ||
      localizedNames.nameEn ||
      existingProcess?.nameEn ||
      resolvedProcessCode,
    nameVi:
      manualName ||
      localizedNames.nameVi ||
      existingProcess?.nameVi ||
      resolvedProcessCode,
    processComposition: composition,
    description: reviewDescription || null,
    needsReview: reviewNeedsCheck,
    reviewComment: reviewComment || '',
    timesPerPiece,
    timeRefQuantity: resolvedTimeRefQuantity,
    pt: ptPerPiece,
    stBuckets: nextStBuckets,
    ct: null,
    stManual: false,
    atParams: existingProcess?.atParams ?? null,
    instanceId:
      existingProcess?.instanceId ||
      createInstanceId({
        code: resolvedProcessCode,
        name: localizedNames.nameEn || localizedNames.nameKo || resolvedProcessCode,
      }),
  });
};

const buildDraftFromProcess = (
  process,
  timeRefQuantity = DEFAULT_TIME_REF_QUANTITY,
  languageCode = 'en'
) => {
  const safeProcess = normalizeProcess(process);
  const composition = safeProcess?.processComposition || {};
  const processQuantity = hasStructuredProcessComposition(composition)
    ? toPositiveInt(safeProcess?.timesPerPiece ?? safeProcess?.quantity, 1)
    : 1;
  const ptPerPiece = toOptionalSeconds(safeProcess?.pt);
  const reviewMeta = parseProcessReviewMeta(safeProcess);
  const manualName = String(safeProcess?.manualName ?? '').trim();
  const fallbackProcessText =
    manualName ||
    resolveLocalizedProcessName(
      {
        code: safeProcess?.code,
        name: safeProcess?.name,
        nameKo: safeProcess?.nameKo,
        nameEn: safeProcess?.nameEn,
        nameVi: safeProcess?.nameVi,
      },
      languageCode
    ) ||
    buildProcessNameFromComposition(safeProcess?.processComposition, languageCode, '') ||
    String(safeProcess?.name ?? '').trim();
  const existingLocations = resolveCompositionLocations(composition);
  const normalizedTargetPairs = resolveCompositionTargetPairs(composition);
  const normalizedActionPairs = resolveCompositionActionPairs(composition);

  return {
    processText: fallbackProcessText,
    part: normalizeProcessCompositionEntry(existingLocations[0], 'part'),
    target: normalizedTargetPairs[0]?.target ?? null,
    targetSpec: normalizedTargetPairs[0]?.targetSpec ?? null,
    target2: normalizedTargetPairs[1]?.target ?? null,
    targetSpec2: normalizedTargetPairs[1]?.targetSpec ?? null,
    target3: normalizedTargetPairs[2]?.target ?? null,
    targetSpec3: normalizedTargetPairs[2]?.targetSpec ?? null,
    action: normalizedActionPairs[0]?.action ?? null,
    actionSpec: normalizedActionPairs[0]?.actionSpec ?? null,
    action2: normalizedActionPairs[1]?.action ?? null,
    actionSpec2: normalizedActionPairs[1]?.actionSpec ?? null,
    action3: normalizedActionPairs[2]?.action ?? null,
    actionSpec3: normalizedActionPairs[2]?.actionSpec ?? null,
    processCode: String(safeProcess?.code ?? '').trim(),
    repeatCount: String(processQuantity),
    pt:
      ptPerPiece == null ? '' : toDraftNumberText(ptPerPiece),
    needsReview: Boolean(reviewMeta.needsReview),
    reviewComment: reviewMeta.reviewComment || '',
  };
};

const collectProcessCompositionOptionsFromProcesses = (
  processes = [],
  kind = 'action',
  defaultType = 'ACTION'
) => {
  const collected = [];
  const seen = new Set();
  (Array.isArray(processes) ? processes : []).forEach((process) => {
    const composition = process?.processComposition || {};
    const compositionLocations = resolveCompositionLocations(composition);
    const compositionTargetPairs = resolveCompositionTargetPairs(composition);
    const compositionActionPairs = resolveCompositionActionPairs(composition);
    const sourceEntries =
      kind === 'location' || kind === 'part'
        ? compositionLocations
        : kind === 'target'
          ? compositionTargetPairs.map((pair) => pair?.target).filter(Boolean)
          : kind === 'targetSpec' || kind === 'spec'
            ? compositionTargetPairs.map((pair) => pair?.targetSpec).filter(Boolean)
            : kind === 'actionSpec'
              ? compositionActionPairs.map((pair) => pair?.actionSpec).filter(Boolean)
              : compositionActionPairs.map((pair) => pair?.action).filter(Boolean);

    sourceEntries.forEach((entry) => {
      const normalized = normalizeProcessMasterOption(entry, defaultType);
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, defaultType);
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      collected.push(normalized);
    });
  });
  return collected;
};

const StyleProcess = ({
  processes = [],
  onProcessesChange,
  optionsReloadKey = 0,
}) => {
  const { languageCode } = useLanguage();
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [timeRefQuantity, setTimeRefQuantity] = useState(DEFAULT_TIME_REF_QUANTITY);
  const [timeRefQuantityInput, setTimeRefQuantityInput] = useState('');
  const [isTimeRefQuantityEditing, setIsTimeRefQuantityEditing] = useState(false);
  const [processMasterOptions, setProcessMasterOptions] = useState({
    locations: [],
    targets: [],
    targetSpecs: [],
    actions: [],
    actionSpecs: [],
    targetToTargetSpecs: [],
    actionToActionSpecs: [],
    targetToTargets: [],
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
          locations: Array.isArray(data?.locations) ? data.locations : [],
          targets: Array.isArray(data?.targets) ? data.targets : [],
          targetSpecs: Array.isArray(data?.targetSpecs) ? data.targetSpecs : [],
          actions: Array.isArray(data?.actions) ? data.actions : [],
          actionSpecs: Array.isArray(data?.actionSpecs) ? data.actionSpecs : [],
          targetToTargetSpecs: Array.isArray(
            data?.relations?.targetToTargetSpecs ?? data?.targetToTargetSpecs
          )
            ? (data?.relations?.targetToTargetSpecs ?? data?.targetToTargetSpecs)
            : [],
          actionToActionSpecs: Array.isArray(
            data?.relations?.actionToActionSpecs ?? data?.actionToActionSpecs
          )
            ? (data?.relations?.actionToActionSpecs ?? data?.actionToActionSpecs)
            : [],
          targetToTargets: Array.isArray(
            data?.relations?.targetToTargets ?? data?.targetToTargets
          )
            ? (data?.relations?.targetToTargets ?? data?.targetToTargets)
            : [],
        });
      } catch (_error) {
        if (!active) return;
        setProcessMasterOptions({
          locations: [],
          targets: [],
          targetSpecs: [],
          actions: [],
          actionSpecs: [],
          targetToTargetSpecs: [],
          actionToActionSpecs: [],
          targetToTargets: [],
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
  }, [languageCode, optionsReloadKey]);

  const partOptionsFromStyleProcesses = useMemo(
    () => collectProcessCompositionOptionsFromProcesses(safeProcesses, 'location', 'LOCATION'),
    [safeProcesses]
  );
  const masterPartIdentitySet = useMemo(
    () =>
      new Set(
        (Array.isArray(processMasterOptions.locations) ? processMasterOptions.locations : [])
          .map((item) => getProcessMasterOptionIdentity(item, 'LOCATION'))
          .filter(Boolean)
      ),
    [processMasterOptions.locations]
  );
  const isNewCustomPartOption = useCallback(
    (option) => {
      const identity = getProcessMasterOptionIdentity(option, 'LOCATION');
      if (!identity) return false;
      return !masterPartIdentitySet.has(identity);
    },
    [masterPartIdentitySet]
  );
  const partOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const appendOption = (item) => {
      const normalized = normalizeProcessMasterOption(item, 'LOCATION');
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, 'LOCATION');
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      merged.push(normalized);
    };

    (Array.isArray(processMasterOptions.locations) ? processMasterOptions.locations : []).forEach(
      appendOption
    );
    partOptionsFromStyleProcesses.forEach(appendOption);

    return merged.sort((left, right) =>
      compareProcessMasterOptionAsc(left, right, languageCode)
    );
  }, [languageCode, partOptionsFromStyleProcesses, processMasterOptions.locations]);
  const targetOptionsFromStyleProcesses = useMemo(
    () => collectProcessCompositionOptionsFromProcesses(safeProcesses, 'target', 'TARGET'),
    [safeProcesses]
  );
  const masterTargetIdentitySet = useMemo(
    () =>
      new Set(
        (Array.isArray(processMasterOptions.targets) ? processMasterOptions.targets : [])
          .map((item) => getProcessMasterOptionIdentity(item, 'TARGET'))
          .filter(Boolean)
      ),
    [processMasterOptions.targets]
  );
  const isNewCustomTargetOption = useCallback(
    (option) => {
      const identity = getProcessMasterOptionIdentity(option, 'TARGET');
      if (!identity) return false;
      return !masterTargetIdentitySet.has(identity);
    },
    [masterTargetIdentitySet]
  );
  const targetOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const appendOption = (item) => {
      const normalized = normalizeProcessMasterOption(item, 'TARGET');
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, 'TARGET');
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      merged.push(normalized);
    };

    (Array.isArray(processMasterOptions.targets) ? processMasterOptions.targets : []).forEach(
      appendOption
    );
    targetOptionsFromStyleProcesses.forEach(appendOption);

    return merged.sort((left, right) =>
      compareProcessMasterOptionAsc(left, right, languageCode)
    );
  }, [languageCode, processMasterOptions.targets, targetOptionsFromStyleProcesses]);
  const actionOptionsFromStyleProcesses = useMemo(
    () => collectProcessCompositionOptionsFromProcesses(safeProcesses, 'action', 'ACTION'),
    [safeProcesses]
  );
  const masterActionIdentitySet = useMemo(
    () =>
      new Set(
        (Array.isArray(processMasterOptions.actions) ? processMasterOptions.actions : [])
          .map((item) => getProcessMasterOptionIdentity(item, 'ACTION'))
          .filter(Boolean)
      ),
    [processMasterOptions.actions]
  );
  const isNewCustomActionOption = useCallback(
    (option) => {
      const identity = getProcessMasterOptionIdentity(option, 'ACTION');
      if (!identity) return false;
      return !masterActionIdentitySet.has(identity);
    },
    [masterActionIdentitySet]
  );
  const actionOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const appendOption = (item) => {
      const normalized = normalizeProcessMasterOption(item, 'ACTION');
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, 'ACTION');
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      merged.push(normalized);
    };

    (Array.isArray(processMasterOptions.actions) ? processMasterOptions.actions : []).forEach(
      appendOption
    );
    actionOptionsFromStyleProcesses.forEach(appendOption);

    return merged.sort((left, right) =>
      compareProcessMasterOptionAsc(left, right, languageCode)
    );
  }, [actionOptionsFromStyleProcesses, languageCode, processMasterOptions.actions]);
  const targetSpecOptionsFromStyleProcesses = useMemo(
    () => collectProcessCompositionOptionsFromProcesses(safeProcesses, 'targetSpec', 'TARGET_SPEC'),
    [safeProcesses]
  );
  const masterTargetSpecIdentitySet = useMemo(
    () =>
      new Set(
        (Array.isArray(processMasterOptions.targetSpecs) ? processMasterOptions.targetSpecs : [])
          .map((item) => getProcessMasterOptionIdentity(item, 'TARGET_SPEC'))
          .filter(Boolean)
      ),
    [processMasterOptions.targetSpecs]
  );
  const isNewCustomTargetSpecOption = useCallback(
    (option) => {
      const identity = getProcessMasterOptionIdentity(option, 'TARGET_SPEC');
      if (!identity) return false;
      return !masterTargetSpecIdentitySet.has(identity);
    },
    [masterTargetSpecIdentitySet]
  );
  const targetSpecOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const appendOption = (item) => {
      const normalized = normalizeProcessMasterOption(item, 'TARGET_SPEC');
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, 'TARGET_SPEC');
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      merged.push(normalized);
    };

    (Array.isArray(processMasterOptions.targetSpecs) ? processMasterOptions.targetSpecs : []).forEach(
      appendOption
    );
    targetSpecOptionsFromStyleProcesses.forEach(appendOption);

    return merged.sort((left, right) =>
      compareProcessMasterOptionAsc(left, right, languageCode)
    );
  }, [languageCode, processMasterOptions.targetSpecs, targetSpecOptionsFromStyleProcesses]);
  const actionSpecOptionsFromStyleProcesses = useMemo(
    () => collectProcessCompositionOptionsFromProcesses(safeProcesses, 'actionSpec', 'ACTION_SPEC'),
    [safeProcesses]
  );
  const masterActionSpecIdentitySet = useMemo(
    () =>
      new Set(
        (Array.isArray(processMasterOptions.actionSpecs) ? processMasterOptions.actionSpecs : [])
          .map((item) => getProcessMasterOptionIdentity(item, 'ACTION_SPEC'))
          .filter(Boolean)
      ),
    [processMasterOptions.actionSpecs]
  );
  const isNewCustomActionSpecOption = useCallback(
    (option) => {
      const identity = getProcessMasterOptionIdentity(option, 'ACTION_SPEC');
      if (!identity) return false;
      return !masterActionSpecIdentitySet.has(identity);
    },
    [masterActionSpecIdentitySet]
  );
  const actionSpecOptions = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const appendOption = (item) => {
      const normalized = normalizeProcessMasterOption(item, 'ACTION_SPEC');
      if (!normalized) return;
      const identity = getProcessMasterOptionIdentity(normalized, 'ACTION_SPEC');
      if (!identity || seen.has(identity)) return;
      seen.add(identity);
      merged.push(normalized);
    };

    (Array.isArray(processMasterOptions.actionSpecs) ? processMasterOptions.actionSpecs : []).forEach(
      appendOption
    );
    actionSpecOptionsFromStyleProcesses.forEach(appendOption);

    return merged.sort((left, right) =>
      compareProcessMasterOptionAsc(left, right, languageCode)
    );
  }, [actionSpecOptionsFromStyleProcesses, languageCode, processMasterOptions.actionSpecs]);
  const compositionMasterLookupByKind = useMemo(
    () => ({
      location: buildProcessMasterLookupByCode(partOptions),
      part: buildProcessMasterLookupByCode(partOptions),
      target: buildProcessMasterLookupByCode(targetOptions),
      action: buildProcessMasterLookupByCode(actionOptions),
      targetSpec: buildProcessMasterLookupByCode(targetSpecOptions),
      actionSpec: buildProcessMasterLookupByCode(actionSpecOptions),
      spec: buildProcessMasterLookupByCode(targetSpecOptions),
    }),
    [actionOptions, actionSpecOptions, partOptions, targetOptions, targetSpecOptions]
  );

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState(null);
  const [addDraft, setAddDraft] = useState(createEmptyDraft);
  const [partInputValue, setPartInputValue] = useState('');
  const [targetInputValue, setTargetInputValue] = useState('');
  const [specInputValue, setSpecInputValue] = useState('');
  const [targetCandidate, setTargetCandidate] = useState(null);
  const [targetSpecCandidate, setTargetSpecCandidate] = useState(null);
  const [addActionInput, setAddActionInput] = useState('');
  const [actionSpecInputValue, setActionSpecInputValue] = useState('');
  const [actionCandidate, setActionCandidate] = useState(null);
  const [actionSpecCandidate, setActionSpecCandidate] = useState(null);
  const [isSelectionComposerExpanded, setIsSelectionComposerExpanded] = useState(false);
  const [targetComposerOpen, setTargetComposerOpen] = useState(false);
  const [actionComposerOpen, setActionComposerOpen] = useState(false);
  const deferredAddDraft = useDeferredValue(addDraft);
  const [addError, setAddError] = useState('');
  const [pendingPtChange, setPendingPtChange] = useState(null);
  const draftFormRef = React.useRef(null);
  const processRowRefs = React.useRef(new Map());
  const pendingReturnScrollInstanceIdRef = React.useRef(null);
  const displayOrderQuantity = useMemo(
    () => toPositiveInt(timeRefQuantity, DEFAULT_TIME_REF_QUANTITY),
    [timeRefQuantity]
  );
  const targetToTargetSpecRelationMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(processMasterOptions.targetToTargetSpecs)
      ? processMasterOptions.targetToTargetSpecs
      : []
    ).forEach((row) => {
      const parentCode = normalizeStyleProcessCodeSegment(
        row?.parentCode ?? row?.targetCode
      );
      const childCode = normalizeStyleProcessCodeSegment(
        row?.childCode ?? row?.targetSpecCode
      );
      if (!parentCode || !childCode) return;
      const existing = map.get(parentCode);
      if (existing instanceof Set) {
        existing.add(childCode);
      } else {
        map.set(parentCode, new Set([childCode]));
      }
    });
    return map;
  }, [processMasterOptions.targetToTargetSpecs]);
  const targetToTargetRelationMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(processMasterOptions.targetToTargets)
      ? processMasterOptions.targetToTargets
      : []
    ).forEach((row) => {
      const parentCode = normalizeStyleProcessCodeSegment(
        row?.parentCode ?? row?.targetCode
      );
      const childCode = normalizeStyleProcessCodeSegment(
        row?.childCode ?? row?.linkedTargetCode
      );
      if (!parentCode || !childCode || parentCode === childCode) return;

      const append = (fromCode, toCode) => {
        const existing = map.get(fromCode);
        if (existing instanceof Set) {
          existing.add(toCode);
        } else {
          map.set(fromCode, new Set([toCode]));
        }
      };
      append(parentCode, childCode);
      append(childCode, parentCode);
    });
    return map;
  }, [processMasterOptions.targetToTargets]);
  const actionToActionSpecRelationMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(processMasterOptions.actionToActionSpecs)
      ? processMasterOptions.actionToActionSpecs
      : []
    ).forEach((row) => {
      const parentCode = normalizeStyleProcessCodeSegment(
        row?.parentCode ?? row?.actionCode
      );
      const childCode = normalizeStyleProcessCodeSegment(
        row?.childCode ?? row?.actionSpecCode
      );
      if (!parentCode || !childCode) return;
      const existing = map.get(parentCode);
      if (existing instanceof Set) {
        existing.add(childCode);
      } else {
        map.set(parentCode, new Set([childCode]));
      }
    });
    return map;
  }, [processMasterOptions.actionToActionSpecs]);
  const resolveLinkedTargetCodeSet = useCallback(
    (parentCodes = []) => {
      const linked = new Set();
      let hasConstraint = false;
      (Array.isArray(parentCodes) ? parentCodes : []).forEach((code) => {
        const normalizedCode = normalizeStyleProcessCodeSegment(code);
        if (!normalizedCode) return;
        const rowSet = targetToTargetRelationMap.get(normalizedCode);
        if (!(rowSet instanceof Set) || rowSet.size === 0) return;
        hasConstraint = true;
        rowSet.forEach((item) => linked.add(item));
      });
      return hasConstraint ? linked : null;
    },
    [targetToTargetRelationMap]
  );
  const filterTargetSpecOptionsByTargetCode = useCallback(
    (targetCode) => {
      const normalizedTargetCode = normalizeStyleProcessCodeSegment(targetCode);
      if (!normalizedTargetCode) return targetSpecOptions;
      const linkedSpecCodes = targetToTargetSpecRelationMap.get(normalizedTargetCode);
      if (!(linkedSpecCodes instanceof Set) || linkedSpecCodes.size === 0) {
        return targetSpecOptions;
      }
      return targetSpecOptions.filter((option) =>
        linkedSpecCodes.has(normalizeStyleProcessCodeSegment(option?.code))
      );
    },
    [targetSpecOptions, targetToTargetSpecRelationMap]
  );
  const selectedTargetPairs = useMemo(() => getDraftTargetPairs(addDraft), [addDraft]);
  const selectedActionPairs = useMemo(() => getDraftActionPairs(addDraft), [addDraft]);
  const selectedTargetCodeSet = useMemo(
    () =>
      new Set(
        selectedTargetPairs
          .map((pair) => normalizeStyleProcessCodeSegment(pair?.target?.code))
          .filter(Boolean)
      ),
    [selectedTargetPairs]
  );
  const selectedActionCodeSet = useMemo(
    () =>
      new Set(
        selectedActionPairs
          .map((pair) => normalizeStyleProcessCodeSegment(pair?.action?.code))
          .filter(Boolean)
      ),
    [selectedActionPairs]
  );
  const availableTargetOptions = useMemo(() => {
    const linkedTargets = resolveLinkedTargetCodeSet(Array.from(selectedTargetCodeSet));
    const sourceOptions =
      linkedTargets instanceof Set
        ? targetOptions.filter((option) =>
            linkedTargets.has(normalizeStyleProcessCodeSegment(option?.code))
          )
        : targetOptions;
    return sourceOptions.filter(
      (option) => !selectedTargetCodeSet.has(normalizeStyleProcessCodeSegment(option?.code))
    );
  }, [resolveLinkedTargetCodeSet, selectedTargetCodeSet, targetOptions]);
  const filteredTargetSpecOptions = useMemo(
    () => filterTargetSpecOptionsByTargetCode(targetCandidate?.code),
    [filterTargetSpecOptionsByTargetCode, targetCandidate?.code]
  );
  const targetSpecNoneOption = useMemo(
    () =>
      normalizeProcessMasterOption(
        {
          id: TARGET_SPEC_NONE_OPTION_CODE,
          type: 'TARGET_SPEC',
          code: TARGET_SPEC_NONE_OPTION_CODE,
          label: getStyleProcessMessage(languageCode, 'noSpecOption'),
          nameKo: STYLE_PROCESS_MESSAGES.ko.noSpecOption,
          nameEn: STYLE_PROCESS_MESSAGES.en.noSpecOption,
          nameVi: STYLE_PROCESS_MESSAGES.vi.noSpecOption,
        },
        'TARGET_SPEC'
      ),
    [languageCode]
  );
  const filteredTargetSpecOptionsWithNone = useMemo(() => {
    const options = [...filteredTargetSpecOptions];
    if (targetSpecNoneOption) {
      options.unshift(targetSpecNoneOption);
    }
    return options;
  }, [filteredTargetSpecOptions, targetSpecNoneOption]);
  const availableActionOptions = useMemo(
    () =>
      actionOptions.filter(
        (option) => !selectedActionCodeSet.has(normalizeStyleProcessCodeSegment(option?.code))
      ),
    [actionOptions, selectedActionCodeSet]
  );
  const filteredActionSpecOptions = useMemo(() => {
    const selectedActionCode = normalizeStyleProcessCodeSegment(actionCandidate?.code);
    if (!selectedActionCode) return actionSpecOptions;
    const linkedSpecCodes = actionToActionSpecRelationMap.get(selectedActionCode);
    if (!(linkedSpecCodes instanceof Set) || linkedSpecCodes.size === 0) {
      return actionSpecOptions;
    }
    return actionSpecOptions.filter((option) =>
      linkedSpecCodes.has(normalizeStyleProcessCodeSegment(option?.code))
    );
  }, [actionCandidate?.code, actionSpecOptions, actionToActionSpecRelationMap]);
  const actionSpecNoneOption = useMemo(
    () =>
      normalizeProcessMasterOption(
        {
          id: ACTION_SPEC_NONE_OPTION_CODE,
          type: 'ACTION_SPEC',
          code: ACTION_SPEC_NONE_OPTION_CODE,
          label: getStyleProcessMessage(languageCode, 'noSpecOption'),
          nameKo: STYLE_PROCESS_MESSAGES.ko.noSpecOption,
          nameEn: STYLE_PROCESS_MESSAGES.en.noSpecOption,
          nameVi: STYLE_PROCESS_MESSAGES.vi.noSpecOption,
        },
        'ACTION_SPEC'
      ),
    [languageCode]
  );
  const filteredActionSpecOptionsWithNone = useMemo(() => {
    const options = [...filteredActionSpecOptions];
    if (actionSpecNoneOption) {
      options.unshift(actionSpecNoneOption);
    }
    return options;
  }, [actionSpecNoneOption, filteredActionSpecOptions]);
  const targetSpecNoneOptionCodeKey = useMemo(
    () => normalizeStyleProcessCodeSegment(TARGET_SPEC_NONE_OPTION_CODE),
    []
  );
  const actionSpecNoneOptionCodeKey = useMemo(
    () => normalizeStyleProcessCodeSegment(ACTION_SPEC_NONE_OPTION_CODE),
    []
  );
  const resolveTargetPairLabel = useCallback(
    (pair) => {
      const targetLabel = resolveProcessMasterLabel(pair?.target, languageCode);
      const targetSpecLabel = resolveProcessMasterLabel(pair?.targetSpec, languageCode);
      if (!targetLabel) return targetSpecLabel || '';
      return targetSpecLabel ? `${targetLabel}(${targetSpecLabel})` : targetLabel;
    },
    [languageCode]
  );
  const resolveActionPairLabel = useCallback(
    (pair) => {
      const actionLabel = resolveProcessMasterLabel(pair?.action, languageCode);
      const actionSpecLabel = resolveProcessMasterLabel(pair?.actionSpec, languageCode);
      if (!actionLabel) return actionSpecLabel || '';
      return actionSpecLabel ? `${actionLabel}(${actionSpecLabel})` : actionLabel;
    },
    [languageCode]
  );
  const isCustomTargetPair = useCallback(
    (pair) =>
      isNewCustomTargetOption(pair?.target) ||
      Boolean(pair?.targetSpec && isNewCustomTargetSpecOption(pair?.targetSpec)),
    [isNewCustomTargetOption, isNewCustomTargetSpecOption]
  );
  const isCustomActionPair = useCallback(
    (pair) =>
      isNewCustomActionOption(pair?.action) ||
      Boolean(pair?.actionSpec && isNewCustomActionSpecOption(pair?.actionSpec)),
    [isNewCustomActionOption, isNewCustomActionSpecOption]
  );

  const totalPT = useMemo(
    () => {
      return safeProcesses.reduce((acc, process) => {
        const ptPerPiece = toOptionalSeconds(process?.pt);
        if (ptPerPiece == null) return acc;
        return acc + ptPerPiece;
      }, 0);
    },
    [safeProcesses]
  );
  const totalAT = useMemo(
    () => {
      const total = calculateProcessDisplayAtTotalForOrderQuantity(
        safeProcesses,
        displayOrderQuantity
      );
      return total == null ? null : total / displayOrderQuantity;
    },
    [safeProcesses, displayOrderQuantity]
  );
  const totalST = useMemo(
    () =>
      safeProcesses.reduce((acc, process) => {
        const value = resolveProcessStPerPieceSeconds(
          process,
          displayOrderQuantity
        );
        return value == null ? acc : acc + value;
      }, 0),
    [safeProcesses, displayOrderQuantity]
  );
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(
    () => hasCompleteDisplayableProcessAtTime(safeProcesses, displayOrderQuantity),
    [safeProcesses, displayOrderQuantity]
  );
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

  const canStartAdd = !isLoadingOptions && !optionsError;
  const isEditingRow = Boolean(editingInstanceId);
  const isDraftOpen = isAddingRow || isEditingRow;
  const editingProcess = useMemo(
    () =>
      isEditingRow
        ? safeProcesses.find((process) => process.instanceId === editingInstanceId) || null
        : null,
    [editingInstanceId, isEditingRow, safeProcesses]
  );

  const trySelectExistingOptionOnEnter = useCallback(
    (event, { inputText, options, onMatch }) => {
      if (event.key !== 'Enter' && event.key !== 'NumpadEnter' && event.key !== 'Tab') return false;
      const matchedOption = findProcessMasterOptionByInput(options, inputText, languageCode);
      if (!matchedOption) return false;
      event.preventDefault();
      event.stopPropagation();
      onMatch(matchedOption);
      return true;
    },
    [languageCode]
  );

  const handlePartEnterSelect = useCallback(
    (event) =>
      trySelectExistingOptionOnEnter(event, {
        inputText: partInputValue,
        options: partOptions,
        onMatch: (matchedOption) => {
          setAddDraft((prev) => ({
            ...prev,
            part: normalizeProcessCompositionEntry(matchedOption, 'part'),
          }));
          setPartInputValue('');
          setAddError('');
        },
      }),
    [partInputValue, partOptions, trySelectExistingOptionOnEnter]
  );
  const resetPendingTargetSelection = useCallback(() => {
    setTargetCandidate(null);
    setTargetSpecCandidate(null);
    setTargetInputValue('');
    setSpecInputValue('');
    setTargetComposerOpen(false);
  }, []);
  const resetPendingActionSelection = useCallback(() => {
    setActionCandidate(null);
    setActionSpecCandidate(null);
    setAddActionInput('');
    setActionSpecInputValue('');
    setActionComposerOpen(false);
  }, []);
  const commitTargetSelection = (nextSpecValue) => {
    const normalizedTarget = normalizeProcessCompositionEntry(targetCandidate, 'target');
    if (!normalizedTarget) {
      setAddError(getStyleProcessMessage(languageCode, 'validateTarget'));
      return false;
    }
    const normalizedSpecCode = normalizeStyleProcessCodeSegment(nextSpecValue?.code);
    const normalizedTargetSpec =
      normalizedSpecCode === targetSpecNoneOptionCodeKey
        ? null
        : normalizeProcessCompositionEntry(nextSpecValue, 'targetSpec');
    const appended = appendTargetPairToDraft(normalizedTarget, normalizedTargetSpec);
    if (!appended) return false;
    resetPendingTargetSelection();
    return true;
  };
  const commitActionSelection = (nextSpecValue) => {
    const normalizedAction = normalizeProcessCompositionEntry(actionCandidate, 'action');
    if (!normalizedAction) {
      setAddError(getStyleProcessMessage(languageCode, 'validateAction'));
      return false;
    }
    const normalizedSpecCode = normalizeStyleProcessCodeSegment(nextSpecValue?.code);
    const normalizedActionSpec =
      normalizedSpecCode === actionSpecNoneOptionCodeKey
        ? null
        : normalizeProcessCompositionEntry(nextSpecValue, 'actionSpec');
    const appended = appendActionPairToDraft(normalizedAction, normalizedActionSpec);
    if (!appended) return false;
    resetPendingActionSelection();
    return true;
  };
  const handleTargetComposerSelect = useCallback(
    (nextValue) => {
      if (!targetCandidate) {
        const normalizedTarget = normalizeProcessCompositionEntry(nextValue, 'target');
        if (!normalizedTarget) return;
        setTargetCandidate(normalizedTarget);
        setTargetSpecCandidate(null);
        setTargetInputValue('');
        setSpecInputValue('');
        setAddError('');
        window.requestAnimationFrame(() => {
          setTargetComposerOpen(true);
        });
        return;
      }
      const normalizedSpecCode = normalizeStyleProcessCodeSegment(nextValue?.code);
      if (normalizedSpecCode === targetSpecNoneOptionCodeKey) {
        commitTargetSelection(nextValue);
        return;
      }
      const normalizedSpec = normalizeProcessCompositionEntry(nextValue, 'targetSpec');
      if (!normalizedSpec) return;
      setTargetSpecCandidate(normalizedSpec);
      setAddError('');
      commitTargetSelection(normalizedSpec);
    },
    [commitTargetSelection, targetCandidate, targetSpecNoneOptionCodeKey]
  );
  const handleTargetComposerEnterSelect = useCallback(
    (event) => {
      const options = targetCandidate
        ? filteredTargetSpecOptionsWithNone
        : availableTargetOptions;
      const matched = trySelectExistingOptionOnEnter(event, {
        inputText: targetInputValue,
        options,
        onMatch: (matchedOption) => {
          handleTargetComposerSelect(matchedOption);
        },
      });
      if (matched) return;
      if (event.key !== 'Enter' && event.key !== 'NumpadEnter' && event.key !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      const rawInput = String(targetInputValue ?? '').trim();
      if (!rawInput) {
        if (targetCandidate) {
          commitTargetSelection(targetSpecNoneOption);
        }
        return;
      }
      handleTargetComposerSelect(rawInput);
    },
    [
      availableTargetOptions,
      commitTargetSelection,
      filteredTargetSpecOptionsWithNone,
      handleTargetComposerSelect,
      targetCandidate,
      targetInputValue,
      targetSpecNoneOption,
      trySelectExistingOptionOnEnter,
    ]
  );
  const handleActionComposerSelect = useCallback(
    (nextValue) => {
      if (!actionCandidate) {
        const normalizedAction = normalizeProcessCompositionEntry(nextValue, 'action');
        if (!normalizedAction) return;
        setActionCandidate(normalizedAction);
        setActionSpecCandidate(null);
        setAddActionInput('');
        setActionSpecInputValue('');
        setAddError('');
        window.requestAnimationFrame(() => {
          setActionComposerOpen(true);
        });
        return;
      }
      const normalizedSpecCode = normalizeStyleProcessCodeSegment(nextValue?.code);
      if (normalizedSpecCode === actionSpecNoneOptionCodeKey) {
        commitActionSelection(nextValue);
        return;
      }
      const normalizedSpec = normalizeProcessCompositionEntry(nextValue, 'actionSpec');
      if (!normalizedSpec) return;
      setActionSpecCandidate(normalizedSpec);
      setAddError('');
      commitActionSelection(normalizedSpec);
    },
    [actionCandidate, actionSpecNoneOptionCodeKey, commitActionSelection]
  );
  const handleActionComposerEnterSelect = useCallback(
    (event) => {
      const options = actionCandidate
        ? filteredActionSpecOptionsWithNone
        : availableActionOptions;
      const matched = trySelectExistingOptionOnEnter(event, {
        inputText: addActionInput,
        options,
        onMatch: (matchedOption) => {
          handleActionComposerSelect(matchedOption);
        },
      });
      if (matched) return;
      if (event.key !== 'Enter' && event.key !== 'NumpadEnter' && event.key !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      const rawInput = String(addActionInput ?? '').trim();
      if (!rawInput) {
        if (actionCandidate) {
          commitActionSelection(actionSpecNoneOption);
        }
        return;
      }
      handleActionComposerSelect(rawInput);
    },
    [
      actionCandidate,
      actionSpecNoneOption,
      addActionInput,
      availableActionOptions,
      commitActionSelection,
      filteredActionSpecOptionsWithNone,
      handleActionComposerSelect,
      trySelectExistingOptionOnEnter,
    ]
  );
  const appendTargetPairToDraft = useCallback((normalizedTarget, normalizedTargetSpec) => {
    if (selectedTargetPairs.length >= DRAFT_TARGET_SLOT_FIELDS.length) {
      setAddError(getStyleProcessMessage(languageCode, 'validateTargetLimit'));
      return false;
    }
    if (!normalizedTarget) {
      if (normalizedTargetSpec) {
        setAddError(getStyleProcessMessage(languageCode, 'validateTargetRequiredForSpec'));
      } else {
        setAddError(getStyleProcessMessage(languageCode, 'validateTarget'));
      }
      return false;
    }
    const targetIdentity = getProcessMasterOptionIdentity(normalizedTarget, 'TARGET');
    const duplicatedTarget = selectedTargetPairs.some((pair) => {
      const pairIdentity = getProcessMasterOptionIdentity(pair?.target, 'TARGET');
      return pairIdentity && targetIdentity && pairIdentity === targetIdentity;
    });
    if (duplicatedTarget) {
      setAddError(getStyleProcessMessage(languageCode, 'validateTargetDuplicate'));
      return false;
    }
    const normalizedTargetCode = normalizeStyleProcessCodeSegment(normalizedTarget?.code);
    const linkedTargets = resolveLinkedTargetCodeSet(Array.from(selectedTargetCodeSet));
    if (
      normalizedTargetCode &&
      linkedTargets instanceof Set &&
      linkedTargets.size > 0 &&
      !linkedTargets.has(normalizedTargetCode)
    ) {
      setAddError(getStyleProcessMessage(languageCode, 'validateInvalid'));
      return false;
    }
    const linkedTargetSpecCodes = normalizedTargetCode
      ? targetToTargetSpecRelationMap.get(normalizedTargetCode)
      : null;
    const normalizedTargetSpecCode = normalizeStyleProcessCodeSegment(normalizedTargetSpec?.code);
    if (
      normalizedTargetSpec &&
      normalizedTargetSpecCode &&
      linkedTargetSpecCodes instanceof Set &&
      linkedTargetSpecCodes.size > 0 &&
      !linkedTargetSpecCodes.has(normalizedTargetSpecCode)
    ) {
      setAddError(getStyleProcessMessage(languageCode, 'validateInvalid'));
      return false;
    }

    setAddDraft((prev) =>
      applyDraftTargetPairs(prev, [...getDraftTargetPairs(prev), {
        target: normalizedTarget,
        targetSpec: normalizedTargetSpec ?? null,
      }])
    );
    setAddError('');
    return true;
  }, [
    languageCode,
    resolveLinkedTargetCodeSet,
    selectedTargetCodeSet,
    selectedTargetPairs,
    targetToTargetSpecRelationMap,
  ]);
  const appendActionPairToDraft = useCallback((normalizedAction, normalizedActionSpec) => {
    if (selectedActionPairs.length >= DRAFT_ACTION_SLOT_FIELDS.length) {
      setAddError(getStyleProcessMessage(languageCode, 'validateActionLimit'));
      return false;
    }
    if (!normalizedAction) {
      if (normalizedActionSpec) {
        setAddError(getStyleProcessMessage(languageCode, 'validateActionRequiredForSpec'));
      } else {
        setAddError(getStyleProcessMessage(languageCode, 'validateAction'));
      }
      return false;
    }
    const actionIdentity = getProcessMasterOptionIdentity(normalizedAction, 'ACTION');
    const duplicatedAction = selectedActionPairs.some((pair) => {
      const pairIdentity = getProcessMasterOptionIdentity(pair?.action, 'ACTION');
      return pairIdentity && actionIdentity && pairIdentity === actionIdentity;
    });
    if (duplicatedAction) {
      setAddError(getStyleProcessMessage(languageCode, 'validateActionDuplicate'));
      return false;
    }
    const normalizedActionCode = normalizeStyleProcessCodeSegment(normalizedAction?.code);
    const linkedActionSpecCodes = normalizedActionCode
      ? actionToActionSpecRelationMap.get(normalizedActionCode)
      : null;
    const normalizedActionSpecCode = normalizeStyleProcessCodeSegment(normalizedActionSpec?.code);
    if (
      normalizedActionSpec &&
      normalizedActionSpecCode &&
      linkedActionSpecCodes instanceof Set &&
      linkedActionSpecCodes.size > 0 &&
      !linkedActionSpecCodes.has(normalizedActionSpecCode)
    ) {
      setAddError(getStyleProcessMessage(languageCode, 'validateInvalid'));
      return false;
    }

    setAddDraft((prev) =>
      applyDraftActionPairs(prev, [...getDraftActionPairs(prev), {
        action: normalizedAction,
        actionSpec: normalizedActionSpec ?? null,
      }])
    );
    setAddError('');
    return true;
  }, [actionToActionSpecRelationMap, languageCode, selectedActionPairs]);
  const handleRemoveTargetBadge = useCallback((index) => {
    setAddDraft((prev) =>
      applyDraftTargetPairs(
        prev,
        getDraftTargetPairs(prev).filter((_pair, pairIndex) => pairIndex !== index)
      )
    );
    setAddError('');
  }, []);
  const handleRemoveActionBadge = useCallback((index) => {
    setAddDraft((prev) =>
      applyDraftActionPairs(
        prev,
        getDraftActionPairs(prev).filter((_pair, pairIndex) => pairIndex !== index)
      )
    );
    setAddError('');
  }, []);

  useEffect(() => {
    if (!isEditingRow) return undefined;
    const formNode = draftFormRef.current;
    if (!formNode) return undefined;

    const timerId = window.setTimeout(() => {
      formNode.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      const firstInput = formNode.querySelector('input, textarea');
      if (firstInput && typeof firstInput.focus === 'function') {
        firstInput.focus({ preventScroll: true });
        if (typeof firstInput.select === 'function') {
          firstInput.select();
        }
      }
    }, 60);

    return () => window.clearTimeout(timerId);
  }, [editingInstanceId, isEditingRow]);

  useEffect(() => {
    if (isDraftOpen) return undefined;
    const targetInstanceId = pendingReturnScrollInstanceIdRef.current;
    if (!targetInstanceId) return undefined;
    const rowNode = processRowRefs.current.get(targetInstanceId);
    if (!rowNode) return undefined;
    pendingReturnScrollInstanceIdRef.current = null;

    const timerId = window.setTimeout(() => {
      rowNode.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);

    return () => window.clearTimeout(timerId);
  }, [isDraftOpen, safeProcesses]);

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
    const processText = resolveDraftProcessText(draft);
    if (!processText) {
      return getStyleProcessMessage(languageCode, 'validateTextRequired');
    }

    const codeKey = normalizeProcessCodeKey(draft?.processCode);
    if (!codeKey) {
      return getStyleProcessMessage(languageCode, 'validateCodeRequired');
    }

    const previewProcess = buildProcessPayload(draft, null, timeRefQuantity);
    const identity = getProcessIdentity(previewProcess);
    if (!identity) return getStyleProcessMessage(languageCode, 'validateInvalid');

    const duplicated = safeProcesses.some((process) => {
      if (ignoreInstanceId && process.instanceId === ignoreInstanceId) return false;
      return getProcessIdentity(process) === identity;
    });
    if (duplicated) return getStyleProcessMessage(languageCode, 'validateDuplicate');

    const duplicatedCode = safeProcesses.some((process) => {
      if (ignoreInstanceId && process.instanceId === ignoreInstanceId) return false;
      return normalizeProcessCodeKey(process?.code) === codeKey;
    });
    if (duplicatedCode) return getStyleProcessMessage(languageCode, 'validateDuplicateCode');
    return '';
  };

  const handleStartAddRow = () => {
    if (!canStartAdd) return;
    setEditingInstanceId(null);
    setIsAddingRow(true);
    setIsSelectionComposerExpanded(false);
    setAddDraft(createEmptyDraft());
    setPartInputValue('');
    setTargetInputValue('');
    setSpecInputValue('');
    setTargetCandidate(null);
    setTargetSpecCandidate(null);
    setAddActionInput('');
    setActionSpecInputValue('');
    setActionCandidate(null);
    setActionSpecCandidate(null);
    setTargetComposerOpen(false);
    setActionComposerOpen(false);
    setAddError('');
  };

  const handleCancelAddRow = () => {
    setIsAddingRow(false);
    setEditingInstanceId(null);
    setIsSelectionComposerExpanded(false);
    setAddDraft(createEmptyDraft());
    setPartInputValue('');
    setTargetInputValue('');
    setSpecInputValue('');
    setTargetCandidate(null);
    setTargetSpecCandidate(null);
    setAddActionInput('');
    setActionSpecInputValue('');
    setActionCandidate(null);
    setActionSpecCandidate(null);
    setTargetComposerOpen(false);
    setActionComposerOpen(false);
    setAddError('');
  };

  const handleStartEditRow = useCallback((process) => {
    if (!process) return;
    setIsAddingRow(false);
    setEditingInstanceId(process.instanceId);
    setIsSelectionComposerExpanded(false);
    setAddDraft(buildDraftFromProcess(process, displayOrderQuantity, languageCode));
    setPartInputValue('');
    setTargetInputValue('');
    setSpecInputValue('');
    setTargetCandidate(null);
    setTargetSpecCandidate(null);
    setAddActionInput('');
    setActionSpecInputValue('');
    setActionCandidate(null);
    setActionSpecCandidate(null);
    setTargetComposerOpen(false);
    setActionComposerOpen(false);
    setAddError('');
  }, [displayOrderQuantity, languageCode]);

  const resolveDraftWithPendingSelections = useCallback((draft) => {
    let nextDraft = draft;

    const pendingTarget = normalizeProcessCompositionEntry(
      targetCandidate
        ? targetCandidate
        : String(targetInputValue ?? '').trim(),
      'target'
    );
    const pendingTargetSpec = normalizeProcessCompositionEntry(
      targetCandidate
        ? targetSpecCandidate ?? String(targetInputValue ?? '').trim()
        : targetSpecCandidate ?? String(specInputValue ?? '').trim(),
      'targetSpec'
    );
    if (pendingTarget) {
      const currentTargetPairs = getDraftTargetPairs(nextDraft);
      const pendingTargetIdentity = getProcessMasterOptionIdentity(pendingTarget, 'TARGET');
      const duplicated = currentTargetPairs.some((pair) => {
        const pairIdentity = getProcessMasterOptionIdentity(pair?.target, 'TARGET');
        return pairIdentity && pendingTargetIdentity && pairIdentity === pendingTargetIdentity;
      });
      if (!duplicated && currentTargetPairs.length < DRAFT_TARGET_SLOT_FIELDS.length) {
        nextDraft = applyDraftTargetPairs(nextDraft, [...currentTargetPairs, {
          target: pendingTarget,
          targetSpec: pendingTargetSpec ?? null,
        }]);
      }
    }

    const pendingAction = normalizeProcessCompositionEntry(
      actionCandidate
        ? actionCandidate
        : String(addActionInput ?? '').trim(),
      'action'
    );
    const pendingActionSpec = normalizeProcessCompositionEntry(
      actionCandidate
        ? actionSpecCandidate ?? String(addActionInput ?? '').trim()
        : actionSpecCandidate ?? String(actionSpecInputValue ?? '').trim(),
      'actionSpec'
    );
    if (pendingAction) {
      const currentActionPairs = getDraftActionPairs(nextDraft);
      const pendingActionIdentity = getProcessMasterOptionIdentity(pendingAction, 'ACTION');
      const duplicated = currentActionPairs.some((pair) => {
        const pairIdentity = getProcessMasterOptionIdentity(pair?.action, 'ACTION');
        return pairIdentity && pendingActionIdentity && pairIdentity === pendingActionIdentity;
      });
      if (!duplicated && currentActionPairs.length < DRAFT_ACTION_SLOT_FIELDS.length) {
        nextDraft = applyDraftActionPairs(nextDraft, [...currentActionPairs, {
          action: pendingAction,
          actionSpec: pendingActionSpec ?? null,
        }]);
      }
    }

    return nextDraft;
  }, [
    actionCandidate,
    actionSpecCandidate,
    actionSpecInputValue,
    addActionInput,
    specInputValue,
    targetCandidate,
    targetInputValue,
    targetSpecCandidate,
  ]);

  const applyEditedProcess = (instanceId, nextProcess) => {
    pendingReturnScrollInstanceIdRef.current = instanceId;
    onProcessesChange(
      safeProcesses.map((process) =>
        process.instanceId === instanceId ? nextProcess : process
      )
    );
    handleCancelAddRow();
  };

  const handleSaveAddRow = () => {
    const draftForSave = resolveDraftWithPendingSelections(addDraft);
    const errorMessage = validateDraft(draftForSave, {
      ignoreInstanceId: isEditingRow ? editingInstanceId : null,
    });
    if (errorMessage) {
      setAddError(errorMessage);
      return;
    }
    const nextProcess = buildProcessPayload(draftForSave, editingProcess, timeRefQuantity);
    if (isEditingRow) {
      if (!areOptionalSecondsEqual(editingProcess?.pt, nextProcess?.pt)) {
        const processName = resolveLocalizedProcessDisplayLabel(
          nextProcess,
          languageCode,
          getStyleProcessMessage(languageCode, 'processColumn'),
          compositionMasterLookupByKind
        );
        setPendingPtChange({
          instanceId: editingInstanceId,
          nextProcess,
          hasWorkRecords: hasProcessWorkRecords(editingProcess),
          processName,
          previousPt: formatSecondsOrDash(editingProcess?.pt),
          nextPt: formatSecondsOrDash(nextProcess?.pt),
        });
        return;
      }
      applyEditedProcess(editingInstanceId, nextProcess);
    } else {
      onProcessesChange([...safeProcesses, nextProcess]);
      handleCancelAddRow();
    }
  };

  const handleKeepPendingPtChange = () => {
    if (!pendingPtChange) return;
    applyEditedProcess(pendingPtChange.instanceId, pendingPtChange.nextProcess);
    setPendingPtChange(null);
  };

  const handleUpdatePendingPtChangeSt = () => {
    if (!pendingPtChange) return;
    const nextProcess = buildProcessWithPtDerivedStUpdate(pendingPtChange.nextProcess);
    applyEditedProcess(pendingPtChange.instanceId, nextProcess);
    setPendingPtChange(null);
  };

  const handleCancelPendingPtChange = () => {
    setPendingPtChange(null);
  };

  const pendingPtDerivedStBuckets = useMemo(
    () =>
      pendingPtChange
        ? buildPtDerivedStBuckets(pendingPtChange.nextProcess?.pt)
        : [],
    [pendingPtChange]
  );
  const canUpdatePendingPtChangeSt = pendingPtDerivedStBuckets.length > 0;

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

  const renderRowActions = useCallback((process) => {
    const deleteDisabled = isAddingRow || hasProcessWorkRecords(process);
    return (
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
        <Tooltip
          title={
            deleteDisabled && hasProcessWorkRecords(process)
              ? getStyleProcessMessage(languageCode, 'deleteBlocked')
              : getStyleProcessMessage(languageCode, 'delete')
          }
        >
          <span>
            <IconButton
              size="small"
              onClick={() => handleRemoveProcess(process.instanceId)}
              disabled={deleteDisabled}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    );
  }, [handleRemoveProcess, handleStartEditRow, isAddingRow, languageCode]);

  const addPreviewProcess = isDraftOpen
    ? buildProcessPayload(
        resolveDraftWithPendingSelections(deferredAddDraft),
        editingProcess,
        timeRefQuantity
      )
    : null;
  const addPreviewAtTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessAtDisplayPerPieceSeconds(
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
  const isSelectingTargetSpec = Boolean(targetCandidate);
  const targetComposerOptions = isSelectingTargetSpec
    ? filteredTargetSpecOptionsWithNone
    : availableTargetOptions;
  const isSelectingActionSpec = Boolean(actionCandidate);
  const actionComposerOptions = isSelectingActionSpec
    ? filteredActionSpecOptionsWithNone
    : availableActionOptions;
  const isTargetLimitReached = selectedTargetPairs.length >= DRAFT_TARGET_SLOT_FIELDS.length;
  const isActionLimitReached = selectedActionPairs.length >= DRAFT_ACTION_SLOT_FIELDS.length;
  const filterComposerOptions = useCallback(
    (options, state, { includeNoneCode, noneOption }) => {
      const normalizedInput = normalizeProcessMasterMatchText(state?.inputValue);
      const sourceOptions = Array.isArray(options) ? options : [];
      const filtered = normalizedInput
        ? sourceOptions.filter((option) =>
            buildProcessMasterMatchCandidates(option, languageCode).some((candidate) =>
              candidate.includes(normalizedInput)
            )
          )
        : [...sourceOptions];
      if (!includeNoneCode) return filtered;
      const noneKey = normalizeStyleProcessCodeSegment(includeNoneCode);
      if (!noneKey) return filtered;
      const noneRow =
        filtered.find(
          (option) => normalizeStyleProcessCodeSegment(option?.code) === noneKey
        ) ||
        sourceOptions.find(
          (option) => normalizeStyleProcessCodeSegment(option?.code) === noneKey
        ) ||
        noneOption ||
        null;
      const rowsWithoutNone = filtered.filter(
        (option) => normalizeStyleProcessCodeSegment(option?.code) !== noneKey
      );
      return noneRow ? [noneRow, ...rowsWithoutNone] : rowsWithoutNone;
    },
    [languageCode]
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
              resolveProcessAtDisplayPerPieceSeconds(process, displayOrderQuantity);
            const previewStTotalSeconds =
              resolveProcessStPerPieceSeconds(process, displayOrderQuantity);
            const reviewMeta = parseProcessReviewMeta(process);
            const mainProcessLabel = resolveLocalizedProcessDisplayLabel(
              process,
              languageCode,
              getStyleProcessMessage(languageCode, 'processColumn'),
              compositionMasterLookupByKind
            );
            const selectionSummaryLabel = buildProcessNameFromComposition(
              process?.processComposition,
              languageCode,
              '',
              compositionMasterLookupByKind
            );

            return (
              <TableRow
                ref={(node) => {
                  dragProvided.innerRef(node);
                  if (node) {
                    processRowRefs.current.set(process.instanceId, node);
                  } else {
                    processRowRefs.current.delete(process.instanceId);
                  }
                }}
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

                <TableCell
                  align="left"
                  sx={{
                    width: PROCESS_CODE_COLUMN_WIDTH,
                    minWidth: PROCESS_CODE_COLUMN_WIDTH,
                    maxWidth: PROCESS_CODE_COLUMN_WIDTH,
                    px: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: process?.code ? 'text.primary' : 'text.disabled',
                      display: 'block',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={String(process?.code ?? '').trim()}
                  >
                    {String(process?.code ?? '').trim()}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Stack spacing={0.25}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                      <span>{mainProcessLabel}</span>
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
                    {selectionSummaryLabel ? (
                      <Typography variant="caption" color="text.secondary">
                        {`${getStyleProcessMessage(languageCode, 'selectionSummaryLabel')}: ${selectionSummaryLabel}`}
                      </Typography>
                    ) : null}
                  </Stack>
                </TableCell>

                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatSecondsOrDash(process.pt)}
                  </Typography>
                </TableCell>

                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatSecondsOrDash(previewAtTotalSeconds)}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ width: PROCESS_TIME_COLUMN_WIDTH }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    {formatSecondsOrDash(previewStTotalSeconds)}
                  </Typography>
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
      isDraftOpen,
      languageCode,
      compositionMasterLookupByKind,
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
      {isDraftOpen && (
        <Paper
          ref={draftFormRef}
          variant="outlined"
          sx={{
            scrollMarginTop: 88,
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
            <Stack spacing={1.25}>
              <Stack
                direction={{ xs: 'column', xl: 'row' }}
                spacing={1}
                sx={{ alignItems: { xs: 'stretch', xl: 'flex-start' } }}
              >
                <TextField
                  required
                  size="small"
                  label={getStyleProcessMessage(languageCode, 'textProcessLabel')}
                  value={addDraft.processText ?? ''}
                  onChange={(event) => {
                    setAddDraft((prev) => ({
                      ...prev,
                      processText: event.target.value,
                    }));
                    setAddError('');
                  }}
                  placeholder={getStyleProcessMessage(languageCode, 'textProcessPlaceholder')}
                  sx={{ flex: 2, minWidth: 320 }}
                />
                <TextField
                  required
                  size="small"
                  label={getStyleProcessMessage(languageCode, 'processCodeLabel')}
                  value={addDraft.processCode ?? ''}
                  onChange={(event) => {
                    setAddDraft((prev) => ({
                      ...prev,
                      processCode: event.target.value,
                    }));
                    setAddError('');
                  }}
                  placeholder={getStyleProcessMessage(languageCode, 'processCodePlaceholder')}
                  sx={{ minWidth: 170, flex: 1 }}
                />
              </Stack>

              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  border: '1px dashed',
                  borderColor: 'divider',
                  backgroundColor: 'rgba(255,255,255,0.7)',
                }}
              >
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      {getStyleProcessMessage(languageCode, 'selectionComposerTitle')}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setIsSelectionComposerExpanded((prev) => !prev)}
                      endIcon={
                        isSelectionComposerExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />
                      }
                    >
                      {getStyleProcessMessage(
                        languageCode,
                        isSelectionComposerExpanded ? 'selectionComposerCollapse' : 'selectionComposerExpand'
                      )}
                    </Button>
                  </Stack>
                  <Collapse in={isSelectionComposerExpanded} timeout="auto" unmountOnExit>
                    <Stack spacing={1}>
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {getStyleProcessMessage(languageCode, 'selectionComposerHint')}
                      </Typography>

                      <Stack
                        direction={{ xs: 'column', xl: 'row' }}
                        spacing={1}
                        sx={{ alignItems: { xs: 'stretch', xl: 'flex-start' } }}
                      >
                    <Stack spacing={0.75} sx={{ flex: 2, minWidth: 320 }}>
                      <Autocomplete
                        freeSolo
                        forcePopupIcon
                        autoHighlight
                        size="small"
                        disabled={isTargetLimitReached && !isSelectingTargetSpec}
                        open={targetComposerOpen}
                        onOpen={() => setTargetComposerOpen(true)}
                        onClose={() => setTargetComposerOpen(false)}
                        options={targetComposerOptions}
                        filterOptions={(options, state) =>
                          filterComposerOptions(options, state, {
                            includeNoneCode: isSelectingTargetSpec
                              ? TARGET_SPEC_NONE_OPTION_CODE
                              : '',
                            noneOption: targetSpecNoneOption,
                          })
                        }
                        value={null}
                        inputValue={targetInputValue}
                        onChange={(_event, value) => {
                          if (!value) return;
                          handleTargetComposerSelect(value);
                        }}
                        onInputChange={(_event, value, reason) => {
                          if (reason === 'reset') {
                            setTargetInputValue('');
                            return;
                          }
                          setTargetInputValue(String(value ?? ''));
                        }}
                        getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={getStyleProcessMessage(
                              languageCode,
                              isSelectingTargetSpec ? 'targetSpecLabel' : 'targetLabel'
                            )}
                            placeholder={
                              isSelectingTargetSpec
                                ? `${getStyleProcessMessage(languageCode, 'noSpecOption')} / ${getStyleProcessMessage(languageCode, 'specPlaceholder')}`
                                : getStyleProcessMessage(languageCode, 'actionInputHint')
                            }
                            onKeyDown={handleTargetComposerEnterSelect}
                            InputProps={{
                              ...params.InputProps,
                              startAdornment: (
                                <>
                                  {selectedTargetPairs.map((pair, index) => {
                                    const isCustom = isCustomTargetPair(pair);
                                    return (
                                      <Chip
                                        key={`target-pair-${index}`}
                                        size="small"
                                        label={resolveTargetPairLabel(pair)}
                                        onDelete={() => handleRemoveTargetBadge(index)}
                                        sx={
                                          isCustom
                                            ? {
                                                bgcolor: 'rgba(255, 236, 179, 0.55)',
                                                color: '#5b4300',
                                                border: '1px solid rgba(231, 184, 78, 0.9)',
                                                '& .MuiChip-label': {
                                                  fontWeight: 700,
                                                },
                                              }
                                            : undefined
                                        }
                                        avatar={
                                          isCustom ? (
                                            <Avatar
                                              sx={{
                                                width: 18,
                                                height: 18,
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                bgcolor: '#ffd98a',
                                                color: '#4d3600',
                                                border: '1px solid rgba(173, 121, 0, 0.45)',
                                              }}
                                            >
                                              N
                                            </Avatar>
                                          ) : undefined
                                        }
                                      />
                                    );
                                  })}
                                  {targetCandidate ? (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      label={
                                        resolveTargetPairLabel({
                                          target: targetCandidate,
                                          targetSpec: targetSpecCandidate,
                                        }) || resolveProcessMasterLabel(targetCandidate, languageCode)
                                      }
                                      onDelete={() => {
                                        resetPendingTargetSelection();
                                        setAddError('');
                                      }}
                                      avatar={
                                        isNewCustomTargetOption(targetCandidate) ? (
                                          <Avatar
                                            sx={{
                                              width: 18,
                                              height: 18,
                                              fontSize: '0.68rem',
                                              fontWeight: 800,
                                              bgcolor: '#ffd98a',
                                              color: '#4d3600',
                                              border: '1px solid rgba(173, 121, 0, 0.45)',
                                            }}
                                          >
                                            N
                                          </Avatar>
                                        ) : undefined
                                      }
                                    />
                                  ) : null}
                                  {params.InputProps.startAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        sx={{
                          flex: 1,
                          minWidth: 170,
                          '& .MuiAutocomplete-inputRoot': {
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: 0.5,
                          },
                        }}
                      />
                    </Stack>

                    <Stack spacing={0.75} sx={{ flex: 2, minWidth: 320 }}>
                      <Autocomplete
                        freeSolo
                        forcePopupIcon
                        autoHighlight
                        size="small"
                        disabled={isActionLimitReached && !isSelectingActionSpec}
                        open={actionComposerOpen}
                        onOpen={() => setActionComposerOpen(true)}
                        onClose={() => setActionComposerOpen(false)}
                        options={actionComposerOptions}
                        filterOptions={(options, state) =>
                          filterComposerOptions(options, state, {
                            includeNoneCode: isSelectingActionSpec
                              ? ACTION_SPEC_NONE_OPTION_CODE
                              : '',
                            noneOption: actionSpecNoneOption,
                          })
                        }
                        value={null}
                        inputValue={addActionInput}
                        onChange={(_event, value) => {
                          if (!value) return;
                          handleActionComposerSelect(value);
                        }}
                        onInputChange={(_event, value, reason) => {
                          if (reason === 'reset') {
                            setAddActionInput('');
                            return;
                          }
                          setAddActionInput(String(value ?? ''));
                        }}
                        getOptionLabel={(option) => resolveProcessMasterLabel(option, languageCode)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={getStyleProcessMessage(
                              languageCode,
                              isSelectingActionSpec ? 'actionSpecLabel' : 'actionLabel'
                            )}
                            placeholder={
                              isSelectingActionSpec
                                ? `${getStyleProcessMessage(languageCode, 'noSpecOption')} / ${getStyleProcessMessage(languageCode, 'specPlaceholder')}`
                                : getStyleProcessMessage(languageCode, 'actionInputHint')
                            }
                            onKeyDown={handleActionComposerEnterSelect}
                            InputProps={{
                              ...params.InputProps,
                              startAdornment: (
                                <>
                                  {selectedActionPairs.map((pair, index) => {
                                    const isCustom = isCustomActionPair(pair);
                                    return (
                                      <Chip
                                        key={`action-pair-${index}`}
                                        size="small"
                                        label={resolveActionPairLabel(pair)}
                                        onDelete={() => handleRemoveActionBadge(index)}
                                        sx={
                                          isCustom
                                            ? {
                                                bgcolor: 'rgba(255, 236, 179, 0.55)',
                                                color: '#5b4300',
                                                border: '1px solid rgba(231, 184, 78, 0.9)',
                                                '& .MuiChip-label': {
                                                  fontWeight: 700,
                                                },
                                              }
                                            : undefined
                                        }
                                        avatar={
                                          isCustom ? (
                                            <Avatar
                                              sx={{
                                                width: 18,
                                                height: 18,
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                bgcolor: '#ffd98a',
                                                color: '#4d3600',
                                                border: '1px solid rgba(173, 121, 0, 0.45)',
                                              }}
                                            >
                                              N
                                            </Avatar>
                                          ) : undefined
                                        }
                                      />
                                    );
                                  })}
                                  {actionCandidate ? (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      label={
                                        resolveActionPairLabel({
                                          action: actionCandidate,
                                          actionSpec: actionSpecCandidate,
                                        }) || resolveProcessMasterLabel(actionCandidate, languageCode)
                                      }
                                      onDelete={() => {
                                        resetPendingActionSelection();
                                        setAddError('');
                                      }}
                                      avatar={
                                        isNewCustomActionOption(actionCandidate) ? (
                                          <Avatar
                                            sx={{
                                              width: 18,
                                              height: 18,
                                              fontSize: '0.68rem',
                                              fontWeight: 800,
                                              bgcolor: '#ffd98a',
                                              color: '#4d3600',
                                              border: '1px solid rgba(173, 121, 0, 0.45)',
                                            }}
                                          >
                                            N
                                          </Avatar>
                                        ) : undefined
                                      }
                                    />
                                  ) : null}
                                  {params.InputProps.startAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        sx={{
                          flex: 1,
                          minWidth: 170,
                          '& .MuiAutocomplete-inputRoot': {
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: 0.5,
                          },
                        }}
                      />
                    </Stack>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}
                    >
                      <TextField
                        size="small"
                        type="number"
                        label={getStyleProcessMessage(languageCode, 'repeatCountLabel')}
                        value={addDraft.repeatCount ?? '1'}
                        onChange={(event) => {
                          setAddDraft((prev) => ({
                            ...prev,
                            repeatCount: event.target.value,
                          }));
                          setAddError('');
                        }}
                        inputProps={{ min: 1, step: 1 }}
                        sx={{ width: 140 }}
                      />
                      <TextField
                        required
                        size="small"
                        label={getStyleProcessMessage(languageCode, 'processCodeLabel')}
                        value={addDraft.processCode ?? ''}
                        onChange={(event) => {
                          setAddDraft((prev) => ({
                            ...prev,
                            processCode: event.target.value,
                          }));
                          setAddError('');
                        }}
                        placeholder={getStyleProcessMessage(languageCode, 'processCodePlaceholder')}
                        sx={{ minWidth: 210, flex: 1 }}
                      />
                    </Stack>
                  </Stack>
                </Stack>
                  </Collapse>
                </Stack>
              </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  xl: 'minmax(300px, 2.4fr) 120px 132px 132px minmax(280px, 1.9fr) auto',
                },
                gap: 1,
                alignItems: 'start',
              }}
            >
              <TextField
                size="small"
                label={getStyleProcessMessage(languageCode, 'previewLabel')}
                value={
                  addPreviewProcess
                    ? resolveLocalizedProcessDisplayLabel(
                        addPreviewProcess,
                        languageCode,
                        getStyleProcessMessage(languageCode, 'processColumn'),
                        compositionMasterLookupByKind
                      )
                    : getStyleProcessMessage(languageCode, 'previewEmpty')
                }
                InputProps={{ readOnly: true }}
                inputProps={{ tabIndex: -1 }}
                sx={{
                  minWidth: 0,
                  '& .MuiInputBase-input': {
                    fontWeight: 600,
                  },
                }}
              />
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
                label={`${getStyleProcessMessage(languageCode, 'stLabel')}(${stBucketQuantityLabel})`}
                value={formatSecondsOrDash(addPreviewStTotalSeconds)}
                InputProps={{ readOnly: true }}
                inputProps={{ tabIndex: -1 }}
                sx={{ width: 132 }}
              />
              <TextField
                size="small"
                label={`${getStyleProcessMessage(languageCode, 'atLabel')}(${timeRefQuantityLabel})`}
                value={formatSecondsOrDash(addPreviewAtTotalSeconds)}
                InputProps={{ readOnly: true }}
                inputProps={{ tabIndex: -1 }}
                sx={{ width: 132 }}
              />
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 280 }}>
                <Checkbox
                  size="small"
                  checked={
                    Boolean(addDraft.needsReview) || hasReviewCommentText(addDraft.reviewComment)
                  }
                  onChange={(event) => {
                    const checked = Boolean(event.target.checked);
                    setAddDraft((prev) => ({
                      ...prev,
                      needsReview: checked,
                      reviewComment: checked ? prev.reviewComment : '',
                    }));
                  }}
                />
                <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                  {getStyleProcessMessage(languageCode, 'reviewRequiredLabel')}
                </Typography>
                <TextField
                  size="small"
                  value={addDraft.reviewComment || ''}
                  onChange={(event) => {
                    const nextComment = event.target.value;
                    setAddDraft((prev) => ({
                      ...prev,
                      reviewComment: nextComment,
                      needsReview: hasReviewCommentText(nextComment) ? true : prev.needsReview,
                    }));
                  }}
                  onBlur={() => setAddError('')}
                  placeholder={getStyleProcessMessage(languageCode, 'reviewCommentPlaceholder')}
                  sx={{ flex: 1, minWidth: 0 }}
                />
              </Stack>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ justifyContent: { xs: 'flex-end', xl: 'flex-start' } }}
              >
                <Button variant="outlined" onClick={handleCancelAddRow}>
                  {getStyleProcessMessage(languageCode, 'cancel')}
                </Button>
                <SaveButton onClick={handleSaveAddRow}>
                  {getStyleProcessMessage(languageCode, isEditingRow ? 'save' : 'add')}
                </SaveButton>
              </Stack>
            </Box>

            {addError && (
              <Typography variant="caption" color="error">
                {addError}
              </Typography>
            )}
          </Stack>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <DragDropContext onDragEnd={onDragEnd}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 70 }} />
                <col style={{ width: PROCESS_CODE_COLUMN_WIDTH }} />
                <col />
                <col style={{ width: `${PROCESS_TIME_COLUMN_WIDTH}px` }} />
                <col style={{ width: `${PROCESS_TIME_COLUMN_WIDTH}px` }} />
                <col style={{ width: `${PROCESS_TIME_COLUMN_WIDTH}px` }} />
                <col style={{ width: `${PROCESS_ACTION_COLUMN_WIDTH}px` }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 70 }}>{getStyleProcessMessage(languageCode, 'orderColumn')}</TableCell>
                  <TableCell
                    align="left"
                    sx={{
                      width: PROCESS_CODE_COLUMN_WIDTH,
                      minWidth: PROCESS_CODE_COLUMN_WIDTH,
                      maxWidth: PROCESS_CODE_COLUMN_WIDTH,
                      px: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getStyleProcessMessage(languageCode, 'codeColumn')}
                  </TableCell>
                  <TableCell>
                    {getStyleProcessMessage(languageCode, 'processColumn')}
                  </TableCell>
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
                        <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
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
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {getStyleProcessMessage(languageCode, 'total')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasAT ? formatSecondsOrDash(totalAT) : '-'}
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
      <Dialog
        open={Boolean(pendingPtChange)}
        onClose={handleCancelPendingPtChange}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {getStyleProcessMessage(languageCode, 'ptChangeDialogTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            {getStyleProcessMessage(languageCode, 'ptChangeMessage')}
          </DialogContentText>
          <DialogContentText sx={{ mb: 1.5 }}>
            {pendingPtChange?.hasWorkRecords
              ? getStyleProcessMessage(languageCode, 'ptChangeHasRecordsMessage')
              : getStyleProcessMessage(languageCode, 'ptChangeNoRecordsMessage')}
          </DialogContentText>
          {pendingPtChange ? (
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {getStyleProcessMessage(languageCode, 'ptChangeSummary', {
                processName: pendingPtChange.processName,
                previousPt: pendingPtChange.previousPt,
                nextPt: pendingPtChange.nextPt,
              })}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Tooltip
            title={
              pendingPtChange && !canUpdatePendingPtChangeSt
                ? getStyleProcessMessage(languageCode, 'updateAllStDisabled')
                : ''
            }
          >
            <span>
              <Button
                color="warning"
                variant="outlined"
                disabled={!pendingPtChange || !canUpdatePendingPtChangeSt}
                onClick={handleUpdatePendingPtChangeSt}
              >
                {getStyleProcessMessage(languageCode, 'updateAllStOnPtChange')}
              </Button>
            </span>
          </Tooltip>
          <Button variant="contained" onClick={handleKeepPendingPtChange}>
            {getStyleProcessMessage(languageCode, 'keepStOnPtChange')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StyleProcess;

