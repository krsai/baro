import { resolveOptionalString, toPositiveIntOrNull } from "../utils/common";

export const resolveWorkRecordStyleRefId = (record: any) =>
  toPositiveIntOrNull(record?.style?.id ?? record?.styleId);

export const resolveWorkRecordStyleCode = (record: any) =>
  resolveOptionalString(record?.style?.code ?? record?.styleCode ?? null, null);

export const resolveWorkRecordStyleName = (record: any) =>
  resolveOptionalString(record?.style?.name, null);

export const resolveWorkRecordProcessCode = (record: any) =>
  resolveOptionalString(
    record?.styleProcess?.processCode,
    null
  );

export const resolveWorkRecordProcessName = (record: any) =>
  resolveOptionalString(
    record?.styleProcess?.processName,
    null
  );

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
        id: true,
        code: true,
        name: true,
      },
    },
    assignmentPlan: {
      select: {
        id: true,
        lineId: true,
        workOrderId: true,
        // orderNo/customer/label were dropped from AssignmentPlan (FK+join
        // redesign Phase E) - workOrder.orderNumber/buyerOrg.name/style.name
        // are the only source now.
        workOrder: { select: { orderNumber: true } },
        buyerOrg: { select: { name: true } },
        style: { select: { name: true } },
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
