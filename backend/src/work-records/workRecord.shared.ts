import { resolveOptionalString, toPositiveIntOrNull } from "../utils/common";

export const resolveWorkRecordStyleUid = (record: any) =>
  toPositiveIntOrNull(record?.style?.uid ?? record?.styleUid);

export const resolveWorkRecordStyleId = (record: any) =>
  resolveOptionalString(record?.style?.styleId ?? record?.styleId, null);

export const resolveWorkRecordStyleName = (record: any) =>
  resolveOptionalString(record?.style?.name ?? record?.styleName, null);

export const resolveWorkRecordProcessName = (record: any) =>
  resolveOptionalString(record?.process?.name ?? record?.processName, null);

export const resolveWorkRecordColorName = (record: any) =>
  resolveOptionalString(record?.color?.name ?? record?.colorName, null) ??
  resolveOptionalString(record?.color?.code ?? record?.colorCode, null) ??
  null;

export const WORK_RECORD_WITH_REFS_INCLUDE = {
  orderBy: { id: "asc" as const },
  include: {
    style: {
      select: {
        uid: true,
        styleId: true,
        styleCode: true,
        name: true,
      },
    },
    process: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
    color: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
  },
};
