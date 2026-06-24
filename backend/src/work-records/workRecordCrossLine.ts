import {
  ensureArray,
  resolveOptionalString,
  toPositiveIntOrNull,
} from "../utils/common";

export const WORK_LOG_CROSS_LINE_NOTE_PREFIX =
  "[\uB2E4\uB978 \uB77C\uC778 \uC791\uC5C5]";
const WORK_LOG_CROSS_LINE_NOTE_MARKER =
  `\n\n${WORK_LOG_CROSS_LINE_NOTE_PREFIX}\n`;
const WORK_LOG_UI_AUTO_NOTE_PREFIX = "[\uC790\uB3D9 \uBA54\uBAA8]";
const WORK_LOG_UI_AUTO_NOTE_MARKER = `\n\n${WORK_LOG_UI_AUTO_NOTE_PREFIX}\n`;

export type WorkLogCrossLineAssignmentWarning = {
  workerId: number | null;
  workerName: string | null;
  workLogLineId: number | null;
  workLogLineName: string | null;
  assignmentLineId: number | null;
  assignmentLineName: string | null;
  orderNo: string | null;
  styleId: string | null;
  styleName: string | null;
  processCode: string | null;
  processName: string | null;
};

export type WorkLogCrossLineAssignmentWarningSummary = {
  rowCount: number;
  lineCount: number;
  lines: Array<{
    lineId: number | null;
    lineName: string;
    rowCount: number;
  }>;
};

const buildLineLabel = (lineId: number | null, lineName: string | null) => {
  const normalizedName = resolveOptionalString(lineName, null);
  if (normalizedName) return normalizedName;
  if (lineId != null) return `\uB77C\uC778 #${lineId}`;
  return "\uB77C\uC778 \uBBF8\uD655\uC778";
};

const buildWorkerLabel = (warning: WorkLogCrossLineAssignmentWarning) => {
  const workerName = resolveOptionalString(warning.workerName, null);
  if (workerName) return workerName;
  if (warning.workerId != null) return `\uC791\uC5C5\uC790 #${warning.workerId}`;
  return "\uC791\uC5C5\uC790 \uBBF8\uD655\uC778";
};

const buildStyleLabel = (warning: WorkLogCrossLineAssignmentWarning) =>
  resolveOptionalString(warning.styleId, null) ??
  resolveOptionalString(warning.styleName, null) ??
  "\uC2A4\uD0C0\uC77C \uBBF8\uD655\uC778";

const buildProcessLabel = (warning: WorkLogCrossLineAssignmentWarning) =>
  resolveOptionalString(warning.processCode, null) ??
  resolveOptionalString(warning.processName, null) ??
  "\uACF5\uC815 \uBBF8\uD655\uC778";

export const stripWorkLogCrossLineNote = (value: unknown) => {
  const text = typeof value === "string" ? value : "";
  const leadingPrefix = `${WORK_LOG_CROSS_LINE_NOTE_PREFIX}\n`;
  if (text.startsWith(leadingPrefix)) return "";
  const markerIndex = text.indexOf(WORK_LOG_CROSS_LINE_NOTE_MARKER);
  if (markerIndex >= 0) return text.slice(0, markerIndex).trimEnd();
  const prefixIndex = text.indexOf(leadingPrefix);
  return prefixIndex >= 0 ? text.slice(0, prefixIndex).trimEnd() : text.trimEnd();
};

const splitWorkLogUiAutoNote = (value: unknown) => {
  const text = typeof value === "string" ? value : "";
  const leadingPrefix = `${WORK_LOG_UI_AUTO_NOTE_PREFIX}\n`;
  if (text.startsWith(leadingPrefix)) {
    return {
      visibleNote: "",
      autoNoteSuffix: text.trimEnd(),
    };
  }
  const markerIndex = text.indexOf(WORK_LOG_UI_AUTO_NOTE_MARKER);
  if (markerIndex >= 0) {
    return {
      visibleNote: text.slice(0, markerIndex).trimEnd(),
      autoNoteSuffix: text.slice(markerIndex).trimEnd(),
    };
  }
  const prefixIndex = text.indexOf(leadingPrefix);
  if (prefixIndex >= 0) {
    return {
      visibleNote: text.slice(0, prefixIndex).trimEnd(),
      autoNoteSuffix: text.slice(prefixIndex).trimEnd(),
    };
  }
  return {
    visibleNote: text.trimEnd(),
    autoNoteSuffix: "",
  };
};

export const summarizeWorkLogCrossLineAssignmentWarnings = (
  warnings: WorkLogCrossLineAssignmentWarning[]
): WorkLogCrossLineAssignmentWarningSummary | null => {
  const normalizedWarnings = ensureArray(warnings).filter(
    (warning): warning is WorkLogCrossLineAssignmentWarning =>
      Boolean(warning) &&
      toPositiveIntOrNull(warning.assignmentLineId) !== null
  );
  if (normalizedWarnings.length === 0) return null;

  const lineMap = new Map<
    string,
    { lineId: number | null; lineName: string; rowCount: number }
  >();

  normalizedWarnings.forEach((warning) => {
    const lineId = toPositiveIntOrNull(warning.assignmentLineId);
    const lineName = buildLineLabel(lineId, warning.assignmentLineName);
    const key = `${lineId ?? "null"}::${lineName}`;
    const current = lineMap.get(key) || {
      lineId,
      lineName,
      rowCount: 0,
    };
    current.rowCount += 1;
    lineMap.set(key, current);
  });

  return {
    rowCount: normalizedWarnings.length,
    lineCount: lineMap.size,
    lines: Array.from(lineMap.values()).sort((left, right) => {
      if (right.rowCount !== left.rowCount) return right.rowCount - left.rowCount;
      return left.lineName.localeCompare(right.lineName, "ko");
    }),
  };
};

export const buildWorkLogWarningResponse = ({
  crossLineWarnings,
}: {
  crossLineWarnings: WorkLogCrossLineAssignmentWarning[];
}) => {
  const crossLineAssignment = summarizeWorkLogCrossLineAssignmentWarnings(
    crossLineWarnings
  );
  if (!crossLineAssignment) return null;
  return {
    crossLineAssignment,
  };
};

export const buildWorkLogNoteWithCrossLineAssignments = ({
  note,
  workLogLineId,
  workLogLineName,
  warnings,
}: {
  note: unknown;
  workLogLineId?: number | null;
  workLogLineName?: string | null;
  warnings: WorkLogCrossLineAssignmentWarning[];
}) => {
  const baseNote = stripWorkLogCrossLineNote(note);
  const { visibleNote, autoNoteSuffix } = splitWorkLogUiAutoNote(baseNote);
  const normalizedWarnings = ensureArray(warnings).filter(
    (warning): warning is WorkLogCrossLineAssignmentWarning =>
      Boolean(warning) &&
      toPositiveIntOrNull(warning.assignmentLineId) !== null
  );
  if (normalizedWarnings.length === 0) return baseNote || null;

  const groupedWarnings = new Map<
    string,
    WorkLogCrossLineAssignmentWarning & { rowCount: number }
  >();
  normalizedWarnings.forEach((warning) => {
    const key = [
      warning.assignmentLineId ?? "null",
      warning.workerId ?? "null",
      resolveOptionalString(warning.orderNo, ""),
      resolveOptionalString(warning.styleId, ""),
      resolveOptionalString(warning.processCode, ""),
      resolveOptionalString(warning.processName, ""),
    ].join("::");
    const current = groupedWarnings.get(key);
    if (current) {
      current.rowCount += 1;
      return;
    }
    groupedWarnings.set(key, {
      ...warning,
      rowCount: 1,
    });
  });

  const currentLineLabel = buildLineLabel(
    toPositiveIntOrNull(workLogLineId),
    workLogLineName ?? null
  );
  const summaryLines = Array.from(groupedWarnings.values())
    .sort((left, right) => {
      const assignmentLineCompare = buildLineLabel(
        toPositiveIntOrNull(left.assignmentLineId),
        left.assignmentLineName
      ).localeCompare(
        buildLineLabel(
          toPositiveIntOrNull(right.assignmentLineId),
          right.assignmentLineName
        ),
        "ko"
      );
      if (assignmentLineCompare !== 0) return assignmentLineCompare;
      return buildWorkerLabel(left).localeCompare(buildWorkerLabel(right), "ko");
    })
    .map((warning) => {
      const assignmentLineLabel = buildLineLabel(
        toPositiveIntOrNull(warning.assignmentLineId),
        warning.assignmentLineName
      );
      const rowCountText =
        warning.rowCount > 1 ? ` (${warning.rowCount}\uAC74)` : "";
      return `- ${buildWorkerLabel(warning)}: ${assignmentLineLabel} / \uC8FC\uBB38 ${resolveOptionalString(
        warning.orderNo,
        "\uBBF8\uD655\uC778"
      )} / \uC2A4\uD0C0\uC77C ${buildStyleLabel(warning)} / \uACF5\uC815 ${buildProcessLabel(
        warning
      )}${rowCountText}`;
    })
    .join("\n");

  const crossLineNote = [
    `\uD604\uC7AC \uC791\uC5C5\uAE30\uB85D\uC740 ${currentLineLabel} \uAE30\uC900\uC73C\uB85C \uC800\uC7A5\uD588\uC9C0\uB9CC, \uC544\uB798 \uC791\uC5C5\uC740 \uB2E4\uB978 \uB77C\uC778 \uBC30\uC815 \uCE74\uB4DC\uC5D0 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
    summaryLines,
  ]
    .filter(Boolean)
    .join("\n");

  const crossLineSection = visibleNote
    ? `${visibleNote}${WORK_LOG_CROSS_LINE_NOTE_MARKER}${crossLineNote}`
    : `${WORK_LOG_CROSS_LINE_NOTE_PREFIX}\n${crossLineNote}`;
  if (!autoNoteSuffix) return crossLineSection;
  return `${crossLineSection}\n\n${autoNoteSuffix}`;
};
