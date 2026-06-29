import { prisma } from "../db";
import { createHttpError, getErrorCode, getErrorMessage } from "../utils/http";
import {
  ensureArray,
  resolveOptionalString,
  toPositiveIntOrNull,
} from "../utils/common";

const quantitySettlementSnapshotModel = (prisma as any).quantitySettlementSnapshot;

const ORDER_ITEM_WITH_COLOR_INCLUDE = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    style: {
      select: {
        uid: true,
        styleId: true,
        styleCode: true,
        name: true,
      },
    },
    color: {
      select: {
        id: true,
        code: true,
        name: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
      },
    },
  },
};

const getOrderAccessWhere = (orgId: number) => [{ orgId }, { buyerOrgId: orgId }, { sellerOrgId: orgId }];

const assertMonth = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw createHttpError(400, "month is required (format: YYYY-MM)");
  }
};

const resolveQuantitySettlementStorageErrorMessage = (error: unknown) => {
  const rawMessage = getErrorMessage(error, String(error || ""));
  if (/QuantitySettlementSnapshot/i.test(rawMessage)) {
    return "quantity settlement storage is not ready on server. Apply the backend database update first";
  }
  return "quantity settlement storage is not ready on server. Apply the backend database update first";
};

const isQuantitySettlementStorageMissing = (error: unknown) =>
  getErrorCode(error) === "P2021" &&
  /QuantitySettlementSnapshot/i.test(getErrorMessage(error, ""));

const loadQuantitySettlementSnapshotSafe = async (orgId: number, month: string) => {
  if (!quantitySettlementSnapshotModel) {
    return {
      storageReady: false,
      storageMessage:
        "quantity settlement storage is not ready on server. Apply the backend database update first",
      snapshot: null,
    };
  }

  try {
    const snapshot = await quantitySettlementSnapshotModel.findUnique({
      where: { orgId_month: { orgId, month } },
    });
    return {
      storageReady: true,
      storageMessage: "",
      snapshot,
    };
  } catch (error) {
    if (isQuantitySettlementStorageMissing(error)) {
      return {
        storageReady: false,
        storageMessage: resolveQuantitySettlementStorageErrorMessage(error),
        snapshot: null,
      };
    }
    throw error;
  }
};

const toNonNegativeIntOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
};

const toNonNegativeInt = (value: unknown, fallback = 0): number => {
  const parsed = toNonNegativeIntOrNull(value);
  return parsed ?? fallback;
};

const normalizeGenderKey = (value: unknown) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "M" || normalized === "W" || normalized === "U") return normalized;
  return "";
};

const resolveColorName = (item: any) =>
  resolveOptionalString(
    item?.color?.nameKo ??
      item?.color?.nameEn ??
      item?.color?.nameVi ??
      item?.color?.name ??
      item?.colorName ??
      null,
    ""
  ) || "";

const resolveStyleUid = (item: any) =>
  toPositiveIntOrNull(item?.style?.uid ?? item?.styleId ?? item?.styleUid);
const resolveStyleId = (item: any) =>
  resolveOptionalString(
    item?.style?.styleId ??
      item?.styleCode ??
      (toPositiveIntOrNull(item?.styleId) === null ? item?.styleId : null) ??
      null,
    ""
  ) || "";
const resolveStyleCode = (item: any) =>
  resolveOptionalString(item?.style?.styleCode ?? item?.styleCode ?? null, "") || "";
const resolveStyleName = (item: any) =>
  resolveOptionalString(item?.style?.name ?? item?.styleName ?? null, "") || "";
const resolveColorId = (item: any) =>
  toPositiveIntOrNull(item?.assignmentPlan?.colorId ?? item?.color?.id ?? item?.colorId);
const resolveColorCode = (item: any) =>
  resolveOptionalString(
    item?.assignmentPlan?.color ??
      item?.color?.code ??
      item?.colorCode ??
      null,
    ""
  ) || "";

const buildGroupedOrderItemKey = (item: any) =>
  [
    resolveStyleUid(item) ?? "",
    resolveStyleId(item),
    resolveColorId(item) ?? "",
    resolveColorCode(item),
  ].join("::");

const buildAggregateColorKey = (value: {
  styleUid?: unknown;
  styleId?: unknown;
  colorId?: unknown;
  colorCode?: unknown;
}) =>
  [
    toPositiveIntOrNull(value.styleUid) ?? "",
    resolveOptionalString(value.styleId, "") || "",
    toPositiveIntOrNull(value.colorId) ?? "",
    resolveOptionalString(value.colorCode, "") || "",
  ].join("::");

const buildAggregateStyleKey = (value: { styleUid?: unknown; styleId?: unknown }) =>
  [
    toPositiveIntOrNull(value.styleUid) ?? "",
    resolveOptionalString(value.styleId, "") || "",
  ].join("::");

const buildRowId = (value: {
  orderId?: unknown;
  styleUid?: unknown;
  styleId?: unknown;
  colorId?: unknown;
  colorCode?: unknown;
}) =>
  [
    resolveOptionalString(value.orderId, "") || "",
    toPositiveIntOrNull(value.styleUid) ?? "",
    resolveOptionalString(value.styleId, "") || "",
    toPositiveIntOrNull(value.colorId) ?? "",
    resolveOptionalString(value.colorCode, "") || "",
  ].join("::");

const normalizeProcessQuantityEntry = (entry: any) => ({
  processCode: resolveOptionalString(entry?.processCode, "") || "",
  quantity: toNonNegativeInt(entry?.quantity, 0),
});

const buildNormalizedSnapshotRow = (row: any) => {
  const processQuantities = ensureArray(row?.processQuantities)
    .map(normalizeProcessQuantityEntry)
    .filter((entry) => entry.quantity > 0);

  return {
    rowId: resolveOptionalString(row?.rowId, "") || "",
    orderId: resolveOptionalString(row?.orderId, "") || "",
    orderNumber: resolveOptionalString(row?.orderNumber, "") || "",
    customerName: resolveOptionalString(row?.customerName, "") || "",
    dueDate: resolveOptionalString(row?.dueDate, "") || "",
    styleUid: toPositiveIntOrNull(row?.styleUid),
    styleId: resolveOptionalString(row?.styleId, "") || "",
    styleCode: resolveOptionalString(row?.styleCode, "") || "",
    styleName: resolveOptionalString(row?.styleName, "") || "",
    colorId: toPositiveIntOrNull(row?.colorId),
    colorCode: resolveOptionalString(row?.colorCode, "") || "",
    colorName: resolveOptionalString(row?.colorName, "") || "",
    genderLabels: ensureArray(row?.genderLabels)
      .map((value) => normalizeGenderKey(value))
      .filter(Boolean),
    orderQuantity: toNonNegativeInt(row?.orderQuantity, 0),
    targetQuantity: toNonNegativeIntOrNull(row?.targetQuantity),
    confirmedQuantity: toNonNegativeIntOrNull(row?.confirmedQuantity),
    billableQuantity: toNonNegativeIntOrNull(row?.billableQuantity),
    payrollEligibleQuantity: toNonNegativeIntOrNull(row?.payrollEligibleQuantity),
    estimatedQuantity: toNonNegativeInt(row?.estimatedQuantity, 0),
    processMinQuantity: toNonNegativeIntOrNull(row?.processMinQuantity),
    processMaxQuantity: toNonNegativeIntOrNull(row?.processMaxQuantity),
    processSpread: toNonNegativeInt(row?.processSpread, 0),
    processCount: toNonNegativeInt(row?.processCount, 0),
    processQuantities,
    reasonCode: resolveOptionalString(row?.reasonCode, "") || "",
    memo: resolveOptionalString(row?.memo, "") || "",
  };
};

const buildStatusForRow = (row: any) => {
  const targetQuantity = toNonNegativeIntOrNull(row?.targetQuantity);
  const confirmedQuantity = toNonNegativeIntOrNull(row?.confirmedQuantity);
  const billableQuantity = toNonNegativeIntOrNull(row?.billableQuantity);
  const payrollEligibleQuantity = toNonNegativeIntOrNull(row?.payrollEligibleQuantity);
  const estimatedQuantity = toNonNegativeInt(row?.estimatedQuantity, 0);
  const processSpread = toNonNegativeInt(row?.processSpread, 0);
  const hasPersistedValues =
    targetQuantity !== null ||
    confirmedQuantity !== null ||
    billableQuantity !== null ||
    payrollEligibleQuantity !== null;
  const isActive =
    estimatedQuantity > 0 ||
    (targetQuantity ?? 0) > 0 ||
    (confirmedQuantity ?? 0) > 0 ||
    (billableQuantity ?? 0) > 0 ||
    (payrollEligibleQuantity ?? 0) > 0;

  if (!isActive && !hasPersistedValues) {
    return {
      code: "IDLE",
      isActive: false,
    };
  }

  if (
    confirmedQuantity === null ||
    billableQuantity === null ||
    payrollEligibleQuantity === null
  ) {
    return {
      code: "REVIEW",
      isActive: true,
    };
  }

  if (
    confirmedQuantity < billableQuantity ||
    confirmedQuantity < payrollEligibleQuantity ||
    (targetQuantity !== null && targetQuantity > 0 && billableQuantity > targetQuantity)
  ) {
    return {
      code: "BLOCKED",
      isActive: true,
    };
  }

  if (processSpread > 0) {
    return {
      code: "REVIEW",
      isActive: true,
    };
  }

  return {
    code: "CONFIRMED",
    isActive: true,
  };
};

const buildSummary = (rows: any[]) => {
  const summary = {
    totalRows: rows.length,
    activeRows: 0,
    idleRows: 0,
    confirmedRows: 0,
    reviewRows: 0,
    blockedRows: 0,
    unresolvedRows: 0,
    readyForPayroll: true,
  };

  rows.forEach((row) => {
    const status = row?.status?.code;
    if (status === "IDLE") {
      summary.idleRows += 1;
      return;
    }
    summary.activeRows += 1;
    if (status === "CONFIRMED") {
      summary.confirmedRows += 1;
      return;
    }
    if (status === "BLOCKED") {
      summary.blockedRows += 1;
      summary.unresolvedRows += 1;
      summary.readyForPayroll = false;
      return;
    }
    summary.reviewRows += 1;
    summary.unresolvedRows += 1;
    summary.readyForPayroll = false;
  });

  return summary;
};

const buildWorkRecordAggregates = (workLogs: any[]) => {
  const styleOnlyMap = new Map<string, Map<string, number>>();
  const colorMap = new Map<string, Map<string, number>>();

  const appendQuantity = (target: Map<string, Map<string, number>>, key: string, processKey: string, quantity: number) => {
    if (!key || quantity <= 0) return;
    let processMap = target.get(key);
    if (!processMap) {
      processMap = new Map<string, number>();
      target.set(key, processMap);
    }
    processMap.set(processKey, (processMap.get(processKey) || 0) + quantity);
  };

  workLogs.forEach((workLog) => {
    ensureArray(workLog?.workRecords).forEach((record) => {
      const quantity = toNonNegativeInt(record?.quantity, 0);
      if (quantity <= 0) return;
      const styleKey = buildAggregateStyleKey({
        styleUid: resolveStyleUid(record),
        styleId: resolveStyleId(record),
      });
      const colorKey = buildAggregateColorKey({
        styleUid: resolveStyleUid(record),
        styleId: resolveStyleId(record),
        colorId: resolveColorId(record),
        colorCode: resolveColorCode(record),
      });
      const processKey =
        resolveOptionalString(
          record?.styleProcess?.processCode ??
            record?.process?.code ??
            record?.processCode,
          ""
        ) ||
        String(toPositiveIntOrNull(record?.processId) ?? "unknown");
      appendQuantity(styleOnlyMap, styleKey, processKey, quantity);
      appendQuantity(colorMap, colorKey, processKey, quantity);
    });
  });

  const mapToSummary = (map: Map<string, Map<string, number>>) => {
    const summaryMap = new Map<string, any>();
    map.forEach((processMap, key) => {
      const entries = Array.from(processMap.entries())
        .map(([processCode, quantity]) => ({ processCode, quantity: toNonNegativeInt(quantity, 0) }))
        .filter((entry) => entry.quantity > 0)
        .sort((a, b) => a.processCode.localeCompare(b.processCode));
      if (entries.length === 0) return;
      const quantities = entries.map((entry) => entry.quantity);
      const processMinQuantity = Math.min(...quantities);
      const processMaxQuantity = Math.max(...quantities);
      summaryMap.set(key, {
        // 완제품 수량은 공정별 누적의 최소값으로 본다.
        estimatedQuantity: processMinQuantity,
        processMinQuantity,
        processMaxQuantity,
        processSpread: Math.max(0, processMaxQuantity - processMinQuantity),
        processCount: entries.length,
        processQuantities: entries,
      });
    });
    return summaryMap;
  };

  return {
    styleOnlyMap: mapToSummary(styleOnlyMap),
    colorMap: mapToSummary(colorMap),
  };
};

const buildBaseRows = (orders: any[], aggregates: { styleOnlyMap: Map<string, any>; colorMap: Map<string, any> }) => {
  const rows: any[] = [];

  orders.forEach((order) => {
    const groupedItems = new Map<string, any>();
    ensureArray(order?.workOrderItems).forEach((item) => {
      const quantity = toNonNegativeInt(item?.totalQuantity, 0);
      if (quantity <= 0) return;
      const groupKey = buildGroupedOrderItemKey(item);
      const existing = groupedItems.get(groupKey);
      const genderKey = normalizeGenderKey(item?.gender);
      if (!existing) {
        groupedItems.set(groupKey, {
          orderId: resolveOptionalString(order?.orderId, "") || "",
          orderNumber: resolveOptionalString(order?.orderNumber, "") || "",
          customerName: resolveOptionalString(order?.customerName ?? order?.buyerOrgName, "") || "",
          dueDate: resolveOptionalString(order?.dueDate, "") || "",
          styleUid: resolveStyleUid(item),
          styleId: resolveStyleId(item),
          styleCode: resolveStyleCode(item),
          styleName: resolveStyleName(item),
          colorId: resolveColorId(item),
          colorCode: resolveColorCode(item),
          colorName: resolveColorName(item),
          orderQuantity: quantity,
          genderLabelSet: new Set<string>(genderKey ? [genderKey] : []),
        });
        return;
      }
      existing.orderQuantity += quantity;
      if (genderKey) {
        existing.genderLabelSet.add(genderKey);
      }
    });

    groupedItems.forEach((group) => {
      const colorKey = buildAggregateColorKey(group);
      const styleKey = buildAggregateStyleKey(group);
      const aggregate =
        (group.colorId || group.colorCode
          ? aggregates.colorMap.get(colorKey)
          : aggregates.styleOnlyMap.get(styleKey)) ?? null;
      rows.push({
        rowId: buildRowId(group),
        orderId: group.orderId,
        orderNumber: group.orderNumber,
        customerName: group.customerName,
        dueDate: group.dueDate,
        styleUid: group.styleUid,
        styleId: group.styleId,
        styleCode: group.styleCode,
        styleName: group.styleName,
        colorId: group.colorId,
        colorCode: group.colorCode,
        colorName: group.colorName,
        genderLabels: Array.from(group.genderLabelSet.values()).sort(),
        orderQuantity: group.orderQuantity,
        targetQuantity: null,
        confirmedQuantity: null,
        billableQuantity: null,
        payrollEligibleQuantity: null,
        estimatedQuantity: aggregate?.estimatedQuantity ?? 0,
        processMinQuantity: aggregate?.processMinQuantity ?? null,
        processMaxQuantity: aggregate?.processMaxQuantity ?? null,
        processSpread: aggregate?.processSpread ?? 0,
        processCount: aggregate?.processCount ?? 0,
        processQuantities: aggregate?.processQuantities ?? [],
        reasonCode: "",
        memo: "",
      });
    });
  });

  return rows.sort((a, b) => {
    const orderCompare = String(a.orderNumber || "").localeCompare(String(b.orderNumber || ""));
    if (orderCompare !== 0) return orderCompare;
    const styleCompare = String(a.styleCode || a.styleId || "").localeCompare(
      String(b.styleCode || b.styleId || "")
    );
    if (styleCompare !== 0) return styleCompare;
    return String(a.colorCode || a.colorName || "").localeCompare(
      String(b.colorCode || b.colorName || "")
    );
  });
};

const mergeSavedRows = (baseRows: any[], savedRows: any[]) => {
  const rowMap = new Map(baseRows.map((row) => [row.rowId, { ...row }]));

  savedRows.forEach((savedRow) => {
    const normalized = buildNormalizedSnapshotRow(savedRow);
    if (!normalized.rowId) return;
    const existing = rowMap.get(normalized.rowId);
    if (!existing) {
      rowMap.set(normalized.rowId, normalized);
      return;
    }
    rowMap.set(normalized.rowId, {
      ...existing,
      targetQuantity: normalized.targetQuantity,
      confirmedQuantity: normalized.confirmedQuantity,
      billableQuantity: normalized.billableQuantity,
      payrollEligibleQuantity: normalized.payrollEligibleQuantity,
      reasonCode: normalized.reasonCode,
      memo: normalized.memo,
    });
  });

  return Array.from(rowMap.values()).map((row) => {
    const status = buildStatusForRow(row);
    return {
      ...row,
      status,
      suggestedTargetQuantity:
        row.targetQuantity !== null ? row.targetQuantity : row.orderQuantity,
      suggestedConfirmedQuantity:
        row.confirmedQuantity !== null ? row.confirmedQuantity : row.estimatedQuantity,
      suggestedBillableQuantity:
        row.billableQuantity !== null
          ? row.billableQuantity
          : row.confirmedQuantity !== null
            ? row.confirmedQuantity
            : row.estimatedQuantity,
      suggestedPayrollEligibleQuantity:
        row.payrollEligibleQuantity !== null
          ? row.payrollEligibleQuantity
          : row.confirmedQuantity !== null
            ? row.confirmedQuantity
            : row.estimatedQuantity,
    };
  });
};

export const getQuantitySettlementByMonth = async (orgId: number, monthInput: string) => {
  const month = String(monthInput || "");
  assertMonth(month);

  const [snapshotState, payrollSnapshot, orders, workLogs] = await Promise.all([
    loadQuantitySettlementSnapshotSafe(orgId, month),
    prisma.payrollSnapshot.findUnique({
      where: { orgId_month: { orgId, month } },
      select: { id: true, lockedAt: true, lockedBy: true },
    }),
    prisma.workOrder.findMany({
      where: {
        OR: getOrderAccessWhere(orgId),
        status: { not: "SETTLED" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { workOrderItems: ORDER_ITEM_WITH_COLOR_INCLUDE },
    }),
    prisma.workLog.findMany({
      where: {
        orgId,
        displayDate: { startsWith: month },
      },
      select: {
        id: true,
        workRecords: {
          select: {
            styleId: true,
            processId: true,
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
                colorId: true,
                color: true,
                colorName: true,
              },
            },
            styleProcess: {
              select: {
                processCode: true,
              },
            },
            process: {
              select: {
                code: true,
              },
            },
            quantity: true,
          },
        },
      },
    }),
  ]);

  const aggregates = buildWorkRecordAggregates(workLogs);
  const baseRows = buildBaseRows(orders, aggregates);
  const savedRows = ensureArray(snapshotState.snapshot?.data).map(buildNormalizedSnapshotRow);
  const rows = mergeSavedRows(baseRows, savedRows);
  const summary = buildSummary(rows);
  const workRecordCount = workLogs.reduce(
    (sum, workLog) => sum + ensureArray(workLog?.workRecords).length,
    0
  );

  return {
    month,
    locked: Boolean(payrollSnapshot),
    lockedAt: payrollSnapshot?.lockedAt ?? null,
    lockedBy: payrollSnapshot?.lockedBy ?? null,
    snapshotExists: Boolean(snapshotState.snapshot),
    storageReady: snapshotState.storageReady,
    storageMessage: snapshotState.storageMessage,
    updatedAt: snapshotState.snapshot?.updatedAt ?? null,
    updatedBy: snapshotState.snapshot?.updatedBy ?? snapshotState.snapshot?.createdBy ?? null,
    sourceSummary: {
      orderCount: orders.length,
      workLogCount: workLogs.length,
      workRecordCount,
      baseRowCount: baseRows.length,
    },
    rows,
    summary,
  };
};

export const saveQuantitySettlementByMonth = async ({
  orgId,
  month: monthInput,
  savedBy,
  rows,
}: {
  orgId: number;
  month: string;
  savedBy: string;
  rows?: any[];
}) => {
  const month = String(monthInput || "");
  assertMonth(month);

  if (!quantitySettlementSnapshotModel) {
    throw createHttpError(
      503,
      "quantity settlement storage is not ready on server. Apply the backend database update first"
    );
  }

  const payrollSnapshot = await prisma.payrollSnapshot.findUnique({
    where: { orgId_month: { orgId, month } },
    select: { id: true },
  });
  if (payrollSnapshot) {
    throw createHttpError(409, "quantity settlement locked by payroll");
  }

  const payloadRows = ensureArray(rows)
    .map(buildNormalizedSnapshotRow)
    .filter((row) => row.rowId);

  try {
    await quantitySettlementSnapshotModel.upsert({
      where: { orgId_month: { orgId, month } },
      create: {
        orgId,
        month,
        data: payloadRows,
        createdBy: resolveOptionalString(savedBy, "unknown") || "unknown",
        updatedBy: resolveOptionalString(savedBy, "unknown") || "unknown",
      },
      update: {
        data: payloadRows,
        updatedBy: resolveOptionalString(savedBy, "unknown") || "unknown",
      },
    });
  } catch (error) {
    if (isQuantitySettlementStorageMissing(error)) {
      throw createHttpError(503, resolveQuantitySettlementStorageErrorMessage(error));
    }
    throw error;
  }

  return getQuantitySettlementByMonth(orgId, month);
};

export const assertQuantitySettlementReadyForPayroll = async (
  orgId: number,
  monthInput: string
) => {
  const settlement = await getQuantitySettlementByMonth(orgId, monthInput);
  if (!settlement.summary.readyForPayroll) {
    throw createHttpError(409, "quantity settlement incomplete");
  }
  return settlement.summary;
};
