import { resolveOptionalString, toPositiveIntOrNull } from "../utils/common";

export const resolveWorkRecordStyleRefId = (record: any) =>
  toPositiveIntOrNull(record?.style?.uid ?? record?.styleId ?? record?.styleUid);

export const resolveWorkRecordStyleCode = (record: any) =>
  resolveOptionalString(record?.style?.styleId ?? record?.styleCode ?? null, null);

export const resolveWorkRecordStyleName = (record: any) =>
  resolveOptionalString(record?.style?.name ?? record?.styleName, null);

export const resolveWorkRecordProcessCode = (record: any) =>
  resolveOptionalString(
    record?.styleProcess?.processCode ?? record?.process?.code ?? record?.processCode,
    null
  );

export const resolveWorkRecordProcessName = (record: any) =>
  resolveOptionalString(
    record?.styleProcess?.processName ?? record?.process?.name ?? record?.processName,
    null
  );

export const resolveWorkRecordColorName = (record: any) =>
  resolveOptionalString(record?.assignmentPlan?.colorName ?? record?.colorName, null) ??
  resolveOptionalString(record?.assignmentPlan?.color ?? record?.colorCode, null) ??
  null;

export const WORK_RECORD_WITH_REFS_INCLUDE = {
  orderBy: { id: "asc" as const },
  include: {
    worker: {
      select: {
        id: true,
        name: true,
      },
    },
    style: {
      select: {
        uid: true,
        styleId: true,
        styleCode: true,
        name: true,
      },
    },
    assignmentPlan: {
      select: {
        id: true,
        lineId: true,
        workOrderId: true,
        orderNo: true,
        customer: true,
        label: true,
        colorId: true,
        colorName: true,
        color: true,
      },
    },
    process: {
      select: {
        id: true,
        code: true,
        name: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
      },
    },
    styleProcess: {
      select: {
        id: true,
        processCode: true,
        processName: true,
      },
    },
  },
};
