import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { spawnSync } from "node:child_process";
import "./config/env";
import { Prisma, type OrgUserRole } from "@prisma/client";
import {
  populateVerifiedRequestAuth,
  resolveRequestAuthErrorMessage,
} from "./auth/requestAuth";
import { prisma } from "./db";
import {
  normalizePayType,
  resolveEmployeeEffectivePayType,
  resolveOrgRoleLabel,
  resolveRoleDefaultPayType,
} from "./employees/employeeCompensation";
import { normalizeEmployeeNo } from "./employees/employeeNumber";
import { createEmployeeRouter } from "./employees/employee.routes";
import { createFactoryRouter } from "./factories/factory.routes";
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  normalizeFactoryManagementStartDateKey,
  resolveFactoryManagementStartDateKey,
} from "./factories/factoryManagementStart";
import { createLineRouter } from "./lines/line.routes";
import { createOrgMembershipRouter } from "./org-memberships/orgMembership.routes";
import { createOrganizationRouter } from "./organizations/organization.routes";
import {
  attachOrganizationSubscription,
  ensureOrganizationSubscription,
  getHardCodedSystemAdminEmail,
  getSystemAdminContactEmail,
  getOrganizationByQuery,
  getRequestedOrgIdText,
  getRequesterEmail,
  requireOrgRole,
  requireSystemAdmin,
} from "./middleware/access";
import { payrollRouter } from "./payroll/payroll.routes";
import { quantitySettlementRouter } from "./quantity-settlement/quantitySettlement.routes";
import {
  getCurrentRequestActor,
  runWithRequestActor,
} from "./requestActor";
import {
  parseDateKeyParts,
  resolveAtTrainingMonthKey,
  shiftMonthKey,
} from "./utils/atTrainingMonthKey";
import {
  createAtTrainingOverlapState,
  parseAtTrainingWorkerDateKey,
  registerAtTrainingWorkerDayClaim,
  toAtTrainingWorkerDateKey,
} from "./services/atTrainingOverlap";
import {
  ensureArray,
  isNumericId,
  isValidOrgCode,
  normalizeComparableText,
  normalizeEmail,
  normalizeOrgCode,
  resolveOptionalString,
  toId,
  toNumberOrNull,
  toPositiveInt,
  toPositiveIntOrNull,
  wait,
} from "./utils/common";
import {
  createHttpError,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
  toErrorRecord,
} from "./utils/http";
import {
  resolveWorkRecordProcessCode,
  resolveWorkRecordProcessName,
  resolveWorkRecordStyleCode,
  resolveWorkRecordStyleName,
  resolveWorkRecordStyleRefId,
  WORK_RECORD_WITH_REFS_INCLUDE,
} from "./work-records/workRecord.shared";
import {
  buildWorkLogNoteWithEmploymentAdjustments,
  resolveWorkRecordEmploymentCoverage,
  type WorkRecordEmploymentAdjustment,
} from "./work-records/workRecordEmployment";
import {
  buildWorkLogNoteWithCrossLineAssignments,
  buildWorkLogWarningResponse,
  type WorkLogCrossLineAssignmentWarning,
} from "./work-records/workRecordCrossLine";
import {
  AT_MONTHLY_A_CLAMP_RATIO,
  fitAtParamsWithProportionalAllocation,
  type AtFittedParams,
  type AtTrainingDayBucket,
  type AtTrainingDayProcessRow,
} from "./services/atTraining";
import {
  resolveAtAttendanceDay,
  resolveAtAttendanceQueryDateRange,
} from "./services/attendanceFallback";

const app = express();
app.use(cors());
const JSON_BODY_LIMIT =
  String(process.env.JSON_BODY_LIMIT || "10mb").trim() || "10mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(async (req, res, next) => {
  try {
    const auth = await populateVerifiedRequestAuth(req);
    return runWithRequestActor(auth?.email, () => next());
  } catch (error) {
    const status = getErrorStatus(error) ?? 401;
    return res.status(status).json({
      ok: false,
      error: resolveRequestAuthErrorMessage(error),
    });
  }
});

const WORK_LOG_RECORD_INCLUDE = WORK_RECORD_WITH_REFS_INCLUDE;
const WORK_LOG_DETAIL_RECORD_SELECT = WORK_RECORD_WITH_REFS_INCLUDE;

function assertGeneratedPrismaClientShape() {
  const modelByName = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [model.name, model])
  );
  const hasField = (modelName: string, fieldName: string) =>
    Boolean(
      modelByName
        .get(modelName)
        ?.fields.some((field) => field.name === fieldName)
    );

  const staleSignals: string[] = [];
  if (!hasField("WorkOrder", "workOrderItems")) {
    staleSignals.push("WorkOrder.workOrderItems missing");
  }
  if (!hasField("WorkOrderItem", "style")) {
    staleSignals.push("WorkOrderItem.style missing");
  }
  if (hasField("WorkOrderItem", "colorName")) {
    staleSignals.push("WorkOrderItem.colorName still present");
  }
  if (!hasField("WorkRecord", "styleId")) {
    staleSignals.push("WorkRecord.styleId missing");
  }
  if (!hasField("WorkRecord", "styleProcessId")) {
    staleSignals.push("WorkRecord.styleProcessId missing");
  }
  if (!hasField("Style", "id")) {
    staleSignals.push("Style.id missing");
  }
  if (!hasField("Style", "code")) {
    staleSignals.push("Style.code missing");
  }
  if (hasField("Style", "uid")) {
    staleSignals.push("Style.uid still present");
  }
  if (hasField("Style", "styleId")) {
    staleSignals.push("Style.styleId still present");
  }
  if (hasField("Style", "styleCode")) {
    staleSignals.push("Style.styleCode still present");
  }
  if (hasField("Style", "customer")) {
    staleSignals.push("Style.customer still present");
  }
  if (hasField("Style", "customerNameKo")) {
    staleSignals.push("Style.customerNameKo still present");
  }
  if (hasField("Style", "customerNameVi")) {
    staleSignals.push("Style.customerNameVi still present");
  }
  if (hasField("Employee", "lineName")) {
    staleSignals.push("Employee.lineName still present");
  }
  if (!hasField("Employee", "lineId")) {
    staleSignals.push("Employee.lineId missing");
  }
  if (hasField("Employee", "orgMembershipId")) {
    staleSignals.push("Employee.orgMembershipId still present");
  }
  if (!hasField("Employee", "email")) {
    staleSignals.push("Employee.email missing");
  }
  if (!hasField("Employee", "orgRole")) {
    staleSignals.push("Employee.orgRole missing");
  }
  if (!hasField("Employee", "status")) {
    staleSignals.push("Employee.status missing");
  }
  if (!hasField("Employee", "createdByEmployeeId")) {
    staleSignals.push("Employee.createdByEmployeeId missing");
  }
  if (hasField("WorkOrder", "buyerOrgName")) {
    staleSignals.push("WorkOrder.buyerOrgName still present");
  }
  if (hasField("WorkOrder", "buyerOrgNameKo")) {
    staleSignals.push("WorkOrder.buyerOrgNameKo still present");
  }
  if (hasField("WorkOrder", "buyerOrgNameVi")) {
    staleSignals.push("WorkOrder.buyerOrgNameVi still present");
  }
  if (hasField("WorkOrder", "sellerOrgName")) {
    staleSignals.push("WorkOrder.sellerOrgName still present");
  }
  if (hasField("WorkOrder", "customerName")) {
    staleSignals.push("WorkOrder.customerName still present");
  }
  if (hasField("WorkOrderItem", "colorCode")) {
    staleSignals.push("WorkOrderItem.colorCode still present");
  }
  if (hasField("WorkLog", "factoryName")) {
    staleSignals.push("WorkLog.factoryName still present");
  }
  if (!hasField("WorkRecord", "lineId")) {
    staleSignals.push("WorkRecord.lineId missing");
  }
  if (!hasField("WorkRecord", "effectiveCoverageStartDate")) {
    staleSignals.push("WorkRecord.effectiveCoverageStartDate missing");
  }
  if (!hasField("WorkRecord", "effectiveCoverageEndDate")) {
    staleSignals.push("WorkRecord.effectiveCoverageEndDate missing");
  }
  if (!hasField("Organization", "assignmentCards")) {
    staleSignals.push("Organization.assignmentCards missing");
  }
  if (!hasField("Organization", "representativeEmployeeId")) {
    staleSignals.push("Organization.representativeEmployeeId missing");
  }
  if (!hasField("Organization", "defaultSizeSetCode")) {
    staleSignals.push("Organization.defaultSizeSetCode missing");
  }
  if (!hasField("OrgRelationship", "defaultSizeSetCode")) {
    staleSignals.push("OrgRelationship.defaultSizeSetCode missing");
  }
  if (!hasField("AssignmentCard", "payload")) {
    staleSignals.push("AssignmentCard.payload missing");
  }
  if (!hasField("AssignmentCard", "cardId")) {
    staleSignals.push("AssignmentCard.cardId missing");
  }
  if (!hasField("AssignmentCard", "styleId")) {
    staleSignals.push("AssignmentCard.styleId missing");
  }
  if (!hasField("AssignmentCard", "workOrderId")) {
    staleSignals.push("AssignmentCard.workOrderId missing");
  }
  if (!hasField("AssignmentCard", "buyerOrgId")) {
    staleSignals.push("AssignmentCard.buyerOrgId missing");
  }
  if (!hasField("AssignmentPlan", "externalId")) {
    staleSignals.push("AssignmentPlan.externalId missing");
  }
  if (!hasField("AssignmentPlan", "startIndex")) {
    staleSignals.push("AssignmentPlan.startIndex missing");
  }
  if (!hasField("AssignmentPlan", "endIndex")) {
    staleSignals.push("AssignmentPlan.endIndex missing");
  }
  if (!hasField("AssignmentPlan", "assignmentCardId")) {
    staleSignals.push("AssignmentPlan.assignmentCardId missing");
  }
  if (!hasField("AssignmentPlan", "buyerOrgId")) {
    staleSignals.push("AssignmentPlan.buyerOrgId missing");
  }
  if (hasField("AssignmentPlan", "colorId")) {
    staleSignals.push("AssignmentPlan.colorId still present");
  }
  if (hasField("AssignmentPlan", "colorName")) {
    staleSignals.push("AssignmentPlan.colorName still present");
  }
  if (hasField("AssignmentPlan", "color")) {
    staleSignals.push("AssignmentPlan.color still present");
  }
  if (hasField("AssignmentPlan", "stripeColor")) {
    staleSignals.push("AssignmentPlan.stripeColor still present");
  }
  if (hasField("AssignmentPlan", "imageUrl")) {
    staleSignals.push("AssignmentPlan.imageUrl still present");
  }
  if (hasField("AssignmentPlan", "thumbnailUrl")) {
    staleSignals.push("AssignmentPlan.thumbnailUrl still present");
  }
  if (hasField("AssignmentPlan", "orderNo")) {
    staleSignals.push("AssignmentPlan.orderNo still present");
  }
  if (hasField("AssignmentPlan", "customer")) {
    staleSignals.push("AssignmentPlan.customer still present");
  }
  if (hasField("AssignmentPlan", "label")) {
    staleSignals.push("AssignmentPlan.label still present");
  }
  if (hasField("AssignmentPlan", "previewUrl")) {
    staleSignals.push("AssignmentPlan.previewUrl still present");
  }
  if (!modelByName.has("OrganizationHoliday")) {
    staleSignals.push("OrganizationHoliday model missing");
  }
  if (!modelByName.has("SystemSetting")) {
    staleSignals.push("SystemSetting model missing");
  }
  if (!hasField("AtTrainingBucketProcess", "eventCount")) {
    staleSignals.push("AtTrainingBucketProcess.eventCount missing");
  }
  if (!hasField("AtTrainingBucketProcess", "assignmentPlanId")) {
    staleSignals.push("AtTrainingBucketProcess.assignmentPlanId missing");
  }
  if (!hasField("AtTrainingBucketProcess", "sourceGroupKey")) {
    staleSignals.push("AtTrainingBucketProcess.sourceGroupKey missing");
  }
  if (!hasField("AtTrainingBucket", "workerId")) {
    staleSignals.push("AtTrainingBucket.workerId missing");
  }
  if (modelByName.has("OrgMembership")) {
    staleSignals.push("OrgMembership model still present");
  }
  if (hasField("WorkRecord", "processName")) {
    staleSignals.push("WorkRecord.processName still present");
  }
  if (hasField("WorkRecord", "colorName")) {
    staleSignals.push("WorkRecord.colorName still present");
  }
  if (hasField("WorkRecord", "workerName")) {
    staleSignals.push("WorkRecord.workerName still present");
  }
  if (hasField("WorkRecord", "customerName")) {
    staleSignals.push("WorkRecord.customerName still present");
  }
  if (hasField("WorkRecord", "orderNo")) {
    staleSignals.push("WorkRecord.orderNo still present");
  }
  if (hasField("WorkRecord", "styleName")) {
    staleSignals.push("WorkRecord.styleName still present");
  }
  if (hasField("WorkRecord", "processCode")) {
    staleSignals.push("WorkRecord.processCode still present");
  }
  if (hasField("WorkRecord", "colorId")) {
    staleSignals.push("WorkRecord.colorId still present");
  }
  if (hasField("WorkRecord", "colorCode")) {
    staleSignals.push("WorkRecord.colorCode still present");
  }

  if (staleSignals.length > 0) {
    throw new Error(
      `Stale Prisma client detected (${staleSignals.join(
        "; "
      )}). Run "npm run prisma:prepare-client" in backend and restart the server.`
    );
  }
}

assertGeneratedPrismaClientShape();

const WORK_ORDER_ITEM_GENDER_CODES = new Set(["M", "W", "U"]);
const WORK_ORDER_STATUS_CODES = new Set([
  "EDITING",
  "ORDER_RECEIVED",
  "IN_PROGRESS",
  "PRODUCTION_DONE",
  "SHIPPED",
  "SETTLED",
]);
const WORK_ORDER_CONFIRMATION_STATUS_CODES = new Set([
  "PLANNED",
  "CONFIRMED",
]);
const AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES = new Set([
  "EDITING",
  "ORDER_RECEIVED",
  "IN_PROGRESS",
]);
let supportsWorkOrderEditingStatus = false;
const resolveUnlockedWorkOrderStatus = (): "EDITING" | "ORDER_RECEIVED" =>
  supportsWorkOrderEditingStatus ? "EDITING" : "ORDER_RECEIVED";
const ORDER_MODIFICATION_LOCK_ERROR =
  "order modification is locked";
const WORK_ORDER_STATUS_LEGACY_CODE_MAP = new Map<string, string>([
  ["수정", "EDITING"],
  ["주문접수", "ORDER_RECEIVED"],
  ["접수", "ORDER_RECEIVED"],
  ["작업중", "IN_PROGRESS"],
  ["제작", "IN_PROGRESS"],
  ["생산", "IN_PROGRESS"],
  ["완료", "PRODUCTION_DONE"],
  ["생산완료", "PRODUCTION_DONE"],
  ["출고완료", "SHIPPED"],
  ["출고", "SHIPPED"],
  ["정산완료", "SETTLED"],
  ["정산", "SETTLED"],
]);
const DEFAULT_EMPLOYEE_ROLE_CODE_SEWING = "WORKER_SEWING";
const DEFAULT_EMPLOYEE_ROLES = [
  {
    code: "WORKER_SUPERVISOR",
    name: "감독",
    defaultPayType: "CT",
    sortOrder: 1,
  },
  {
    code: "WORKER_CUTTING",
    name: "재단",
    defaultPayType: "CT",
    sortOrder: 2,
  },
  {
    code: DEFAULT_EMPLOYEE_ROLE_CODE_SEWING,
    name: "봉제",
    defaultPayType: "CT",
    sortOrder: 3,
  },
  {
    code: "WORKER_IRONING",
    name: "다림",
    defaultPayType: "CT",
    sortOrder: 4,
  },
  {
    code: "WORKER_INSPECTION",
    name: "검수",
    defaultPayType: "CT",
    sortOrder: 5,
  },
  {
    code: "WORKER_PACKING",
    name: "포장",
    defaultPayType: "CT",
    sortOrder: 6,
  },
  {
    code: "WORKER_OTHER",
    name: "기타",
    defaultPayType: "CT",
    sortOrder: 7,
  },
] as const;
const DEFAULT_EMPLOYEE_ROLE_CODES = new Set<string>(
  DEFAULT_EMPLOYEE_ROLES.map((role) => role.code)
);

const DEFAULT_ATTRIBUTES = {
  colors: [] as { code: string; name: string }[],
  categories: [
    {
      code: "01-CHEF",
      name: "Chef Uniform",
      nameKo: "쉐프복",
      nameEn: "Chef Uniform",
      nameVi: "Đồng phục đầu bếp",
    },
    {
      code: "02-APRON",
      name: "Apron",
      nameKo: "앞치마",
      nameEn: "Apron",
      nameVi: "Tạp dề",
    },
    {
      code: "03-WINDBREAKER",
      name: "Windbreaker",
      nameKo: "바람막이",
      nameEn: "Windbreaker",
      nameVi: "Áo khoác gió",
    },
    {
      code: "04-SS-TSHIRT",
      name: "Short Sleeve T-Shirt",
      nameKo: "반팔 티셔츠",
      nameEn: "Short Sleeve T-Shirt",
      nameVi: "Áo thun ngắn tay",
    },
    {
      code: "05-LS-TSHIRT",
      name: "Long Sleeve T-Shirt",
      nameKo: "긴팔 티셔츠",
      nameEn: "Long Sleeve T-Shirt",
      nameVi: "Áo thun dài tay",
    },
    {
      code: "06-SCRUB",
      name: "Scrub",
      nameKo: "스크럽",
      nameEn: "Scrub",
      nameVi: "Đồng phục scrub",
    },
  ],
  roles: DEFAULT_EMPLOYEE_ROLES,
  processes: [
    { code: "P01", name: "테스트 공정 01" },
    { code: "P02", name: "테스트 공정 02" },
    { code: "P03", name: "테스트 공정 03" },
    { code: "P04", name: "테스트 공정 04" },
    { code: "P05", name: "테스트 공정 05" },
    { code: "P06", name: "테스트 공정 06" },
    { code: "P07", name: "테스트 공정 07" },
    { code: "P08", name: "테스트 공정 08" },
    { code: "P09", name: "테스트 공정 09" },
    { code: "P10", name: "테스트 공정 10" },
  ],
};

const normalizeWorkOrderItemGender = (
  value: unknown,
  fallback: "M" | "W" | "U" | null = "M"
): "M" | "W" | "U" | null => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return fallback;
  if (WORK_ORDER_ITEM_GENDER_CODES.has(normalized)) {
    return normalized as "M" | "W" | "U";
  }
  if (normalized === "MEN" || normalized === "MALE" || normalized === "남성") {
    return "M";
  }
  if (normalized === "WOMEN" || normalized === "FEMALE" || normalized === "여성") {
    return "W";
  }
  if (normalized === "UNISEX" || normalized === "공용") {
    return "U";
  }
  return fallback;
};
const resolveWorkOrderStatus = (
  value: unknown,
  fallback:
    | "EDITING"
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED"
    | "SETTLED" = "EDITING"
): "EDITING" | "ORDER_RECEIVED" | "IN_PROGRESS" | "PRODUCTION_DONE" | "SHIPPED" | "SETTLED" => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, "").trim();
  if (!normalized) return fallback;
  const upper = normalized.toUpperCase();
  if (WORK_ORDER_STATUS_CODES.has(upper)) {
    return upper as
      | "EDITING"
      | "ORDER_RECEIVED"
      | "IN_PROGRESS"
      | "PRODUCTION_DONE"
      | "SHIPPED"
      | "SETTLED";
  }
  return (WORK_ORDER_STATUS_LEGACY_CODE_MAP.get(normalized) ??
    fallback) as
    | "EDITING"
    | "ORDER_RECEIVED"
    | "IN_PROGRESS"
    | "PRODUCTION_DONE"
    | "SHIPPED"
    | "SETTLED";
};
const resolveDefaultWorkOrderStatusForLockState = (
  isLocked: boolean
): "EDITING" | "ORDER_RECEIVED" =>
  isLocked ? "ORDER_RECEIVED" : resolveUnlockedWorkOrderStatus();
const resolveCanonicalWorkOrderStatusForLockState = ({
  status,
  isManualLocked,
}: {
  status: unknown;
  isManualLocked: boolean;
}):
  | "EDITING"
  | "ORDER_RECEIVED"
  | "IN_PROGRESS"
  | "PRODUCTION_DONE"
  | "SHIPPED"
  | "SETTLED" => {
  const rawStatus = resolveWorkOrderStatus(
    status,
    resolveDefaultWorkOrderStatusForLockState(isManualLocked)
  );
  if (!AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES.has(rawStatus)) {
    return rawStatus;
  }
  if (!isManualLocked) {
    return resolveUnlockedWorkOrderStatus();
  }
  if (rawStatus === "EDITING") {
    return "ORDER_RECEIVED";
  }
  return rawStatus;
};
const resolveWorkOrderConfirmationStatus = (
  value: unknown,
  fallback: "PLANNED" | "CONFIRMED" = "PLANNED"
): "PLANNED" | "CONFIRMED" => {
  if (value === "" || value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/\s+/g, "").trim().toUpperCase();
  if (!normalized) return fallback;
  if (WORK_ORDER_CONFIRMATION_STATUS_CODES.has(normalized)) {
    return normalized as "PLANNED" | "CONFIRMED";
  }
  return fallback;
};
const toSortOrder = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
};
const isWorkerEmployeeRoleCode = (value: unknown): boolean =>
  DEFAULT_EMPLOYEE_ROLE_CODES.has(String(value ?? "").trim().toUpperCase());
const FACTORY_WORK_HOURS_PER_DAY = 8;
const ATTENDANCE_DEFAULT_WORK_SECONDS = FACTORY_WORK_HOURS_PER_DAY * 60 * 60;
const AT_TRAINING_CUTOFF_DAY = 5;
const AT_AUTO_SYNC_ENABLED = false;
const DEFAULT_TIME_REF_QUANTITY = 1000;
const DEFAULT_ST_BUCKET_QUANTITY = 1;
const ST_STANDARD_BUCKETS = Object.freeze([
  DEFAULT_ST_BUCKET_QUANTITY,
  3,
  5,
  10,
  30,
  50,
  100,
  300,
  500,
  1000,
  3000,
  5000,
  10000,
]);
const CUSTOMER_PRICING_TRADE_TYPES = new Set(["CMPT", "FOB"]);
const CUSTOMER_PRICING_ROW_MODES = new Set(["DEFAULT", "CMPT", "FOB", "BOTH"]);
// 출퇴근 입력값을 AT 계산에 반영한다.
// 출퇴근 기록이 있는 봉제 작업자(재직자)의 실제 근로시간만 AT 집계에 사용한다.
const USE_ATTENDANCE_INPUT_FOR_AT = true;
const AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO = (() => {
  const parsed = Number(process.env.AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO);
  if (!Number.isFinite(parsed) || parsed <= 1) return 8;
  return parsed;
})();
const AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS = toPositiveInt(
  process.env.AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS,
  8
);
const roundToScale = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const STARTUP_DB_MAX_RETRIES = toPositiveInt(
  process.env.STARTUP_DB_MAX_RETRIES,
  5
);
const STARTUP_DB_RETRY_DELAY_MS = toPositiveInt(
  process.env.STARTUP_DB_RETRY_DELAY_MS,
  1500
);
const STARTUP_BOOTSTRAP_RETRY_DELAY_MS = toPositiveInt(
  process.env.STARTUP_BOOTSTRAP_RETRY_DELAY_MS,
  5000
);
const STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT =
  String(process.env.STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT ?? "true")
    .trim()
    .toLowerCase() !== "false";
const STARTUP_REQUIRED_RUNTIME_COLUMNS = [
  { tableName: "WorkLog", columnName: "coverageStartDate" },
  { tableName: "WorkLog", columnName: "coverageEndDate" },
  { tableName: "WorkLog", columnName: "entryMode" },
  { tableName: "WorkLog", columnName: "factoryId" },
  { tableName: "Organization", columnName: "nameKo" },
  { tableName: "Organization", columnName: "nameVi" },
  { tableName: "Organization", columnName: "representativeEmployeeId" },
  { tableName: "Organization", columnName: "defaultSizeSetCode" },
  { tableName: "OrgRelationship", columnName: "defaultSizeSetCode" },
  { tableName: "Factory", columnName: "nameKo" },
  { tableName: "Factory", columnName: "nameVi" },
  { tableName: "Factory", columnName: "managementStartDate" },
  { tableName: "Factory", columnName: "managerEmployeeId" },
  { tableName: "Employee", columnName: "lineId" },
  { tableName: "Employee", columnName: "email" },
  { tableName: "Employee", columnName: "orgRole" },
  { tableName: "Employee", columnName: "status" },
  { tableName: "Employee", columnName: "requestedName" },
  { tableName: "Employee", columnName: "approvedAt" },
  { tableName: "Style", columnName: "id" },
  { tableName: "Style", columnName: "code" },
  { tableName: "WorkRecord", columnName: "styleId" },
  { tableName: "WorkRecord", columnName: "styleProcessId" },
  { tableName: "WorkRecord", columnName: "lineId" },
  { tableName: "WorkRecord", columnName: "effectiveCoverageStartDate" },
  { tableName: "WorkRecord", columnName: "effectiveCoverageEndDate" },
  { tableName: "WorkOrder", columnName: "buyerOrgId" },
  { tableName: "WorkOrder", columnName: "sellerOrgId" },
  { tableName: "WorkOrder", columnName: "customerId" },
  { tableName: "WorkOrderItem", columnName: "styleId" },
  { tableName: "WorkOrderItem", columnName: "colorId" },
  { tableName: "StyleProcess", columnName: "timesPerPiece" },
  { tableName: "StyleProcessStandard", columnName: "bucketQuantity" },
  { tableName: "StyleProcessStandard", columnName: "bucketStSeconds" },
  { tableName: "AtTrainingBucket", columnName: "workerId" },
  { tableName: "AssignmentCard", columnName: "cardId" },
  { tableName: "AssignmentCard", columnName: "payload" },
  { tableName: "AssignmentCard", columnName: "sortOrder" },
  { tableName: "AssignmentPlan", columnName: "externalId" },
  { tableName: "AssignmentPlan", columnName: "lineId" },
  { tableName: "AssignmentPlan", columnName: "startIndex" },
  { tableName: "AssignmentPlan", columnName: "endIndex" },
  { tableName: "AssignmentPlan", columnName: "completedAt" },
  { tableName: "AssignmentPlan", columnName: "closedAt" },
  { tableName: "AssignmentPlan", columnName: "productionCompletedAt" },
  { tableName: "AssignmentPlan", columnName: "assignmentQuantity" },
  { tableName: "AssignmentPlan", columnName: "assignmentStTotalSeconds" },
  { tableName: "AssignmentPlan", columnName: "assignmentCtTotalSeconds" },
  { tableName: "AssignmentPlan", columnName: "assignmentCtSnapshot" },
  { tableName: "OrgRelationship", columnName: "pricingDefaultTradeType" },
  { tableName: "OrgRelationship", columnName: "pricingMatrix" },
] as const;
// createdByEmployeeId/updatedByEmployeeId is an audit FK pattern applied to 24+
// tables (migration_fix.sql's "audited_tables" DO block) plus SystemSetting
// (updatedByEmployeeId only). Rather than hand-maintaining one static entry per
// table/column here - which is exactly how this drift gate went stale before
// (see AGENTS.md 43: a missed hasField entry let a real production drift go
// undetected) - derive the required list straight from the generated Prisma
// Client's DMMF: any model that declares a createdByEmployeeId/updatedByEmployeeId
// scalar field in schema.prisma is automatically required to have that column in
// the runtime DB too. New models that adopt this audit pattern are covered
// without remembering to update a hardcoded list.
const AUDIT_EMPLOYEE_FK_COLUMN_NAMES = [
  "createdByEmployeeId",
  "updatedByEmployeeId",
] as const;
const STARTUP_REQUIRED_RUNTIME_AUDIT_FK_COLUMNS = Prisma.dmmf.datamodel.models.flatMap(
  (model) =>
    AUDIT_EMPLOYEE_FK_COLUMN_NAMES.filter((columnName) =>
      model.fields.some((field) => field.name === columnName)
    ).map((columnName) => ({ tableName: model.name, columnName }))
);
const STARTUP_FORBIDDEN_RUNTIME_COLUMNS = [
  { tableName: "Employee", columnName: "lineName" },
  { tableName: "Employee", columnName: "orgMembershipId" },
  { tableName: "Style", columnName: "uid" },
  { tableName: "Style", columnName: "styleId" },
  { tableName: "Style", columnName: "styleCode" },
  { tableName: "Style", columnName: "customer" },
  { tableName: "Style", columnName: "customerNameKo" },
  { tableName: "Style", columnName: "customerNameVi" },
  { tableName: "StyleProcess", columnName: "styleUid" },
  { tableName: "WorkOrder", columnName: "buyerOrgName" },
  { tableName: "WorkOrder", columnName: "buyerOrgNameKo" },
  { tableName: "WorkOrder", columnName: "buyerOrgNameVi" },
  { tableName: "WorkOrder", columnName: "sellerOrgName" },
  { tableName: "WorkOrder", columnName: "customerName" },
  { tableName: "WorkOrderItem", columnName: "styleUid" },
  { tableName: "WorkOrderItem", columnName: "styleName" },
  { tableName: "WorkOrderItem", columnName: "styleCode" },
  { tableName: "WorkOrderItem", columnName: "colorCode" },
  { tableName: "WorkLog", columnName: "factoryName" },
  { tableName: "WorkRecord", columnName: "workerName" },
  { tableName: "WorkRecord", columnName: "customerName" },
  { tableName: "WorkRecord", columnName: "styleUid" },
  { tableName: "WorkRecord", columnName: "styleName" },
  { tableName: "WorkRecord", columnName: "processId" },
  { tableName: "WorkRecord", columnName: "processCode" },
  { tableName: "WorkRecord", columnName: "processName" },
  { tableName: "WorkRecord", columnName: "colorId" },
  { tableName: "WorkRecord", columnName: "colorCode" },
  { tableName: "WorkRecord", columnName: "colorName" },
  { tableName: "WorkRecord", columnName: "gender" },
  { tableName: "WorkRecord", columnName: "orderNo" },
] as const;
const STARTUP_FORBIDDEN_RUNTIME_TABLES = ["OrgMembership"] as const;
const STARTUP_REQUIRED_RUNTIME_ENUM_VALUES = [
  { enumName: "OrgMembershipStatus", value: "TERMINATED" },
  { enumName: "WorkOrderStatus", value: "EDITING" },
] as const;
const ROLE_OPTIONS = new Set(["ADMIN", "OPERATOR", "ACCOUNTANT", "WORKER"]);
const ORG_ACCESS_ROLES: OrgUserRole[] = [
  "ADMIN",
  "OPERATOR",
  "ACCOUNTANT",
  "WORKER",
];
const ORG_MANAGEMENT_ROLES: OrgUserRole[] = ORG_ACCESS_ROLES;
const MEMBERSHIP_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
  "TERMINATED",
]);
const SUBSCRIPTION_STATUSES = new Set([
  "NOT_SUBSCRIBED",
  "TRIAL",
  "ACTIVE",
  "GRACE",
  "SUSPENDED",
]);
const TRIAL_DAYS = 30;
const GRACE_DAYS = 30;
const SUBSCRIPTION_NULL_DATE_CUTOFF_MS = Date.UTC(1971, 0, 1);
const ORGANIZATION_TYPE_KEYS = {
  MANUFACTURER: "MANUFACTURER",
  BRAND: "BRAND",
} as const;
type OrganizationTypeKey =
  (typeof ORGANIZATION_TYPE_KEYS)[keyof typeof ORGANIZATION_TYPE_KEYS];

const ONBOARDING_ORGANIZATION_TYPE_OPTIONS = new Set<OrganizationTypeKey>(
  Object.values(ORGANIZATION_TYPE_KEYS)
);
const ROLE_ACCESS_POLICY_SETTING_KEY = "ROLE_ACCESS_POLICY";
const ROLE_ACCESS_POLICY_SCHEMA_VERSION = 4;
const ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY = "__schemaVersion";
const ROLE_ACCESS_POLICY_FEATURES = [
  "DASHBOARD",
  "ORDER",
  "STYLE",
  "ST_REVIEW",
  "SHIPMENT_REVIEW",
  "ASSIGNMENT",
  "PRODUCTION_PLAN",
  "INVENTORY",
  "ATTENDANCE",
  "PRODUCTION_ANALYSIS",
  "WORK_HISTORY",
  "PAYROLL",
  "REVENUE_ANALYSIS",
  "BUSINESS",
  "LINE",
  "EMPLOYEE",
  "CUSTOMER",
  "PERMISSION",
  "HOLIDAY",
] as const;
type RoleAccessPolicyFeature = (typeof ROLE_ACCESS_POLICY_FEATURES)[number];
type RoleAccessPolicy = Record<
  OrganizationTypeKey,
  Record<OrgUserRole, RoleAccessPolicyFeature[]>
>;
type SerializedRoleAccessPolicy = RoleAccessPolicy & {
  [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]: number;
};
const ROLE_ACCESS_POLICY_FEATURE_SET = new Set<string>(
  ROLE_ACCESS_POLICY_FEATURES
);
const DEFAULT_ROLE_ACCESS_POLICY: RoleAccessPolicy = {
  MANUFACTURER: {
    ADMIN: [...ROLE_ACCESS_POLICY_FEATURES],
    OPERATOR: [
      "DASHBOARD",
      "ORDER",
      "STYLE",
      "ST_REVIEW",
      "SHIPMENT_REVIEW",
      "ASSIGNMENT",
      "PRODUCTION_PLAN",
      "INVENTORY",
      "ATTENDANCE",
      "PRODUCTION_ANALYSIS",
      "WORK_HISTORY",
      "LINE",
      "CUSTOMER",
    ],
    ACCOUNTANT: [
      "DASHBOARD",
      "PAYROLL",
      "REVENUE_ANALYSIS",
      "BUSINESS",
      "EMPLOYEE",
      "HOLIDAY",
    ],
    WORKER: ["DASHBOARD"],
  },
  BRAND: {
    ADMIN: ["DASHBOARD", "ORDER", "STYLE"],
    OPERATOR: ["DASHBOARD", "ORDER", "STYLE"],
    ACCOUNTANT: ["DASHBOARD"],
    WORKER: ["DASHBOARD"],
  },
};
const cloneRoleAccessPolicy = (value: RoleAccessPolicy): RoleAccessPolicy =>
  JSON.parse(JSON.stringify(value));
const sanitizeRoleAccessPolicyFeatureList = (
  value: unknown
): RoleAccessPolicyFeature[] => {
  const featureSet = new Set<RoleAccessPolicyFeature>();
  ensureArray(value).forEach((feature) => {
    const normalized = String(feature || "").trim().toUpperCase();
    if (!ROLE_ACCESS_POLICY_FEATURE_SET.has(normalized)) return;
    featureSet.add(normalized as RoleAccessPolicyFeature);
  });
  return Array.from(featureSet);
};
const hasRoleAccessPolicySchemaVersion = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schemaVersion = Number(
    (value as any)?.[ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY] ??
      (value as any)?.schemaVersion ??
      0
  );
  return (
    Number.isFinite(schemaVersion) &&
    schemaVersion >= ROLE_ACCESS_POLICY_SCHEMA_VERSION
  );
};
const applyLegacyDashboardDefault = (policy: RoleAccessPolicy): void => {
  (Object.values(ORGANIZATION_TYPE_KEYS) as OrganizationTypeKey[]).forEach(
    (orgType) => {
      ORG_ACCESS_ROLES.forEach((role) => {
        const features = policy[orgType][role];
        if (features.includes("DASHBOARD")) return;
        features.unshift("DASHBOARD");
      });
    }
  );
};
const applyLegacyProductionAnalysisDefault = (policy: RoleAccessPolicy): void => {
  (Object.values(ORGANIZATION_TYPE_KEYS) as OrganizationTypeKey[]).forEach(
    (orgType) => {
      ORG_ACCESS_ROLES.forEach((role) => {
        const features = policy[orgType][role];
        if (!features.includes("WORK_HISTORY")) return;
        if (features.includes("PRODUCTION_ANALYSIS")) return;
        const workHistoryIndex = features.indexOf("WORK_HISTORY");
        features.splice(Math.max(0, workHistoryIndex), 0, "PRODUCTION_ANALYSIS");
      });
    }
  );
};
const applyLegacyRevenueAnalysisDefault = (policy: RoleAccessPolicy): void => {
  (Object.values(ORGANIZATION_TYPE_KEYS) as OrganizationTypeKey[]).forEach(
    (orgType) => {
      ORG_ACCESS_ROLES.forEach((role) => {
        const features = policy[orgType][role];
        if (!features.includes("BUSINESS")) return;
        if (features.includes("REVENUE_ANALYSIS")) return;
        const businessIndex = features.indexOf("BUSINESS");
        features.splice(Math.max(0, businessIndex), 0, "REVENUE_ANALYSIS");
      });
    }
  );
};
const sanitizeRoleAccessPolicy = (value: unknown): RoleAccessPolicy => {
  const policy = cloneRoleAccessPolicy(DEFAULT_ROLE_ACCESS_POLICY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return policy;
  (Object.values(ORGANIZATION_TYPE_KEYS) as OrganizationTypeKey[]).forEach(
    (orgType) => {
      const sourceByRole = (value as any)?.[orgType];
      if (!sourceByRole || typeof sourceByRole !== "object" || Array.isArray(sourceByRole)) {
        return;
      }
      ORG_ACCESS_ROLES.forEach((role) => {
        if (sourceByRole[role] === undefined) return;
        policy[orgType][role] = sanitizeRoleAccessPolicyFeatureList(
          sourceByRole[role]
        );
      });
    }
  );
  if (!hasRoleAccessPolicySchemaVersion(value)) {
    applyLegacyDashboardDefault(policy);
    applyLegacyProductionAnalysisDefault(policy);
    applyLegacyRevenueAnalysisDefault(policy);
  }
  return policy;
};
const serializeRoleAccessPolicy = (
  policy: RoleAccessPolicy
): SerializedRoleAccessPolicy =>
  ({
    ...policy,
    [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  } as SerializedRoleAccessPolicy);
let systemSettingStorageReadyPromise: Promise<void> | null = null;
let systemSettingStorageReady = false;
const ensureSystemSettingStorageReady = async () => {
  if (systemSettingStorageReady) return;
  if (systemSettingStorageReadyPromise) {
    await systemSettingStorageReadyPromise;
    return;
  }
  systemSettingStorageReadyPromise = prisma
    .$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key" TEXT NOT NULL,
        "value" JSONB NOT NULL,
        "updatedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
      )
    `)
    .then(() => {
      systemSettingStorageReady = true;
    });
  try {
    await systemSettingStorageReadyPromise;
  } finally {
    systemSettingStorageReadyPromise = null;
  }
};
const loadRoleAccessPolicySetting = async () => {
  await ensureSystemSettingStorageReady();
  const stored = await prisma.systemSetting.findUnique({
    where: { key: ROLE_ACCESS_POLICY_SETTING_KEY },
    select: { value: true, updatedAt: true, updatedBy: true },
  });
  const policy = sanitizeRoleAccessPolicy(stored?.value);
  return {
    policy: serializeRoleAccessPolicy(policy),
    stored: Boolean(stored),
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
  };
};
const hasRoleAccessPolicyFeature = async ({
  orgType,
  orgRole,
  feature,
}: {
  orgType: unknown;
  orgRole: OrgUserRole;
  feature: RoleAccessPolicyFeature;
}) => {
  const normalizedOrgType = String(orgType ?? "")
    .trim()
    .toUpperCase() as OrganizationTypeKey;
  if (
    normalizedOrgType !== ORGANIZATION_TYPE_KEYS.MANUFACTURER &&
    normalizedOrgType !== ORGANIZATION_TYPE_KEYS.BRAND
  ) {
    return false;
  }

  const { policy } = await loadRoleAccessPolicySetting();
  return policy[normalizedOrgType][orgRole].includes(feature);
};
const ONBOARDING_ORGANIZATION_TYPE_TOKENS: Record<string, OrganizationTypeKey> = {
  manufacturer: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  factory: ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "공장": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "수주자": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  "테스트수주자": ORGANIZATION_TYPE_KEYS.MANUFACTURER,
  brand: ORGANIZATION_TYPE_KEYS.BRAND,
  "브랜드": ORGANIZATION_TYPE_KEYS.BRAND,
  "발주자": ORGANIZATION_TYPE_KEYS.BRAND,
  "테스트발주자": ORGANIZATION_TYPE_KEYS.BRAND,
};
const ONBOARDING_COUNTRY_OPTIONS = new Set(["KR", "VN"]);
const ONBOARDING_COMPANY_NAME_MIN_LENGTH = 2;
const ONBOARDING_COMPANY_NAME_MAX_LENGTH = 120;
const ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH = 240;
const ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH = 80;
const ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH = 40;
const ONBOARDING_KR_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{3}-\d{2}-\d{5})$/;
const ONBOARDING_VN_BUSINESS_NUMBER_REGEX = /^(?:\d{10}|\d{13}|\d{10}-\d{3})$/;
const resolveRole = (value: any, fallback: OrgUserRole = "WORKER"): OrgUserRole =>
  ROLE_OPTIONS.has(value) ? (value as OrgUserRole) : fallback;
const resolveStatus = (value: any) =>
  MEMBERSHIP_STATUSES.has(value) ? value : null;
const resolveSubscriptionStatus = (value: any) =>
  SUBSCRIPTION_STATUSES.has(value) ? value : null;
const isManufacturerOrg = (org: { type?: string | null } | null | undefined) =>
  org?.type === "MANUFACTURER";
const isBrandOrg = (org: { type?: string | null } | null | undefined) =>
  org?.type === "BRAND";
const resolveCustomerPerspective = (
  org: { type?: string | null } | null | undefined
): "MANUFACTURER" | "BRAND" | null => {
  if (isManufacturerOrg(org)) return "MANUFACTURER";
  if (isBrandOrg(org)) return "BRAND";
  return null;
};
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const normalizeSubscriptionDateOrNull = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime() < SUBSCRIPTION_NULL_DATE_CUTOFF_MS ? null : date;
};

const buildSubscriptionResponse = (subscription: any) => {
  if (!subscription || typeof subscription !== "object") return null;
  const trialStartedAt = normalizeSubscriptionDateOrNull(subscription.trialStartedAt);
  const trialEndsAt = normalizeSubscriptionDateOrNull(subscription.trialEndsAt);
  const activatedAt = normalizeSubscriptionDateOrNull(subscription.activatedAt);
  const activeEndsAt = normalizeSubscriptionDateOrNull(subscription.activeEndsAt);
  const suspendedAt = normalizeSubscriptionDateOrNull(subscription.suspendedAt);
  const graceEndsAt = activeEndsAt ? addDays(new Date(activeEndsAt), GRACE_DAYS) : null;
  return {
    id: subscription.id,
    status: subscription.status,
    serviceContactEmail: subscription.membershipEmail ?? null,
    membershipEmail: subscription.membershipEmail ?? null,
    billingEmail: subscription.billingEmail ?? null,
    trialStartedAt,
    trialEndsAt,
    activatedAt,
    activeEndsAt,
    graceEndsAt,
    suspendedAt,
    updatedAt: subscription.updatedAt ?? null,
    createdAt: subscription.createdAt ?? null,
  };
};

const normalizeSubscriptionEmailInput = (
  value: unknown,
  fieldName: string,
  fallback: string | null
) => {
  if (value === undefined) return { value: fallback };
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string` };
  }
  const normalized = normalizeEmail(value);
  if (!normalized) return { value: null };
  if (!normalized.includes("@")) {
    return { error: `${fieldName} is invalid` };
  }
  return { value: normalized };
};

const normalizeDateInput = (
  value: unknown,
  fieldName: string,
  fallback: Date | null
) => {
  if (value === undefined) return { value: fallback };
  if (value === null || value === "") return { value: null };
  const rawDate = new Date(value as any);
  if (Number.isNaN(rawDate.getTime())) {
    return { error: `${fieldName} is invalid` };
  }
  const date = normalizeSubscriptionDateOrNull(value);
  return { value: date };
};

const toOrganizationResponse = (organization: any) => {
  if (!organization) return organization;
  const { subscription, representativeEmployee, ...rest } = organization;
  const representativeEmployeeResponse =
    representativeEmployee && typeof representativeEmployee === "object"
      ? {
          id: representativeEmployee.id ?? null,
          name: resolveOptionalString(representativeEmployee.name, null),
          employeeNo: normalizeEmployeeNo(representativeEmployee.employeeNo) ?? null,
          phone: resolveOptionalString(representativeEmployee.phone, null),
          email: resolveOptionalString(representativeEmployee.email, null),
        }
      : null;
  return {
    ...rest,
    representativeEmployee: representativeEmployeeResponse,
    representativeEmployeeId:
      representativeEmployeeResponse?.id ?? rest.representativeEmployeeId ?? null,
    representative:
      representativeEmployeeResponse?.name ?? rest.representative ?? null,
    phone: representativeEmployeeResponse ? representativeEmployeeResponse.phone : rest.phone ?? null,
    email: representativeEmployeeResponse ? representativeEmployeeResponse.email : rest.email ?? null,
    subscription: buildSubscriptionResponse(subscription),
  };
};

const hasSubscriptionPayload = (payload: any = {}) =>
  payload.subscriptionStatus !== undefined ||
  payload.status !== undefined ||
  payload.serviceContactEmail !== undefined ||
  payload.membershipEmail !== undefined ||
  payload.billingEmail !== undefined ||
  payload.trialStartedAt !== undefined ||
  payload.trialEndsAt !== undefined ||
  payload.activeEndsAt !== undefined;

const applySubscriptionPayload = async (organization: any, payload: any = {}) => {
  const current = await ensureOrganizationSubscription(organization);
  if (!current) {
    throw createHttpError(404, "subscription not found");
  }
  if (!hasSubscriptionPayload(payload)) {
    return current;
  }

  const rawStatus = payload.subscriptionStatus ?? payload.status;
  let nextStatus = current.status;
  if (rawStatus !== undefined) {
    const resolved = resolveSubscriptionStatus(rawStatus);
    if (!resolved) {
      throw createHttpError(400, "invalid subscription status");
    }
    nextStatus = resolved;
  }

  const serviceContactEmailInput =
    payload.serviceContactEmail !== undefined
      ? payload.serviceContactEmail
      : payload.membershipEmail;

  const serviceContactEmailResolved = normalizeSubscriptionEmailInput(
    serviceContactEmailInput,
    "serviceContactEmail",
    current.membershipEmail ?? null
  );
  if (serviceContactEmailResolved.error) {
    throw createHttpError(400, serviceContactEmailResolved.error);
  }
  const billingEmailResolved = normalizeSubscriptionEmailInput(
    payload.billingEmail,
    "billingEmail",
    current.billingEmail ?? null
  );
  if (billingEmailResolved.error) {
    throw createHttpError(400, billingEmailResolved.error);
  }

  const trialStartedAtResolved = normalizeDateInput(
    payload.trialStartedAt,
    "trialStartedAt",
    current.trialStartedAt
  );
  if (trialStartedAtResolved.error) {
    throw createHttpError(400, trialStartedAtResolved.error);
  }
  const trialEndsAtResolved = normalizeDateInput(
    payload.trialEndsAt,
    "trialEndsAt",
    current.trialEndsAt
  );
  if (trialEndsAtResolved.error) {
    throw createHttpError(400, trialEndsAtResolved.error);
  }
  const activeEndsAtResolved = normalizeDateInput(
    payload.activeEndsAt,
    "activeEndsAt",
    current.activeEndsAt
  );
  if (activeEndsAtResolved.error) {
    throw createHttpError(400, activeEndsAtResolved.error);
  }

  const now = new Date();
  let serviceContactEmail = serviceContactEmailResolved.value;
  let billingEmail = billingEmailResolved.value;
  let trialStartedAt = trialStartedAtResolved.value;
  let trialEndsAt = trialEndsAtResolved.value;
  let activatedAt = current.activatedAt;
  let activeEndsAt = activeEndsAtResolved.value;
  let suspendedAt = current.suspendedAt;

  if (nextStatus === "TRIAL") {
    if (!trialStartedAt) {
      trialStartedAt = now;
    }
    if (!trialEndsAt) {
      trialEndsAt = addDays(trialStartedAt, TRIAL_DAYS);
    }
    activeEndsAt = null;
    suspendedAt = null;
  }

  if (nextStatus === "ACTIVE") {
    if (!serviceContactEmail || !billingEmail) {
      throw createHttpError(
        400,
        "serviceContactEmail and billingEmail are required for ACTIVE"
      );
    }
    if (!activatedAt) {
      activatedAt = now;
    }
    if (rawStatus !== undefined && current.status !== "ACTIVE" && payload.activeEndsAt === undefined) {
      activeEndsAt = null;
    }
    suspendedAt = null;
  }

  if (nextStatus === "GRACE") {
    if (!activeEndsAt) {
      activeEndsAt = current.activeEndsAt ?? now;
    }
    suspendedAt = null;
  }

  if (nextStatus === "SUSPENDED") {
    suspendedAt = now;
  } else if (nextStatus === "NOT_SUBSCRIBED") {
    suspendedAt = null;
    activeEndsAt = null;
  } else if (rawStatus !== undefined) {
    suspendedAt = null;
  }

  const updateData: any = {
    status: nextStatus,
    activatedAt,
    activeEndsAt,
    suspendedAt,
    ...(serviceContactEmail !== undefined
      ? { membershipEmail: serviceContactEmail }
      : {}),
    ...(billingEmail !== undefined ? { billingEmail } : {}),
    ...(trialStartedAt !== undefined ? { trialStartedAt } : {}),
    ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
  };
  return prisma.organizationSubscription.update({
    where: { id: current.id },
    data: updateData,
  });
};

const ensureHardcodedSystemAdmin = async () => {
  const email = getHardCodedSystemAdminEmail();
  if (!email) return null;

  return prisma.systemUser.upsert({
    where: { email },
    update: { systemRole: "SYSTEM_ADMIN" },
    create: { email, systemRole: "SYSTEM_ADMIN" },
  });
};

const combineOrganizationPhone = (countryCode: unknown, phoneNumber: unknown) => {
  const normalizedCountryCode = resolveOptionalString(countryCode, null);
  const normalizedPhoneNumber = resolveOptionalString(phoneNumber, null);
  return [normalizedCountryCode, normalizedPhoneNumber].filter(Boolean).join(" ");
};

const buildSharedCustomerOrganizationData = (
  payload: any = {},
  fallbackOrganization: any = null
) => {
  return {
    code:
      payload?.code !== undefined
        ? normalizeOrgCode(payload.code)
        : normalizeOrgCode(fallbackOrganization?.code),
    name:
      payload?.name !== undefined
        ? resolveOptionalString(payload.name, null)
        : resolveOptionalString(fallbackOrganization?.name, null),
    nameKo:
      payload?.nameKo !== undefined
        ? resolveOptionalString(payload.nameKo, null)
        : resolveOptionalString(fallbackOrganization?.nameKo, null),
    nameVi:
      payload?.nameVi !== undefined
        ? resolveOptionalString(payload.nameVi, null)
        : resolveOptionalString(fallbackOrganization?.nameVi, null),
    address:
      payload?.address !== undefined
        ? resolveOptionalString(payload.address, null)
        : resolveOptionalString(fallbackOrganization?.address, null),
    country:
      payload?.country !== undefined
        ? resolveOptionalString(payload.country, null)
        : resolveOptionalString((fallbackOrganization as any)?.country, null),
    countryCode:
      payload?.countryCode !== undefined
        ? resolveOptionalString(payload.countryCode, null)
        : resolveOptionalString((fallbackOrganization as any)?.countryCode, null),
    phone:
      payload?.phoneNumber !== undefined || payload?.phone !== undefined
        ? resolveOptionalString(payload.phoneNumber ?? payload.phone, null)
        : resolveOptionalString(fallbackOrganization?.phone, null),
    representative:
      payload?.manager !== undefined || payload?.representative !== undefined
        ? resolveOptionalString(payload.manager ?? payload.representative, null)
        : resolveOptionalString(fallbackOrganization?.representative, null),
    email:
      payload?.email !== undefined
        ? resolveOptionalString(payload.email, null)
        : resolveOptionalString(fallbackOrganization?.email, null),
  };
};

const toCustomerResponse = (relationship: any, perspective: string = "MANUFACTURER") => {
  const targetOrg =
    perspective === "BRAND" ? relationship.manufacturer ?? {} : relationship.brand ?? {};
  const targetCode = targetOrg.code ?? relationship.customerCode ?? "";
  const phone = combineOrganizationPhone(
    (targetOrg as any)?.countryCode ?? null,
    targetOrg.phone ?? relationship.managerPhone ?? null
  );
  return {
    id: relationship.id,
    brandOrgId: relationship.brandOrgId,
    manufacturerOrgId: relationship.manufacturerOrgId,
    code: targetCode,
    name: targetOrg.name ?? "",
    nameKo: (targetOrg as any)?.nameKo ?? null,
    nameVi: (targetOrg as any)?.nameVi ?? null,
    industry: targetOrg.type ?? null,
    type: targetOrg.type ?? null,
    address: targetOrg.address ?? "",
    country: (targetOrg as any)?.country ?? null,
    countryCode: (targetOrg as any)?.countryCode ?? null,
    phoneNumber: targetOrg.phone ?? relationship.managerPhone ?? "",
    phone,
    manager: targetOrg.representative ?? relationship.managerName ?? "",
    email: targetOrg.email ?? relationship.managerEmail ?? "",
    defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(
      relationship.defaultSizeSetCode
    ),
    targetMonthlyWage: (targetOrg as any)?.targetMonthlyWage ?? null,
    wagePerSecond: (targetOrg as any)?.wagePerSecond ?? null,
    pricingDefaultTradeType:
      typeof relationship?.pricingDefaultTradeType === "string"
        ? relationship.pricingDefaultTradeType
        : null,
    registeredAt: relationship.createdAt,
    brand: relationship.brand ?? null,
    manufacturer: relationship.manufacturer ?? null,
  };
};

const normalizeCustomerPricingTradeType = (value: any, fallback = "CMPT") => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CUSTOMER_PRICING_TRADE_TYPES.has(normalized) ? normalized : fallback;
};

const normalizeCustomerPricingRowMode = (value: any, fallback = "DEFAULT") => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CUSTOMER_PRICING_ROW_MODES.has(normalized) ? normalized : fallback;
};

const normalizeCustomerPricingAmount = (value: any) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundToScale(parsed, 4);
};

const normalizeCustomerPricingRows = (value: any) => {
  const nextRows: Record<string, any> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return nextRows;

  Object.entries(value).forEach(([rawStyleId, rawRowValue]) => {
    const styleId = String(rawStyleId || "").trim();
    if (!styleId) return;

    const normalizedRow = {
      mode: normalizeCustomerPricingRowMode((rawRowValue as any)?.mode),
      prices: {
        CMPT: {} as Record<string, number>,
        FOB: {} as Record<string, number>,
      },
    };

    CUSTOMER_PRICING_TRADE_TYPES.forEach((tradeType) => {
      const source = (rawRowValue as any)?.prices?.[tradeType];
      if (!source || typeof source !== "object" || Array.isArray(source)) return;

      Object.entries(source).forEach(([rawBucketQuantity, rawAmount]) => {
        const bucketQuantity = toPositiveInt(rawBucketQuantity, 0);
        if (!ST_STANDARD_BUCKETS.includes(bucketQuantity)) return;
        const normalizedAmount = normalizeCustomerPricingAmount(rawAmount);
        if (normalizedAmount === null) return;
        normalizedRow.prices[tradeType as "CMPT" | "FOB"][String(bucketQuantity)] =
          normalizedAmount;
      });
    });

    const hasAnyPrice =
      Object.keys(normalizedRow.prices.CMPT).length > 0 ||
      Object.keys(normalizedRow.prices.FOB).length > 0;
    if (!hasAnyPrice && normalizedRow.mode === "DEFAULT") return;
    nextRows[styleId] = normalizedRow;
  });

  return nextRows;
};

const normalizeCustomerPricingPayload = (value: any = {}) => ({
  defaultTradeType: normalizeCustomerPricingTradeType(
    value?.defaultTradeType,
    "CMPT"
  ),
  rows: normalizeCustomerPricingRows(value?.rows),
});

const toCustomerPricingResponse = (relationship: any) => {
  const normalized = normalizeCustomerPricingPayload({
    defaultTradeType: relationship?.pricingDefaultTradeType,
    rows: relationship?.pricingMatrix,
  });

  return {
    defaultTradeType: normalized.defaultTradeType,
    rows: normalized.rows,
    currencyCode: "USD",
    updatedAt: relationship?.updatedAt ?? null,
  };
};

const createStyleId = () =>
  `S-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

const toStyleIdentityKey = (customer: any, value: any) =>
  `${(customer ?? "").trim()}::${(value ?? "").trim()}`;

const toOptionalSeconds = (value: any) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : roundToScale(parsed, 4);
};

const toOptionalProcessSeconds = (value: any) => {
  const parsed = toOptionalSeconds(value);
  if (parsed === null) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
};

const resolveStBucketQuantity = (
  orderQuantity: any,
  fallback = DEFAULT_ST_BUCKET_QUANTITY
) => {
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, fallback);
  let resolvedBucket = fallback;
  ST_STANDARD_BUCKETS.forEach((bucket) => {
    if (resolvedOrderQuantity >= bucket) {
      resolvedBucket = bucket;
    }
  });
  return resolvedBucket;
};

type StyleAtParams = {
  a: number;
  b: number;
  version: number;
  updatedAt: string | null;
  trainedPeriod: string | null;
  attendanceCoverage: number | null;
  attendanceFallbackShare: number | null;
  observationCount: number | null;
  fitStatus: string | null;
  isProvisional: boolean;
  fallbackReason: string | null;
  weightedPointCount: number | null;
  distinctQuantityCount: number | null;
  distinctEventCount: number | null;
  distinctSourceGroupCount: number | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  minEventCount: number | null;
  maxEventCount: number | null;
  quantitySamples: number[];
  eventCountSamples: number[];
};

const normalizeCustomerDefaultSizeSetCode = (value: unknown) =>
  value === "URD_NUMERIC" ? "URD_NUMERIC" : "LEGACY_APPAREL";

type StyleStBucket = {
  bucketQuantity: number;
  bucketStSeconds: number;
  setBy: string | null;
  setAt: string | null;
  updatedAt: string | null;
};

const toNonNegativeIntOrNull = (value: any) => {
  const parsed = toNumberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return Math.trunc(parsed);
};

const toPositiveNumberSamples = (value: any) =>
  ensureArray(value)
    .map((item) => toNumberOrNull(item))
    .filter((item): item is number => item !== null && item > 0)
    .map((item) => roundToScale(item, 4))
    .slice(0, 10);

const toStyleAtParams = (value: any): StyleAtParams | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = toOptionalSeconds((value as any).a);
  const b = toOptionalSeconds((value as any).b);
  if (a === null || b === null) return null;

  const versionRaw = Number((value as any).version);
  const version =
    Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;

  const updatedAtRaw = resolveOptionalString((value as any).updatedAt, null);
  const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
  const updatedAt =
    updatedAtDate && !Number.isNaN(updatedAtDate.getTime())
      ? updatedAtDate.toISOString()
      : null;

  const trainedPeriodRaw = resolveOptionalString(
    (value as any).trainedPeriod,
    null
  );
  const trainedPeriod =
    trainedPeriodRaw && /^\d{4}-\d{2}$/.test(trainedPeriodRaw)
      ? trainedPeriodRaw
      : null;
  const attendanceCoverageRaw = toNumberOrNull((value as any).attendanceCoverage);
  const attendanceCoverage =
    attendanceCoverageRaw === null
      ? null
      : roundToScale(Math.min(1, Math.max(0, attendanceCoverageRaw)), 4);
  const attendanceFallbackShareRaw = toNumberOrNull(
    (value as any).attendanceFallbackShare
  );
  const attendanceFallbackShare =
    attendanceFallbackShareRaw === null
      ? attendanceCoverage === null
        ? null
        : roundToScale(Math.min(1, Math.max(0, 1 - attendanceCoverage)), 4)
      : roundToScale(Math.min(1, Math.max(0, attendanceFallbackShareRaw)), 4);
  const observationCountRaw = toNumberOrNull((value as any).observationCount);
  const observationCount =
    observationCountRaw === null
      ? null
      : Math.max(0, Math.trunc(observationCountRaw));
  const fitStatus = resolveOptionalString((value as any).fitStatus, null);
  const fallbackReason = resolveOptionalString((value as any).fallbackReason, null);
  const isProvisional =
    Boolean((value as any).isProvisional) || fitStatus === "USED_PROVISIONAL";
  const minQuantity = toNumberOrNull((value as any).minQuantity);
  const maxQuantity = toNumberOrNull((value as any).maxQuantity);
  const minEventCount = toNumberOrNull((value as any).minEventCount);
  const maxEventCount = toNumberOrNull((value as any).maxEventCount);

  return {
    a,
    b,
    version,
    updatedAt,
    trainedPeriod,
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount,
    fitStatus,
    isProvisional,
    fallbackReason,
    weightedPointCount: toNonNegativeIntOrNull((value as any).weightedPointCount),
    distinctQuantityCount: toNonNegativeIntOrNull((value as any).distinctQuantityCount),
    distinctEventCount: toNonNegativeIntOrNull((value as any).distinctEventCount),
    distinctSourceGroupCount: toNonNegativeIntOrNull((value as any).distinctSourceGroupCount),
    minQuantity: minQuantity === null ? null : roundToScale(minQuantity, 4),
    maxQuantity: maxQuantity === null ? null : roundToScale(maxQuantity, 4),
    minEventCount: minEventCount === null ? null : roundToScale(minEventCount, 4),
    maxEventCount: maxEventCount === null ? null : roundToScale(maxEventCount, 4),
    quantitySamples: toPositiveNumberSamples((value as any).quantitySamples),
    eventCountSamples: toPositiveNumberSamples((value as any).eventCountSamples),
  };
};

const toStyleStBucket = (value: any): StyleStBucket | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bucketQuantity = toPositiveIntOrNull(
    (value as any).bucketQuantity ?? (value as any).quantity
  );
  const bucketStSeconds = toOptionalProcessSeconds(
    (value as any).bucketStSeconds ?? (value as any).seconds
  );
  if (bucketQuantity === null || bucketStSeconds === null) return null;
  const setAtRaw = resolveOptionalString((value as any).setAt, null);
  const setAtDate = setAtRaw ? new Date(setAtRaw) : null;
  const updatedAtRaw = resolveOptionalString((value as any).updatedAt, null);
  const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;
  return {
    bucketQuantity,
    bucketStSeconds,
    setBy: resolveOptionalString((value as any).setBy, null),
    setAt:
      setAtDate && !Number.isNaN(setAtDate.getTime())
        ? setAtDate.toISOString()
        : null,
    updatedAt:
      updatedAtDate && !Number.isNaN(updatedAtDate.getTime())
        ? updatedAtDate.toISOString()
        : null,
  };
};

const normalizeStyleProcessStBuckets = (values: any): StyleStBucket[] => {
  const byQuantity = new Map<number, StyleStBucket>();
  ensureArray(values).forEach((value) => {
    const normalized = toStyleStBucket(value);
    if (!normalized) return;
    byQuantity.set(normalized.bucketQuantity, normalized);
  });

  return Array.from(byQuantity.values()).sort(
    (left, right) => left.bucketQuantity - right.bucketQuantity
  );
};

const findStyleProcessExactStBucket = (
  values: StyleStBucket[] = [],
  orderQuantity = 1
): StyleStBucket | null => {
  const resolvedOrderQuantity = resolveStBucketQuantity(orderQuantity);
  return (
    values.find((value) => toPositiveInt(value.bucketQuantity, 0) === resolvedOrderQuantity) ??
    null
  );
};

const resolveStyleProcessAtTotalSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return null;
  }
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const atParams = toStyleAtParams((process as any).atParams);
  if (!atParams) return null;
  return atParams.a * resolvedOrderQuantity + atParams.b;
};

const resolveStyleProcessAtPerPieceSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const totalAt = resolveStyleProcessAtTotalSecondsForOrderQuantity(
    process,
    resolvedOrderQuantity
  );
  if (totalAt == null || !Number.isFinite(totalAt) || totalAt <= 0) return null;
  return totalAt / resolvedOrderQuantity;
};

const resolveStyleProcessAtPerPieceSecondsForReferenceQuantity = (process: any) => {
  const referenceQuantity = toPositiveInt(
    (process as any)?.timeRefQuantity ?? (process as any)?.referenceQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  return resolveStyleProcessAtPerPieceSecondsForOrderQuantity(
    process,
    referenceQuantity
  );
};

const isSameStyleAtParams = (
  left: StyleAtParams | null,
  right: StyleAtParams | null
) => {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  const sameNumberArray = (leftValues: number[], rightValues: number[]) =>
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index]);
  return (
    left.a === right.a &&
    left.b === right.b &&
    left.version === right.version &&
    left.updatedAt === right.updatedAt &&
    left.trainedPeriod === right.trainedPeriod &&
    left.attendanceCoverage === right.attendanceCoverage &&
    left.attendanceFallbackShare === right.attendanceFallbackShare &&
    left.observationCount === right.observationCount &&
    left.fitStatus === right.fitStatus &&
    left.isProvisional === right.isProvisional &&
    left.fallbackReason === right.fallbackReason &&
    left.weightedPointCount === right.weightedPointCount &&
    left.distinctQuantityCount === right.distinctQuantityCount &&
    left.distinctEventCount === right.distinctEventCount &&
    left.distinctSourceGroupCount === right.distinctSourceGroupCount &&
    left.minQuantity === right.minQuantity &&
    left.maxQuantity === right.maxQuantity &&
    left.minEventCount === right.minEventCount &&
    left.maxEventCount === right.maxEventCount &&
    sameNumberArray(left.quantitySamples, right.quantitySamples) &&
    sameNumberArray(left.eventCountSamples, right.eventCountSamples)
  );
};

const clampAtSlopeByMonthlyChange = (
  nextAInput: number,
  currentAtParams: StyleAtParams | null,
  options: { observationCount?: number | null } = {}
): number => {
  const nextA = toOptionalSeconds(nextAInput);
  if (nextA == null) return nextAInput;
  if (!currentAtParams || currentAtParams.a <= 0) return nextA;

  const observationCountRaw = Number(options.observationCount);
  const observationCount =
    Number.isFinite(observationCountRaw) && observationCountRaw > 0
      ? Math.trunc(observationCountRaw)
      : 0;
  const currentA = currentAtParams.a;
  const divergenceRatio = Math.max(
    nextA / currentA,
    currentA / Math.max(nextA, Number.EPSILON)
  );
  if (
    observationCount >= AT_MONTHLY_A_CLAMP_BREAKOUT_MIN_OBSERVATIONS &&
    Number.isFinite(divergenceRatio) &&
    divergenceRatio >= AT_MONTHLY_A_CLAMP_BREAKOUT_RATIO
  ) {
    return nextA;
  }

  const minA = currentA * (1 - AT_MONTHLY_A_CLAMP_RATIO);
  const maxA = currentA * (1 + AT_MONTHLY_A_CLAMP_RATIO);
  return roundToScale(Math.min(maxA, Math.max(minA, nextA)), 4);
};

const resolveOnboardingRequesterEmail = (req: Request, fallbackEmail?: unknown) => {
  const requesterEmail = normalizeEmail(getRequesterEmail(req));
  const requestedEmail = normalizeEmail(fallbackEmail);
  if (requesterEmail && requestedEmail && requesterEmail !== requestedEmail) {
    throw createHttpError(403, "email does not match authenticated user");
  }
  return requesterEmail;
};

const resolveOnboardingOrganizationType = (
  value: unknown
): OrganizationTypeKey | null => {
  const token = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!token) return null;
  if (ONBOARDING_ORGANIZATION_TYPE_TOKENS[token]) {
    return ONBOARDING_ORGANIZATION_TYPE_TOKENS[token];
  }
  const normalized = token.toUpperCase() as OrganizationTypeKey;
  return ONBOARDING_ORGANIZATION_TYPE_OPTIONS.has(normalized)
    ? normalized
    : null;
};

const resolveOnboardingCountry = (value: unknown): "KR" | "VN" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "KR" || normalized === "KOREA" || normalized === "SOUTH KOREA") {
    return "KR";
  }
  if (
    normalized === "VN" ||
    normalized === "VIETNAM" ||
    normalized === "VIET NAM"
  ) {
    return "VN";
  }
  return ONBOARDING_COUNTRY_OPTIONS.has(normalized) ? (normalized as "KR" | "VN") : null;
};

const normalizeOnboardingBusinessNumber = (value: unknown) =>
  String(resolveOptionalString(value, "") || "")
    .trim()
    .replace(/[\s-]+/g, "");

const getOnboardingBusinessNumberIdentity = (value: unknown) =>
  normalizeOnboardingBusinessNumber(value).replace(/\D+/g, "");

const findOrganizationByBusinessNumberIdentity = async (
  businessNumberIdentity: string
) => {
  if (!businessNumberIdentity) return null;
  const organizations = await prisma.organization.findMany({
    where: {
      businessNumber: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      businessNumber: true,
    },
    orderBy: { id: "asc" },
  });
  return (
    organizations.find(
      (organization) =>
        getOnboardingBusinessNumberIdentity(organization.businessNumber) ===
        businessNumberIdentity
    ) ?? null
  );
};

const findPendingOnboardingRequestByBusinessNumberIdentity = async (
  businessNumberIdentity: string,
  options: { excludeRequestId?: number } = {}
) => {
  if (!businessNumberIdentity) return null;
  const pendingRequests = await prisma.onboardingRequest.findMany({
    where: {
      status: "PENDING",
      requestType: "REGISTER_ORG",
      ...(options.excludeRequestId ? { NOT: { id: options.excludeRequestId } } : {}),
    },
    select: {
      id: true,
      requesterEmail: true,
      organizationNameEn: true,
      businessNumber: true,
    },
    orderBy: { id: "desc" },
  });
  return (
    pendingRequests.find(
      (request) =>
        getOnboardingBusinessNumberIdentity(request.businessNumber) ===
        businessNumberIdentity
    ) ?? null
  );
};

const isValidOnboardingBusinessNumber = (
  country: "KR" | "VN",
  businessNumber: string
) => {
  if (country === "KR") {
    return ONBOARDING_KR_BUSINESS_NUMBER_REGEX.test(businessNumber);
  }
  if (country === "VN") {
    return ONBOARDING_VN_BUSINESS_NUMBER_REGEX.test(businessNumber);
  }
  return false;
};

const toOnboardingRequestSummary = (request: any) => ({
  id: request.id,
  requesterEmail: request.requesterEmail,
  organizationNameEn: request.organizationNameEn,
  organizationType: request.organizationType ?? null,
  country: request.country ?? null,
  companyAddress: request.companyAddress ?? null,
  businessNumber: request.businessNumber,
  contactName: request.contactName ?? null,
  contactEmail: request.contactEmail,
  contactPhone: request.contactPhone,
  status: request.status,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  approvedBy: request.approvedBy ?? null,
  approvedAt: request.approvedAt ?? null,
  rejectedBy: request.rejectedBy ?? null,
  rejectedAt: request.rejectedAt ?? null,
  rejectionReason: request.rejectionReason ?? null,
  organizationId: request.organizationId ?? null,
  organizationName: request.organization?.name ?? null,
  approvedOrganizationType: request.organization?.type ?? null,
});

const normalizeStyleProcessCodeSegment = (value: any) =>
  String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

const hashStyleProcessText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase();
};

const buildCustomStyleSpecCode = (value: any) => {
  const text = resolveOptionalString(value, null);
  if (!text) return "";
  const compact = text.replace(/\s+/g, "").toLowerCase();
  const numberMatch = compact.match(/\d+(?:\.\d+)?/);
  const numericToken = numberMatch ? numberMatch[0].replace(/\./g, "_") : "";
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

type StyleProcessCompositionEntryKind =
  | "part"
  | "target"
  | "action"
  | "spec"
  | "location"
  | "targetSpec"
  | "actionSpec";

const normalizeStyleProcessCompositionEntryKind = (
  kind: StyleProcessCompositionEntryKind
): "part" | "target" | "action" | "spec" => {
  if (kind === "location") return "part";
  if (kind === "targetSpec" || kind === "actionSpec") return "spec";
  return kind;
};

const normalizeStyleProcessCompositionEntry = (
  value: any,
  kind: StyleProcessCompositionEntryKind
) => {
  const normalizedKind = normalizeStyleProcessCompositionEntryKind(kind);
  if (value === null || value === undefined) return null;
  const fallbackText =
    typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(
          value?.label ??
            value?.nameKo ??
            value?.nameEn ??
            value?.nameVi ??
            value?.name ??
            value?.value,
          null
        )
      : resolveOptionalString(value, null);
  const codeSource =
    typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.code, null)
      : null;
  const code =
    normalizeStyleProcessCodeSegment(codeSource) ||
    (normalizedKind === "spec" ? buildCustomStyleSpecCode(fallbackText) : "");
  const label = fallbackText ?? code;
  if (!label && !code) return null;

  const nameKo =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameKo, null)
      : null) ??
    label ??
    "";
  const nameEn =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameEn, null)
      : null) ??
    label ??
    "";
  const nameVi =
    (typeof value === "object" && !Array.isArray(value)
      ? resolveOptionalString(value?.nameVi, null)
      : null) ??
    label ??
    "";

  return {
    code: code || null,
    label: label || code,
    nameKo,
    nameEn,
    nameVi,
    isCustom:
      Boolean(
        typeof value === "object" &&
          !Array.isArray(value) &&
          (value as any)?.isCustom
      ) || !codeSource,
  };
};

const normalizeStyleProcessCompositionEntries = (
  value: any,
  kind: StyleProcessCompositionEntryKind
) => {
  const entries = ensureArray(value)
    .map((item) => normalizeStyleProcessCompositionEntry(item, kind))
    .filter(Boolean);
  const used = new Set<string>();
  return entries.filter((entry) => {
    const labelText = resolveOptionalString(entry?.label, "") ?? "";
    const dedupeKey = `${resolveOptionalString(entry?.code, null) ?? ""}::${labelText.toLowerCase()}`;
    if (!dedupeKey || used.has(dedupeKey)) return false;
    used.add(dedupeKey);
    return true;
  });
};

const normalizeStyleProcessComposition = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const locationInputs = [
    ...ensureArray((value as any)?.locations),
    ...ensureArray((value as any)?.parts),
    ...(value as any)?.location ? [(value as any).location] : [],
    ...(value as any)?.part ? [(value as any).part] : [],
  ];
  const locations = normalizeStyleProcessCompositionEntries(locationInputs, "part");
  const rawTargetPairs = ensureArray((value as any)?.targetPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const targetEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.target ?? (pair as any)?.targetItem,
        "target"
      );
      const targetSpecEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.targetSpec ?? (pair as any)?.spec ?? (pair as any)?.targetSpecItem,
        "targetSpec"
      );
      if (!targetEntry && !targetSpecEntry) return null;
      return {
        target: targetEntry,
        targetSpec: targetSpecEntry,
      };
    })
    .filter(Boolean) as Array<{
    target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
    targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
  }>;

  const rawTargets = normalizeStyleProcessCompositionEntries(
    (value as any)?.targets,
    "target"
  );

  const legacySpecs = normalizeStyleProcessCompositionEntries((value as any)?.specs, "spec");
  const targetSpecInputs = [
    ...ensureArray((value as any)?.targetSpecs),
    ...(value as any)?.targetSpec ? [(value as any).targetSpec] : [],
    ...((ensureArray((value as any)?.targetSpecs).length === 0 &&
    (value as any)?.targetSpec === undefined
      ? legacySpecs
      : []) as any[]),
  ];
  const rawTargetSpecs = normalizeStyleProcessCompositionEntries(targetSpecInputs, "spec");

  const targetPairs =
    rawTargetPairs.length > 0
      ? rawTargetPairs.filter((pair) => Boolean(pair?.target))
      : (() => {
          const pairCount = Math.max(rawTargets.length, rawTargetSpecs.length);
          if (pairCount === 0) return [] as Array<{
            target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }>;
          const pairs: Array<{
            target: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            targetSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }> = [];
          for (let index = 0; index < pairCount; index += 1) {
            const targetEntry = rawTargets[index] ?? null;
            const targetSpecEntry = rawTargetSpecs[index] ?? null;
            if (!targetEntry && !targetSpecEntry) continue;
            if (!targetEntry) continue;
            pairs.push({
              target: targetEntry,
              targetSpec: targetSpecEntry,
            });
          }
          return pairs;
        })();

  const rawActionPairs = ensureArray((value as any)?.actionPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const actionEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.action ?? (pair as any)?.actionItem,
        "action"
      );
      const actionSpecEntry = normalizeStyleProcessCompositionEntry(
        (pair as any)?.actionSpec ?? (pair as any)?.spec ?? (pair as any)?.actionSpecItem,
        "actionSpec"
      );
      if (!actionEntry && !actionSpecEntry) return null;
      return {
        action: actionEntry,
        actionSpec: actionSpecEntry,
      };
    })
    .filter(Boolean) as Array<{
    action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
    actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
  }>;
  const rawActions = normalizeStyleProcessCompositionEntries(
    (value as any)?.actions,
    "action"
  );
  const actionSpecInputs = [
    ...ensureArray((value as any)?.actionSpecs),
    ...(value as any)?.actionSpec ? [(value as any).actionSpec] : [],
  ];
  const rawActionSpecs = normalizeStyleProcessCompositionEntries(actionSpecInputs, "spec");
  const actionPairs =
    rawActionPairs.length > 0
      ? rawActionPairs.filter((pair) => Boolean(pair?.action))
      : (() => {
          const pairCount = Math.max(rawActions.length, rawActionSpecs.length);
          if (pairCount === 0) return [] as Array<{
            action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }>;
          const pairs: Array<{
            action: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
            actionSpec: ReturnType<typeof normalizeStyleProcessCompositionEntry> | null;
          }> = [];
          for (let index = 0; index < pairCount; index += 1) {
            const actionEntry = rawActions[index] ?? null;
            const actionSpecEntry = rawActionSpecs[index] ?? null;
            if (!actionEntry && !actionSpecEntry) continue;
            if (!actionEntry) continue;
            pairs.push({
              action: actionEntry,
              actionSpec: actionSpecEntry,
            });
          }
          return pairs;
        })();
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

const resolveStyleProcessCompositionText = (
  entry: any,
  language: "ko" | "en" | "vi"
) => {
  if (!entry || typeof entry !== "object") return "";
  if (language === "ko") {
    return resolveOptionalString(entry?.nameKo ?? entry?.label ?? entry?.code, "") ?? "";
  }
  if (language === "vi") {
    return resolveOptionalString(entry?.nameVi ?? entry?.label ?? entry?.code, "") ?? "";
  }
  return resolveOptionalString(entry?.nameEn ?? entry?.label ?? entry?.code, "") ?? "";
};

const buildStyleProcessNameFromComposition = (
  composition: any,
  language: "ko" | "en" | "vi",
  fallback: any = null
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) {
    return resolveOptionalString(fallback, null);
  }

  const locationText = normalizedComposition.locations
    .map((entry: any) => resolveStyleProcessCompositionText(entry, language))
    .filter(Boolean)
    .join("·");
  const targetPairs = ensureArray((normalizedComposition as any)?.targetPairs);
  const targetWithSpec = targetPairs
    .map((pair: any) => {
      const targetText = resolveStyleProcessCompositionText(pair?.target, language);
      const targetSpecText = resolveStyleProcessCompositionText(
        pair?.targetSpec,
        language
      );
      if (targetText) {
        return `${targetText}${targetSpecText ? `(${targetSpecText})` : ""}`;
      }
      if (targetSpecText) return `(${targetSpecText})`;
      return "";
    })
    .filter(Boolean)
    .join(" + ");
  const actionPairs = ensureArray((normalizedComposition as any)?.actionPairs);
  const actionWithSpec = actionPairs
    .map((pair: any) => {
      const actionText = resolveStyleProcessCompositionText(pair?.action, language);
      const actionSpecText = resolveStyleProcessCompositionText(pair?.actionSpec, language);
      if (actionText) {
        return `${actionText}${actionSpecText ? `(${actionSpecText})` : ""}`;
      }
      if (actionSpecText) return `(${actionSpecText})`;
      return "";
    })
    .filter(Boolean)
    .join(" + ");
  const leftText =
    locationText && targetWithSpec
      ? `${locationText}: ${targetWithSpec}`
      : locationText || targetWithSpec;
  const baseText =
    leftText && actionWithSpec
      ? `${leftText} - ${actionWithSpec}`
      : leftText || actionWithSpec;
  if (!baseText) {
    return resolveOptionalString(fallback, null);
  }
  return baseText;
};

const buildStyleProcessLocalizedNamesFromComposition = (
  composition: any,
  fallback: {
    name?: any;
    nameKo?: any;
    nameEn?: any;
    nameVi?: any;
  } = {}
) => ({
  nameKo:
    buildStyleProcessNameFromComposition(composition, "ko", fallback.nameKo ?? fallback.name) ?? "",
  nameEn:
    buildStyleProcessNameFromComposition(composition, "en", fallback.nameEn ?? fallback.name) ?? "",
  nameVi:
    buildStyleProcessNameFromComposition(composition, "vi", fallback.nameVi ?? fallback.name) ?? "",
});

const buildStyleProcessCodeFromComposition = (
  composition: any,
  fallback: any = null
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) {
    return normalizeStyleProcessCodeSegment(fallback);
  }
  const tokens = [
    ...normalizedComposition.locations.map((entry: any) =>
      resolveOptionalString(entry?.code, null)
    ),
    ...ensureArray((normalizedComposition as any)?.targetPairs).flatMap((pair: any) => [
      resolveOptionalString(pair?.target?.code, null),
      resolveOptionalString(pair?.targetSpec?.code, null) ||
        buildCustomStyleSpecCode(pair?.targetSpec?.label),
    ]),
    ...ensureArray((normalizedComposition as any)?.actionPairs).flatMap((pair: any) => [
      resolveOptionalString(pair?.action?.code, null),
      resolveOptionalString(pair?.actionSpec?.code, null) ||
        buildCustomStyleSpecCode(pair?.actionSpec?.label),
    ]),
  ]
    .map((token) => normalizeStyleProcessCodeSegment(token))
    .filter(Boolean);

  if (tokens.length > 0) return tokens.join("_");
  return normalizeStyleProcessCodeSegment(fallback);
};

const resolveStyleProcessDisplayCode = (value: any) => {
  const normalized = normalizeStyleProcessCodeSegment(value);
  return normalized || null;
};

const resolveStyleProcessVisibleCode = (
  rowProcessCode: any,
  displayProcess: any = null
) => {
  if (
    displayProcess &&
    typeof displayProcess === "object" &&
    !Array.isArray(displayProcess)
  ) {
    const displayCode = resolveStyleProcessDisplayCode((displayProcess as any).code);
    if (displayCode) return displayCode;
    if ("code" in (displayProcess as any)) return null;
  }
  return resolveOptionalString(rowProcessCode, null);
};

const normalizeStyleProcess = (process: any) => {
  if (!process || typeof process !== "object" || Array.isArray(process)) {
    return process;
  }
  const {
    st: _legacySt,
    processQuantity: _legacyProcessQuantity,
    quantity: _legacyQuantity,
    timesPerPiece: _rawTimesPerPiece,
    stValues: _legacyStValues,
    stBuckets: _rawStBuckets,
    ...rest
  } = process;
  const next = { ...rest };
  const explicitManualName = resolveOptionalString(
    (next as any).manualName ?? (next as any).processText,
    null
  );
  if (explicitManualName) {
    (next as any).manualName = explicitManualName;
  } else if ("manualName" in next) {
    delete (next as any).manualName;
  }
  if ("processText" in next) {
    delete (next as any).processText;
  }
  const normalizedDisplayCode = resolveStyleProcessDisplayCode((next as any).code);
  if (normalizedDisplayCode) {
    (next as any).code = normalizedDisplayCode;
  } else if ("code" in next) {
    (next as any).code = null;
  }
  const normalizedStorageCode = resolveStyleProcessDisplayCode(
    (next as any).storageCode
  );
  if (normalizedStorageCode) {
    (next as any).storageCode = normalizedStorageCode;
  } else if ("storageCode" in next) {
    (next as any).storageCode = null;
  }
  const normalizedComposition = normalizeStyleProcessComposition(
    (next as any).processComposition
  );
  const hasStructuredComposition =
    normalizedComposition !== null &&
    (ensureArray((normalizedComposition as any)?.locations).length > 0 ||
      ensureArray((normalizedComposition as any)?.targetPairs).length > 0 ||
      ensureArray((normalizedComposition as any)?.actionPairs).length > 0);
  if (normalizedComposition) {
    (next as any).processComposition = normalizedComposition;
    if (explicitManualName) {
      (next as any).name = explicitManualName;
      (next as any).nameKo = explicitManualName;
      (next as any).nameEn = explicitManualName;
      (next as any).nameVi = explicitManualName;
    } else {
      const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
        normalizedComposition,
        {
          name: (next as any).name,
          nameKo: (next as any).nameKo,
          nameEn: (next as any).nameEn,
          nameVi: (next as any).nameVi,
        }
      );
      (next as any).name = localizedNames.nameEn || (next as any).name;
      (next as any).nameKo = localizedNames.nameKo;
      (next as any).nameEn = localizedNames.nameEn;
      (next as any).nameVi = localizedNames.nameVi;
    }

    // Legacy rows with 4+ actions exceed current UI constraints (max 3).
    const hasTooManyActions =
      ensureArray((normalizedComposition as any)?.actionPairs).length > 3;
    if (hasTooManyActions) {
      const existingDescription = resolveOptionalString((next as any).description, "") ?? "";
      const normalizedDescription = existingDescription.trim();
      const reviewMessage =
        "Legacy process has more than 3 actions. Please review and split if needed.";
      if (!normalizedDescription) {
        (next as any).description = `[REVIEW] ${reviewMessage}`;
      } else if (!normalizedDescription.startsWith("[REVIEW]")) {
        (next as any).description = `[REVIEW] ${normalizedDescription}`;
      }
      (next as any).needsReview = true;
      (next as any).reviewComment =
        (resolveOptionalString((next as any).reviewComment, null) ??
          resolveOptionalString((next as any).description, null) ??
          reviewMessage)
          .replace(/^\[REVIEW\]\s*/i, "")
          .trim();
    }
  } else if ("processComposition" in next) {
    delete (next as any).processComposition;
  }
  if (explicitManualName) {
    (next as any).name = explicitManualName;
    (next as any).nameKo = explicitManualName;
    (next as any).nameEn = explicitManualName;
    (next as any).nameVi = explicitManualName;
  }
  const normalizedStBuckets = normalizeStyleProcessStBuckets(
    _rawStBuckets ?? _legacyStValues
  );
  const resolvedTimeRefQuantity = toPositiveInt(
    (next as any).timeRefQuantity ??
      (next as any).referenceQuantity ??
      normalizedStBuckets[0]?.bucketQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const exactStBucket = findStyleProcessExactStBucket(
    normalizedStBuckets,
    resolvedTimeRefQuantity
  );
  if ("pt" in next) next.pt = toOptionalProcessSeconds(next.pt);
  next.ct = exactStBucket?.bucketStSeconds ?? toOptionalProcessSeconds(next.ct);
  const normalizedAtParams = toStyleAtParams((next as any).atParams);
  if (normalizedAtParams) {
    (next as any).atParams = normalizedAtParams;
  } else if ("atParams" in next) {
    delete (next as any).atParams;
  }
  if ("at" in next) {
    delete (next as any).at;
  }
  if (normalizedStBuckets.length > 0) {
    (next as any).stBuckets = normalizedStBuckets;
  } else if ("stBuckets" in next) {
    delete (next as any).stBuckets;
  }
  if ("stValues" in next) {
    delete (next as any).stValues;
  }
  next.timeRefQuantity = resolvedTimeRefQuantity;
  next.stManual =
    exactStBucket !== null ||
    (typeof next.stManual === "boolean" ? next.stManual && normalizedStBuckets.length > 0 : false);
  if ("referenceQuantity" in next) {
    delete (next as any).referenceQuantity;
  }
  next.timesPerPiece = hasStructuredComposition
    ? toPositiveInt(_rawTimesPerPiece ?? _legacyQuantity ?? _legacyProcessQuantity, 1)
    : 1;
  if ("quantity" in next) {
    delete (next as any).quantity;
  }
  if ("processQuantity" in next) {
    delete (next as any).processQuantity;
  }
  return next;
};

const normalizeStyleProcesses = (value: any) =>
  ensureArray(value).map((process) => normalizeStyleProcess(process));

const resolveStyleProcessExactStPerPieceSeconds = (
  process: any,
  orderQuantity = 1
) => {
  const normalized = normalizeStyleProcess(process);
  const exactStBucket = findStyleProcessExactStBucket(
    ensureArray((normalized as any)?.stBuckets) as StyleStBucket[],
    orderQuantity
  );
  if (exactStBucket) return exactStBucket.bucketStSeconds;

  return null;
};

type StyleProcessDuplicateIdentity = {
  identityKey: string;
  firstIndex: number;
  duplicateIndex: number;
};

const getStyleProcessIdentityKey = (process: any): string => {
  const codeKey = normalizeProcessCodeKey(process?.code);
  if (codeKey) return `code:${codeKey}`;
  const nameKey = normalizeProcessNameKey(process?.name);
  if (nameKey) return `name:${nameKey}`;
  return "";
};

const findStyleProcessDuplicateIdentity = (
  processes: any[]
): StyleProcessDuplicateIdentity | null => {
  const firstIndexByIdentity = new Map<string, number>();
  for (let index = 0; index < processes.length; index += 1) {
    const identityKey = getStyleProcessIdentityKey(processes[index]);
    if (!identityKey) continue;
    const firstIndex = firstIndexByIdentity.get(identityKey);
    if (firstIndex !== undefined) {
      return {
        identityKey,
        firstIndex,
        duplicateIndex: index,
      };
    }
    firstIndexByIdentity.set(identityKey, index);
  }
  return null;
};

const createStyleProcessDuplicateError = (
  duplicate: StyleProcessDuplicateIdentity,
  scope = "processes"
) =>
  `${scope} contains duplicate process entries (${duplicate.identityKey}, first index ${duplicate.firstIndex}, duplicate index ${duplicate.duplicateIndex})`;

const normalizeProcessCodeKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const normalizeProcessNameKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const toStyleProcessMetricKey = (
  styleKey: string,
  type: "code" | "name",
  value: string
) => `${styleKey}::${type}:${value}`;

const collectPositiveIntSet = (...values: any[]) =>
  Array.from(
    new Set(
      values
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const resolveWorkOrderItemStyleId = (item: any) =>
  toPositiveIntOrNull(item?.style?.id ?? item?.styleId);
const resolveWorkOrderItemStyleCode = (item: any) =>
  resolveOptionalString(item?.style?.code ?? item?.styleCode, null);
const resolveWorkOrderItemStyleName = (item: any) =>
  resolveOptionalString(item?.style?.name ?? item?.styleName, null);
const resolveWorkOrderItemColorName = (item: any) =>
  resolveOptionalString(item?.color?.name ?? item?.colorName, null) ??
  resolveOptionalString(item?.color?.code ?? item?.colorCode, null) ??
  "";
// resolveAssignmentPlanColorName was retired in Phase D
// (AssignmentCard/AssignmentPlan FK+join redesign) along with
// AssignmentPlan.colorId/colorName - color/gender were never tracked at the
// assignment level.

const resolveStyleSyncTargetOrgIds = async (orgId: number) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, type: true },
  });
  if (!org) return [orgId];

  const targetOrgIds = new Set<number>([org.id]);

  if (org.type === "MANUFACTURER") {
    const relationships = await prisma.orgRelationship.findMany({
      where: { manufacturerOrgId: org.id },
      select: { brandOrgId: true },
    });
    relationships.forEach((relationship) => {
      const brandOrgId = Number(relationship?.brandOrgId);
      if (Number.isSafeInteger(brandOrgId) && brandOrgId > 0) {
        targetOrgIds.add(brandOrgId);
      }
    });
  } else if (org.type === "BRAND") {
    const relationships = await prisma.orgRelationship.findMany({
      where: { brandOrgId: org.id },
      select: { manufacturerOrgId: true },
    });
    relationships.forEach((relationship) => {
      const manufacturerOrgId = Number(relationship?.manufacturerOrgId);
      if (Number.isSafeInteger(manufacturerOrgId) && manufacturerOrgId > 0) {
        targetOrgIds.add(manufacturerOrgId);
      }
    });
  }

  return Array.from(targetOrgIds.values());
};

type AtSyncRunOptions = {
  trainingMonthKey?: string | null;
  debug?: boolean;
};

const resolveAtSyncTrainingMonthKey = (options: AtSyncRunOptions = {}) => {
  const override = normalizeMonthKey(options.trainingMonthKey);
  if (override) return override;
  return resolveAtTrainingMonthKey({
    now: new Date(),
    timeZone: BUSINESS_TIME_ZONE,
    cutoffDay: AT_TRAINING_CUTOFF_DAY,
  });
};

type AtTrainingBucketStoreClient = Prisma.TransactionClient | typeof prisma;
type AtTrainingMetricQuality = {
  totalQuantity: number;
  weightedCoverageQuantity: number;
  observationCount: number;
};
type AtTrainingBucketProcessDraft = {
  styleId: number;
  styleProcessId: number;
  assignmentPlanId: number | null;
  sourceGroupKey: string;
  quantity: number;
  eventCount: number;
};
type AtTrainingBucketDraft = {
  sourceWorkLogId: number;
  workerId: number;
  monthKey: string;
  workDate: string;
  factoryId: number | null;
  laborInputSeconds: number;
  attendanceCoverage: number | null;
  processRows: AtTrainingBucketProcessDraft[];
  diagnosticRecordCount?: number;
  diagnosticActualSeconds?: number;
  diagnosticFallbackSeconds?: number;
  diagnosticActualWorkerDayCount?: number;
  diagnosticFallbackWorkerDayCount?: number;
};
type AtTrainingSourceDiagnosticSample = {
  workLogId: number | null;
  workerId: number | null;
  styleId: number | null;
  styleCode: string | null;
  processCode: string | null;
  processName: string | null;
  quantity: number;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  workDate?: string | null;
  reason: string;
};
type AtTrainingSourceDiagnostics = {
  trainingMonthKey: string | null;
  sourceWorkLogCount: number;
  sourceWorkRecordCount: number;
  filteredWorkLogCount: number;
  filteredWorkRecordCount: number;
  includedWorkLogCount: number;
  includedWorkRecordCount: number;
  excludedWorkLogCount: number;
  excludedWorkRecordCount: number;
  draftCount: number;
  eligibleWorkerCount: number;
  attendanceRowCount: number;
  actualAttendanceWorkerDayCount: number;
  fallbackAttendanceWorkerDayCount: number;
  actualLaborInputSeconds: number;
  fallbackLaborInputSeconds: number;
  fullFallbackWorkerWorkLogCount: number;
  partialFallbackWorkerWorkLogCount: number;
  incompleteAttendanceWorkerDayCount: number;
  ambiguousOverlappingWorkerDayCount: number;
  ambiguousOverlapExcludedWorkerBucketCount: number;
  ambiguousOverlapExcludedRecordCount: number;
  fallbackAppliedWorkLogCount: number;
  noEligibleWorkingDayExcludedRecordCount: number;
  skippedBeforeAttendanceCoverageWorkLogCount: number;
  skippedInvalidWorkLogCount: number;
  partialMissingAttendanceWorkLogCount: number;
  skippedNoUsableRowsWorkLogCount: number;
  skippedNoLaborInputWorkLogCount: number;
  excludedStyleNotResolvedRecordCount: number;
  excludedProcessNotResolvedRecordCount: number;
  excludedCoverageInvalidRecordCount: number;
  excludedMissingWorkerRecordCount: number;
  excludedIneligibleWorkerRecordCount: number;
  excludedMissingAttendanceRecordCount: number;
  earlyExitStage: string | null;
  rawStyleIdCount: number;
  rawStyleIdSamples: number[];
  styleCandidateCount: number;
  styleCandidateSamples: Array<{
    id: number | null;
    orgId: number | null;
    code: string | null;
    name: string | null;
  }>;
  sampleExcludedRecords: AtTrainingSourceDiagnosticSample[];
  incompleteAttendanceSamples: Array<{
    workerId: number;
    factoryId: number;
    workDate: string;
  }>;
  ambiguousOverlappingWorkerDaySamples: Array<{
    workerId: number;
    workDate: string;
    workLogIds: number[];
  }>;
};
type AtTrainingBucketBuildResult = {
  drafts: AtTrainingBucketDraft[];
  diagnostics: AtTrainingSourceDiagnostics;
};

const createAtTrainingSourceDiagnostics = (
  trainingMonthKey: string | null
): AtTrainingSourceDiagnostics => ({
  trainingMonthKey,
  sourceWorkLogCount: 0,
  sourceWorkRecordCount: 0,
  filteredWorkLogCount: 0,
  filteredWorkRecordCount: 0,
  includedWorkLogCount: 0,
  includedWorkRecordCount: 0,
  excludedWorkLogCount: 0,
  excludedWorkRecordCount: 0,
  draftCount: 0,
  eligibleWorkerCount: 0,
  attendanceRowCount: 0,
  actualAttendanceWorkerDayCount: 0,
  fallbackAttendanceWorkerDayCount: 0,
  actualLaborInputSeconds: 0,
  fallbackLaborInputSeconds: 0,
  fullFallbackWorkerWorkLogCount: 0,
  partialFallbackWorkerWorkLogCount: 0,
  incompleteAttendanceWorkerDayCount: 0,
  ambiguousOverlappingWorkerDayCount: 0,
  ambiguousOverlapExcludedWorkerBucketCount: 0,
  ambiguousOverlapExcludedRecordCount: 0,
  fallbackAppliedWorkLogCount: 0,
  noEligibleWorkingDayExcludedRecordCount: 0,
  skippedBeforeAttendanceCoverageWorkLogCount: 0,
  skippedInvalidWorkLogCount: 0,
  partialMissingAttendanceWorkLogCount: 0,
  skippedNoUsableRowsWorkLogCount: 0,
  skippedNoLaborInputWorkLogCount: 0,
  excludedStyleNotResolvedRecordCount: 0,
  excludedProcessNotResolvedRecordCount: 0,
  excludedCoverageInvalidRecordCount: 0,
  excludedMissingWorkerRecordCount: 0,
  excludedIneligibleWorkerRecordCount: 0,
  excludedMissingAttendanceRecordCount: 0,
  earlyExitStage: null,
  rawStyleIdCount: 0,
  rawStyleIdSamples: [],
  styleCandidateCount: 0,
  styleCandidateSamples: [],
  sampleExcludedRecords: [],
  incompleteAttendanceSamples: [],
  ambiguousOverlappingWorkerDaySamples: [],
});

const pushAtTrainingSourceDiagnosticSample = (
  diagnostics: AtTrainingSourceDiagnostics,
  sample: AtTrainingSourceDiagnosticSample
) => {
  if (diagnostics.sampleExcludedRecords.length >= 30) return;
  diagnostics.sampleExcludedRecords.push(sample);
};

const toAtTrainingStyleProcessMetricKey = (styleProcessId: number) =>
  `STYLE_PROCESS:${styleProcessId}`;

const toAtTrainingSourceGroupKey = ({
  assignmentPlanId = null,
  styleProcessId = null,
}: {
  assignmentPlanId?: unknown;
  styleProcessId?: unknown;
}) => {
  const normalizedAssignmentPlanId = toPositiveIntOrNull(assignmentPlanId);
  if (normalizedAssignmentPlanId !== null) {
    return `assignmentPlan:${normalizedAssignmentPlanId}`;
  }
  const normalizedStyleProcessId = toPositiveIntOrNull(styleProcessId);
  if (normalizedStyleProcessId !== null) {
    return `missingAssignmentPlan:process:${normalizedStyleProcessId}`;
  }
  return "missingAssignmentPlan";
};

const AT_SYNC_RUNTIME_MARKER = "at-sync-runtime-2026-07-22-6";

const loadAtTrainingSourceWorkLogs = async ({
  orgId,
  trainingMonthKey = null,
  workLogIds = [],
  workDate = null,
  factoryId = null,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey?: string | null;
  workLogIds?: number[];
  workDate?: string | null;
  factoryId?: number | null;
  db?: AtTrainingBucketStoreClient;
}) => {
  const normalizedWorkLogIds = Array.from(
    new Set(
      ensureArray(workLogIds)
        .map((workLogId) => toPositiveIntOrNull(workLogId))
        .filter((workLogId): workLogId is number => workLogId !== null)
    )
  );
  const where: Prisma.WorkLogWhereInput = { orgId };
  if (normalizedWorkLogIds.length > 0) {
    where.id = { in: normalizedWorkLogIds };
  } else {
    const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
    const normalizedWorkDate = normalizeDateKey(workDate);
    const normalizedFactoryId = toPositiveIntOrNull(factoryId);
    if (normalizedTrainingMonthKey) {
      where.displayDate = { startsWith: normalizedTrainingMonthKey };
    } else if (normalizedWorkDate) {
      where.displayDate = normalizedWorkDate;
    }
    if (normalizedFactoryId !== null) {
      where.factoryId = normalizedFactoryId;
    }
  }

  try {
    return await db.workLog.findMany({
      where,
      select: {
        id: true,
        displayDate: true,
        coverageStartDate: true,
        coverageEndDate: true,
        entryMode: true,
        factoryId: true,
        workerCount: true,
        workRecords: {
          where: {
            quantity: { gt: 0 },
            styleId: { not: null },
          },
          select: {
            workerId: true,
            assignmentPlanId: true,
            styleId: true,
            styleProcessId: true,
            style: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            assignmentPlan: {
              select: {
                // orderNo/customer dropped in Phase E - workOrder.orderNumber
                // is the only source now (customer itself was already unused
                // here).
                workOrder: { select: { orderNumber: true } },
              },
            },
            styleProcess: {
              select: {
                processCode: true,
                processName: true,
              },
            },
            quantity: true,
            effectiveCoverageStartDate: true,
            effectiveCoverageEndDate: true,
          },
        },
      },
      orderBy: [{ displayDate: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    return db.workLog.findMany({
      where,
      select: {
        id: true,
        displayDate: true,
        factoryId: true,
        workerCount: true,
        workRecords: {
          where: {
            quantity: { gt: 0 },
            styleId: { not: null },
          },
          select: {
            workerId: true,
            assignmentPlanId: true,
            styleId: true,
            styleProcessId: true,
            style: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            assignmentPlan: {
              select: {
                // orderNo/customer dropped in Phase E - workOrder.orderNumber
                // is the only source now (customer itself was already unused
                // here).
                workOrder: { select: { orderNumber: true } },
              },
            },
            styleProcess: {
              select: {
                processCode: true,
                processName: true,
              },
            },
            quantity: true,
            effectiveCoverageStartDate: true,
            effectiveCoverageEndDate: true,
          },
        },
      },
      orderBy: [{ displayDate: "asc" }, { id: "asc" }],
    });
  }
};

const buildAtTrainingBucketDraftsFromRawSource = async ({
  orgId,
  trainingMonthKey = null,
  workLogIds = [],
  workDate = null,
  factoryId = null,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey?: string | null;
  workLogIds?: number[];
  workDate?: string | null;
  factoryId?: number | null;
  db?: AtTrainingBucketStoreClient;
}): Promise<AtTrainingBucketBuildResult> => {
  const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
  const diagnostics = createAtTrainingSourceDiagnostics(
    normalizedTrainingMonthKey || null
  );
  const workLogs = await loadAtTrainingSourceWorkLogs({
    orgId,
    trainingMonthKey,
    workLogIds,
    workDate,
    factoryId,
    db,
  });
  diagnostics.sourceWorkLogCount = workLogs.length;
  diagnostics.sourceWorkRecordCount = workLogs.reduce(
    (sum, workLog) => sum + ensureArray((workLog as any)?.workRecords).length,
    0
  );
  if (workLogs.length === 0) {
    diagnostics.earlyExitStage = "NO_WORK_LOGS";
    return { drafts: [], diagnostics };
  }
  const normalizedRequestedWorkDate = normalizeDateKey(workDate);
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(
    workLogs.flatMap((workLog) => ensureArray((workLog as any)?.workRecords))
  );
  const styleMetaByPlanId = await resolveAssignmentPlanStyleMetaById({
    orgId,
    assignmentPlanIds,
    db,
  });
  const normalizedWorkLogs = workLogs.map((workLog) => ({
    ...workLog,
    workRecords: ensureArray((workLog as any)?.workRecords).map((record) => {
      const assignmentPlanId = toPositiveIntOrNull((record as any)?.assignmentPlanId);
      const planStyleMeta =
        assignmentPlanId !== null ? styleMetaByPlanId.get(assignmentPlanId) ?? null : null;
      const recordStyleRefId = resolveWorkRecordStyleRefId(record);
      return {
        ...record,
        orderNo: resolveOptionalString(
          (record as any)?.assignmentPlan?.workOrder?.orderNumber,
          null
        ),
        styleId: planStyleMeta?.styleId ?? recordStyleRefId,
        styleCode: resolveOptionalString(
          planStyleMeta?.styleCode ?? (record as any)?.style?.code,
          null
        ),
        styleName: resolveOptionalString(
          planStyleMeta?.styleName ?? (record as any)?.style?.name,
          null
        ),
        processCode: resolveWorkRecordProcessCode(record),
      };
    }),
  }));

  const styleIds = Array.from(
    new Set(
      normalizedWorkLogs
        .flatMap((item) => item.workRecords)
        .map((record) => toPositiveIntOrNull((record as any).styleId))
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  diagnostics.rawStyleIdCount = styleIds.length;
  diagnostics.rawStyleIdSamples = styleIds.slice(0, 20);
  if (styleIds.length === 0) {
    diagnostics.earlyExitStage = "NO_STYLE_KEYS";
    return { drafts: [], diagnostics };
  }

  const syncTargetOrgIds = await resolveStyleSyncTargetOrgIds(orgId);
  const styleCandidates = await db.style.findMany({
    where: {
      orgId: { in: syncTargetOrgIds },
      OR: [
        ...(styleIds.length > 0 ? [{ id: { in: styleIds } }] : []),
      ],
    },
    select: {
      id: true,
      orgId: true,
      code: true,
      name: true,
      processes: true,
      organization: {
        select: { id: true, name: true, nameKo: true, nameVi: true },
      },
    },
  });
  diagnostics.styleCandidateCount = styleCandidates.length;
  diagnostics.styleCandidateSamples = styleCandidates.slice(0, 20).map((style) => ({
    id: toPositiveIntOrNull(style?.id),
    orgId: toPositiveIntOrNull(style?.orgId),
    code: resolveOptionalString(style?.code, null),
    name: resolveOptionalString(style?.name, null),
  }));
  if (styleCandidates.length === 0) {
    diagnostics.earlyExitStage = "NO_STYLE_CANDIDATES";
    return { drafts: [], diagnostics };
  }

  await ensureStyleProcessStorageForStyles(styleCandidates, {
    processOrgId: orgId,
    db,
  });
  const styleProcessRowsByStyleId = await loadStyleProcessRowsByStyleId(
    styleCandidates.map((style) => Number(style.id)),
    { processOrgId: orgId, db }
  );

  const stylesById = new Map(
    styleCandidates.map((style) => [Number(style.id), style])
  );
  const styleProcessRowsById = new Map<number, any>();
  Array.from(styleProcessRowsByStyleId.values())
    .flat()
    .forEach((processRow) => {
      const styleProcessId = toPositiveIntOrNull(processRow?.id);
      if (styleProcessId === null) return;
      styleProcessRowsById.set(styleProcessId, processRow);
    });

  const resolveCandidateStyle = (record: { styleId?: any }) => {
    const directStyleId = toPositiveIntOrNull((record as any).styleId);
    return directStyleId !== null ? stylesById.get(directStyleId) ?? null : null;
  };

  const workerIds = Array.from(
    new Set(
      normalizedWorkLogs
        .flatMap((workLog) => workLog.workRecords)
        .map((record) => toPositiveIntOrNull(record.workerId))
        .filter((workerId): workerId is number => workerId !== null)
    )
  );
  const eligibleWorkerDateWindowById = new Map<
    number,
    {
      joinedDateKey: string;
      leftDateKey: string;
      leaveStartDateKey: string;
      leaveEndDateKey: string;
    }
  >();
  const workerEligibilityFailureReasonById = new Map<number, string>();
  if (workerIds.length > 0) {
    const workerRows = await db.employee.findMany({
      where: {
        orgId,
        id: { in: workerIds },
      },
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        leaveStartAt: true,
        leaveEndAt: true,
        orgRole: true,
        status: true,
        role: {
          select: {
            code: true,
          },
        },
      },
    });
    workerRows.forEach((worker) => {
      const workerId = toPositiveIntOrNull(worker.id);
      if (workerId === null) return;
      if (worker.orgRole !== "WORKER") {
        workerEligibilityFailureReasonById.set(workerId, "WORKER_ORG_ROLE_NOT_ELIGIBLE");
        return;
      }
      if (!["ACTIVE", "TERMINATED"].includes(String(worker.status))) {
        workerEligibilityFailureReasonById.set(workerId, "WORKER_STATUS_NOT_ELIGIBLE");
        return;
      }
      const workerRoleCode = String(worker.role?.code ?? "").trim().toUpperCase();
      if (workerRoleCode !== DEFAULT_EMPLOYEE_ROLE_CODE_SEWING) {
        workerEligibilityFailureReasonById.set(workerId, "WORKER_FIELD_ROLE_NOT_ELIGIBLE");
        return;
      }
      eligibleWorkerDateWindowById.set(workerId, {
        joinedDateKey: toDateKeyInTimeZone(worker.joinedAt, BUSINESS_TIME_ZONE),
        leftDateKey: toDateKeyInTimeZone(worker.leftAt, BUSINESS_TIME_ZONE),
        leaveStartDateKey: toDateKeyInTimeZone(
          worker.leaveStartAt,
          BUSINESS_TIME_ZONE
        ),
        leaveEndDateKey: toDateKeyInTimeZone(
          worker.leaveEndAt,
          BUSINESS_TIME_ZONE
        ),
      });
    });
  }
  diagnostics.eligibleWorkerCount = eligibleWorkerDateWindowById.size;
  const isEligibleWorkerOnDate = (
    workerId: number | null,
    normalizedWorkDate: string
  ): workerId is number => {
    if (workerId === null || !normalizedWorkDate) return false;
    const eligibility = eligibleWorkerDateWindowById.get(workerId);
    if (!eligibility) return false;
    if (eligibility.joinedDateKey && normalizedWorkDate < eligibility.joinedDateKey) {
      return false;
    }
    if (eligibility.leftDateKey && normalizedWorkDate > eligibility.leftDateKey) {
      return false;
    }
    return true;
  };

  const isWorkerOnLeaveDate = (
    workerId: number | null,
    normalizedWorkDate: string
  ): boolean => {
    if (workerId === null || !normalizedWorkDate) return false;
    const eligibility = eligibleWorkerDateWindowById.get(workerId);
    if (!eligibility?.leaveStartDateKey) return false;
    if (normalizedWorkDate < eligibility.leaveStartDateKey) return false;
    return (
      !eligibility.leaveEndDateKey ||
      normalizedWorkDate <= eligibility.leaveEndDateKey
    );
  };

  const attendanceSecondsByWorkerDate = new Map<string, number>();
  const explicitAttendanceWorkerDateKeys = new Set<string>();
  if (USE_ATTENDANCE_INPUT_FOR_AT && normalizedWorkLogs.length > 0) {
    const explicitWorkDates = Array.from(
      new Set(
        normalizedWorkLogs
          .map((workLog) => normalizeDateKey(workLog.displayDate))
          .filter((value) => value !== "")
      )
    );
    const eligibleWorkerIds = Array.from(eligibleWorkerDateWindowById.keys());
    const coverageDateRange = resolveAtAttendanceQueryDateRange(
      normalizedWorkLogs.flatMap((workLog) => [
        normalizeDateKey((workLog as any).coverageStartDate),
        normalizeDateKey((workLog as any).coverageEndDate),
        normalizeDateKey((workLog as any).displayDate),
        ...ensureArray((workLog as any).workRecords).flatMap((record) => [
          normalizeDateKey((record as any).effectiveCoverageStartDate),
          normalizeDateKey((record as any).effectiveCoverageEndDate),
        ]),
      ])
    );
    const attendanceWorkDateWhere = coverageDateRange
      ? coverageDateRange
      : normalizedRequestedWorkDate !== ""
        ? { in: [normalizedRequestedWorkDate] }
        : explicitWorkDates.length > 0
          ? { in: explicitWorkDates }
          : null;

    if (attendanceWorkDateWhere && eligibleWorkerIds.length > 0) {
      try {
        const attendanceRows = await db.attendanceEntry.findMany({
          where: {
            orgId,
            workDate: attendanceWorkDateWhere as any,
            workerId: { in: eligibleWorkerIds },
          },
          select: {
            workDate: true,
            factoryId: true,
            workerId: true,
            workedSeconds: true,
          },
        });
        diagnostics.attendanceRowCount = attendanceRows.length;
        attendanceRows.forEach((row) => {
          const normalizedWorkDate = normalizeDateKey(row.workDate);
          const resolvedFactoryId = toPositiveIntOrNull((row as any).factoryId);
          const resolvedWorkerId = toPositiveIntOrNull(row.workerId);
          const workedSeconds = toNumberOrNull(row.workedSeconds);
          if (
            !normalizedWorkDate ||
            resolvedFactoryId === null ||
            resolvedWorkerId === null ||
            !isEligibleWorkerOnDate(resolvedWorkerId, normalizedWorkDate)
          ) {
            return;
          }
          const attendanceWorkerDateKey = toAtTrainingWorkerDateKey(
            normalizedWorkDate,
            resolvedWorkerId
          );
          explicitAttendanceWorkerDateKeys.add(attendanceWorkerDateKey);
          if (workedSeconds === null) {
            diagnostics.incompleteAttendanceWorkerDayCount += 1;
            if (diagnostics.incompleteAttendanceSamples.length < 30) {
              diagnostics.incompleteAttendanceSamples.push({
                workerId: resolvedWorkerId,
                factoryId: resolvedFactoryId,
                workDate: normalizedWorkDate,
              });
            }
            return;
          }
          if (workedSeconds <= 0) {
            if (!attendanceSecondsByWorkerDate.has(attendanceWorkerDateKey)) {
              attendanceSecondsByWorkerDate.set(attendanceWorkerDateKey, 0);
            }
            return;
          }
          attendanceSecondsByWorkerDate.set(
            attendanceWorkerDateKey,
            (attendanceSecondsByWorkerDate.get(attendanceWorkerDateKey) ?? 0) +
              Math.max(0, Math.round(workedSeconds))
          );
        });
      } catch (error: unknown) {
        if (getErrorCode(error) !== "P2021") {
          throw error;
        }
        const contextMonthKey =
          normalizedTrainingMonthKey ||
          normalizeMonthKey(
            normalizedRequestedWorkDate
              ? String(normalizedRequestedWorkDate).slice(0, 7)
              : ""
          ) ||
          "mixed";
        console.warn(
          `[AT sync] orgId=${orgId} month=${contextMonthKey} attendance_table_missing=true mode=attendance_only`
        );
      }
    }
  }

  const organizationHolidayDateKeys = new Set<string>();
  try {
    const holidayRows = await db.organizationHoliday.findMany({
      where: { orgId },
      select: { holidayDate: true },
    });
    holidayRows.forEach((row) => {
      const holidayDateKey = normalizeDateKey(row.holidayDate);
      if (holidayDateKey) organizationHolidayDateKeys.add(holidayDateKey);
    });
  } catch (error: unknown) {
    if (getErrorCode(error) !== "P2021") throw error;
    console.warn(
      `[AT sync] orgId=${orgId} organization_holiday_table_missing=true`
    );
  }

  const toUtcDateFromDateKey = (dateKey: string): Date | null => {
    const parts = parseDateKeyParts(dateKey);
    if (!parts) return null;
    const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (Number.isNaN(utcDate.getTime())) return null;
    return utcDate;
  };
  const toDateKeyFromUtcDate = (date: Date): string =>
    date.toISOString().slice(0, 10);
  const shiftDateKeyByDays = (dateKey: string, days: number): string | null => {
    const baseDate = toUtcDateFromDateKey(dateKey);
    if (!baseDate) return null;
    baseDate.setUTCDate(baseDate.getUTCDate() + Math.trunc(days));
    return toDateKeyFromUtcDate(baseDate);
  };
  const countDateRangeDaysInclusive = (startDateKey: string, endDateKey: string): number => {
    const startDate = toUtcDateFromDateKey(startDateKey);
    const endDate = toUtcDateFromDateKey(endDateKey);
    if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) return 0;
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
  };

  const resolveWorkerSecondsForDate = (
    normalizedWorkDate: string,
    workerId: number | null
  ) => {
    if (!USE_ATTENDANCE_INPUT_FOR_AT) {
      return { seconds: ATTENDANCE_DEFAULT_WORK_SECONDS, source: "FALLBACK" as const };
    }
    if (workerId === null) {
      return { seconds: 0, source: "NONE" as const };
    }
    const workerDateKey = toAtTrainingWorkerDateKey(normalizedWorkDate, workerId);
    const parsedDate = toUtcDateFromDateKey(normalizedWorkDate);
    return resolveAtAttendanceDay({
      actualEntryExists: explicitAttendanceWorkerDateKeys.has(workerDateKey),
      actualWorkedSeconds: attendanceSecondsByWorkerDate.get(workerDateKey) ?? null,
      isEligibleWorker: isEligibleWorkerOnDate(workerId, normalizedWorkDate),
      isOnLeave: isWorkerOnLeaveDate(workerId, normalizedWorkDate),
      isWorkingDay:
        parsedDate !== null &&
        parsedDate.getUTCDay() !== 0 &&
        !organizationHolidayDateKeys.has(normalizedWorkDate),
      fallbackWorkSeconds: ATTENDANCE_DEFAULT_WORK_SECONDS,
    });
  };
  const resolveWorkerSecondsForPeriod = ({
    periodStartDateKey,
    periodEndDateKey,
    workerId,
  }: {
    periodStartDateKey: string;
    periodEndDateKey: string;
    workerId: number | null;
  }): {
    seconds: number;
    actualSeconds: number;
    fallbackSeconds: number;
    actualWorkerDayCount: number;
    fallbackWorkerDayCount: number;
  } => {
    const dayCount = countDateRangeDaysInclusive(periodStartDateKey, periodEndDateKey);
    const result = {
      seconds: 0,
      actualSeconds: 0,
      fallbackSeconds: 0,
      actualWorkerDayCount: 0,
      fallbackWorkerDayCount: 0,
    };
    if (dayCount <= 0 || workerId === null) return result;

    let cursorDateKey = periodStartDateKey;
    for (let offset = 0; offset < dayCount; offset += 1) {
      const resolvedDay = resolveWorkerSecondsForDate(
        cursorDateKey,
        workerId
      );
      result.seconds += resolvedDay.seconds;
      if (resolvedDay.source === "ACTUAL") {
        result.actualSeconds += resolvedDay.seconds;
        if (resolvedDay.seconds > 0) result.actualWorkerDayCount += 1;
      } else if (resolvedDay.source === "FALLBACK") {
        result.fallbackSeconds += resolvedDay.seconds;
        if (resolvedDay.seconds > 0) result.fallbackWorkerDayCount += 1;
      }
      if (offset === dayCount - 1) break;
      const nextDateKey = shiftDateKeyByDays(cursorDateKey, 1);
      if (!nextDateKey) break;
      cursorDateKey = nextDateKey;
    }
    return result;
  };
  const filteredWorkLogs = normalizedWorkLogs;
  diagnostics.filteredWorkLogCount = filteredWorkLogs.length;
  diagnostics.filteredWorkRecordCount = filteredWorkLogs.reduce(
    (sum, workLog) => sum + ensureArray((workLog as any)?.workRecords).length,
    0
  );
  diagnostics.skippedBeforeAttendanceCoverageWorkLogCount = 0;
  if (filteredWorkLogs.length === 0) {
    diagnostics.excludedWorkLogCount = diagnostics.sourceWorkLogCount;
    diagnostics.excludedWorkRecordCount = diagnostics.sourceWorkRecordCount;
    return { drafts: [], diagnostics };
  }

  const previousPeriodEndDateByFactory = new Map<string, string>();
  const overlapState = createAtTrainingOverlapState();

  const drafts = filteredWorkLogs.reduce((draftRows, workLog) => {
    const normalizedWorkDate = normalizeDateKey(workLog.displayDate);
    const normalizedCoverageEndDate =
      resolveWorkLogCoverageEndDate(workLog, normalizedWorkDate) || normalizedWorkDate;
    const monthKey = normalizeMonthKey(normalizedCoverageEndDate.slice(0, 7));
    const resolvedFactoryId = toPositiveIntOrNull((workLog as any).factoryId);
    const workLogId = toPositiveIntOrNull(workLog.id);
    if (!normalizedWorkDate || !normalizedCoverageEndDate || !monthKey || workLogId === null) {
      diagnostics.skippedInvalidWorkLogCount += 1;
      return draftRows;
    }

    const periodTrackerKey =
      resolvedFactoryId === null ? "__factory_null__" : String(resolvedFactoryId);
    const previousPeriodEndDateKey =
      previousPeriodEndDateByFactory.get(periodTrackerKey) || "";
    const monthStartDateKey = `${monthKey}-01`;
    const nextDateAfterPrevious = previousPeriodEndDateKey
      ? shiftDateKeyByDays(previousPeriodEndDateKey, 1)
      : null;
    const candidatePeriodStartDateKey = nextDateAfterPrevious || monthStartDateKey;
    const explicitCoverageStartDate =
      resolveWorkLogCoverageStartDate(workLog, normalizedCoverageEndDate) || null;
    const inferredPeriodStartDateKey =
      candidatePeriodStartDateKey <= normalizedCoverageEndDate
        ? candidatePeriodStartDateKey
        : normalizedCoverageEndDate;
    const periodStartDateKey =
      explicitCoverageStartDate && explicitCoverageStartDate <= normalizedCoverageEndDate
        ? explicitCoverageStartDate
        : inferredPeriodStartDateKey;

    const preliminaryRows = workLog.workRecords
      .map((record) => {
        const quantity = Number(record.quantity) || 0;
        if (quantity <= 0) return null;
        const workerId = toPositiveIntOrNull(record.workerId);
        const assignmentPlanId = toPositiveIntOrNull((record as any).assignmentPlanId);
        const resolvedStyle = resolveCandidateStyle(record);
        const styleProcessId = toPositiveIntOrNull(record.styleProcessId);
        const matchedStyleProcess =
          styleProcessId !== null ? styleProcessRowsById.get(styleProcessId) ?? null : null;
        const processMatchesStyle =
          matchedStyleProcess &&
          toPositiveIntOrNull(matchedStyleProcess?.styleId) ===
            toPositiveIntOrNull(resolvedStyle?.id);
        const processCode = resolveOptionalString(
          matchedStyleProcess?.processCode ?? record.processCode,
          null
        );
        const processName = resolveOptionalString(
          matchedStyleProcess?.processName ?? resolveWorkRecordProcessName(record),
          null
        );
        const effectiveCoverageStartDate =
          resolveWorkRecordEffectiveCoverageStartDate(record, workLog) || periodStartDateKey;
        const effectiveCoverageEndDate =
          resolveWorkRecordEffectiveCoverageEndDate(record, workLog) ||
          normalizedCoverageEndDate;
        const sampleBase = {
          workLogId,
          workerId,
          styleId: toPositiveIntOrNull((record as any).styleId),
          styleCode: resolveOptionalString((record as any).styleCode, null),
          processCode,
          processName,
          quantity: Math.max(0, Math.round(quantity)),
          coverageStartDate: effectiveCoverageStartDate || null,
          coverageEndDate: effectiveCoverageEndDate || null,
        };
        if (!resolvedStyle) {
          diagnostics.excludedStyleNotResolvedRecordCount += 1;
          pushAtTrainingSourceDiagnosticSample(diagnostics, {
            ...sampleBase,
            reason: "STYLE_NOT_RESOLVED",
          });
          return null;
        }
        if (styleProcessId === null || !processMatchesStyle) {
          diagnostics.excludedProcessNotResolvedRecordCount += 1;
          pushAtTrainingSourceDiagnosticSample(diagnostics, {
            ...sampleBase,
            reason: "PROCESS_NOT_RESOLVED",
          });
          return null;
        }
        if (
          !effectiveCoverageStartDate ||
          !effectiveCoverageEndDate ||
          effectiveCoverageStartDate > effectiveCoverageEndDate
        ) {
          diagnostics.excludedCoverageInvalidRecordCount += 1;
          pushAtTrainingSourceDiagnosticSample(diagnostics, {
            ...sampleBase,
            reason: "COVERAGE_INVALID",
          });
          return null;
        }
        if (workerId === null) {
          diagnostics.excludedMissingWorkerRecordCount += 1;
          pushAtTrainingSourceDiagnosticSample(diagnostics, {
            ...sampleBase,
            reason: "MISSING_WORKER",
          });
          return null;
        }
        if (
          !isEligibleWorkerOnDate(workerId, effectiveCoverageStartDate) ||
          !isEligibleWorkerOnDate(workerId, effectiveCoverageEndDate)
        ) {
          diagnostics.excludedIneligibleWorkerRecordCount += 1;
          pushAtTrainingSourceDiagnosticSample(diagnostics, {
            ...sampleBase,
            reason:
              workerEligibilityFailureReasonById.get(workerId) ||
              "WORKER_OUTSIDE_EMPLOYMENT",
          });
          return null;
        }
        return {
          styleId: Number(resolvedStyle.id),
          styleProcessId,
          assignmentPlanId,
          quantity,
          workerId,
          styleCode: sampleBase.styleCode,
          processCode,
          processName,
          effectiveCoverageStartDate,
          effectiveCoverageEndDate,
        };
      })
      .filter(Boolean) as Array<{
      styleId: number;
      styleProcessId: number;
      assignmentPlanId: number | null;
      quantity: number;
      workerId: number;
      styleCode: string | null;
      processCode: string | null;
      processName: string | null;
      effectiveCoverageStartDate: string;
      effectiveCoverageEndDate: string;
    }>;
    if (preliminaryRows.length === 0) {
      diagnostics.skippedNoUsableRowsWorkLogCount += 1;
      return draftRows;
    }

    const workerIdsForDay = new Set<number>();
    const coverageByWorkerId = new Map<number, { startDateKey: string; endDateKey: string }>();
    preliminaryRows.forEach((row) => {
      workerIdsForDay.add(row.workerId);
      const currentCoverage = coverageByWorkerId.get(row.workerId);
      if (!currentCoverage) {
        coverageByWorkerId.set(row.workerId, {
          startDateKey: row.effectiveCoverageStartDate,
          endDateKey: row.effectiveCoverageEndDate,
        });
      } else {
        currentCoverage.startDateKey =
          row.effectiveCoverageStartDate < currentCoverage.startDateKey
            ? row.effectiveCoverageStartDate
            : currentCoverage.startDateKey;
        currentCoverage.endDateKey =
          row.effectiveCoverageEndDate > currentCoverage.endDateKey
            ? row.effectiveCoverageEndDate
            : currentCoverage.endDateKey;
      }
    });

    const workerLaborById = new Map<
      number,
      ReturnType<typeof resolveWorkerSecondsForPeriod>
    >();
    workerIdsForDay.forEach((workerId) => {
      const effectiveCoverage = coverageByWorkerId.get(workerId);
      if (
        !effectiveCoverage ||
        effectiveCoverage.startDateKey > effectiveCoverage.endDateKey
      ) {
        workerLaborById.set(workerId, {
          seconds: 0,
          actualSeconds: 0,
          fallbackSeconds: 0,
          actualWorkerDayCount: 0,
          fallbackWorkerDayCount: 0,
        });
        return;
      }
      workerLaborById.set(
        workerId,
        resolveWorkerSecondsForPeriod({
          periodStartDateKey: effectiveCoverage.startDateKey,
          periodEndDateKey: effectiveCoverage.endDateKey,
          workerId,
        })
      );
    });

    const includedRows = preliminaryRows.filter((row) => {
      const workerLabor = workerLaborById.get(row.workerId);
      const workerSeconds = workerLabor?.seconds ?? 0;
      if (workerSeconds > 0) return true;
      diagnostics.noEligibleWorkingDayExcludedRecordCount += 1;
      pushAtTrainingSourceDiagnosticSample(diagnostics, {
        workLogId,
        workerId: row.workerId,
        styleId: row.styleId,
        styleCode: row.styleCode,
        processCode: row.processCode,
        processName: row.processName,
        quantity: Math.max(0, Math.round(row.quantity)),
        coverageStartDate: row.effectiveCoverageStartDate,
        coverageEndDate: row.effectiveCoverageEndDate,
        reason: "NO_ELIGIBLE_WORKING_DAYS",
      });
      return false;
    });
    if (includedRows.length === 0) {
      diagnostics.skippedNoUsableRowsWorkLogCount += 1;
      return draftRows;
    }

    const includedWorkerIds = new Set<number>();
    includedRows.forEach((row) => includedWorkerIds.add(row.workerId));
    let createdWorkerDraftCount = 0;
    includedWorkerIds.forEach((workerId) => {
      const workerRows = includedRows.filter((row) => row.workerId === workerId);
      const workerLabor = workerLaborById.get(workerId);
      if (!workerLabor || workerLabor.seconds <= 0 || workerRows.length === 0) return;
      const bucketKey = `${workLogId}:${workerId}`;
      const effectiveCoverage = coverageByWorkerId.get(workerId);
      if (effectiveCoverage) {
        const dayCount = countDateRangeDaysInclusive(
          effectiveCoverage.startDateKey,
          effectiveCoverage.endDateKey
        );
        let cursorDateKey = effectiveCoverage.startDateKey;
        for (let offset = 0; offset < dayCount; offset += 1) {
          const workedDay = resolveWorkerSecondsForDate(cursorDateKey, workerId);
          if (workedDay.seconds > 0) {
            const workerDateKey = toAtTrainingWorkerDateKey(cursorDateKey, workerId);
            registerAtTrainingWorkerDayClaim({ state: overlapState, workerDateKey, bucketKey });
          }
          if (offset === dayCount - 1) break;
          const nextDateKey = shiftDateKeyByDays(cursorDateKey, 1);
          if (!nextDateKey) break;
          cursorDateKey = nextDateKey;
        }
      }

      const perProcessGroups = new Map<string, AtTrainingBucketProcessDraft>();
      const eventDateKeysByProcessGroupKey = new Map<string, Set<string>>();
      workerRows.forEach((row) => {
        const sourceGroupKey = toAtTrainingSourceGroupKey({
          assignmentPlanId: row.assignmentPlanId,
          styleProcessId: row.styleProcessId,
        });
        const processGroupKey = `${row.styleProcessId}::${sourceGroupKey}`;
        const eventDateKeys =
          eventDateKeysByProcessGroupKey.get(processGroupKey) ?? new Set<string>();
        const dayCount = countDateRangeDaysInclusive(
          row.effectiveCoverageStartDate,
          row.effectiveCoverageEndDate
        );
        let cursorDateKey = row.effectiveCoverageStartDate;
        for (let offset = 0; offset < dayCount; offset += 1) {
          const workedDay = resolveWorkerSecondsForDate(cursorDateKey, workerId);
          if (workedDay.seconds > 0) eventDateKeys.add(`${workerId}:${cursorDateKey}`);
          if (offset === dayCount - 1) break;
          const nextDateKey = shiftDateKeyByDays(cursorDateKey, 1);
          if (!nextDateKey) break;
          cursorDateKey = nextDateKey;
        }
        eventDateKeysByProcessGroupKey.set(processGroupKey, eventDateKeys);
        const current = perProcessGroups.get(processGroupKey) || {
          styleId: row.styleId,
          styleProcessId: row.styleProcessId,
          assignmentPlanId: row.assignmentPlanId,
          sourceGroupKey,
          quantity: 0,
          eventCount: 0,
        };
        current.quantity += row.quantity;
        current.eventCount = Math.max(eventDateKeys.size, 1);
        perProcessGroups.set(processGroupKey, current);
      });
      const processRows = Array.from(perProcessGroups.values()).filter(
        (item) => item.quantity > 0 && item.eventCount > 0
      );
      if (processRows.length === 0) return;

      const attendanceCoverage = Math.min(
        1,
        Math.max(0, workerLabor.actualSeconds / workerLabor.seconds)
      );
      draftRows.push({
        sourceWorkLogId: workLogId,
        workerId,
        monthKey,
        workDate: normalizedCoverageEndDate,
        factoryId: resolvedFactoryId,
        laborInputSeconds: Math.max(1, Math.round(workerLabor.seconds)),
        attendanceCoverage,
        processRows,
        diagnosticRecordCount: workerRows.length,
        diagnosticActualSeconds: workerLabor.actualSeconds,
        diagnosticFallbackSeconds: workerLabor.fallbackSeconds,
        diagnosticActualWorkerDayCount: workerLabor.actualWorkerDayCount,
        diagnosticFallbackWorkerDayCount: workerLabor.fallbackWorkerDayCount,
      });
      createdWorkerDraftCount += 1;
    });
    if (createdWorkerDraftCount === 0) {
      diagnostics.skippedNoLaborInputWorkLogCount += 1;
      return draftRows;
    }
    previousPeriodEndDateByFactory.set(periodTrackerKey, normalizedCoverageEndDate);
    return draftRows;
  }, [] as AtTrainingBucketDraft[]);
  const safeDrafts = drafts.filter(
    (draft) => !overlapState.ambiguousBucketKeys.has(`${draft.sourceWorkLogId}:${draft.workerId}`)
  );
  diagnostics.ambiguousOverlappingWorkerDayCount = overlapState.ambiguousWorkerDateKeys.size;
  diagnostics.ambiguousOverlapExcludedWorkerBucketCount = drafts.length - safeDrafts.length;
  diagnostics.ambiguousOverlapExcludedRecordCount = drafts
    .filter((draft) => overlapState.ambiguousBucketKeys.has(`${draft.sourceWorkLogId}:${draft.workerId}`))
    .reduce((sum, draft) => sum + (draft.diagnosticRecordCount ?? 0), 0);
  diagnostics.ambiguousOverlappingWorkerDaySamples = Array.from(overlapState.ambiguousWorkerDateKeys)
    .slice(0, 30)
    .map((workerDateKey) => {
      const parsedWorkerDate = parseAtTrainingWorkerDateKey(workerDateKey);
      if (!parsedWorkerDate) return null;
      const workLogIds = Array.from(overlapState.ownerBucketKeysByWorkerDate.get(workerDateKey) ?? [])
        .map((bucketKey) => Number(bucketKey.split(":", 1)[0]))
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((left, right) => left - right);
      return { ...parsedWorkerDate, workLogIds };
    })
    .filter((sample): sample is { workerId: number; workDate: string; workLogIds: number[] } =>
      sample !== null
    );

  diagnostics.actualLaborInputSeconds = safeDrafts.reduce(
    (sum, draft) => sum + (draft.diagnosticActualSeconds ?? 0), 0
  );
  diagnostics.fallbackLaborInputSeconds = safeDrafts.reduce(
    (sum, draft) => sum + (draft.diagnosticFallbackSeconds ?? 0), 0
  );
  diagnostics.actualAttendanceWorkerDayCount = safeDrafts.reduce(
    (sum, draft) => sum + (draft.diagnosticActualWorkerDayCount ?? 0), 0
  );
  diagnostics.fallbackAttendanceWorkerDayCount = safeDrafts.reduce(
    (sum, draft) => sum + (draft.diagnosticFallbackWorkerDayCount ?? 0), 0
  );
  diagnostics.fullFallbackWorkerWorkLogCount = safeDrafts.filter(
    (draft) =>
      (draft.diagnosticFallbackWorkerDayCount ?? 0) > 0 &&
      (draft.diagnosticActualWorkerDayCount ?? 0) === 0
  ).length;
  diagnostics.partialFallbackWorkerWorkLogCount = safeDrafts.filter(
    (draft) =>
      (draft.diagnosticFallbackWorkerDayCount ?? 0) > 0 &&
      (draft.diagnosticActualWorkerDayCount ?? 0) > 0
  ).length;
  diagnostics.includedWorkRecordCount = safeDrafts.reduce(
    (sum, draft) => sum + (draft.diagnosticRecordCount ?? 0), 0
  );
  diagnostics.includedWorkLogCount = new Set(
    safeDrafts.map((draft) => draft.sourceWorkLogId)
  ).size;
  diagnostics.fallbackAppliedWorkLogCount = new Set(
    safeDrafts
      .filter((draft) => (draft.diagnosticFallbackWorkerDayCount ?? 0) > 0)
      .map((draft) => draft.sourceWorkLogId)
  ).size;
  diagnostics.draftCount = safeDrafts.length;
  diagnostics.excludedWorkLogCount = Math.max(
    0,
    diagnostics.sourceWorkLogCount - diagnostics.includedWorkLogCount
  );
  diagnostics.excludedWorkRecordCount = Math.max(
    0,
    diagnostics.sourceWorkRecordCount - diagnostics.includedWorkRecordCount
  );
  return { drafts: safeDrafts, diagnostics };
};

const replaceAtTrainingBucketsForMonth = async ({
  orgId,
  trainingMonthKey,
  drafts,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey: string;
  drafts: AtTrainingBucketDraft[];
  db?: AtTrainingBucketStoreClient;
}) => {
  const actor = getCurrentRequestActor();
  await db.$executeRaw(
    Prisma.sql`DELETE FROM "AtTrainingBucket" WHERE "orgId" = ${orgId} AND "monthKey" = ${trainingMonthKey}`
  );

  for (const draft of drafts) {
    const insertedRows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      INSERT INTO "AtTrainingBucket" (
        "orgId",
        "monthKey",
        "sourceWorkLogId",
        "workerId",
        "workDate",
        "factoryId",
        "laborInputSeconds",
        "attendanceCoverage",
        "createdBy",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${orgId},
        ${draft.monthKey},
        ${draft.sourceWorkLogId},
        ${draft.workerId},
        ${draft.workDate},
        ${draft.factoryId},
        ${draft.laborInputSeconds},
        ${draft.attendanceCoverage},
        ${actor},
        NOW(),
        NOW()
      )
      RETURNING "id"
    `);
    const bucketId = toPositiveIntOrNull(insertedRows[0]?.id);
    if (bucketId === null || draft.processRows.length === 0) continue;

    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "AtTrainingBucketProcess" (
          "orgId",
          "bucketId",
          "styleId",
          "styleProcessId",
          "assignmentPlanId",
          "sourceGroupKey",
          "quantity",
          "eventCount",
          "createdBy",
          "createdAt",
          "updatedAt"
        )
        VALUES ${Prisma.join(
          draft.processRows.map((processRow) => {
            const quantity = Math.max(1, Math.round(processRow.quantity));
            const eventCount = Math.max(1, roundToScale(processRow.eventCount, 4));
            const sourceGroupKey = String(processRow.sourceGroupKey || "").trim() || "legacy";
            return Prisma.sql`(
              ${orgId},
              ${bucketId},
              ${processRow.styleId},
              ${processRow.styleProcessId},
              ${processRow.assignmentPlanId},
              ${sourceGroupKey},
              ${quantity},
              ${eventCount},
              ${actor},
              NOW(),
              NOW()
            )`;
          })
        )}
      `
    );
  }
};

const syncAtTrainingBucketsForMonth = async ({
  orgId,
  trainingMonthKey,
  db = prisma,
}: {
  orgId: number;
  trainingMonthKey: string;
  db?: AtTrainingBucketStoreClient;
}) => {
  const normalizedTrainingMonthKey = normalizeMonthKey(trainingMonthKey);
  if (!normalizedTrainingMonthKey) {
    return {
      draftCount: 0,
      diagnostics: createAtTrainingSourceDiagnostics(null),
    };
  }
  const buildResult = await buildAtTrainingBucketDraftsFromRawSource({
    orgId,
    trainingMonthKey: normalizedTrainingMonthKey,
    db,
  });
  await replaceAtTrainingBucketsForMonth({
    orgId,
    trainingMonthKey: normalizedTrainingMonthKey,
    drafts: buildResult.drafts,
    db,
  });
  return {
    draftCount: buildResult.drafts.length,
    diagnostics: buildResult.diagnostics,
  };
};

const collectRawAtTrainingMonthKeysForOrg = async (orgId: number) => {
  const rows = await prisma.workLog.findMany({
    where: { orgId },
    select: { displayDate: true },
    orderBy: [{ displayDate: "asc" }, { id: "asc" }],
  });
  return Array.from(
    new Set(
      rows
        .map((row) => normalizeMonthKey(normalizeDateKey(row.displayDate).slice(0, 7)))
        .filter((monthKey) => monthKey !== "")
    )
  ).sort();
};

const collectStoredAtTrainingMonthKeysForOrg = async (orgId: number) => {
  const rows = await prisma.$queryRaw<Array<{ monthKey: string }>>(Prisma.sql`
    SELECT DISTINCT "monthKey"
    FROM "AtTrainingBucket"
    WHERE "orgId" = ${orgId}
    ORDER BY "monthKey" ASC
  `);
  return Array.from(
    new Set(
      rows
        .map((row: { monthKey: string }) => normalizeMonthKey(row.monthKey))
        .filter((monthKey: string) => monthKey !== "")
    )
  ).sort();
};

const ensureHistoricalAtTrainingBucketsForOrg = async ({
  orgId,
  maxMonthKey,
  excludeMonthKeys = [],
}: {
  orgId: number;
  maxMonthKey: string;
  excludeMonthKeys?: string[];
}) => {
  const normalizedMaxMonthKey = normalizeMonthKey(maxMonthKey);
  if (!normalizedMaxMonthKey) return [] as string[];

  const [rawMonthKeys, storedMonthKeys] = await Promise.all([
    collectRawAtTrainingMonthKeysForOrg(orgId),
    collectStoredAtTrainingMonthKeysForOrg(orgId),
  ]);
  const storedMonthKeySet = new Set(storedMonthKeys);
  const excludeMonthKeySet = new Set(
    ensureArray(excludeMonthKeys)
      .map((monthKey) => normalizeMonthKey(monthKey))
      .filter((monthKey) => monthKey !== "")
  );
  const missingMonthKeys = rawMonthKeys.filter(
    (monthKey) =>
      monthKey <= normalizedMaxMonthKey &&
      !storedMonthKeySet.has(monthKey) &&
      !excludeMonthKeySet.has(monthKey)
  );

  for (const monthKey of missingMonthKeys) {
    await prisma.$transaction(
      async (tx) => {
        await syncAtTrainingBucketsForMonth({
          orgId,
          trainingMonthKey: monthKey,
          db: tx,
        });
      },
      { timeout: 30000 }
    );
  }

  return missingMonthKeys;
};

const loadAtTrainingDataFromBuckets = async ({
  orgId,
  upToMonthKey,
}: {
  orgId: number;
  upToMonthKey: string;
}) => {
  const normalizedUpToMonthKey = normalizeMonthKey(upToMonthKey);
  if (!normalizedUpToMonthKey) {
    return {
      trainingDayBuckets: [] as AtTrainingDayBucket[],
      metricTrainingQualityByMetricKey: new Map<string, AtTrainingMetricQuality>(),
      styleProcessRowsById: new Map<number, any>(),
    };
  }

  type StoredAtTrainingBucketRow = {
    id: number;
    workDate: string;
    laborInputSeconds: number;
    attendanceCoverage: number | null;
  };
  type StoredAtTrainingBucketProcessRow = {
    bucketId: number;
    styleProcessId: number;
    assignmentPlanId: number | null;
    sourceGroupKey: string | null;
    quantity: number;
    eventCount: number | null;
  };

  const bucketRows = await prisma.$queryRaw<StoredAtTrainingBucketRow[]>(Prisma.sql`
    SELECT
      "id",
      "workDate",
      "laborInputSeconds",
      "attendanceCoverage"
    FROM "AtTrainingBucket"
    WHERE "orgId" = ${orgId} AND "monthKey" <= ${normalizedUpToMonthKey}
    ORDER BY "workDate" ASC, "id" ASC
  `);
  if (bucketRows.length === 0) {
    return {
      trainingDayBuckets: [] as AtTrainingDayBucket[],
      metricTrainingQualityByMetricKey: new Map<string, AtTrainingMetricQuality>(),
      styleProcessRowsById: new Map<number, any>(),
    };
  }

  const bucketIds = bucketRows
    .map((bucketRow: StoredAtTrainingBucketRow) => toPositiveIntOrNull(bucketRow.id))
    .filter((bucketId): bucketId is number => bucketId !== null);
  const bucketProcessRows =
    bucketIds.length > 0
      ? await prisma.$queryRaw<StoredAtTrainingBucketProcessRow[]>(Prisma.sql`
          SELECT
            "bucketId",
            "styleProcessId",
            "assignmentPlanId",
            "sourceGroupKey",
            "quantity",
            "eventCount"
          FROM "AtTrainingBucketProcess"
          WHERE "orgId" = ${orgId} AND "bucketId" IN (${Prisma.join(bucketIds)})
          ORDER BY "bucketId" ASC, "styleProcessId" ASC, "sourceGroupKey" ASC
        `)
      : [];
  const bucketProcessRowsByBucketId = bucketProcessRows.reduce((map, row) => {
    const bucketId = toPositiveIntOrNull(row?.bucketId);
    if (bucketId === null) return map;
    const current = map.get(bucketId) || [];
    current.push(row);
    map.set(bucketId, current);
    return map;
  }, new Map<number, StoredAtTrainingBucketProcessRow[]>());

  const styleProcessIds = Array.from(
    new Set(
      bucketProcessRows
        .map((row: StoredAtTrainingBucketProcessRow) =>
          toPositiveIntOrNull(row?.styleProcessId)
        )
        .filter((styleProcessId): styleProcessId is number => styleProcessId !== null)
    )
  );
  const styleProcessRows =
    styleProcessIds.length > 0
      ? await prisma.styleProcess.findMany({
          where: {
            orgId,
            id: { in: styleProcessIds },
          },
          select: {
            id: true,
            styleId: true,
            timesPerPiece: true,
            ptSeconds: true,
            atParams: true,
            standards: {
              select: {
                bucketQuantity: true,
                bucketStSeconds: true,
              },
            },
          },
        })
      : [];
  const styleProcessRowsById = new Map(
    styleProcessRows.map((row) => [Number(row.id), row])
  );

  const trainingDayBuckets: AtTrainingDayBucket[] = [];
  const metricTrainingQualityByMetricKey = new Map<
    string,
    AtTrainingMetricQuality
  >();

  bucketRows.forEach((bucketRow: StoredAtTrainingBucketRow, bucketOrder: number) => {
    const laborInputSeconds = toNumberOrNull(bucketRow.laborInputSeconds);
    if (laborInputSeconds === null || laborInputSeconds <= 0) return;
    const attendanceCoverage = toNumberOrNull(bucketRow.attendanceCoverage);
    const dayProcessRows: AtTrainingDayProcessRow[] = [];

    ensureArray(bucketProcessRowsByBucketId.get(Number(bucketRow.id))).forEach((processRow) => {
      const styleProcessId = toPositiveIntOrNull(processRow?.styleProcessId);
      const quantity = Number(processRow?.quantity) || 0;
      const eventCount = Number(processRow?.eventCount ?? 1) || 1;
      if (styleProcessId === null || quantity <= 0) return;
      const styleProcessRow = styleProcessRowsById.get(styleProcessId);
      if (!styleProcessRow) return;

      const metricKey = toAtTrainingStyleProcessMetricKey(styleProcessId);
      const sourceGroupKey =
        resolveOptionalString(processRow?.sourceGroupKey, null) ||
        toAtTrainingSourceGroupKey({
          assignmentPlanId: processRow?.assignmentPlanId,
          styleProcessId,
        });
      dayProcessRows.push({
        metricKey,
        quantity,
        eventCount: Math.max(1, roundToScale(eventCount, 4)),
        sourceGroupKey,
        attendanceCoverage,
      });

      const qualityCurrent = metricTrainingQualityByMetricKey.get(metricKey) || {
        totalQuantity: 0,
        weightedCoverageQuantity: 0,
        observationCount: 0,
      };
      qualityCurrent.totalQuantity += quantity;
      if (attendanceCoverage !== null) {
        qualityCurrent.weightedCoverageQuantity += quantity * attendanceCoverage;
      }
      qualityCurrent.observationCount += 1;
      metricTrainingQualityByMetricKey.set(metricKey, qualityCurrent);

    });

    if (dayProcessRows.length === 0) return;
    trainingDayBuckets.push({
      dayKey: `${bucketRow.workDate}#${bucketRow.id}`,
      order: bucketOrder,
      laborInputSeconds: Math.max(1, Math.round(laborInputSeconds)),
      processRows: dayProcessRows,
    });
  });

  return {
    trainingDayBuckets,
    metricTrainingQualityByMetricKey,
    styleProcessRowsById,
  };
};

const buildAtTrainingInitialSeedFromSt = ({
  trainingDayBuckets,
  styleProcessRowsById,
}: {
  trainingDayBuckets: AtTrainingDayBucket[];
  styleProcessRowsById: Map<number, any>;
}) => {
  const styleProcessRowByMetricKey = new Map<string, any>();
  styleProcessRowsById.forEach((processRow, styleProcessId) => {
    const normalizedStyleProcessId = toPositiveIntOrNull(styleProcessId);
    if (normalizedStyleProcessId === null) return;
    styleProcessRowByMetricKey.set(
      toAtTrainingStyleProcessMetricKey(normalizedStyleProcessId),
      processRow
    );
  });

  const metricKeysFromTraining = new Set<string>();
  const weightedSeedStatsByMetricKey = new Map<
    string,
    { weightedStSeconds: number; totalQuantity: number; observationCount: number }
  >();
  const missingSeedSamples: Array<Record<string, any>> = [];
  const pushMissingSeedSample = (sample: Record<string, any>) => {
    if (missingSeedSamples.length >= 30) return;
    missingSeedSamples.push(sample);
  };

  ensureArray(trainingDayBuckets).forEach((dayBucket) => {
    ensureArray(dayBucket?.processRows).forEach((processRow) => {
      const metricKey = String(processRow?.metricKey || "").trim();
      const quantity = Number(processRow?.quantity) || 0;
      if (!metricKey || quantity <= 0) return;
      metricKeysFromTraining.add(metricKey);

      const styleProcessRow = styleProcessRowByMetricKey.get(metricKey) ?? null;
      if (!styleProcessRow) {
        pushMissingSeedSample({
          reason: "STYLE_PROCESS_ROW_NOT_FOUND",
          metricKey,
          dayKey: resolveOptionalString((dayBucket as any)?.dayKey, null),
          quantity,
        });
        return;
      }

      const bucketQuantity = resolveStBucketQuantity(quantity);
      if (bucketQuantity === null) {
        pushMissingSeedSample({
          reason: "ST_BUCKET_QUANTITY_NOT_RESOLVED",
          metricKey,
          styleProcessId: toPositiveIntOrNull(styleProcessRow?.id),
          dayKey: resolveOptionalString((dayBucket as any)?.dayKey, null),
          quantity,
        });
        return;
      }

      const bucketStSeconds = resolveStyleProcessBucketStSeconds(styleProcessRow, bucketQuantity);
      if (bucketStSeconds === null || bucketStSeconds <= 0) {
        pushMissingSeedSample({
          reason: "ST_BUCKET_SECONDS_NOT_FOUND",
          metricKey,
          styleProcessId: toPositiveIntOrNull(styleProcessRow?.id),
          dayKey: resolveOptionalString((dayBucket as any)?.dayKey, null),
          quantity,
          bucketQuantity,
          availableBucketQuantities: ensureArray(styleProcessRow?.standards)
            .map((standard) => toPositiveIntOrNull((standard as any)?.bucketQuantity))
            .filter((value): value is number => value !== null),
        });
        return;
      }

      const current = weightedSeedStatsByMetricKey.get(metricKey) || {
        weightedStSeconds: 0,
        totalQuantity: 0,
        observationCount: 0,
      };
      current.weightedStSeconds += bucketStSeconds * quantity;
      current.totalQuantity += quantity;
      current.observationCount += 1;
      weightedSeedStatsByMetricKey.set(metricKey, current);
    });
  });

  const initialPerPieceByMetricKey = new Map<string, number>();
  weightedSeedStatsByMetricKey.forEach((stats, metricKey) => {
    if (stats.totalQuantity <= 0) return;
    const seedSeconds = roundToScale(stats.weightedStSeconds / stats.totalQuantity, 4);
    if (!Number.isFinite(seedSeconds) || seedSeconds <= 0) return;
    initialPerPieceByMetricKey.set(metricKey, seedSeconds);
  });

  const missingSeedMetricKeys = Array.from(metricKeysFromTraining.values()).filter(
    (metricKey) => !initialPerPieceByMetricKey.has(metricKey)
  );

  return {
    initialPerPieceByMetricKey,
    seedMetricCountFromSt: initialPerPieceByMetricKey.size,
    missingSeedMetricCount: missingSeedMetricKeys.length,
    missingSeedSamples,
  };
};

const applyAtTrainingResultsToStyleProcesses = async ({
  orgId,
  trainingMonthKey,
  fittedParamsByMetric,
  metricTrainingQualityByMetricKey,
  styleProcessRowsById,
}: {
  orgId: number;
  trainingMonthKey: string;
  fittedParamsByMetric: Map<string, AtFittedParams>;
  metricTrainingQualityByMetricKey: Map<string, AtTrainingMetricQuality>;
  styleProcessRowsById: Map<number, any>;
}) => {
  let updatedProcesses = 0;
  let clampAdjustedProcesses = 0;
  const changedStyleIds = new Set<number>();
  const refreshedStyleIds = new Set<number>();

  for (const processRow of styleProcessRowsById.values()) {
    const styleProcessId = toPositiveIntOrNull(processRow?.id);
    const styleId = toPositiveIntOrNull(processRow?.styleId);
    if (styleProcessId === null || styleId === null) continue;

    const metricKey = toAtTrainingStyleProcessMetricKey(styleProcessId);
    const fittedRaw = fittedParamsByMetric.get(metricKey);
    if (!fittedRaw) continue;
    refreshedStyleIds.add(styleId);

    const currentAtParams = toStyleAtParams((processRow as any).atParams);
    const qualityStats = metricTrainingQualityByMetricKey.get(metricKey) || null;
    const nextAttendanceCoverage =
      qualityStats && qualityStats.totalQuantity > 0
        ? roundToScale(
            Math.min(
              1,
              Math.max(
                0,
                qualityStats.weightedCoverageQuantity / qualityStats.totalQuantity
              )
            ),
            4
          )
        : null;
    const nextAttendanceFallbackShare =
      nextAttendanceCoverage == null
        ? null
        : roundToScale(Math.max(0, 1 - nextAttendanceCoverage), 4);
    const nextObservationCount =
      qualityStats && qualityStats.observationCount > 0
        ? Math.trunc(qualityStats.observationCount)
        : null;
    const clampedA = clampAtSlopeByMonthlyChange(fittedRaw.a, currentAtParams, {
      observationCount: nextObservationCount,
    });
    const fitted =
      clampedA !== fittedRaw.a ? { ...fittedRaw, a: clampedA } : fittedRaw;
    if (clampedA !== fittedRaw.a) {
      clampAdjustedProcesses += 1;
    }

    const hasAtParamDelta =
      currentAtParams === null ||
      currentAtParams.a !== fitted.a ||
      currentAtParams.b !== fitted.b;
    const hasQualityDelta =
      (currentAtParams?.attendanceCoverage ?? null) !==
        (nextAttendanceCoverage ?? null) ||
      (currentAtParams?.attendanceFallbackShare ?? null) !==
        (nextAttendanceFallbackShare ?? null) ||
      (currentAtParams?.observationCount ?? null) !==
        (nextObservationCount ?? null);
    const hasTrainingPeriodDelta =
      currentAtParams?.trainedPeriod !== trainingMonthKey;
    const hasFitMetadataDelta =
      (currentAtParams?.fitStatus ?? null) !== (fitted.fitStatus ?? null) ||
      (currentAtParams?.isProvisional ?? false) !== fitted.isProvisional ||
      (currentAtParams?.fallbackReason ?? null) !==
        (fitted.fallbackReason ?? null) ||
      (currentAtParams?.weightedPointCount ?? null) !==
        (fitted.weightedPointCount ?? null) ||
      (currentAtParams?.distinctQuantityCount ?? null) !==
        (fitted.distinctQuantityCount ?? null) ||
      (currentAtParams?.distinctEventCount ?? null) !==
        (fitted.distinctEventCount ?? null) ||
      (currentAtParams?.distinctSourceGroupCount ?? null) !==
        (fitted.distinctSourceGroupCount ?? null) ||
      (currentAtParams?.minQuantity ?? null) !== (fitted.minQuantity ?? null) ||
      (currentAtParams?.maxQuantity ?? null) !== (fitted.maxQuantity ?? null) ||
      (currentAtParams?.minEventCount ?? null) !==
        (fitted.minEventCount ?? null) ||
      (currentAtParams?.maxEventCount ?? null) !==
        (fitted.maxEventCount ?? null) ||
      JSON.stringify(currentAtParams?.quantitySamples ?? []) !==
        JSON.stringify(fitted.quantitySamples ?? []) ||
      JSON.stringify(currentAtParams?.eventCountSamples ?? []) !==
        JSON.stringify(fitted.eventCountSamples ?? []);
    const shouldRefreshAtParams =
      currentAtParams === null ||
      hasAtParamDelta ||
      hasQualityDelta ||
      hasTrainingPeriodDelta ||
      hasFitMetadataDelta;
    const nextAtParams = shouldRefreshAtParams
      ? {
          a: fitted.a,
          b: fitted.b,
          version:
            currentAtParams === null
              ? 1
              : currentAtParams.version + (hasAtParamDelta ? 1 : 0),
          updatedAt: new Date().toISOString(),
          trainedPeriod: trainingMonthKey,
          attendanceCoverage: nextAttendanceCoverage,
          attendanceFallbackShare: nextAttendanceFallbackShare,
          observationCount: nextObservationCount,
          fitStatus: fitted.fitStatus,
          isProvisional: fitted.isProvisional,
          fallbackReason: fitted.fallbackReason,
          weightedPointCount: fitted.weightedPointCount,
          distinctQuantityCount: fitted.distinctQuantityCount,
          distinctEventCount: fitted.distinctEventCount,
          distinctSourceGroupCount: fitted.distinctSourceGroupCount,
          minQuantity: fitted.minQuantity,
          maxQuantity: fitted.maxQuantity,
          minEventCount: fitted.minEventCount,
          maxEventCount: fitted.maxEventCount,
          quantitySamples: fitted.quantitySamples,
          eventCountSamples: fitted.eventCountSamples,
        }
      : currentAtParams;
    const atParamsChanged = !isSameStyleAtParams(currentAtParams, nextAtParams);
    if (!atParamsChanged) continue;

    updatedProcesses += 1;
    changedStyleIds.add(styleId);
    await prisma.styleProcess.update({
      where: { id: styleProcessId },
      data: {
        atParams: nextAtParams,
      },
    });
  }

  if (refreshedStyleIds.size > 0) {
    // StyleProcess.atParams (updated above) is canonical; Style.processes JSON is no
    // longer written back here — StyleProcess/StyleProcessStandard are the only
    // source of truth for process data going forward.
    await rebuildAssignmentCardsForOrgIds(await resolveStyleSyncTargetOrgIds(orgId));
  }

  return {
    updatedStyles: changedStyleIds.size,
    updatedProcesses,
    clampAdjustedProcesses,
  };
};

export const syncStyleProcessActualTimesFromWorkRecords = async (
  orgId: number,
  options: AtSyncRunOptions = {}
) => {
  const trainingMonthKey = resolveAtSyncTrainingMonthKey(options);
  const includeDebugDiagnostics = options.debug === true;
  const startedAt = Date.now();
  const finish = (
    updatedStyles: number,
    updatedProcesses: number,
    reason = "done",
    diagnostics: Record<string, any> | null = null
  ) => {
    console.log(
      `[AT sync] marker=${AT_SYNC_RUNTIME_MARKER} orgId=${orgId} month=${trainingMonthKey} updatedStyles=${updatedStyles} updatedProcesses=${updatedProcesses} reason=${reason} durationMs=${Date.now() - startedAt}`
    );
    if (includeDebugDiagnostics && diagnostics) {
      console.log("[AT sync] diagnostics summary", diagnostics);
      if (Array.isArray(diagnostics?.source?.sampleExcludedRecords)) {
        console.log(
          "[AT sync] excluded record samples",
          diagnostics.source.sampleExcludedRecords
        );
      }
      if (Array.isArray(diagnostics?.missingInitialSeedSamples)) {
        console.log(
          "[AT sync] missing initial ST seed samples",
          diagnostics.missingInitialSeedSamples
        );
      }
      if (Array.isArray(diagnostics?.fitting?.metricSamples)) {
        console.log(
          "[AT sync] fitting metric samples",
          diagnostics.fitting.metricSamples
        );
      }
    }
    return diagnostics
      ? { updatedStyles, updatedProcesses, reason, diagnostics }
      : { updatedStyles, updatedProcesses, reason };
  };
  console.log(
    `[AT sync] marker=${AT_SYNC_RUNTIME_MARKER} start orgId=${orgId} month=${trainingMonthKey}`
  );
  {
    const backfilledMonthKeys = await ensureHistoricalAtTrainingBucketsForOrg({
      orgId,
      maxMonthKey: trainingMonthKey,
      excludeMonthKeys: [trainingMonthKey],
    });
    if (backfilledMonthKeys.length > 0) {
      console.log(
        `[AT sync] orgId=${orgId} month=${trainingMonthKey} backfilledMonths=${backfilledMonthKeys.join(",")}`
      );
    }

    const stylesForStorageSync = await prisma.style.findMany({
      where: { orgId },
      select: {
        id: true,
        orgId: true,
        processes: true,
      },
    });
    if (stylesForStorageSync.length > 0) {
      await ensureStyleProcessStorageForStyles(stylesForStorageSync, {
        processOrgId: orgId,
      });
    }

    const bucketSyncResult = await prisma.$transaction(
      async (tx) => {
        return syncAtTrainingBucketsForMonth({
          orgId,
          trainingMonthKey,
          db: tx,
        });
      },
      { timeout: 30000 }
    );

    const bucketTrainingData = await loadAtTrainingDataFromBuckets({
      orgId,
      upToMonthKey: trainingMonthKey,
    });
    const diagnosticsSummary = includeDebugDiagnostics
      ? {
          trainingMonthKey,
          backfilledMonthKeys,
          source: bucketSyncResult.diagnostics,
          bucketDraftCount: Number(bucketSyncResult?.draftCount || 0),
          trainingDayBucketCount: bucketTrainingData.trainingDayBuckets.length,
          trainingMetricCount:
            bucketTrainingData.metricTrainingQualityByMetricKey.size,
          styleProcessCandidateCount:
            bucketTrainingData.styleProcessRowsById.size,
        }
      : null;
    if (bucketTrainingData.trainingDayBuckets.length === 0) {
      return finish(0, 0, "no_metric_observations", diagnosticsSummary);
    }

    const initialSeedResult = buildAtTrainingInitialSeedFromSt({
      trainingDayBuckets: bucketTrainingData.trainingDayBuckets,
      styleProcessRowsById: bucketTrainingData.styleProcessRowsById,
    });
    const seededDiagnosticsSummary =
      diagnosticsSummary === null
        ? null
        : {
            ...diagnosticsSummary,
            initialSeedMetricCount: initialSeedResult.initialPerPieceByMetricKey.size,
            initialSeedMetricCountFromSt: initialSeedResult.seedMetricCountFromSt,
            missingInitialSeedMetricCount: initialSeedResult.missingSeedMetricCount,
            missingInitialSeedSamples: initialSeedResult.missingSeedSamples,
          };
    if (initialSeedResult.initialPerPieceByMetricKey.size === 0) {
      return finish(0, 0, "no_initial_st_seeds", seededDiagnosticsSummary);
    }

    const fittingResult = fitAtParamsWithProportionalAllocation(
      bucketTrainingData.trainingDayBuckets,
      { initialPerPieceByMetricKey: initialSeedResult.initialPerPieceByMetricKey }
    );
    const fittedParamsByMetric = fittingResult.paramsByMetric;
    const fittedDiagnosticsSummary =
      seededDiagnosticsSummary === null
        ? null
        : {
            ...seededDiagnosticsSummary,
            fitting: fittingResult.diagnostics,
          };
    if (fittedParamsByMetric.size === 0) {
      return finish(0, 0, "no_fitted_metrics", fittedDiagnosticsSummary);
    }
    console.log(
      `[AT sync] orgId=${orgId} month=${trainingMonthKey} metrics=${fittedParamsByMetric.size} dayBuckets=${bucketTrainingData.trainingDayBuckets.length} iterations=${fittingResult.iterationCount} converged=${fittingResult.converged}`
    );

    const applyResult = await applyAtTrainingResultsToStyleProcesses({
      orgId,
      trainingMonthKey,
      fittedParamsByMetric,
      metricTrainingQualityByMetricKey:
        bucketTrainingData.metricTrainingQualityByMetricKey,
      styleProcessRowsById: bucketTrainingData.styleProcessRowsById,
    });
    if (applyResult.clampAdjustedProcesses > 0) {
      console.log(
        `[AT sync] orgId=${orgId} month=${trainingMonthKey} clampAdjustedProcesses=${applyResult.clampAdjustedProcesses} clampRatio=${AT_MONTHLY_A_CLAMP_RATIO}`
      );
    }
    const nextDiagnosticsSummary =
      fittedDiagnosticsSummary === null
        ? null
        : {
            ...fittedDiagnosticsSummary,
            fittedMetricCount: fittedParamsByMetric.size,
            fittingIterationCount: fittingResult.iterationCount,
            fittingConverged: fittingResult.converged,
            clampAdjustedProcesses: applyResult.clampAdjustedProcesses,
          };

    return finish(
      applyResult.updatedStyles,
      applyResult.updatedProcesses,
      backfilledMonthKeys.length > 0
        ? `done+backfilled_${backfilledMonthKeys.length}`
        : "done",
      nextDiagnosticsSummary
    );
  }
};

const buildAtSyncStatusForOrg = async (
  orgId: number,
  options: AtSyncRunOptions = {}
) => {
  const trainingMonthKey = resolveAtSyncTrainingMonthKey(options);
  if (!trainingMonthKey) {
    return {
      trainingMonthKey: "",
      needsUpdate: false,
      reason: "invalid_training_month",
      sourceMonthCount: 0,
      staleMonthCount: 0,
      sourceWorkLogCount: 0,
      sourceWorkRecordCount: 0,
      bucketCount: 0,
      latestSourceUpdatedAt: null,
      latestBucketUpdatedAt: null,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{
      source_month_count: bigint | number | null;
      stale_month_count: bigint | number | null;
      source_work_log_count: bigint | number | null;
      source_work_record_count: bigint | number | null;
      bucket_count: bigint | number | null;
      latest_source_updated_at: Date | null;
      latest_bucket_updated_at: Date | null;
    }>
  >(Prisma.sql`
    WITH work_log_months AS (
      SELECT
        LEFT(wl."workDate", 7) AS month_key,
        COUNT(*)::int AS work_log_count,
        MAX(wl."updatedAt") AS latest_work_log_updated_at
      FROM "WorkLog" wl
      WHERE wl."orgId" = ${orgId}
        AND LEFT(wl."workDate", 7) <= ${trainingMonthKey}
      GROUP BY LEFT(wl."workDate", 7)
    ),
    work_record_months AS (
      SELECT
        LEFT(wl."workDate", 7) AS month_key,
        COUNT(wr.id)::int AS work_record_count,
        MAX(wr."updatedAt") AS latest_work_record_updated_at
      FROM "WorkLog" wl
      JOIN "WorkRecord" wr ON wr."workLogId" = wl.id
      WHERE wl."orgId" = ${orgId}
        AND LEFT(wl."workDate", 7) <= ${trainingMonthKey}
      GROUP BY LEFT(wl."workDate", 7)
    ),
    attendance_months AS (
      SELECT
        LEFT(a."workDate", 7) AS month_key,
        MAX(a."updatedAt") AS latest_attendance_updated_at
      FROM "AttendanceEntry" a
      WHERE a."orgId" = ${orgId}
        AND LEFT(a."workDate", 7) <= ${trainingMonthKey}
      GROUP BY LEFT(a."workDate", 7)
    ),
    source_months AS (
      SELECT
        wlm.month_key,
        COALESCE(wlm.work_log_count, 0) AS work_log_count,
        COALESCE(wrm.work_record_count, 0) AS work_record_count,
        GREATEST(
          COALESCE(wlm.latest_work_log_updated_at, TIMESTAMPTZ 'epoch'),
          COALESCE(wrm.latest_work_record_updated_at, TIMESTAMPTZ 'epoch'),
          COALESCE(am.latest_attendance_updated_at, TIMESTAMPTZ 'epoch')
        ) AS latest_source_updated_at
      FROM work_log_months wlm
      LEFT JOIN work_record_months wrm ON wrm.month_key = wlm.month_key
      LEFT JOIN attendance_months am ON am.month_key = wlm.month_key
    ),
    bucket_months AS (
      SELECT
        b."monthKey" AS month_key,
        COUNT(*)::int AS bucket_count,
        MAX(b."updatedAt") AS latest_bucket_updated_at
      FROM "AtTrainingBucket" b
      WHERE b."orgId" = ${orgId}
        AND b."monthKey" <= ${trainingMonthKey}
      GROUP BY b."monthKey"
    )
    SELECT
      COUNT(sm.month_key)::int AS source_month_count,
      COUNT(*) FILTER (
        WHERE COALESCE(bm.bucket_count, 0) = 0
          OR bm.latest_bucket_updated_at IS NULL
          OR sm.latest_source_updated_at > bm.latest_bucket_updated_at
      )::int AS stale_month_count,
      COALESCE(SUM(sm.work_log_count), 0)::int AS source_work_log_count,
      COALESCE(SUM(sm.work_record_count), 0)::int AS source_work_record_count,
      COALESCE(SUM(bm.bucket_count), 0)::int AS bucket_count,
      MAX(sm.latest_source_updated_at) AS latest_source_updated_at,
      MAX(bm.latest_bucket_updated_at) AS latest_bucket_updated_at
    FROM source_months sm
    LEFT JOIN bucket_months bm ON bm.month_key = sm.month_key
  `);

  const row = rows[0] ?? null;
  const sourceMonthCount = Number(row?.source_month_count ?? 0);
  const staleMonthCount = Number(row?.stale_month_count ?? 0);
  const sourceWorkLogCount = Number(row?.source_work_log_count ?? 0);
  const sourceWorkRecordCount = Number(row?.source_work_record_count ?? 0);
  const bucketCount = Number(row?.bucket_count ?? 0);
  const latestSourceUpdatedAt = row?.latest_source_updated_at
    ? new Date(row.latest_source_updated_at).toISOString()
    : null;
  const latestBucketUpdatedAt = row?.latest_bucket_updated_at
    ? new Date(row.latest_bucket_updated_at).toISOString()
    : null;
  const needsUpdate = sourceMonthCount > 0 && staleMonthCount > 0;
  const reason =
    sourceMonthCount <= 0
      ? "no_source_work_logs"
      : needsUpdate
        ? "source_newer_than_training_bucket"
        : "up_to_date";

  return {
    trainingMonthKey,
    needsUpdate,
    reason,
    sourceMonthCount,
    staleMonthCount,
    sourceWorkLogCount,
    sourceWorkRecordCount,
    bucketCount,
    latestSourceUpdatedAt,
    latestBucketUpdatedAt,
  };
};

const resetAtTrainingStateForOrg = async (orgId: number) => {
  const result = await prisma.$transaction(async (tx) => {
    const styleProcessAtParamsReset = await tx.$executeRaw(Prisma.sql`
      UPDATE "StyleProcess"
      SET "atParams" = NULL,
          "updatedAt" = NOW()
      WHERE "orgId" = ${orgId}
        AND "atParams" IS NOT NULL
    `);
    const styleProcessJsonAtParamsReset = await tx.$executeRaw(Prisma.sql`
      UPDATE "Style" AS s
      SET "processes" = (
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN jsonb_typeof(proc.value) = 'object'
                    THEN proc.value - 'atParams' - 'at'
                  ELSE proc.value
                END
                ORDER BY proc.ordinality
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(s."processes"::jsonb) WITH ORDINALITY AS proc(value, ordinality)
          ),
          "updatedAt" = NOW()
      WHERE s."orgId" = ${orgId}
        AND s."processes" IS NOT NULL
        AND jsonb_typeof(s."processes"::jsonb) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(s."processes"::jsonb) AS elem(value)
          WHERE jsonb_typeof(elem.value) = 'object'
            AND (elem.value ? 'atParams' OR elem.value ? 'at')
        )
    `);
    const trainingBucketProcessesDeleted = await tx.$executeRaw(Prisma.sql`
      DELETE FROM "AtTrainingBucketProcess"
      WHERE "orgId" = ${orgId}
    `);
    const trainingBucketsDeleted = await tx.$executeRaw(Prisma.sql`
      DELETE FROM "AtTrainingBucket"
      WHERE "orgId" = ${orgId}
    `);

    return {
      styleProcessAtParamsReset: Number(styleProcessAtParamsReset || 0),
      styleProcessJsonAtParamsReset: Number(styleProcessJsonAtParamsReset || 0),
      trainingBucketProcessesDeleted: Number(trainingBucketProcessesDeleted || 0),
      trainingBucketsDeleted: Number(trainingBucketsDeleted || 0),
    };
  });

  await rebuildAssignmentCardsForOrgIds(await resolveStyleSyncTargetOrgIds(orgId));
  return result;
};

const normalizeStylePayload = (
  payload: any,
  fallbackCode: string | null = null,
  options: { includeProcesses?: boolean } = {}
) => {
  const rawCode =
    resolveOptionalString(payload?.code, null) ??
    resolveOptionalString(payload?.styleCode, null) ??
    (toPositiveIntOrNull(payload?.id) === null
      ? resolveOptionalString(payload?.id, null)
      : null);
  const code = rawCode || fallbackCode || createStyleId();
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const customer =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";
  const includeProcesses = options.includeProcesses !== false;

  return {
    code,
    name,
    customer,
    registrationDate: resolveOptionalString(payload?.registrationDate, null),
    designer: resolveOptionalString(payload?.designer, null),
    collection: resolveOptionalString(payload?.collection, null),
    season: resolveOptionalString(payload?.season, null),
    imageUrls: ensureArray(payload?.imageUrls),
    processes: includeProcesses ? normalizeStyleProcesses(payload?.processes) : [],
    bom: ensureArray(payload?.bom),
    bomNotes: resolveOptionalString(payload?.bomNotes, null),
    revenueMemo: resolveOptionalString(payload?.revenueMemo, null),
  };
};
const toOrganizationOption = (organization: any) => ({
  id: organization?.id ?? null,
  name: organization?.name ?? "",
  nameKo: (organization as any)?.nameKo ?? null,
  nameVi: (organization as any)?.nameVi ?? null,
  code: organization?.code ?? null,
  type: organization?.type ?? null,
  defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(
    organization?.defaultSizeSetCode
  ),
});
const toUniqueOrganizationOptions = (organizations: any[] = []) => {
  const byId = new Map<number, any>();
  organizations.forEach((organization) => {
    const id = Number(organization?.id);
    if (!Number.isFinite(id) || byId.has(id)) return;
    byId.set(id, toOrganizationOption(organization));
  });
  return Array.from(byId.values());
};

const parseStyleOwnerOrgIdQuery = (rawValue: unknown): number | null => {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const text = String(rawValue).trim();
  if (!/^\d+$/.test(text)) {
    throw createHttpError(400, "invalid ownerOrgId");
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, "invalid ownerOrgId");
  }
  return parsed;
};

const getAccessibleStyleOwnerOrgIds = async (organization: any) => {
  if (isBrandOrg(organization)) {
    return [organization.id];
  }
  if (!isManufacturerOrg(organization)) {
    throw createHttpError(400, "invalid organization type");
  }

  const relationships = await prisma.orgRelationship.findMany({
    where: { manufacturerOrgId: organization.id },
    select: { brandOrgId: true },
  });

  const ownerIds = new Set<number>([organization.id]);
  relationships.forEach((relationship) => {
    const brandOrgId = Number(relationship?.brandOrgId);
    if (Number.isSafeInteger(brandOrgId) && brandOrgId > 0) {
      ownerIds.add(brandOrgId);
    }
  });

  return Array.from(ownerIds.values());
};

const resolveStyleOwnerForCreateOrThrow = async ({
  organization,
  payload,
}: {
  organization: any;
  payload: any;
}) => {
  if (isBrandOrg(organization)) {
    return {
      ownerOrgId: organization.id,
      ownerOrgName: String(organization?.name || "").trim(),
      ownerOrgNameKo: String(organization?.nameKo || "").trim(),
      ownerOrgNameVi: String(organization?.nameVi || "").trim(),
    };
  }
  if (!isManufacturerOrg(organization)) {
    throw createHttpError(400, "invalid organization type");
  }

  const customerOrgId = toPositiveIntOrNull(
    payload?.customerOrgId ?? payload?.buyerOrgId ?? payload?.customerId
  );
  const customerName =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";

  if (customerOrgId) {
    const relationship = await prisma.orgRelationship.findFirst({
      where: {
        manufacturerOrgId: organization.id,
        brandOrgId: customerOrgId,
      },
      include: { brand: true },
    });
    if (!relationship?.brand) {
      throw createHttpError(400, "customer relationship not found");
    }
    return {
      ownerOrgId: relationship.brand.id,
      ownerOrgName: String(relationship.brand.name || "").trim(),
      ownerOrgNameKo: String((relationship.brand as any).nameKo || "").trim(),
      ownerOrgNameVi: String((relationship.brand as any).nameVi || "").trim(),
    };
  }

  if (!customerName) {
    throw createHttpError(400, "customer is required");
  }

  const relationships = await prisma.orgRelationship.findMany({
    where: { manufacturerOrgId: organization.id },
    include: { brand: true },
    orderBy: { id: "asc" },
  });
  const normalizedCustomerName = customerName.toLowerCase();
  const matched = relationships.filter((relationship) => {
    const brandName =
      typeof relationship?.brand?.name === "string"
        ? relationship.brand.name.trim().toLowerCase()
        : "";
    return brandName !== "" && brandName === normalizedCustomerName;
  });

  if (matched.length === 0 || !matched[0]?.brand) {
    throw createHttpError(400, "customer relationship not found");
  }
  if (matched.length > 1) {
    throw createHttpError(409, "multiple customers matched; provide customerOrgId");
  }

  return {
    ownerOrgId: matched[0].brand.id,
    ownerOrgName: String(matched[0].brand.name || "").trim(),
    ownerOrgNameKo: String((matched[0].brand as any).nameKo || "").trim(),
    ownerOrgNameVi: String((matched[0].brand as any).nameVi || "").trim(),
  };
};

const resolveStyleByIdForAccess = async ({
  organization,
  styleId,
  ownerOrgId,
}: {
  organization: any;
  styleId: string;
  ownerOrgId: number | null;
}) => {
  const numericStyleId = toPositiveIntOrNull(styleId);
  if (numericStyleId === null) return null;
  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  let ownerScope = accessibleOwnerOrgIds;

  if (ownerOrgId !== null) {
    if (!accessibleOwnerOrgIds.includes(ownerOrgId)) {
      throw createHttpError(403, "style access denied");
    }
    ownerScope = [ownerOrgId];
  }

  const styles = await prisma.style.findMany({
    where: {
      id: numericStyleId,
      orgId: { in: ownerScope },
    },
    include: {
      organization: {
        select: { id: true, name: true, nameKo: true, nameVi: true },
      },
    },
    orderBy: { id: "asc" },
    take: ownerOrgId === null ? 2 : 1,
  });

  if (styles.length === 0) return null;
  if (ownerOrgId === null && styles.length > 1) {
    throw createHttpError(409, "multiple styles matched; specify ownerOrgId");
  }

  return styles[0];
};

const findStyleConflict = async ({
  orgId,
  name,
  styleCode,
  excludeStyleId = null,
}: {
  orgId: number;
  name: string;
  styleCode: string;
  excludeStyleId?: number | null;
}) => {
  const where: any = {
    orgId,
    OR: [{ name }, { code: styleCode }],
  };
  if (Number.isFinite(excludeStyleId)) {
    where.NOT = { id: excludeStyleId as number };
  }
  const conflict = await prisma.style.findFirst({
    where,
    select: { id: true, name: true, code: true },
  });
  if (!conflict) return null;
  if (conflict.name === name) {
    return "style name already exists for this customer";
  }
  if (conflict.code === styleCode) {
    return "style code already exists for this customer";
  }
  return "style already exists for this customer";
};

type StyleStorageClient = Prisma.TransactionClient | typeof prisma;

const STYLE_PROCESS_STANDARD_INCLUDE: Prisma.StyleProcessInclude = {
  standards: {
    orderBy: [{ bucketQuantity: "asc" }, { id: "asc" }],
  },
  _count: { select: { workRecords: true } },
};

const resolveStyleProcessStorageCode = (process: any, index: number) => {
  const explicitCode = normalizeProcessCodeKey(process?.code);
  if (explicitCode) return explicitCode;
  const storedCode = normalizeProcessCodeKey(process?.storageCode);
  if (storedCode) return storedCode;
  const compositionCode = buildStyleProcessCodeFromComposition(
    process?.processComposition,
    null
  );
  const codeKey = normalizeProcessCodeKey(compositionCode);
  if (codeKey) return codeKey;
  const nameKey = normalizeProcessNameKey(process?.name);
  if (nameKey) return nameKey.toUpperCase();
  return `PROC_${index + 1}`;
};

const buildCompleteStyleProcessStBuckets = ({
  ptSeconds,
  stBuckets,
}: {
  ptSeconds: number | null;
  stBuckets: StyleStBucket[];
}): StyleStBucket[] => {
  const byQuantity = new Map<number, StyleStBucket>();
  ensureArray(stBuckets).forEach((bucket) => {
    const bucketQuantity = toPositiveIntOrNull((bucket as any)?.bucketQuantity);
    const bucketStSeconds = toOptionalProcessSeconds((bucket as any)?.bucketStSeconds);
    if (bucketQuantity === null || bucketStSeconds === null || bucketStSeconds <= 0) return;
    byQuantity.set(bucketQuantity, {
      bucketQuantity,
      bucketStSeconds,
      setBy: resolveOptionalString((bucket as any)?.setBy, null),
      setAt: resolveOptionalString((bucket as any)?.setAt, null),
      updatedAt: resolveOptionalString((bucket as any)?.updatedAt, null),
    });
  });

  if (ptSeconds !== null && ptSeconds > 0) {
    ST_STANDARD_BUCKETS.forEach((bucketQuantity) => {
      if (byQuantity.has(bucketQuantity)) return;
      byQuantity.set(bucketQuantity, {
        bucketQuantity,
        bucketStSeconds: ptSeconds,
        setBy: "PT_DERIVED",
        setAt: null,
        updatedAt: null,
      });
    });
  }

  return Array.from(byQuantity.values()).sort(
    (left, right) => left.bucketQuantity - right.bucketQuantity
  );
};

const STYLE_PROCESS_ST_WRITE_MODE_MANUAL_EDIT = "MANUAL_EDIT";

const normalizeStyleProcessStBucketWriteMode = (value: any): string | null => {
  const normalized = resolveOptionalString(value, "")?.trim().toUpperCase();
  if (normalized === STYLE_PROCESS_ST_WRITE_MODE_MANUAL_EDIT) {
    return STYLE_PROCESS_ST_WRITE_MODE_MANUAL_EDIT;
  }
  return null;
};

const normalizeStyleProcessStBucketUpdateQuantities = (value: any): number[] =>
  Array.from(
    new Set(
      ensureArray(value)
        .map((item) => toPositiveIntOrNull(item))
        .filter((item): item is number => item !== null)
    )
  ).sort((left, right) => left - right);

const buildStyleProcessStorageDrafts = (processes: any): any[] =>
  normalizeStyleProcesses(processes).map((process, index) => {
    const normalizedComposition = normalizeStyleProcessComposition(
      (process as any)?.processComposition
    );
    const ptSeconds = toOptionalProcessSeconds((process as any)?.pt);
    const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
      normalizedComposition,
      {
        name: (process as any)?.name,
        nameKo: (process as any)?.nameKo,
        nameEn: (process as any)?.nameEn,
        nameVi: (process as any)?.nameVi,
      }
    );
    const manualName = resolveOptionalString((process as any)?.manualName, null);
    const providedStBuckets = normalizeStyleProcessStBuckets(
      (process as any)?.stBuckets ?? (process as any)?.stValues
    );
    const stBucketWriteMode = normalizeStyleProcessStBucketWriteMode(
      (process as any)?.stBucketWriteMode
    );
    return {
      styleProcessId: toPositiveIntOrNull(
        (process as any)?.styleProcessId ?? (process as any)?.id
      ),
      processCode: resolveStyleProcessStorageCode(process, index),
      processName:
        manualName ??
        resolveOptionalString((process as any)?.name, null) ??
        resolveOptionalString((process as any)?.nameEn, null) ??
        resolveOptionalString(localizedNames.nameEn, null) ??
        resolveOptionalString((process as any)?.code, null) ??
        resolveStyleProcessStorageCode(process, index),
      processComposition: normalizedComposition,
      processDescription: resolveOptionalString((process as any)?.description, null),
      timesPerPiece: toPositiveInt(
        (process as any)?.timesPerPiece ?? (process as any)?.quantity ?? (process as any)?.processQuantity,
        1
      ),
      sortOrder: index,
      ptSeconds,
      atParams: toStyleAtParams((process as any)?.atParams),
      stBucketWriteMode,
      stBucketUpdateQuantities: normalizeStyleProcessStBucketUpdateQuantities(
        (process as any)?.stBucketUpdateQuantities
      ),
      stBuckets:
        stBucketWriteMode === STYLE_PROCESS_ST_WRITE_MODE_MANUAL_EDIT
          ? providedStBuckets
          : buildCompleteStyleProcessStBuckets({
              ptSeconds,
              stBuckets: providedStBuckets,
            }),
    };
  });

const loadStyleProcessNameLookup = async ({
  orgId,
  processCodes,
  db = prisma,
}: {
  orgId?: number | null;
  processCodes: any[];
  db?: StyleStorageClient;
}) => {
  const resolvedOrgId = toPositiveIntOrNull(orgId);
  const codes = Array.from(
    new Set(
      ensureArray(processCodes)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (resolvedOrgId === null || codes.length === 0) {
    return new Map<
      string,
      {
        name: string | null;
        nameKo: string | null;
        nameEn: string | null;
        nameVi: string | null;
      }
    >();
  }

  const rows = await db.attrProcess.findMany({
    where: {
      orgId: resolvedOrgId,
      code: { in: codes },
    },
    select: {
      code: true,
      name: true,
      nameKo: true,
      nameEn: true,
      nameVi: true,
    },
  });

  return rows.reduce((map, row) => {
    const codeKey = normalizeProcessCodeKey(row.code);
    if (!codeKey) return map;
    const fallbackName = resolveOptionalString(row.name, null);
    map.set(codeKey, {
      name: fallbackName,
      nameKo: resolveOptionalString(row.nameKo, null),
      nameEn: resolveOptionalString(row.nameEn, null) ?? fallbackName,
      nameVi: resolveOptionalString(row.nameVi, null),
    });
    return map;
  }, new Map<
    string,
    {
      name: string | null;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    }
  >());
};

const buildStyleProcessMirrorFromRows = (
  rows: any[] = [],
  processNameLookup = new Map<
    string,
    {
      name: string | null;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    }
  >(),
  displayProcesses: any = []
) =>
  (() => {
    const displayProcessList = ensureArray(displayProcesses);
    return ensureArray(rows)
      .slice()
      .sort(
        (left, right) =>
          Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0) ||
          Number(left?.id ?? 0) - Number(right?.id ?? 0)
      )
      .map((row, index) => {
        const displayProcess = displayProcessList[index] ?? null;
        const normalizedComposition = normalizeStyleProcessComposition(
          row.processComposition
        );
        const masterNames =
          processNameLookup.get(normalizeProcessCodeKey(row.processCode)) ?? null;
        const localizedNames = buildStyleProcessLocalizedNamesFromComposition(
          normalizedComposition,
          {
            name: masterNames?.nameEn ?? masterNames?.name ?? row.processName,
            nameKo: masterNames?.nameKo ?? null,
            nameEn: masterNames?.nameEn ?? masterNames?.name ?? row.processName,
            nameVi: masterNames?.nameVi ?? null,
          }
        );
        const manualName = resolveOptionalString(row.processName, null);
        const workRecordCount = Number(row?._count?.workRecords ?? 0);
        return normalizeStyleProcess({
          id: row.id ?? null,
          styleProcessId: row.id ?? null,
          code: resolveStyleProcessVisibleCode(row.processCode, displayProcess),
          storageCode: row.processCode,
          manualName,
          name:
            manualName ||
            localizedNames.nameEn ||
            masterNames?.nameEn ||
            masterNames?.name ||
            row.processName,
          nameKo: manualName || localizedNames.nameKo || masterNames?.nameKo,
          nameEn:
            manualName ||
            localizedNames.nameEn ||
            masterNames?.nameEn ||
            masterNames?.name ||
            row.processName,
          nameVi: manualName || localizedNames.nameVi || masterNames?.nameVi,
          processComposition: normalizedComposition,
          description: row.processDescription ?? null,
          timesPerPiece: row.timesPerPiece ?? 1,
          pt: toOptionalProcessSeconds(row.ptSeconds),
          atParams: toStyleAtParams(row.atParams),
          stBuckets: ensureArray(row.standards).map((standard) => ({
            bucketQuantity: toPositiveIntOrNull((standard as any)?.bucketQuantity),
            bucketStSeconds: toOptionalProcessSeconds((standard as any)?.bucketStSeconds),
            setBy: resolveOptionalString((standard as any)?.setBy, null),
            setAt:
              (standard as any)?.setAt instanceof Date
                ? (standard as any).setAt.toISOString()
                : resolveOptionalString((standard as any)?.setAt, null),
            updatedAt:
              (standard as any)?.updatedAt instanceof Date
                ? (standard as any).updatedAt.toISOString()
                : resolveOptionalString((standard as any)?.updatedAt, null),
          })),
          timeRefQuantity:
            ensureArray(row.standards)[0]?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY,
          workRecordCount,
          hasWorkRecords: workRecordCount > 0,
          instanceId: `${row.processCode || "PROC"}-${row.id || index}-${index}`,
        });
      });
  })();

const loadStyleProcessRowsByStyleId = async (
  styleIds: number[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => {
  const db = options.db ?? prisma;
  const processOrgId = toPositiveIntOrNull(options.processOrgId);
  const normalizedStyleIds = Array.from(
    new Set(
      ensureArray(styleIds)
        .map((styleId) => toPositiveIntOrNull(styleId))
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  if (normalizedStyleIds.length === 0) return new Map<number, any[]>();
  const rows = await db.styleProcess.findMany({
    where: {
      styleId: { in: normalizedStyleIds },
      ...(processOrgId !== null ? { orgId: processOrgId } : {}),
    },
    include: STYLE_PROCESS_STANDARD_INCLUDE,
    orderBy: [{ styleId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.reduce((map, row) => {
    const current = map.get(row.styleId) || [];
    current.push(row);
    map.set(row.styleId, current);
    return map;
  }, new Map<number, any[]>());
};

const refreshStyleProcessMirrorForStyleIds = async (
  styleIds: number[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => loadStyleProcessRowsByStyleId(styleIds, options);

const loadStyleProcessMirrorMapForStyleIds = async (
  styleIds: number[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => {
  const db = options.db ?? prisma;
  const processOrgId = toPositiveIntOrNull(options.processOrgId);
  const normalizedStyleIds = Array.from(
    new Set(
      ensureArray(styleIds)
        .map((styleId) => toPositiveIntOrNull(styleId))
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  if (normalizedStyleIds.length === 0) return new Map<number, any[]>();

  const rowsByStyleId = await loadStyleProcessRowsByStyleId(normalizedStyleIds, {
    processOrgId,
    db,
  });
  const processNameLookup = await loadStyleProcessNameLookup({
    orgId: processOrgId,
    processCodes: Array.from(rowsByStyleId.values()).flatMap((rows) =>
      ensureArray(rows).map((row) => row?.processCode)
    ),
    db,
  });

  return normalizedStyleIds.reduce((map, styleId) => {
    map.set(
      styleId,
      buildStyleProcessMirrorFromRows(
        rowsByStyleId.get(styleId) || [],
        processNameLookup
      )
    );
    return map;
  }, new Map<number, any[]>());
};

const attachLiveStyleProcessMirrorsToAssignmentPlans = async ({
  orgId,
  plans,
  db = prisma,
}: {
  orgId: number;
  plans: any[];
  db?: StyleStorageClient;
}) => {
  const assignmentPlanStyleIds = Array.from(
    new Set(
      ensureArray(plans)
        .map((plan) => toPositiveIntOrNull(plan?.style?.id))
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  if (assignmentPlanStyleIds.length === 0) return plans;

  const liveProcessMirrorMap = await loadStyleProcessMirrorMapForStyleIds(
    assignmentPlanStyleIds,
    {
      processOrgId: orgId,
      db,
    }
  );

  return ensureArray(plans).map((plan) => {
    const styleId = toPositiveIntOrNull(plan?.style?.id);
    if (styleId === null) return plan;
    const liveProcesses = liveProcessMirrorMap.get(styleId) ?? [];
    if (liveProcesses.length === 0) return plan;
    return {
      ...plan,
      style: {
        ...(plan?.style ?? {}),
        processes: liveProcesses,
      },
    };
  });
};

const syncStyleProcessStorageForStyle = async ({
  styleId,
  orgId,
  processes,
  db = prisma,
}: {
  styleId: number;
  orgId: number;
  processes: any;
  db?: StyleStorageClient;
}) => {
  const processOrgId = toPositiveIntOrNull(orgId);
  if (processOrgId === null) {
    throw createHttpError(400, "invalid style process orgId");
  }
  const drafts = buildStyleProcessStorageDrafts(processes);
  const existingRows = await db.styleProcess.findMany({
    where: { styleId, orgId: processOrgId },
    select: {
      id: true,
      processCode: true,
      processName: true,
      standards: {
        select: {
          bucketQuantity: true,
          bucketStSeconds: true,
          setBy: true,
          setAt: true,
          updatedAt: true,
        },
      },
      _count: { select: { workRecords: true } },
    },
  });
  const existingById = new Map(existingRows.map((row) => [Number(row.id), row]));
  const existingByCode = new Map(
    existingRows.map((row) => [normalizeProcessCodeKey(row.processCode), row])
  );
  const invalidDraftIds = drafts
    .map((draft) => toPositiveIntOrNull(draft?.styleProcessId))
    .filter((id): id is number => id !== null && !existingById.has(id));
  if (invalidDraftIds.length > 0) {
    throw createHttpError(
      409,
      `스타일 공정 참조가 현재 스타일과 일치하지 않습니다. 페이지를 새로고침한 뒤 다시 시도해주세요. 대상: ${invalidDraftIds
        .slice(0, 5)
        .join(", ")}`
    );
  }
  const draftTargets = drafts.map((draft) => {
    const draftId = toPositiveIntOrNull(draft?.styleProcessId);
    const existingByDraftId =
      draftId !== null ? existingById.get(draftId) ?? null : null;
    const existingByDraftCode =
      existingByCode.get(normalizeProcessCodeKey(draft.processCode)) ?? null;
    return {
      draft,
      existingRow: existingByDraftId ?? existingByDraftCode,
    };
  });
  const nextExistingIds = new Set(
    draftTargets
      .map(({ existingRow }) => toPositiveIntOrNull(existingRow?.id))
      .filter((id): id is number => id !== null)
  );
  const seenDraftExistingIds = new Set<number>();
  for (const { existingRow } of draftTargets) {
    const existingRowId = toPositiveIntOrNull(existingRow?.id);
    if (existingRowId === null) continue;
    if (seenDraftExistingIds.has(existingRowId)) {
      throw createHttpError(
        400,
        "같은 스타일 공정이 저장 payload에 두 번 포함되어 있습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."
      );
    }
    seenDraftExistingIds.add(existingRowId);
  }

  if (existingRows.length > 0) {
    const rowsToDelete = existingRows.filter((row) => !nextExistingIds.has(row.id));
    const blockedDeletes = rowsToDelete.filter(
      (row) => Number(row?._count?.workRecords ?? 0) > 0
    );
    if (blockedDeletes.length > 0) {
      const labels = blockedDeletes
        .slice(0, 5)
        .map((row) => row.processCode || row.processName || `#${row.id}`)
        .join(", ");
      throw createHttpError(
        409,
        `작업기록이 연결된 공정은 삭제할 수 없습니다. 공정 구조를 바꾸려면 기존 공정을 남기고 새 공정을 추가해주세요. 대상: ${labels}`
      );
    }
    const deleteIds = rowsToDelete.map((row) => row.id);
    if (deleteIds.length > 0) {
      await db.styleProcess.deleteMany({
        where: { id: { in: deleteIds } },
      });
    }
  }

  for (const { draft, existingRow } of draftTargets) {
    const existingId = existingRow?.id;
    const row = existingId
      ? await db.styleProcess.update({
          where: { id: existingId },
          data: {
            processCode: draft.processCode,
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        })
      : await db.styleProcess.upsert({
          where: {
            styleId_orgId_processCode: {
              styleId,
              orgId: processOrgId,
              processCode: draft.processCode,
            },
          },
          update: {
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
          create: {
            orgId: processOrgId,
            styleId,
            processCode: draft.processCode,
            processName: draft.processName,
            processComposition: draft.processComposition ?? Prisma.JsonNull,
            processDescription: draft.processDescription,
            timesPerPiece: draft.timesPerPiece,
            sortOrder: draft.sortOrder,
            ptSeconds: draft.ptSeconds,
            atParams: draft.atParams,
          },
        });
    if (!existingRow) {
      await db.styleProcessStandard.deleteMany({
        where: { styleProcessId: row.id },
      });
      if (draft.stBuckets.length > 0) {
        await db.styleProcessStandard.createMany({
          data: draft.stBuckets.map((stValue: StyleStBucket) => ({
            orgId: processOrgId,
            styleProcessId: row.id,
            bucketQuantity: stValue.bucketQuantity,
            bucketStSeconds: stValue.bucketStSeconds,
            setBy: stValue.setBy,
            setAt: stValue.setAt ? new Date(stValue.setAt) : undefined,
          })),
          skipDuplicates: true,
        });
      }
      continue;
    }

    if (draft.stBucketWriteMode !== STYLE_PROCESS_ST_WRITE_MODE_MANUAL_EDIT) {
      continue;
    }

    const updateQuantities = ensureArray(draft.stBucketUpdateQuantities)
      .map((quantity) => toPositiveIntOrNull(quantity))
      .filter((quantity): quantity is number => quantity !== null);
    if (updateQuantities.length === 0) {
      continue;
    }
    const stBucketByQuantity = ensureArray(draft.stBuckets).reduce(
      (map, stValue) => {
        const bucketQuantity = toPositiveIntOrNull((stValue as any)?.bucketQuantity);
        const bucketStSeconds = toOptionalProcessSeconds(
          (stValue as any)?.bucketStSeconds
        );
        if (bucketQuantity === null || bucketStSeconds === null || bucketStSeconds <= 0) {
          return map;
        }
        map.set(bucketQuantity, {
          bucketQuantity,
          bucketStSeconds,
          setBy: resolveOptionalString((stValue as any)?.setBy, null) ?? "MANUAL",
          setAt: resolveOptionalString((stValue as any)?.setAt, null),
        });
        return map;
      },
      new Map<number, StyleStBucket>()
    );
    const now = new Date();
    await Promise.all(
      updateQuantities.map(async (bucketQuantity) => {
        const stValue = stBucketByQuantity.get(bucketQuantity) ?? null;
        if (!stValue) {
          await db.styleProcessStandard.deleteMany({
            where: {
              styleProcessId: row.id,
              bucketQuantity,
            },
          });
          return;
        }
        await db.styleProcessStandard.upsert({
          where: {
            styleProcessId_bucketQuantity: {
              styleProcessId: row.id,
              bucketQuantity,
            },
          },
          create: {
            orgId: processOrgId,
            styleProcessId: row.id,
            bucketQuantity,
            bucketStSeconds: stValue.bucketStSeconds,
            setBy: stValue.setBy,
            setAt: stValue.setAt ? new Date(stValue.setAt) : now,
          },
          update: {
            bucketStSeconds: stValue.bucketStSeconds,
            setBy: stValue.setBy,
            setAt: stValue.setAt ? new Date(stValue.setAt) : now,
          },
        });
      })
    );
  }

  const rowsByStyleId = await refreshStyleProcessMirrorForStyleIds([styleId], {
    processOrgId,
    db,
  });
  const rows = rowsByStyleId.get(styleId) || [];
  const processNameLookup = await loadStyleProcessNameLookup({
    orgId: processOrgId,
    processCodes: rows.map((row) => row?.processCode),
    db,
  });
  return buildStyleProcessMirrorFromRows(rows, processNameLookup, processes);
};

const isStyleProcessStorageOutOfSync = ({
  style,
  rows,
}: {
  style: any;
  rows: any[];
}) => {
  const drafts = buildStyleProcessStorageDrafts(style?.processes);
  if (drafts.length === 0) return false;
  if (rows.length !== drafts.length) return true;

  const rowsByCode = ensureArray(rows).reduce((map, row) => {
    const codeKey = normalizeProcessCodeKey(row?.processCode);
    if (!codeKey) return map;
    map.set(codeKey, row);
    return map;
  }, new Map<string, any>());

  for (const draft of drafts) {
    const codeKey = normalizeProcessCodeKey(draft?.processCode);
    if (!codeKey) return true;
    const row = rowsByCode.get(codeKey);
    if (!row) return true;

    const draftPtSeconds = toOptionalProcessSeconds(draft?.ptSeconds);
    const rowPtSeconds = toOptionalProcessSeconds(row?.ptSeconds);
    if (draftPtSeconds !== rowPtSeconds) return true;

    const draftTimesPerPiece = toPositiveInt(draft?.timesPerPiece, 1);
    const rowTimesPerPiece = toPositiveInt(row?.timesPerPiece, 1);
    if (draftTimesPerPiece !== rowTimesPerPiece) return true;
  }

  return false;
};

const ensureStyleProcessStorageForStyles = async (
  styles: any[],
  options: {
    processOrgId?: number | null;
    db?: StyleStorageClient;
  } = {}
) => {
  const db = options.db ?? prisma;
  const processOrgId = toPositiveIntOrNull(options.processOrgId);
  const styleRows = ensureArray(styles).filter(
    (style) => style && typeof style === "object" && Number.isFinite(Number(style?.id))
  );
  if (styleRows.length === 0) return new Map<number, any[]>();

  let rowsByStyleId = await loadStyleProcessRowsByStyleId(
    styleRows.map((style) => Number(style.id)),
    { processOrgId, db }
  );
  const missingStyles = styleRows.filter((style) => {
    if ((rowsByStyleId.get(Number(style.id)) || []).length > 0) return false;
    return normalizeStyleProcesses(style?.processes).length > 0;
  });

  for (const style of missingStyles) {
    const seedOrgId = processOrgId ?? Number(style.orgId);
    if (!Number.isFinite(seedOrgId) || seedOrgId <= 0) continue;
    await syncStyleProcessStorageForStyle({
      styleId: Number(style.id),
      orgId: seedOrgId,
      processes: style.processes,
      db,
    });
  }

  if (missingStyles.length > 0) {
    rowsByStyleId = await loadStyleProcessRowsByStyleId(
      styleRows.map((style) => Number(style.id)),
      { processOrgId, db }
    );
  }

  const outOfSyncStyles = styleRows.filter((style) =>
    isStyleProcessStorageOutOfSync({
      style,
      rows: rowsByStyleId.get(Number(style.id)) || [],
    })
  );

  for (const style of outOfSyncStyles) {
    const seedOrgId = processOrgId ?? Number(style.orgId);
    if (!Number.isFinite(seedOrgId) || seedOrgId <= 0) continue;
    await syncStyleProcessStorageForStyle({
      styleId: Number(style.id),
      orgId: seedOrgId,
      processes: style.processes,
      db,
    });
  }

  if (outOfSyncStyles.length > 0) {
    rowsByStyleId = await loadStyleProcessRowsByStyleId(
      styleRows.map((style) => Number(style.id)),
      { processOrgId, db }
    );
  }

  const processNameLookup = await loadStyleProcessNameLookup({
    orgId: processOrgId,
    processCodes: Array.from(rowsByStyleId.values()).flatMap((rows) =>
      ensureArray(rows).map((row) => row?.processCode)
    ),
    db,
  });

  return styleRows.reduce((map, style) => {
    const styleId = Number(style.id);
    const rows = rowsByStyleId.get(styleId) || [];
    map.set(
      styleId,
      rows.length > 0
        ? buildStyleProcessMirrorFromRows(rows, processNameLookup, style.processes)
        : processOrgId !== null && Number(style.orgId) !== processOrgId
          ? []
          : normalizeStyleProcesses(style.processes)
    );
    return map;
  }, new Map<number, any[]>());
};

const collectStyleQuantityRequirementsFromOrders = ({
  orders,
  styles,
}: {
  orders: any[];
  styles: any[];
}) => {
  const quantityByStyleId = new Map<number, Set<number>>();

  ensureArray(orders).forEach((order) => {
    const quantityByStyleIdInOrder = new Map<number, number>();
    const itemsFromRelation =
      Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
        ? [...order.workOrderItems]
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(workOrderItemToItemShape)
        : null;
    const items = itemsFromRelation ?? [];
    items.forEach((item) => {
      // item.styleId is the numeric Style FK - look it up directly instead of
      // via a style.code candidate map (that mismatch was the root cause of
      // AssignmentCard staying empty, see buildAssignmentCardsFromOrders).
      const styleId = toPositiveIntOrNull(item?.styleId);
      if (styleId === null) return;
      const normalizedQuantity = toPositiveIntOrNull(sumOrderItemQuantity(item));
      if (normalizedQuantity === null) return;
      quantityByStyleIdInOrder.set(
        styleId,
        (quantityByStyleIdInOrder.get(styleId) || 0) + normalizedQuantity
      );
    });

    quantityByStyleIdInOrder.forEach((quantity, styleId) => {
      const current = quantityByStyleId.get(styleId) || new Set<number>();
      current.add(resolveStBucketQuantity(quantity));
      quantityByStyleId.set(styleId, current);
    });
  });

  return quantityByStyleId;
};

const ensureStyleStandardsForQuantities = async ({
  styles,
  quantityByStyleId,
  processOrgId = null,
  db = prisma,
}: {
  styles: any[];
  quantityByStyleId: Map<number, Set<number>>;
  processOrgId?: number | null;
  db?: StyleStorageClient;
}) => {
  const styleIds = Array.from(quantityByStyleId.keys());
  if (styleIds.length === 0) {
    return ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
  }

  await ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
  const rowsByStyleId = await loadStyleProcessRowsByStyleId(styleIds, {
    processOrgId,
    db,
  });
  const touchedStyleIds = new Set<number>();

  for (const styleId of styleIds) {
    const requiredQuantities = Array.from(quantityByStyleId.get(styleId) || []);
    const processRows = rowsByStyleId.get(styleId) || [];
    for (const processRow of processRows) {
      const existingQuantities = new Set(
        ensureArray(processRow.standards).map((standard) =>
          toPositiveIntOrNull((standard as any)?.bucketQuantity)
        )
      );
      const ptSeconds = toOptionalProcessSeconds(processRow.ptSeconds);
      if (ptSeconds === null) continue;
      const missingQuantities = requiredQuantities.filter(
        (quantity) => !existingQuantities.has(quantity)
      );
      if (missingQuantities.length === 0) continue;
      await db.styleProcessStandard.createMany({
        data: missingQuantities.map((quantity) => ({
          orgId: processRow.orgId,
          styleProcessId: processRow.id,
          bucketQuantity: quantity,
          bucketStSeconds: ptSeconds,
          setBy: "PT_DERIVED",
        })),
        skipDuplicates: true,
      });
      touchedStyleIds.add(styleId);
    }
  }

  if (touchedStyleIds.size > 0) {
    await refreshStyleProcessMirrorForStyleIds(Array.from(touchedStyleIds), {
      processOrgId,
      db,
    });
  }

  return ensureStyleProcessStorageForStyles(styles, { processOrgId, db });
};

const toStyleResponse = (
  style: any,
  options: {
    includeProcesses?: boolean;
    processMirrorMap?: Map<number, any[]>;
  } = {}
) => {
  const owner = style.organization ?? null;
  const ownerOrgName = resolveOptionalString(owner?.name, "") ?? "";
  return {
    id: style.id,
    styleId: style.id,
    ownerOrgId: style.orgId ?? null,
    customerOrgId: style.orgId ?? null,
    ownerOrgName,
    code: style.code ?? "",
    styleCode: style.code ?? "",
    name: style.name ?? "",
    customer: ownerOrgName,
    customerNameKo: resolveOptionalString(owner?.nameKo, "") ?? "",
    customerNameVi: resolveOptionalString(owner?.nameVi, "") ?? "",
    registrationDate: style.registrationDate ?? "",
    designer: style.designer ?? "",
    collection: style.collection ?? "",
    season: style.season ?? "",
    imageUrls: ensureArray(style.imageUrls),
    processes:
      options.includeProcesses === false
        ? []
        : options.processMirrorMap?.get(Number(style.id)) ?? [],
    bom: ensureArray(style.bom),
    bomNotes: style.bomNotes ?? "",
    revenueMemo: style.revenueMemo ?? "",
    createdAt: style.createdAt,
    updatedAt: style.updatedAt,
    workRecordCount: Number(style._count?.workRecords ?? 0),
    hasWorkRecords: Number(style._count?.workRecords ?? 0) > 0,
  };
};

const sumOrderItemQuantity = (item: any = {}) => {
  const direct = Number(item?.totalQuantity);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);

  const fromSizeQuantities = Object.values(item?.sizeQuantities ?? {}).reduce(
    (sum: number, value: any) => sum + (Number(value) || 0),
    0
  );
  if (fromSizeQuantities > 0) return Math.round(fromSizeQuantities);

  const fromLegacyRows = ensureArray(item?.quantities).reduce(
    (sum: number, row: any) => sum + (Number(row?.quantity) || 0),
    0
  );
  if (fromLegacyRows > 0) return Math.round(fromLegacyRows);

  return 0;
};

const normalizeOrderItemSizeKey = (value: unknown): string => {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return "";
  if (raw === "XXL" || raw === "2X") return "2XL";
  if (raw === "XXXL" || raw === "3X") return "3XL";
  if (raw === "XXXXL" || raw === "4X") return "4XL";
  if (
    raw === "FREE" ||
    raw === "FREESIZE" ||
    raw === "ONESIZE" ||
    raw === "ONESZ" ||
    raw === "F"
  ) {
    return "FREE";
  }
  return raw;
};

const normalizeOrderItemSizeQuantities = (item: any = {}) => {
  const next: Record<string, number> = {};
  const directEntries =
    item?.sizeQuantities && typeof item.sizeQuantities === "object"
      ? Object.entries(item.sizeQuantities)
      : [];
  directEntries.forEach(([rawKey, rawValue]) => {
    const sizeKey = normalizeOrderItemSizeKey(rawKey);
    if (!sizeKey) return;
    const quantity = Math.max(0, Math.round(Number(rawValue) || 0));
    next[sizeKey] = quantity;
  });
  if (Object.values(next).some((quantity) => quantity > 0)) {
    return next;
  }

  ensureArray(item?.quantities).forEach((row: any) => {
    const sizeKey = normalizeOrderItemSizeKey(
      row?.sizeId ?? row?.sizeName ?? row?.size
    );
    if (!sizeKey) return;
    const quantity = Math.max(0, Math.round(Number(row?.quantity) || 0));
    if (quantity <= 0) return;
    next[sizeKey] = (next[sizeKey] || 0) + quantity;
  });
  return next;
};

const resolveOrderItemColorCode = (item: any = {}, sizeQuantities: Record<string, number>) => {
  const directColorCode =
    resolveOptionalString(item?.colorCode ?? item?.color, null) ?? "";
  if (directColorCode) return directColorCode;

  for (const row of ensureArray(item?.quantities)) {
    const rowColorCode =
      resolveOptionalString(row?.colorCode ?? row?.color, null) ?? "";
    if (rowColorCode) return rowColorCode;
    const rowColorId = resolveOptionalString(row?.colorId, null) ?? "";
    if (rowColorId && !WORK_ORDER_ITEM_GENDER_CODES.has(rowColorId.toUpperCase())) {
      return rowColorId;
    }
  }

  if (Object.values(sizeQuantities).some((quantity) => quantity > 0)) {
    const rawColorId = resolveOptionalString(item?.colorId, null) ?? "";
    if (rawColorId && !WORK_ORDER_ITEM_GENDER_CODES.has(rawColorId.toUpperCase())) {
      return rawColorId;
    }
  }

  return "";
};

const resolveOrderItemColorId = (item: any = {}) => {
  const directColorId = toPositiveIntOrNull(item?.colorId);
  if (directColorId !== null) return directColorId;
  for (const row of ensureArray(item?.quantities)) {
    const legacyColorId = toPositiveIntOrNull(row?.colorId);
    if (legacyColorId !== null) return legacyColorId;
  }
  return null;
};

const resolveOrderItemColorName = (item: any = {}, fallbackCode = "") => {
  const directName = resolveOptionalString(item?.colorName, null);
  if (directName) return directName;
  for (const row of ensureArray(item?.quantities)) {
    const legacyName = resolveOptionalString(row?.colorName ?? row?.color, null);
    if (legacyName) return legacyName;
  }
  return fallbackCode;
};

const resolveOrderItemGender = (item: any = {}) => {
  const directGender = normalizeWorkOrderItemGender(item?.gender, null);
  if (directGender) return directGender;
  for (const row of ensureArray(item?.quantities)) {
    const legacyGender = normalizeWorkOrderItemGender(
      row?.gender ?? row?.colorId,
      null
    );
    if (legacyGender) return legacyGender;
  }
  return "M";
};

const normalizeOrderItems = (value: any): any[] =>
  ensureArray(value)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const { quantities: _legacyQuantities, ...rest } = item as Record<string, unknown>;
      const sizeQuantities = normalizeOrderItemSizeQuantities(item);
      const colorCode = resolveOrderItemColorCode(item, sizeQuantities);
      return {
        ...rest,
        colorId: resolveOrderItemColorId(item),
        colorCode,
        colorName: resolveOrderItemColorName(item, colorCode),
        gender: resolveOrderItemGender(item),
        sizeQuantities,
        totalQuantity: sumOrderItemQuantity({
          ...item,
          sizeQuantities,
        }),
      };
    });

const syncOrderItemColorSnapshots = async (items: any) => {
  const normalizedItems = normalizeOrderItems(items);
  const colorIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => toPositiveIntOrNull(item?.colorId))
        .filter((value): value is number => value !== null)
    )
  );

  if (colorIds.length === 0) {
    return normalizedItems.map((item) => {
      const colorCode =
        resolveOptionalString(item?.colorCode ?? item?.color, null) ?? "";
      return {
        ...item,
        colorId: toPositiveIntOrNull(item?.colorId),
        colorCode,
        colorName: resolveOrderItemColorName(item, colorCode),
      };
    });
  }

  const colors = await prisma.attrColor.findMany({
    where: { id: { in: colorIds } },
    select: { id: true, code: true, name: true },
  });
  const colorById = colors.reduce((map, color) => {
    map.set(color.id, color);
    return map;
  }, new Map<number, { id: number; code: string; name: string }>());

  return normalizedItems.map((item) => {
    const colorId = toPositiveIntOrNull(item?.colorId);
    const linkedColor = colorId ? colorById.get(colorId) ?? null : null;
    const colorCode =
      resolveOptionalString(linkedColor?.code, null) ??
      resolveOptionalString(item?.colorCode ?? item?.color, null) ??
      "";

    return {
      ...item,
      colorId: linkedColor?.id ?? null,
      colorCode,
      colorName:
        resolveOptionalString(linkedColor?.name, null) ??
        resolveOrderItemColorName(item, colorCode),
    };
  });
};
const syncOrderItemStyleRefs = async (items: any, orgIds: any[]) => {
  const normalizedItems = normalizeOrderItems(items);
  void orgIds;
  return normalizedItems.map((item) => ({
    ...item,
    styleId: toPositiveIntOrNull(item?.style?.id ?? item?.styleId),
    styleName: resolveOptionalString(item?.style?.name ?? item?.styleName, null),
    styleCode: resolveOptionalString(item?.style?.code ?? item?.styleCode, null),
  }));
};

const buildOrderId = () =>
  `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_CREATE_SERIALIZABLE_RETRIES = 2;
const WORK_ORDER_ITEM_WITH_COLOR_INCLUDE = {
  orderBy: { sortOrder: "asc" as const },
  include: {
    style: {
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
const WORK_ORDER_PARTY_INCLUDE = {
  buyerOrg: {
    select: { id: true, name: true, nameKo: true, nameVi: true },
  },
  sellerOrg: {
    select: { id: true, name: true, nameKo: true, nameVi: true },
  },
  customerOrg: {
    select: { id: true, name: true, nameKo: true, nameVi: true },
  },
};
const WORK_ORDER_RESPONSE_INCLUDE = {
  ...WORK_ORDER_PARTY_INCLUDE,
  workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE,
};

const normalizeOrderPayload = (payload: any = {}, fallback: any = null) => {
  const fallbackOrderId =
    typeof fallback?.orderId === "string" ? fallback.orderId.trim() : "";
  const payloadOrderId =
    typeof payload?.id === "string" ? payload.id.trim() : "";
  const orderId = payloadOrderId || fallbackOrderId || buildOrderId();

  const fallbackOrderNumber =
    typeof fallback?.orderNumber === "string" ? fallback.orderNumber : "";
  const orderNumber =
    typeof payload?.orderNumber === "string"
      ? payload.orderNumber.trim()
      : fallbackOrderNumber;

  const fallbackItemsFromRelation =
    Array.isArray(fallback?.workOrderItems) && fallback.workOrderItems.length > 0
      ? [...fallback.workOrderItems]
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(workOrderItemToItemShape)
      : [];
  const items = normalizeOrderItems(
    payload?.items !== undefined ? payload.items : fallbackItemsFromRelation
  );
  const computedTotalQuantity = items.reduce(
    (sum, item) => sum + (Number(item?.totalQuantity) || 0),
    0
  );
  const buyerOrgId = toPositiveIntOrNull(
    payload?.buyerOrgId !== undefined ? payload.buyerOrgId : fallback?.buyerOrgId
  );
  const customerId = toPositiveIntOrNull(
    payload?.customerId !== undefined ? payload.customerId : fallback?.customerId
  );
  const resolvedCustomerId = customerId ?? buyerOrgId;
  const resolvedBuyerOrgId = buyerOrgId ?? resolvedCustomerId;
  const confirmationStatus = resolveWorkOrderConfirmationStatus(
    fallback?.confirmationStatus ?? payload?.confirmationStatus,
    "PLANNED"
  );
  const status = resolveCanonicalWorkOrderStatusForLockState({
    status: payload?.status ?? fallback?.status,
    isManualLocked: Boolean(fallback?.modificationLockedAt),
  });

  return {
    orderId,
    orderNumber,
    buyerOrgId: resolvedBuyerOrgId,
    sellerOrgId: toNumberOrNull(
      payload?.sellerOrgId !== undefined
        ? payload.sellerOrgId
        : fallback?.sellerOrgId
    ),
    customerId: resolvedCustomerId,
    dueDate: resolveOptionalString(payload?.dueDate, fallback?.dueDate ?? null),
    status,
    confirmationStatus,
    items,
    totalQuantity: toNonNegativeInt(
      payload?.totalQuantity !== undefined
        ? payload.totalQuantity
        : fallback?.totalQuantity,
      computedTotalQuantity
    ),
  };
};

const getOrderAccessWhere = (orgId: number) => [
  { orgId },
  { buyerOrgId: orgId },
  { sellerOrgId: orgId },
];

const resolveOrderPartiesOrThrow = async ({
  buyerOrgId,
  sellerOrgId,
  requesterOrgId,
}: {
  buyerOrgId: number | null;
  sellerOrgId: number | null;
  requesterOrgId: number;
}) => {
  if (!buyerOrgId) {
    throw createHttpError(400, "buyerOrgId is required");
  }
  if (!sellerOrgId) {
    throw createHttpError(400, "sellerOrgId is required");
  }
  if (buyerOrgId === sellerOrgId) {
    throw createHttpError(400, "buyer and seller must be different organizations");
  }
  if (requesterOrgId !== buyerOrgId && requesterOrgId !== sellerOrgId) {
    throw createHttpError(403, "request organization must be buyer or seller");
  }

  const organizations = await prisma.organization.findMany({
    where: { id: { in: [buyerOrgId, sellerOrgId] } },
    select: { id: true, name: true, nameKo: true, nameVi: true, type: true },
  });

  const buyer = organizations.find((item) => item.id === buyerOrgId) ?? null;
  const seller = organizations.find((item) => item.id === sellerOrgId) ?? null;
  if (!buyer || !seller) {
    throw createHttpError(400, "buyer or seller organization not found");
  }
  if (!isBrandOrg(buyer)) {
    throw createHttpError(400, "buyer organization must be BRAND");
  }
  if (!isManufacturerOrg(seller)) {
    throw createHttpError(400, "seller organization must be MANUFACTURER");
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: {
      brandOrgId: buyerOrgId,
      manufacturerOrgId: sellerOrgId,
    },
    select: { id: true },
  });
  if (!relationship) {
    throw createHttpError(400, "buyer and seller must have an active relationship");
  }

  return { buyer, seller };
};

const findSharedOrderConflict = async ({
  buyerOrgId,
  sellerOrgId,
  orderNumber,
  excludeOrderRecordId = null,
}: {
  buyerOrgId: number;
  sellerOrgId: number;
  orderNumber: string;
  excludeOrderRecordId?: number | null;
}) => {
  const normalizedOrderNumber = String(orderNumber || "").trim();
  if (!normalizedOrderNumber) return null;

  return prisma.workOrder.findFirst({
    where: {
      buyerOrgId,
      sellerOrgId,
      orderNumber: normalizedOrderNumber,
      ...(excludeOrderRecordId ? { NOT: { id: excludeOrderRecordId } } : {}),
    },
    select: { id: true, orderId: true },
    orderBy: { id: "asc" },
  });
};

const createOrReuseSharedOrder = async ({
  normalized,
}: {
  normalized: any;
}) => {
  const resolvedOwnerOrgId = toPositiveIntOrNull(normalized?.buyerOrgId);
  if (!resolvedOwnerOrgId) {
    throw createHttpError(400, "buyerOrgId is required");
  }

  for (let attempt = 0; attempt <= ORDER_CREATE_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.workOrder.findFirst({
            where: {
              buyerOrgId: normalized.buyerOrgId,
              sellerOrgId: normalized.sellerOrgId,
              orderNumber: normalized.orderNumber,
            },
            include: WORK_ORDER_RESPONSE_INCLUDE,
            orderBy: { id: "asc" },
          });
          if (existing) {
            if (existing.orgId !== resolvedOwnerOrgId) {
              const normalizedExisting = await tx.workOrder.update({
                where: { id: existing.id },
                data: { orgId: resolvedOwnerOrgId },
                include: WORK_ORDER_RESPONSE_INCLUDE,
              });
              return { order: normalizedExisting, created: false };
            }
            return { order: existing, created: false };
          }

          const { items: _createItems, ...workOrderCreateData } = normalized;
          const created = await tx.workOrder.create({
            data: {
              orgId: resolvedOwnerOrgId,
              ...workOrderCreateData,
              // WorkOrderItem (created below) is the source of truth; do not
              // duplicate the items array into the WorkOrder.items JSON column.
              items: Prisma.JsonNull,
            },
          });
          const itemsToCreate = normalizeOrderItems(normalized.items);
          if (itemsToCreate.length > 0) {
            await tx.workOrderItem.createMany({
              data: itemsToCreate.map((item: any, idx: number) => ({
                workOrderId: created.id,
                itemId: item.id || "",
                styleId: toPositiveIntOrNull(item.styleId),
                colorId: toPositiveIntOrNull(item.colorId),
                gender: normalizeWorkOrderItemGender(item.gender, "M"),
                sizeQuantities: item.sizeQuantities ?? null,
                totalQuantity: toNonNegativeInt(item.totalQuantity, 0),
                sortOrder: idx,
              })),
            });
          }
          const createdWithItems = await tx.workOrder.findUnique({
            where: { id: created.id },
            include: WORK_ORDER_RESPONSE_INCLUDE,
          });
          return { order: createdWithItems ?? created, created: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }
      );
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "P2034" && attempt < ORDER_CREATE_SERIALIZABLE_RETRIES) {
        continue;
      }
      if (code === "P2002") {
          const existing = await prisma.workOrder.findFirst({
            where: {
              buyerOrgId: normalized.buyerOrgId,
              sellerOrgId: normalized.sellerOrgId,
              orderNumber: normalized.orderNumber,
            },
            include: WORK_ORDER_RESPONSE_INCLUDE,
            orderBy: { id: "asc" },
          });
        if (existing) {
          if (existing.orgId !== resolvedOwnerOrgId) {
            const normalizedExisting = await prisma.workOrder.update({
              where: { id: existing.id },
              data: { orgId: resolvedOwnerOrgId },
              include: WORK_ORDER_RESPONSE_INCLUDE,
            });
            return { order: normalizedExisting, created: false };
          }
          return { order: existing, created: false };
        }
      }
      throw error;
    }
  }

  throw createHttpError(409, "failed to create order due to concurrent updates");
};

const workOrderItemToItemShape = (row: any) => ({
  id: row.itemId || String(row.id),
  styleId: resolveWorkOrderItemStyleId(row),
  styleName: resolveWorkOrderItemStyleName(row) ?? "",
  styleCode: resolveWorkOrderItemStyleCode(row) ?? "",
  colorId: toPositiveIntOrNull(row?.color?.id ?? row?.colorId),
  colorCode: row?.color?.code ?? "",
  colorName: resolveWorkOrderItemColorName(row),
  gender: normalizeWorkOrderItemGender(row?.gender, "M") ?? "M",
  sizeQuantities: row.sizeQuantities ?? {},
  totalQuantity: row.totalQuantity ?? 0,
});

const toOrderResponse = (
  order: any,
  options: {
    isAssignmentModificationLocked?: boolean;
  } = {}
) => {
  const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
    ? [...order.workOrderItems]
        .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(workOrderItemToItemShape)
    : null;
  const items = itemsFromRelation ?? [];
  const ownerOrgId = order.buyerOrgId ?? order.orgId ?? null;
  const buyerOrg = order.buyerOrg ?? null;
  const sellerOrg = order.sellerOrg ?? null;
  const customerOrg = order.customerOrg ?? buyerOrg;
  const buyerOrgName = resolveOptionalString(buyerOrg?.name, "") ?? "";
  const customerName = resolveOptionalString(customerOrg?.name, buyerOrgName) ?? "";
  const isManualModificationLocked = Boolean(order?.modificationLockedAt);
  const isAssignmentModificationLocked = Boolean(options.isAssignmentModificationLocked);
  const isModificationLocked = isManualModificationLocked;
  const status = resolveCanonicalWorkOrderStatusForLockState({
    status: order.status,
    isManualLocked: isManualModificationLocked,
  });
  return {
    id: order.orderId,
    ownerOrgId,
    orderNumber: order.orderNumber ?? "",
    buyerOrgId: order.buyerOrgId ?? null,
    buyerOrgName,
    buyerOrgNameKo: resolveOptionalString(buyerOrg?.nameKo, "") ?? "",
    buyerOrgNameVi: resolveOptionalString(buyerOrg?.nameVi, "") ?? "",
    sellerOrgId: order.sellerOrgId ?? null,
    sellerOrgName: resolveOptionalString(sellerOrg?.name, "") ?? "",
    customerId: order.customerId ?? order.buyerOrgId ?? null,
    customerName,
    customer: customerName,
    dueDate: order.dueDate ?? "",
    status,
    confirmationStatus: resolveWorkOrderConfirmationStatus(
      order.confirmationStatus,
      "PLANNED"
    ),
    items,
    totalQuantity: toNonNegativeInt(order.totalQuantity, 0),
    isModificationLocked,
    isManualModificationLocked,
    isAssignmentModificationLocked,
    canToggleModificationLock: true,
    modificationLockedAt: order.modificationLockedAt ?? null,
    modificationLockedBy: order.modificationLockedBy ?? "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

const normalizeDateKey = (value: any) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};
const normalizeMonthKey = (value: any) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : "";
};
const BUSINESS_TIME_ZONE = resolveOptionalString(process.env.BUSINESS_TIME_ZONE, "Asia/Seoul") || "Asia/Seoul";
const toDateKeyInTimeZone = (input: any, timeZone = BUSINESS_TIME_ZONE) => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string" && input.trim() === "") return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
};
const todayDateKey = () => toDateKeyInTimeZone(new Date()) || new Date().toISOString().slice(0, 10);
const evaluateWorkerEmploymentOnDateKey = ({
  joinedAt,
  leftAt,
  targetDateKey,
}: {
  joinedAt?: unknown;
  leftAt?: unknown;
  targetDateKey?: string | null;
}) => {
  const normalizedTargetDateKey = normalizeDateKey(targetDateKey);
  const joinedDateKey = toDateKeyInTimeZone(joinedAt, BUSINESS_TIME_ZONE);
  const leftDateKey = toDateKeyInTimeZone(leftAt, BUSINESS_TIME_ZONE);

  if (!normalizedTargetDateKey) {
    return {
      passed: false,
      reason: "invalid_workDate",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  if (joinedDateKey && normalizedTargetDateKey < joinedDateKey) {
    return {
      passed: false,
      reason: "workDate_before_joinedAt",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  // leftAt is inclusive: worker is treated as employed on leftAt date.
  if (leftDateKey && normalizedTargetDateKey > leftDateKey) {
    return {
      passed: false,
      reason: "workDate_after_leftAt",
      joinedDateKey,
      leftDateKey,
    } as const;
  }
  return {
    passed: true,
    reason: "pass",
    joinedDateKey,
    leftDateKey,
  } as const;
};
const normalizeTimeText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
const parseTimeToMinutes = (value: any): number | null => {
  const normalized = normalizeTimeText(value);
  if (!normalized) return null;
  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};
const ATTENDANCE_DEFAULT_CLOCK_IN = "08:00";
const ATTENDANCE_DEFAULT_CLOCK_OUT = "18:00";
const resolveAttendanceWorkedMinuteRange = (
  clockIn: any,
  clockOut: any
): { inMinutes: number; outMinutes: number } | null => {
  const inMinutes = parseTimeToMinutes(clockIn);
  const outMinutes = parseTimeToMinutes(clockOut);
  if (inMinutes === null && outMinutes === null) return null;

  // One-sided punches are treated as the standard workday boundary.
  const resolvedInMinutes =
    inMinutes ?? parseTimeToMinutes(ATTENDANCE_DEFAULT_CLOCK_IN);
  const resolvedOutMinutes =
    outMinutes ?? parseTimeToMinutes(ATTENDANCE_DEFAULT_CLOCK_OUT);
  if (resolvedInMinutes === null || resolvedOutMinutes === null) return null;

  return {
    inMinutes: resolvedInMinutes,
    outMinutes: resolvedOutMinutes,
  };
};
const calculateWorkedSeconds = (clockIn: any, clockOut: any): number | null => {
  const resolvedRange = resolveAttendanceWorkedMinuteRange(clockIn, clockOut);
  if (!resolvedRange) return null;
  const { inMinutes, outMinutes } = resolvedRange;
  const diffMinutes =
    outMinutes >= inMinutes
      ? outMinutes - inMinutes
      : 24 * 60 - inMinutes + outMinutes;
  return Math.max(0, Math.round(diffMinutes * 60));
};
const toAttendanceWorkerDateKey = (
  workDate: string,
  workerId: number,
  factoryId: number
) => `${workDate}::${workerId}::${factoryId}`;
const normalizeAttendanceEntryPayloadList = (entries: any) => {
  const rows: Array<{
    workerId: number;
    clockIn: string | null;
    clockOut: string | null;
    workedSeconds: number | null;
    note: string | null;
  }> = [];
  const seenWorkerIds = new Set<number>();
  let invalidWorkerEntryIndex = -1;
  let invalidClockInEntryIndex = -1;
  let invalidClockOutEntryIndex = -1;
  let duplicateWorkerId: number | null = null;

  ensureArray(entries).forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;

    const clockInInput = resolveOptionalString(entry.clockIn, null);
    const clockOutInput = resolveOptionalString(entry.clockOut, null);
    const note = resolveOptionalString(entry.note, null);
    const hasAnyInput = clockInInput !== null || clockOutInput !== null || note !== null;
    if (!hasAnyInput) return;

    const workerId = toPositiveIntOrNull(entry.workerId);
    if (workerId === null) {
      if (invalidWorkerEntryIndex < 0) invalidWorkerEntryIndex = index;
      return;
    }

    const clockIn = normalizeTimeText(clockInInput);
    const clockOut = normalizeTimeText(clockOutInput);
    if (clockInInput !== null && clockIn === null) {
      if (invalidClockInEntryIndex < 0) invalidClockInEntryIndex = index;
      return;
    }
    if (clockOutInput !== null && clockOut === null) {
      if (invalidClockOutEntryIndex < 0) invalidClockOutEntryIndex = index;
      return;
    }

    if (seenWorkerIds.has(workerId)) {
      duplicateWorkerId = workerId;
      return;
    }
    seenWorkerIds.add(workerId);

    rows.push({
      workerId,
      clockIn,
      clockOut,
      workedSeconds: calculateWorkedSeconds(clockIn, clockOut),
      note,
    });
  });

  return {
    rows,
    invalidWorkerEntryIndex,
    invalidClockInEntryIndex,
    invalidClockOutEntryIndex,
    duplicateWorkerId,
  };
};
const normalizeHolidayDateKeyList = (holidays: any): string[] =>
  Array.from(
    new Set(
      ensureArray(holidays)
        .map((value) => normalizeDateKey(value))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right));
const toHolidayDateKeyResponse = (rows: any) =>
  ensureArray(rows)
    .map((row) => normalizeDateKey(row?.holidayDate))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
let organizationHolidayStorageReadyPromise: Promise<void> | null = null;
const ensureOrganizationHolidayStorageReady = async () => {
  if (organizationHolidayStorageReadyPromise) {
    await organizationHolidayStorageReadyPromise;
    return;
  }

  organizationHolidayStorageReadyPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrganizationHoliday" (
        "id" SERIAL NOT NULL,
        "orgId" INTEGER NOT NULL,
        "holidayDate" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationHoliday_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationHoliday_orgId_holidayDate_key"
      ON "OrganizationHoliday" ("orgId", "holidayDate")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationHoliday_orgId_holidayDate_idx"
      ON "OrganizationHoliday" ("orgId", "holidayDate")
    `);
  })();

  try {
    await organizationHolidayStorageReadyPromise;
  } catch (error) {
    organizationHolidayStorageReadyPromise = null;
    throw error;
  }
};
const toAttendanceEntryResponse = (entry: any) => ({
  id: entry?.id ?? null,
  orgId: entry?.orgId ?? null,
  factoryId: entry?.factoryId ?? null,
  workerId: entry?.workerId ?? null,
  workDate: entry?.workDate ?? "",
  clockIn: entry?.clockIn ?? null,
  clockOut: entry?.clockOut ?? null,
  workedSeconds:
    entry?.workedSeconds == null ? null : toNonNegativeInt(entry?.workedSeconds, 0),
  note: entry?.note ?? null,
  createdAt: entry?.createdAt ?? null,
  updatedAt: entry?.updatedAt ?? null,
});
const toNonNegativeInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};
const toSignedInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
};
const toOptionalFiniteNumber = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const normalizeWorkRecordPayloadList = (records: any) => {
  const rows: any[] = [];
  let invalidWorkerRecordIndex = -1;

  ensureArray(records).forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    const quantity = toNonNegativeInt(record.quantity, 0);
    if (quantity <= 0) return;

    const workerId = toPositiveIntOrNull(record.workerId);
    if (!workerId) {
      if (invalidWorkerRecordIndex < 0) invalidWorkerRecordIndex = index;
      return;
    }

    rows.push({
      workerId,
      lineId: toPositiveIntOrNull(record.lineId),
      styleId: toPositiveIntOrNull(record.styleId),
      styleCode: resolveOptionalString(record.styleCode, null),
      styleProcessId: toPositiveIntOrNull(record.styleProcessId),
      processCode: resolveOptionalString(record.processCode, null),
      processName: resolveOptionalString(record.processName, null),
      ctSeconds: toNonNegativeInt(record.ctSeconds, 0),
      quantity,
      assignmentPlanId: toPositiveIntOrNull(record.assignmentPlanId),
    });
  });

  return { rows, invalidWorkerRecordIndex };
};
const buildCanonicalWorkRecordWriteData = ({
  orgId,
  workLogId,
  record,
  defaultLineId = null,
  defaultCoverageStartDate = null,
  defaultCoverageEndDate = null,
}: {
  orgId: number;
  workLogId: number;
  record: any;
  defaultLineId?: number | null;
  defaultCoverageStartDate?: string | null;
  defaultCoverageEndDate?: string | null;
}) => ({
  orgId,
  workLogId,
  workerId: toPositiveIntOrNull(record?.workerId),
  lineId: toPositiveIntOrNull(record?.lineId) ?? toPositiveIntOrNull(defaultLineId),
  styleId: toPositiveIntOrNull(record?.styleId),
  styleProcessId: toPositiveIntOrNull(record?.styleProcessId),
  effectiveCoverageStartDate:
    resolveOptionalString(record?.effectiveCoverageStartDate, null) ??
    resolveOptionalString(defaultCoverageStartDate, null),
  effectiveCoverageEndDate:
    resolveOptionalString(record?.effectiveCoverageEndDate, null) ??
    resolveOptionalString(defaultCoverageEndDate, null),
  ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
  quantity: toNonNegativeInt(record?.quantity, 0),
  assignmentPlanId: toPositiveIntOrNull(record?.assignmentPlanId),
});
const syncWorkRecordRefs = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any[];
}) => {
  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedRecords.length === 0) return [];

  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(normalizedRecords);
  const styleMetaByPlanId = await resolveAssignmentPlanStyleMetaById({
    orgId,
    assignmentPlanIds,
  });
  const normalizedWithPlanStyle = normalizedRecords.map((record) => {
    const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
    const planStyleMeta =
      assignmentPlanId !== null ? styleMetaByPlanId.get(assignmentPlanId) ?? null : null;
    const recordStyleId = toPositiveIntOrNull(record?.styleId);
    return {
      ...record,
      styleId: planStyleMeta?.styleId ?? recordStyleId,
      styleCode: resolveOptionalString(planStyleMeta?.styleCode ?? record?.styleCode, null),
      styleName: resolveOptionalString(planStyleMeta?.styleName ?? record?.styleName, null),
    };
  });

  const styleIds = collectPositiveIntSet(
    ...normalizedWithPlanStyle.map((record) => record?.styleId)
  );
  const styleProcessIds = collectPositiveIntSet(
    ...normalizedWithPlanStyle.map((record) => record?.styleProcessId)
  );

  const [styles, styleProcessRowsById] =
    await Promise.all([
    styleIds.length > 0
      ? prisma.style.findMany({
          where: {
            orgId,
            id: { in: styleIds },
          },
          select: {
            id: true,
            code: true,
            name: true,
          },
        })
      : Promise.resolve([]),
    styleProcessIds.length > 0
      ? prisma.styleProcess.findMany({
          where: {
            orgId,
            id: { in: styleProcessIds },
          },
          select: {
            id: true,
            styleId: true,
            processCode: true,
            processName: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const styleProcessById = new Map(
    styleProcessRowsById.map((row) => [Number(row.id), row])
  );
  return normalizedWithPlanStyle.map((record) => {
    const recordStyleId = toPositiveIntOrNull(record?.styleId);
    const linkedStyle =
      recordStyleId !== null ? styleById.get(recordStyleId) ?? null : null;
    const directStyleProcessId = toPositiveIntOrNull(record?.styleProcessId);
    const directStyleProcess =
      directStyleProcessId !== null
        ? styleProcessById.get(directStyleProcessId) ?? null
        : null;
    const directStyleProcessMatchesStyle =
      directStyleProcess &&
      (recordStyleId === null ||
        toPositiveIntOrNull(directStyleProcess?.styleId) === recordStyleId);
    const linkedStyleProcess =
      directStyleProcessMatchesStyle ? directStyleProcess : null;
    return {
      ...record,
      lineId: toPositiveIntOrNull(record?.lineId),
      styleId: recordStyleId,
      styleCode: resolveOptionalString(
        linkedStyle?.code ?? record?.styleCode,
        null
      ),
      styleName: resolveOptionalString(linkedStyle?.name ?? record?.styleName, null),
      styleProcessId:
        toPositiveIntOrNull(linkedStyleProcess?.id),
      processCode: resolveOptionalString(
        linkedStyleProcess?.processCode,
        null
      ),
      processName: resolveOptionalString(
        linkedStyleProcess?.processName,
        null
      ),
      processNameKo: resolveOptionalString(
        record?.processNameKo,
        null
      ),
      processNameEn: resolveOptionalString(
        record?.processNameEn,
        null
      ),
      processNameVi: resolveOptionalString(
        record?.processNameVi,
        null
      ),
    };
  });
};
const resolveAssignmentPlanStyleMetaById = async ({
  orgId,
  assignmentPlanIds,
  db = prisma,
}: {
  orgId: number;
  assignmentPlanIds: number[];
  db?: any;
}) => {
  const normalizedPlanIds = collectPositiveIntSet(...assignmentPlanIds);
  if (normalizedPlanIds.length === 0) return new Map<number, any>();

  const plans = await db.assignmentPlan.findMany({
    where: { orgId, id: { in: normalizedPlanIds } },
    select: {
      id: true,
      styleId: true,
      style: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  // AssignmentPlan.styleId/style relation is the only source here. If it is
  // missing, callers must surface the missing canonical FK instead of guessing
  // from AssignmentCard payload or cardId strings.
  const styleMetaByPlanId = new Map<number, any>();
  ensureArray(plans).forEach((plan) => {
    const planId = toPositiveIntOrNull(plan?.id);
    if (planId === null) return;
    const directStyleId = toPositiveIntOrNull(plan?.style?.id ?? plan?.styleId);
    if (directStyleId === null) return;
    styleMetaByPlanId.set(planId, {
      styleId: directStyleId,
      styleCode: resolveOptionalString(plan?.style?.code, null),
      styleName: resolveOptionalString(plan?.style?.name, null),
    });
  });

  return styleMetaByPlanId;
};

const attachCanonicalFieldsToWorkRecords = async ({
  orgId,
  lineId,
  records,
  db = prisma,
}: {
  orgId: number;
  lineId: number | null;
  records: any[];
  db?: any;
}) => {
  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedRecords.length === 0) return [];

  const normalizedLineId = toPositiveIntOrNull(lineId);
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(normalizedRecords);
  const styleMetaByPlanId = await resolveAssignmentPlanStyleMetaById({
    orgId,
    assignmentPlanIds,
    db,
  });

  const withResolvedStyleId = normalizedRecords.map((record) => {
    const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
    const planStyleMeta =
      assignmentPlanId != null ? styleMetaByPlanId.get(assignmentPlanId) ?? null : null;
    const recordStyleId = toPositiveIntOrNull(record?.styleId);
    const nextStyleId = planStyleMeta?.styleId ?? recordStyleId;
    const canonicalStyleIdSource =
      planStyleMeta?.styleId != null
        ? "AssignmentPlan.workOrderItem.styleId"
        : recordStyleId !== null
          ? "WorkRecord.styleId"
          : null;
    return {
      ...record,
      lineId: normalizedLineId ?? toPositiveIntOrNull(record?.lineId),
      styleId: nextStyleId,
      styleCode: resolveOptionalString(planStyleMeta?.styleCode ?? record?.styleCode, null),
      styleName: resolveOptionalString(planStyleMeta?.styleName ?? record?.styleName, null),
      _canonicalStyleIdSource: canonicalStyleIdSource,
    };
  });

  // Callers that resolve a process only from an AssignmentPlan's CT snapshot (e.g. the
  // work-log Excel import) may not have a real StyleProcess.id yet, since persisted
  // snapshots do not carry styleProcessId. Backfill it here from (styleId, processCode)
  // now that styleId is resolved above, instead of leaving it null.
  const styleProcessLookupKeys = new Set<string>();
  withResolvedStyleId.forEach((record) => {
    if (toPositiveIntOrNull(record?.styleProcessId) !== null) return;
    const styleId = toPositiveIntOrNull(record?.styleId);
    const processCode = normalizeProcessCodeKey(record?.processCode);
    if (styleId === null || !processCode) return;
    styleProcessLookupKeys.add(`${styleId}:${processCode}`);
  });
  const styleProcessIdByKey = new Map<string, number>();
  if (styleProcessLookupKeys.size > 0) {
    const lookupStyleIds = Array.from(
      new Set(Array.from(styleProcessLookupKeys).map((key) => Number(key.split(":")[0])))
    );
    const candidateProcesses = await db.styleProcess.findMany({
      where: { orgId, styleId: { in: lookupStyleIds } },
      select: { id: true, styleId: true, processCode: true },
    });
    ensureArray(candidateProcesses).forEach((process: any) => {
      const styleId = toPositiveIntOrNull(process?.styleId);
      const processCode = normalizeProcessCodeKey(process?.processCode);
      const processId = toPositiveIntOrNull(process?.id);
      if (styleId === null || !processCode || processId === null) return;
      const key = `${styleId}:${processCode}`;
      if (!styleProcessIdByKey.has(key)) styleProcessIdByKey.set(key, processId);
    });
  }

  const result = withResolvedStyleId.map((record) => {
    const existingStyleProcessId = toPositiveIntOrNull(record?.styleProcessId);
    if (existingStyleProcessId !== null) return record;
    const styleId = toPositiveIntOrNull(record?.styleId);
    const processCode = normalizeProcessCodeKey(record?.processCode);
    if (styleId === null || !processCode) return record;
    const resolvedStyleProcessId = styleProcessIdByKey.get(`${styleId}:${processCode}`) ?? null;
    if (resolvedStyleProcessId === null) return record;
    return { ...record, styleProcessId: resolvedStyleProcessId };
  });
  const stillMissing = result.filter(
    (record) => toPositiveIntOrNull(record?.styleProcessId) === null
  );
  if (stillMissing.length > 0) {
    console.warn(
      `[attachCanonicalFieldsToWorkRecords] orgId=${orgId} styleProcessId still missing for ${stillMissing.length}/${result.length} records`,
      JSON.stringify(
        stillMissing.slice(0, 10).map((record) => ({
          assignmentPlanId: record?.assignmentPlanId ?? null,
          styleId: record?.styleId ?? null,
          styleCode: record?.styleCode ?? null,
          processCode: record?.processCode ?? null,
          rawStyleProcessId: record?.styleProcessId ?? null,
        }))
      )
    );
  }
  return result;
};
const collectWorkLogCrossLineAssignmentWarnings = async ({
  orgId,
  workLogLineId,
  workLogLineName = null,
  records,
  db = prisma,
}: {
  orgId: number;
  workLogLineId: number | null;
  workLogLineName?: string | null;
  records: any[];
  db?: any;
}): Promise<WorkLogCrossLineAssignmentWarning[]> => {
  const normalizedWorkLogLineId = toPositiveIntOrNull(workLogLineId);
  if (normalizedWorkLogLineId === null) return [];

  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedRecords.length === 0) return [];

  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(normalizedRecords);
  if (assignmentPlanIds.length === 0) return [];

  const workerIds = collectWorkRecordWorkerIds(normalizedRecords);
  const [plans, workers] = await Promise.all([
    db.assignmentPlan.findMany({
    where: {
      orgId,
      id: { in: assignmentPlanIds },
    },
    select: {
      id: true,
      lineId: true,
      // orderNo/label dropped in Phase E - workOrder.orderNumber is the only
      // source now (label itself was already unused here).
      workOrder: { select: { orderNumber: true } },
    },
    }),
    workerIds.length > 0
      ? db.employee.findMany({
          where: { orgId, id: { in: workerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const planById = new Map(
    ensureArray(plans).map((plan) => [toPositiveIntOrNull(plan?.id), plan])
  );
  const workerNameById = new Map(
    ensureArray(workers).map((worker) => [
      toPositiveIntOrNull(worker?.id),
      resolveOptionalString(worker?.name, null),
    ])
  );
  const styleMetaByPlanId = await resolveAssignmentPlanStyleMetaById({
    orgId,
    assignmentPlanIds,
    db,
  });

  const lineIds = collectPositiveIntSet(
    normalizedWorkLogLineId,
    ...ensureArray(plans).map((plan) => plan?.lineId)
  );
  const lines =
    lineIds.length > 0
      ? await db.line.findMany({
          where: {
            orgId,
            id: { in: lineIds },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
  const lineById = new Map(
    ensureArray(lines).map((line) => [toPositiveIntOrNull(line?.id), line])
  );
  const fallbackWorkLogLineName =
    resolveOptionalString(workLogLineName, null) ??
    resolveOptionalString(lineById.get(normalizedWorkLogLineId)?.name, null);

  return normalizedRecords.reduce(
    (warnings: WorkLogCrossLineAssignmentWarning[], record) => {
      const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
      if (assignmentPlanId === null) return warnings;
      const plan = planById.get(assignmentPlanId) ?? null;
      const assignmentLineId = toPositiveIntOrNull(plan?.lineId);
      if (
        assignmentLineId === null ||
        assignmentLineId === normalizedWorkLogLineId
      ) {
        return warnings;
      }
      warnings.push({
        workerId: toPositiveIntOrNull(record?.workerId),
        workerName:
          workerNameById.get(toPositiveIntOrNull(record?.workerId)) ?? null,
        workLogLineId: normalizedWorkLogLineId,
        workLogLineName: fallbackWorkLogLineName,
        assignmentLineId,
        assignmentLineName:
          resolveOptionalString(lineById.get(assignmentLineId)?.name, null) ?? null,
        orderNo:
          resolveOptionalString(plan?.workOrder?.orderNumber, null),
        styleId:
          resolveOptionalString(
            styleMetaByPlanId.get(assignmentPlanId)?.styleId,
            null
          ) ?? null,
        styleName:
          resolveOptionalString(
            styleMetaByPlanId.get(assignmentPlanId)?.styleName,
            null
          ) ?? null,
        processCode: resolveOptionalString(record?.processCode, null),
        processName: resolveOptionalString(record?.processName, null),
      });
      return warnings;
    },
    []
  );
};
const buildWorkDateRange = (workDate: any) => {
  const normalized = normalizeDateKey(workDate);
  if (!normalized) return null;
  const startAt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(startAt.getTime())) return null;
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setMilliseconds(endAt.getMilliseconds() - 1);
  return { dateKey: normalized, startAt, endAt };
};
const shiftDateKeyByDays = (dateKey: string, days: number): string | null => {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(utcDate.getTime())) return null;
  utcDate.setUTCDate(utcDate.getUTCDate() + Math.trunc(days));
  return utcDate.toISOString().slice(0, 10);
};
const resolveWorkLogLineMeta = (
  value: any
): { lineId: number | null; lineName: string | null } => {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : Array.isArray(value)
        ? value.find((item) => item && typeof item === "object")
        : null;

  const lineId = toPositiveIntOrNull(source?.lineId);
  const lineName = resolveOptionalString(source?.lineName, null);
  return { lineId, lineName };
};
const isWorkLogCoverageMissingColumnError = (error: any) => {
  const code = resolveOptionalString((error as any)?.code, "") || "";
  if (code !== "P2022") return false;
  const missingColumn =
    resolveOptionalString((error as any)?.meta?.column, null) ||
    resolveOptionalString((error as any)?.message, "");
  if (!missingColumn) return false;
  return /((WorkLog\.)?(coverageStartDate|coverageEndDate|entryMode))|((WorkRecord\.)?(effectiveCoverageStartDate|effectiveCoverageEndDate))/i.test(
    missingColumn
  );
};

const buildWorkLogSelectWithOptionalCoverage = ({
  includeCoverage,
  includeRecords,
}: {
  includeCoverage: boolean;
  includeRecords: boolean;
}) => {
  const select: Record<string, any> = {
    id: true,
    displayDate: true,
    factoryId: true,
    factory: {
      select: { id: true, name: true },
    },
    factoryWagePerSecond: true,
    ctBasis: true,
    workerCount: true,
    itemCount: true,
    totalCtSeconds: true,
    note: true,
    records: true,
    createdAt: true,
    updatedAt: true,
    updatedBy: true,
  };
  if (includeCoverage) {
    select.coverageStartDate = true;
    select.coverageEndDate = true;
    select.entryMode = true;
  }
  if (includeRecords) {
    select.workRecords = WORK_LOG_RECORD_INCLUDE;
  }
  return select;
};

const fetchWorkLogByIdWithRecordsSafe = async ({
  orgId,
  workLogId,
  recordSelect,
  warnLabel,
}: {
  orgId: number;
  workLogId: number;
  recordSelect: any;
  warnLabel: string;
}) => {
  try {
    return await prisma.workLog.findFirst({
      where: { id: workLogId, orgId },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: true,
          includeRecords: false,
        }),
        workRecords: recordSelect,
      },
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    const fallbackRow = await prisma.workLog.findFirst({
      where: { id: workLogId, orgId },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: false,
          includeRecords: false,
        }),
        workRecords: recordSelect,
      },
    });
    console.warn(
      `[${warnLabel}] orgId=${orgId} workLogId=${workLogId} missing work-log coverage columns; fallback record projection activated`
    );
    return fallbackRow;
  }
};
const findPreviousWorkLogCoverageForLine = async ({
  orgId,
  factoryId = null,
  lineId,
  beforeWorkDate,
}: {
  orgId: number;
  factoryId?: number | null;
  lineId: number;
  beforeWorkDate: string;
}) => {
  const normalizedBeforeWorkDate = normalizeDateKey(beforeWorkDate);
  const normalizedFactoryId = toPositiveIntOrNull(factoryId);
  if (!lineId || !normalizedBeforeWorkDate) {
    return null;
  }

  const pageSize = 200;
  for (let skip = 0; skip < 2000; skip += pageSize) {
    let candidates: any[] = [];
    try {
      candidates = await prisma.workLog.findMany({
        where: {
          orgId,
          ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
          displayDate: { lt: normalizedBeforeWorkDate },
        },
        select: {
          id: true,
          displayDate: true,
          coverageStartDate: true,
          coverageEndDate: true,
          entryMode: true,
          records: true,
        },
        orderBy: [{ displayDate: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      });
    } catch (error) {
      if (!isWorkLogCoverageMissingColumnError(error)) throw error;
      candidates = await prisma.workLog.findMany({
        where: {
          orgId,
          ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
          displayDate: { lt: normalizedBeforeWorkDate },
        },
        select: {
          id: true,
          displayDate: true,
          records: true,
        },
        orderBy: [{ displayDate: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      });
      if (skip === 0) {
        console.warn(
          `[work-log-context] orgId=${orgId} lineId=${lineId} missing work-log coverage columns; fallback previous-coverage query activated`
        );
      }
    }
    if (candidates.length === 0) break;

    for (const candidate of candidates) {
      const candidateLineMeta = resolveWorkLogLineMeta(candidate?.records);
      if (toPositiveIntOrNull(candidateLineMeta.lineId) !== lineId) continue;
      const coverageEndDate = resolveWorkLogCoverageEndDate(candidate, candidate?.displayDate);
      const coverageStartDate = resolveWorkLogCoverageStartDate(
        candidate,
        coverageEndDate
      );
      return {
        workLogId: toPositiveIntOrNull(candidate?.id),
        displayDate: normalizeDateKey(candidate?.displayDate),
        coverageStartDate,
        coverageEndDate,
        entryMode: resolveWorkLogEntryMode({
          coverageStartDate,
          coverageEndDate,
          requestedEntryMode: candidate?.entryMode,
        }),
      };
    }

    if (candidates.length < pageSize) break;
  }

  return null;
};
const resolveWorkLogRecordResponses = (workLog: any) => {
  // WorkRecord is the sole source of truth for record data. WorkLog.records JSON
  // only ever stores header metadata ({ lineId, lineName }), never row data, so it
  // must not be read here as a fallback.
  if (Array.isArray(workLog?.workRecords)) {
    return workLog.workRecords.map(toWorkRecordResponse);
  }
  return [];
};
const collectWorkRecordWorkerIds = (records: any): number[] =>
  Array.from(
    new Set(
      ensureArray(records)
        .map((record) => toPositiveIntOrNull(record?.workerId))
        .filter((workerId): workerId is number => workerId !== null)
    )
  );
const collectWorkRecordAssignmentPlanIds = (records: any): number[] =>
  Array.from(
    new Set(
      ensureArray(records)
        .map((record) => toPositiveIntOrNull(record?.assignmentPlanId))
        .filter((planId): planId is number => planId !== null)
    )
  );
const resolveWorkOrderIdFromAssignmentBoardItem = (item: any): number | null =>
  toPositiveIntOrNull(item?.workOrderId);
const buildOrderProgressCoverageByWorkOrderId = ({
  cards,
  assignments,
}: {
  cards: any;
  assignments: any;
}) => {
  const coverageByWorkOrderId = new Map<
    number,
    { hasUnassignedCards: boolean; hasAssignments: boolean }
  >();
  const ensureCoverage = (workOrderId: number) => {
    const current = coverageByWorkOrderId.get(workOrderId);
    if (current) return current;
    const next = { hasUnassignedCards: false, hasAssignments: false };
    coverageByWorkOrderId.set(workOrderId, next);
    return next;
  };

  ensureArray(cards).forEach((card) => {
    if ((resolveOptionalString(card?.type, "") ?? "").toUpperCase() === "DELTA") {
      return;
    }
    const workOrderId = resolveWorkOrderIdFromAssignmentBoardItem(card);
    if (workOrderId === null) return;
    ensureCoverage(workOrderId).hasUnassignedCards = true;
  });

  normalizeStateAssignments(assignments).forEach((assignment) => {
    const workOrderId = resolveWorkOrderIdFromAssignmentBoardItem(assignment);
    if (workOrderId === null) return;
    ensureCoverage(workOrderId).hasAssignments = true;
  });

  return coverageByWorkOrderId;
};
const resolveAutoOrderProgressStatus = ({
  isManualLocked,
  coverage,
}: {
  isManualLocked: boolean;
  coverage?: { hasUnassignedCards: boolean; hasAssignments: boolean } | null;
}): "EDITING" | "ORDER_RECEIVED" | "IN_PROGRESS" => {
  if (!isManualLocked) {
    return resolveUnlockedWorkOrderStatus();
  }
  if (!coverage) {
    return "ORDER_RECEIVED";
  }
  if (coverage.hasAssignments && !coverage.hasUnassignedCards) {
    return "IN_PROGRESS";
  }
  return "ORDER_RECEIVED";
};
const syncOrderProgressStatusesForOrg = async ({
  orgId,
  orderIds = null,
  cards = null,
  assignments = null,
  includeTerminalStages = false,
}: {
  orgId: number;
  orderIds?: string[] | null;
  cards?: any;
  assignments?: any;
  includeTerminalStages?: boolean;
}) => {
  void includeTerminalStages;
  const normalizedOrderIds = Array.from(
    new Set(
      ensureArray(orderIds)
        .map((orderId) => resolveOptionalString(orderId, null))
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  );
  const shouldLoadCards = cards == null;
  const shouldLoadAssignments = assignments == null;
  const [resolvedCards, resolvedAssignments] = await Promise.all([
    shouldLoadCards ? loadAssignmentCardsForOrg({ orgId }) : Promise.resolve(cards),
    shouldLoadAssignments
      ? loadAssignmentPlansForBoardState(orgId).then((plans) => ({
          assignments: ensureArray(plans).map((plan) => toAssignmentPlanResponse(plan)),
        }))
      : Promise.resolve({ assignments }),
  ]);
  const coverageByWorkOrderId = buildOrderProgressCoverageByWorkOrderId({
    cards: resolvedCards,
    assignments: resolvedAssignments?.assignments ?? assignments,
  });
  const orders = await prisma.workOrder.findMany({
    where: {
      OR: getOrderAccessWhere(orgId),
      ...(normalizedOrderIds.length > 0 ? { orderId: { in: normalizedOrderIds } } : {}),
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      modificationLockedAt: true,
    },
  });
  const updates = orders.flatMap((order) => {
    const currentStatus = resolveCanonicalWorkOrderStatusForLockState({
      status: order?.status,
      isManualLocked: Boolean(order?.modificationLockedAt),
    });
    if (
      !includeTerminalStages &&
      !AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES.has(currentStatus)
    ) {
      return [];
    }
    const nextStatus = resolveAutoOrderProgressStatus({
      isManualLocked: Boolean(order?.modificationLockedAt),
      coverage:
        coverageByWorkOrderId.get(toPositiveIntOrNull(order?.id) ?? -1) ?? null,
    });
    if (currentStatus === nextStatus) return [];
    return [{ id: order.id, status: nextStatus }];
  });
  if (updates.length === 0) return;

  await prisma.$transaction(
    updates.map((item) =>
      prisma.workOrder.update({
        where: { id: item.id },
        data: { status: item.status },
      })
    )
  );
};
const syncConfirmedOrdersToInProgressFromWorkRecords = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any;
}) => {
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(records);
  if (assignmentPlanIds.length === 0) return;

  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId, id: { in: assignmentPlanIds } },
    select: {
      workOrderId: true,
    },
  });
  const workOrderIds = collectPositiveIntSet(...plans.map((plan) => plan?.workOrderId));
  const linkedOrders =
    workOrderIds.length > 0
      ? await prisma.workOrder.findMany({
          where: { id: { in: workOrderIds } },
          select: { orderId: true },
        })
      : [];
  const orderIds = Array.from(
    new Set(
      linkedOrders
        .map((order) => resolveOptionalString(order?.orderId, null))
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  );
  if (orderIds.length === 0) return;
  await syncOrderProgressStatusesForOrg({
    orgId,
    orderIds,
  });
};
const trySyncConfirmedOrdersToInProgressFromWorkRecords = async ({
  orgId,
  records,
  mode,
}: {
  orgId: number;
  records: any;
  mode: "create" | "update";
}) => {
  try {
    await syncConfirmedOrdersToInProgressFromWorkRecords({
      orgId,
      records,
    });
  } catch (error) {
    console.warn(
      `[order-progress-sync] orgId=${orgId} mode=${mode} failed: ${getErrorMessage(
        error,
        "failed to sync order progress after work-log save"
      )}`
    );
  }
};
const summarizeWorkLogRecordsForDebug = (records: any) =>
  ensureArray(records).slice(0, 5).map((record, index) => ({
    index,
    workerId: toPositiveIntOrNull(record?.workerId),
    lineId: toPositiveIntOrNull(record?.lineId),
    styleId: toPositiveIntOrNull(record?.styleId),
    styleCode: resolveOptionalString(record?.styleCode, null),
    processCode: resolveOptionalString(record?.processCode, null),
    quantity: toNonNegativeInt(record?.quantity, 0),
    assignmentPlanId: toPositiveIntOrNull(record?.assignmentPlanId),
  }));
const buildWorkLogRecordTraceRows = (records: any, limit = 40) =>
  ensureArray(records)
    .slice(0, limit)
    .map((record, index) => ({
      index: index + 1,
      workerId: toPositiveIntOrNull(record?.workerId),
      assignmentPlanId: toPositiveIntOrNull(record?.assignmentPlanId),
      lineId: toPositiveIntOrNull(record?.lineId),
      styleId: toPositiveIntOrNull(record?.styleId),
      styleCode: resolveOptionalString(record?.styleCode, null),
      processCode: resolveOptionalString(record?.processCode, null),
      quantity: toNonNegativeInt(record?.quantity, 0),
      ctSeconds: toNonNegativeInt(record?.ctSeconds, 0),
    }));
const logWorkLogRecordTrace = (label: string, records: any) => {
  const rows = buildWorkLogRecordTraceRows(records);
  if (rows.length === 0) return;
  console.log(`${label} recordRows=${rows.length}`);
  console.table(rows);
};
const summarizeWorkLogPayloadForDebug = (payload: any = {}) => {
  const records = ensureArray(payload?.records);
  return {
    workDate: normalizeDateKey(payload?.workDate),
    coverageStartDate: normalizeDateKey(payload?.coverageStartDate),
    coverageEndDate: normalizeDateKey(payload?.coverageEndDate),
    entryMode: resolveOptionalString(payload?.entryMode, null),
    factoryId: toPositiveIntOrNull(payload?.factoryId),
    lineId: toPositiveIntOrNull(payload?.lineId),
    workerCount: toNonNegativeInt(payload?.workerCount, 0),
    itemCount: toNonNegativeInt(payload?.itemCount, records.length),
    totalCtSeconds: toNonNegativeInt(payload?.totalCtSeconds, 0),
    noteLength: resolveOptionalString(payload?.note, "")?.length ?? 0,
    recordCount: records.length,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(records).slice(0, 10),
    recordsPreview: summarizeWorkLogRecordsForDebug(records),
  };
};
const validateWorkLogOperationStartDateRange = ({
  coverageStartDate,
  coverageEndDate,
  operationStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
}: {
  coverageStartDate?: string | null;
  coverageEndDate?: string | null;
  operationStartDateKey?: string | null;
}) => {
  const startDate = normalizeDateKey(coverageStartDate);
  const endDate = normalizeDateKey(coverageEndDate);
  const resolvedOperationStartDateKey =
    normalizeFactoryManagementStartDateKey(operationStartDateKey) ||
    DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  if (
    (startDate && startDate < resolvedOperationStartDateKey) ||
    (endDate && endDate < resolvedOperationStartDateKey)
  ) {
    return `Work logs before ${resolvedOperationStartDateKey} are not accepted.`;
  }
  return null;
};
const createWorkLogMutationTrace = ({
  req,
  mode,
  payload,
  workLogId = null,
}: {
  req: any;
  mode: "create" | "update" | "delete";
  payload?: any;
  workLogId?: number | null;
}) => {
  const requestId = `wl-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const trace = {
    requestId,
    mode,
    step: "start",
    workLogId,
    payloadSummary: summarizeWorkLogPayloadForDebug(payload),
  };
  req.__workLogTrace = trace;
  console.log(
    `[work-logs:${mode}] req=${requestId} step=start`,
    trace.payloadSummary
  );
  logWorkLogRecordTrace(
    `[work-logs:${mode}] req=${requestId} step=start`,
    payload?.records
  );
  return trace;
};
const updateWorkLogMutationTrace = (
  trace: {
    requestId: string;
    mode: "create" | "update" | "delete";
    step: string;
    workLogId?: number | null;
    payloadSummary?: any;
  } | null,
  step: string,
  details: Record<string, unknown> | null = null
) => {
  if (!trace) return;
  trace.step = step;
  if (details && Object.keys(details).length > 0) {
    console.log(
      `[work-logs:${trace.mode}] req=${trace.requestId} step=${step}`,
      details
    );
    return;
  }
  console.log(`[work-logs:${trace.mode}] req=${trace.requestId} step=${step}`);
};
const trySyncAssignmentPlanSideEffectsAfterWorkLogMutation = async ({
  orgId,
  assignmentPlanIds,
  mode,
}: {
  orgId: number;
  assignmentPlanIds: any;
  mode: "create" | "update" | "delete";
}) => {
  const normalizedPlanIds = Array.from(
    new Set(
      ensureArray(assignmentPlanIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
  if (normalizedPlanIds.length === 0) return;

  // Important:
  // Mutating persisted board/plan schedule from work-log deltas can accumulate drift
  // when users edit or delete logs repeatedly across environments.
  // Keep schedule mutation disabled by default and rely on deterministic
  // progress snapshot recomputation for rendering.
  const shouldMutateScheduleFromWorkLogs =
    resolveOptionalString(process.env.ENABLE_WORKLOG_SCHEDULE_SYNC, "")?.toLowerCase?.() ===
    "true";
  if (shouldMutateScheduleFromWorkLogs) {
    // Work-log mutation is already committed at this point.
    // Downstream assignment sync should not flip the API response to a failure.
    try {
      await syncAssignmentSchedulesFromWorkRecordPlans({
        orgId,
        assignmentPlanIds: normalizedPlanIds,
      });
    } catch (error) {
      console.warn(
        `[work-logs:${mode}] orgId=${orgId} assignment schedule sync failed: ${getErrorMessage(
          error,
          "failed to sync assignment schedules after work-log mutation"
        )}`
      );
    }
  }

  try {
    await persistAssignmentPlanProgressSnapshot({
      orgId,
      assignmentPlanIds: normalizedPlanIds,
    });
  } catch (error) {
    console.warn(
      `[work-logs:${mode}] orgId=${orgId} assignment progress snapshot sync failed: ${getErrorMessage(
        error,
        "failed to persist assignment progress snapshot after work-log mutation"
      )}`
    );
  }
};
const toUtcDateFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): Date | null => {
  const dateKey = normalizeDateKey(dateKeyInput);
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate;
};
const toDateKeyFromUtcDateForAssignmentSchedule = (date: Date): string =>
  date.toISOString().slice(0, 10);
const shiftDateKeyByDaysForAssignmentSchedule = (
  dateKeyInput: any,
  days: number
): string | null => {
  const baseDate = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!baseDate) return null;
  baseDate.setUTCDate(baseDate.getUTCDate() + Math.trunc(days));
  return toDateKeyFromUtcDateForAssignmentSchedule(baseDate);
};
const diffDateKeysByDaysForAssignmentSchedule = (
  fromDateKeyInput: any,
  toDateKeyInput: any
): number | null => {
  const fromDate = toUtcDateFromDateKeyForAssignmentSchedule(fromDateKeyInput);
  const toDate = toUtcDateFromDateKeyForAssignmentSchedule(toDateKeyInput);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
};
const countDateRangeDaysInclusiveForAssignmentSchedule = (
  startDateKeyInput: any,
  endDateKeyInput: any
): number => {
  const diffDays = diffDateKeysByDaysForAssignmentSchedule(
    startDateKeyInput,
    endDateKeyInput
  );
  if (diffDays == null || diffDays < 0) return 0;
  return diffDays + 1;
};
const toEpochDayFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): number | null => {
  const date = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!date) return null;
  return Math.trunc(date.getTime() / (24 * 60 * 60 * 1000));
};
const resolveAssignmentProducedQuantityFromProcessTotals = ({
  processTotals,
  baselineQuantity: _baselineQuantity,
}: {
  processTotals: number[];
  baselineQuantity: number | null;
}): number => {
  const normalizedTotals = ensureArray(processTotals).map((value) =>
    Math.max(0, Math.round(Number(value) || 0))
  );
  if (normalizedTotals.length === 0) return 0;
  if (normalizedTotals.length === 1) return normalizedTotals[0]!;
  // 완제품 수량은 공정별 누적의 최소값으로 본다.
  return Math.min(...normalizedTotals);
};
const resolveAssignmentPlanClosedQty = (plan: any) =>
  toOptionalNonNegativeInt(plan?.closedQty, toOptionalNonNegativeInt(plan?.finalQuantity, null));

const resolveAssignmentPlanClosedAtValue = (plan: any) =>
  toOptionalDateValue(plan?.closedAt, toOptionalDateValue(plan?.completedAt, null));

const resolveAssignmentPlanClosedAt = (plan: any) =>
  toIsoDateStringOrNull(resolveAssignmentPlanClosedAtValue(plan));

const resolveAssignmentPlanCompletionDateValue = (plan: any) =>
  toOptionalDateValue(
    plan?.productionCompletedAt,
    resolveAssignmentPlanClosedAtValue(plan)
  );

const resolveAssignmentPlanPayrollLockMonth = (plan: any) => {
  const completionDate = resolveAssignmentPlanCompletionDateValue(plan);
  const completionDateKey = completionDate
    ? toDateKeyInTimeZone(completionDate, BUSINESS_TIME_ZONE)
    : null;
  return completionDateKey ? completionDateKey.slice(0, 7) : null;
};

const resolveAssignmentPlanCloseMode = ({
  closedQty,
  targetQty,
}: {
  closedQty: number | null;
  targetQty: number | null;
}): "FULL" | "SHORT" | "OVER" | null => {
  if (closedQty == null) return null;
  if (targetQty == null || targetQty <= 0) return "FULL";
  if (closedQty === targetQty) return "FULL";
  if (closedQty < targetQty) return "SHORT";
  return "OVER";
};

const resolveAssignmentPlanCloseBasis = (plan: any): "QC_BASED" | "MANUAL" | null => {
  const basis = resolveOptionalString(plan?.closeBasis, null);
  if (basis === "QC_BASED" || basis === "MANUAL") return basis;
  return null;
};
const resolveAssignmentPlanLatestQcDate = (plan: any) =>
  normalizeDateKey(plan?.latestQcDate) || null;

const resolveAssignmentPlanQcPassedTotal = (plan: any) =>
  Math.max(0, Math.round(Number(plan?.qcPassedTotal ?? 0) || 0));

const normalizeQcPassEventSizeKey = (value: any) => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, "") || null;
};

const buildQcPassEventResponse = (event: any) => ({
  id: toPositiveIntOrNull(event?.id),
  assignmentPlanId: toPositiveIntOrNull(event?.assignmentPlanId),
  inspectedOn: normalizeDateKey(event?.inspectedOn) || null,
  passedQuantity: Math.max(0, Math.round(Number(event?.passedQuantity ?? 0) || 0)),
  colorId: toPositiveIntOrNull(event?.colorId),
  colorName:
    resolveOptionalString(event?.attrColor?.name, null) ??
    resolveOptionalString(event?.attrColor?.nameKo, null) ??
    resolveOptionalString(event?.attrColor?.code, null),
  sizeKey: normalizeQcPassEventSizeKey(event?.sizeKey),
  note: resolveOptionalString(event?.note, null),
  sourceType:
    resolveOptionalString(event?.sourceType, null) === "MIGRATED_LEGACY"
      ? "MIGRATED_LEGACY"
      : "MANUAL",
  cancelledAt: toIsoDateStringOrNull(toOptionalDateValue(event?.cancelledAt, null)),
  cancelledBy: resolveOptionalString(event?.cancelledBy, null),
  createdAt: toIsoDateStringOrNull(toOptionalDateValue(event?.createdAt, null)),
  createdBy: resolveOptionalString(event?.createdBy, null),
});

const syncAssignmentPlanQcAggregate = async ({
  orgId,
  planId,
  db = prisma,
}: {
  orgId: number;
  planId: number;
  db?: any;
}) => {
  const normalizedPlanId = toPositiveIntOrNull(planId);
  if (normalizedPlanId == null) {
    return { qcPassedTotal: 0, latestQcDate: null };
  }

  const aggregate = await db.qcPassEvent.aggregate({
    where: {
      orgId,
      assignmentPlanId: normalizedPlanId,
      cancelledAt: null,
    },
    _sum: { passedQuantity: true },
    _max: { inspectedOn: true },
  });

  const qcPassedTotal = Math.max(
    0,
    Math.round(Number(aggregate?._sum?.passedQuantity ?? 0) || 0)
  );
  const latestQcDate = normalizeDateKey(aggregate?._max?.inspectedOn) || null;

  try {
    await db.assignmentPlan.update({
      where: { id: normalizedPlanId },
      data: {
        qcPassedTotal,
        latestQcDate,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) {
      throw error;
    }
    console.warn(
      "[assignment-plan][qc-aggregate] skip legacy qc summary column update (schema out of sync)"
    );
  }

  return { qcPassedTotal, latestQcDate };
};

const findAssignmentPlanForQcEvent = async ({
  orgId,
  assignmentPlanRef,
  db = prisma,
}: {
  orgId: number;
  assignmentPlanRef: any;
  db?: any;
}) => {
  const externalId = resolveOptionalString(assignmentPlanRef, null);
  if (externalId) {
    const byExternalId = await db.assignmentPlan.findFirst({
      where: { orgId, externalId },
      select: {
        id: true,
        externalId: true,
        assignmentQuantity: true,
        isCompleted: true,
        finalQuantity: true,
        completedAt: true,
        closedQty: true,
        closedAt: true,
      },
    });
    if (byExternalId) return byExternalId;
  }

  const numericId = toPositiveIntOrNull(assignmentPlanRef);
  if (numericId == null) return null;
  return db.assignmentPlan.findFirst({
    where: { orgId, id: numericId },
    select: {
      id: true,
      externalId: true,
      assignmentQuantity: true,
      isCompleted: true,
      finalQuantity: true,
      completedAt: true,
      closedQty: true,
      closedAt: true,
    },
  });
};
const resolveWorkRecordProcessBucketKeyForAssignmentSchedule = (
  value: any
): string | null => {
  const styleProcessId = toPositiveIntOrNull(value?.styleProcessId);
  if (styleProcessId != null) return `style-process:${styleProcessId}`;
  return null;
};
const allocateExtendedDurationsByPlannedRatio = (
  plannedDurations: number[],
  targetTotalDays: number
): number[] => {
  const normalizedPlanned = ensureArray(plannedDurations).map((value) =>
    Math.max(1, Math.round(Number(value) || 1))
  );
  if (normalizedPlanned.length === 0) return [];
  const plannedTotal = normalizedPlanned.reduce((sum, value) => sum + value, 0);
  if (targetTotalDays <= plannedTotal) {
    return [...normalizedPlanned];
  }

  const extraDays = targetTotalDays - plannedTotal;
  const baseAdds = normalizedPlanned.map((duration) =>
    Math.floor((duration / plannedTotal) * extraDays)
  );
  let remaining = extraDays - baseAdds.reduce((sum, value) => sum + value, 0);
  const rankedByRemainder = normalizedPlanned
    .map((duration, index) => ({
      index,
      remainder: (duration / plannedTotal) * extraDays - (baseAdds[index] || 0),
    }))
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.index - b.index;
    });
  for (let i = 0; i < rankedByRemainder.length && remaining > 0; i += 1) {
    const targetIndex = rankedByRemainder[i]!.index;
    baseAdds[targetIndex] = (baseAdds[targetIndex] || 0) + 1;
    remaining -= 1;
  }

  return normalizedPlanned.map((duration, index) => duration + (baseAdds[index] || 0));
};
const syncAssignmentSchedulesFromWorkRecordPlans = async ({
  orgId,
  assignmentPlanIds,
}: {
  orgId: number;
  assignmentPlanIds: any;
}): Promise<{ updatedAssignmentCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(assignmentPlanIds);
  if (normalizedPlanIds.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const affectedPlans = await prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: normalizedPlanIds } },
      select: { id: true, externalId: true, lineId: true },
    });
  if (affectedPlans.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const lineIds = Array.from(
    new Set(
      affectedPlans
        .map((plan) => toPositiveIntOrNull(plan?.lineId))
        .filter((lineId): lineId is number => lineId !== null)
    )
  );
  if (lineIds.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const linePlans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      lineId: { in: lineIds },
    },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      assignmentQuantity: true,
      assignmentCtSnapshot: true,
      startIndex: true,
      endIndex: true,
      startDayOffsetPercent: true,
      startDayPercent: true,
      endDayPercent: true,
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
  });
  if (linePlans.length === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const linePlanIds = linePlans.map((plan) => plan.id);
  const workRecords =
    linePlanIds.length > 0
        ? await prisma.workRecord.findMany({
          where: {
            orgId,
            assignmentPlanId: { in: linePlanIds },
          },
          select: {
            assignmentPlanId: true,
            styleProcess: {
              select: {
                processCode: true,
              },
            },
            quantity: true,
            workLog: {
              select: {
                displayDate: true,
              },
            },
          },
        })
      : [];

  const baselineQuantityByPlanId = linePlans.reduce((map, plan) => {
    const baselineQuantity = resolveAssignmentQuantity(plan);
    if (baselineQuantity != null && baselineQuantity > 0) {
      map.set(plan.id, baselineQuantity);
    }
    return map;
  }, new Map<number, number>());

  const processBucketsByPlanDate = new Map<
    number,
    Map<string, Map<string, number>>
  >();
  let skippedScheduleWorkRecordCount = 0;
  workRecords.forEach((record) => {
    const planId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (!planId || !baselineQuantityByPlanId.has(planId)) return;
    const workDateKey = normalizeDateKey(record?.workLog?.displayDate);
    if (!workDateKey) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;

    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    if (!processKey) {
      skippedScheduleWorkRecordCount += 1;
      return;
    }
    const byDate = processBucketsByPlanDate.get(planId) || new Map<string, Map<string, number>>();
    const byProcess =
      byDate.get(workDateKey) || new Map<string, number>();
    byProcess.set(processKey, (byProcess.get(processKey) || 0) + quantity);
    byDate.set(workDateKey, byProcess);
    processBucketsByPlanDate.set(planId, byDate);
  });
  if (skippedScheduleWorkRecordCount > 0) {
    console.warn(
      `[assignment-schedule-sync] orgId=${orgId} skipped ${skippedScheduleWorkRecordCount} work records without WorkRecord.styleProcessId`
    );
  }

  const completionDateByPlanId = new Map<number, string>();
  linePlans.forEach((plan) => {
    const baselineQuantity = baselineQuantityByPlanId.get(plan.id);
    if (baselineQuantity == null || baselineQuantity <= 0) return;
    const processKeyGroups = resolveAssignmentPlanRequiredProcessGroups(plan);

    const byDate = processBucketsByPlanDate.get(plan.id);
    if (!byDate || byDate.size === 0) return;

    const cumulativeByProcess = new Map<string, number>();
    const sortedDateKeys = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
    for (const dateKey of sortedDateKeys) {
      const byProcess = byDate.get(dateKey);
      if (!byProcess) continue;
      byProcess.forEach((value, processKey) => {
        cumulativeByProcess.set(
          processKey,
          (cumulativeByProcess.get(processKey) || 0) + Math.max(0, Math.round(value))
        );
      });

      const producedQuantity = resolveProducedQtyFromProcessKeyTotals({
        processTotalsByKey: cumulativeByProcess,
        processKeyGroups,
      });
      if (producedQuantity >= baselineQuantity) {
        completionDateByPlanId.set(plan.id, dateKey);
        break;
      }
    }
  });

  const planByExternalId = linePlans.reduce((map, plan) => {
    if (!plan?.externalId || map.has(plan.externalId)) return map;
    map.set(plan.externalId, plan);
    return map;
  }, new Map<string, any>());
  const targetLineIdSet = new Set(lineIds.map((lineId) => String(lineId)));

  const stateAssignments = normalizeStateAssignments(
    linePlans.map((plan) => toAssignmentPlanResponse(plan))
  );
  const changedExternalIds = new Set<string>();

  const updateAssignmentRange = ({
    entry,
    nextStartDateKey,
    nextEndDateKey,
    epochOffset,
  }: {
    entry: any;
    nextStartDateKey: string;
    nextEndDateKey: string;
    epochOffset: number | null;
  }) => {
    const nextStartEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(nextStartDateKey);
    const nextEndEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(nextEndDateKey);
    if (nextStartEpochDay == null || nextEndEpochDay == null) return;

    const nextStartIndexRaw =
      epochOffset == null ? toSignedInt(entry.assignment?.startIndex, 0) : nextStartEpochDay - epochOffset;
    const nextEndIndexRaw =
      epochOffset == null ? toSignedInt(entry.assignment?.endIndex, nextStartIndexRaw) : nextEndEpochDay - epochOffset;
    const nextStartIndex = Math.max(0, Math.trunc(nextStartIndexRaw));
    const nextEndIndex = Math.max(nextStartIndex, Math.trunc(nextEndIndexRaw));

    const prevStartDateKey = normalizeDateKey(entry.assignment?.startDateKey) || entry.startDateKey;
    const prevEndDateKey = normalizeDateKey(entry.assignment?.endDateKey) || entry.endDateKey;
    const prevStartIndex = toSignedInt(entry.assignment?.startIndex, 0);
    const prevEndIndex = Math.max(
      prevStartIndex,
      toSignedInt(entry.assignment?.endIndex, prevStartIndex)
    );

    const isChanged =
      prevStartDateKey !== nextStartDateKey ||
      prevEndDateKey !== nextEndDateKey ||
      prevStartIndex !== nextStartIndex ||
      prevEndIndex !== nextEndIndex;
    if (!isChanged) return;

    entry.startDateKey = nextStartDateKey;
    entry.endDateKey = nextEndDateKey;
    entry.assignment = {
      ...entry.assignment,
      startDateKey: nextStartDateKey,
      endDateKey: nextEndDateKey,
      startIndex: nextStartIndex,
      endIndex: nextEndIndex,
    };
    changedExternalIds.add(entry.externalId);
  };

  lineIds.forEach((lineId) => {
    const lineIdText = String(lineId);
    if (!targetLineIdSet.has(lineIdText)) return;

    const lineCandidates = stateAssignments
      .map((assignment, stateIndex) => ({ assignment, stateIndex }))
      .filter(({ assignment }) => String(assignment?.lineId ?? "") === lineIdText)
      .filter(({ assignment }) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId) return false;
        const plan = planByExternalId.get(externalId);
        return Boolean(plan && Number(plan.lineId) === Number(lineId));
      });
    if (lineCandidates.length === 0) return;

    let missingDateCandidateCount = 0;
    const lineEntries = lineCandidates
      .map(({ assignment, stateIndex }) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId) return null;
        const plan = planByExternalId.get(externalId);
        if (!plan || Number(plan.lineId) !== Number(lineId)) return null;

        const startDateKey =
          normalizeDateKey(assignment?.startDateKey) ||
          normalizeDateKey(resolveAssignmentStartDateKey(assignment));
        const endDateKeyFromState = normalizeDateKey(assignment?.endDateKey);
        const startIndex = toSignedInt(assignment?.startIndex, 0);
        const endIndex = Math.max(startIndex, toSignedInt(assignment?.endIndex, startIndex));
        const fallbackSpanDays = Math.max(0, endIndex - startIndex);
        const endDateKey =
          endDateKeyFromState ||
          (startDateKey
            ? shiftDateKeyByDaysForAssignmentSchedule(startDateKey, fallbackSpanDays)
            : null);
        if (!startDateKey || !endDateKey) {
          missingDateCandidateCount += 1;
          return null;
        }

        const plannedDurationDays = Math.max(
          1,
          countDateRangeDaysInclusiveForAssignmentSchedule(startDateKey, endDateKey)
        );
        return {
          externalId,
          planId: plan.id,
          stateIndex,
          assignment: { ...assignment },
          startDateKey,
          endDateKey,
          plannedDurationDays,
          completionDateKey:
            normalizeDateKey(completionDateByPlanId.get(plan.id) || "") || null,
        };
      })
      .filter((entry): entry is any => Boolean(entry))
      .sort((a, b) => {
        const startCompare = a.startDateKey.localeCompare(b.startDateKey);
        if (startCompare !== 0) return startCompare;
        const endCompare = a.endDateKey.localeCompare(b.endDateKey);
        if (endCompare !== 0) return endCompare;
        return String(a.externalId).localeCompare(String(b.externalId));
      });
    if (missingDateCandidateCount > 0) return;
    if (lineEntries.length === 0) return;

    const anchorEpochOffsets = lineEntries
      .map((entry) => {
        const startEpochDay = toEpochDayFromDateKeyForAssignmentSchedule(entry.startDateKey);
        if (startEpochDay == null) return null;
        const startIndex = toSignedInt(entry.assignment?.startIndex, 0);
        return startEpochDay - startIndex;
      })
      .filter((value): value is number => Number.isFinite(value));
    const epochOffset = anchorEpochOffsets.length > 0 ? anchorEpochOffsets[0]! : null;

    const chains: any[][] = [];
    lineEntries.forEach((entry) => {
      const lastChain = chains.length > 0 ? chains[chains.length - 1]! : null;
      if (!lastChain || lastChain.length === 0) {
        chains.push([entry]);
        return;
      }
      const prev = lastChain[lastChain.length - 1];
      const gapFromPrev = diffDateKeysByDaysForAssignmentSchedule(
        prev.endDateKey,
        entry.startDateKey
      );
      if (gapFromPrev != null && gapFromPrev <= 1) {
        lastChain.push(entry);
        return;
      }
      chains.push([entry]);
    });

    chains.forEach((chain) => {
      let cursor = 0;
      while (cursor < chain.length) {
        const first = chain[cursor];
        if (!first?.completionDateKey) {
          cursor += 1;
          continue;
        }
        let blockEndIndex = cursor;
        while (blockEndIndex + 1 < chain.length && chain[blockEndIndex + 1]?.completionDateKey) {
          blockEndIndex += 1;
        }
        const block = chain.slice(cursor, blockEndIndex + 1);
        const oldBlockEndDateKey = block[block.length - 1]!.endDateKey;
        const blockCompletionKeys = block
          .map((entry) => normalizeDateKey(entry?.completionDateKey))
          .filter((value): value is string => Boolean(value));
        if (blockCompletionKeys.length === 0) {
          cursor = blockEndIndex + 1;
          continue;
        }
        const actualBlockEndDateKey = blockCompletionKeys.reduce((max, key) =>
          key > max ? key : max
        );
        const overrunDays = diffDateKeysByDaysForAssignmentSchedule(
          oldBlockEndDateKey,
          actualBlockEndDateKey
        );
        if (overrunDays == null || overrunDays <= 0) {
          cursor = blockEndIndex + 1;
          continue;
        }

        const uniqueCompletionDates = new Set(blockCompletionKeys);
        const shouldDistributeByRatio =
          block.length > 1 && uniqueCompletionDates.size === 1;

        if (shouldDistributeByRatio) {
          const blockStartDateKey = block[0]!.startDateKey;
          const targetTotalDays = countDateRangeDaysInclusiveForAssignmentSchedule(
            blockStartDateKey,
            actualBlockEndDateKey
          );
          if (targetTotalDays > 0) {
            const plannedDurations = block.map((entry) =>
              Math.max(
                1,
                countDateRangeDaysInclusiveForAssignmentSchedule(
                  entry.startDateKey,
                  entry.endDateKey
                )
              )
            );
            const allocatedDurations = allocateExtendedDurationsByPlannedRatio(
              plannedDurations,
              targetTotalDays
            );
            let nextStartDateKey: string | null = blockStartDateKey;
            block.forEach((entry, index) => {
              if (!nextStartDateKey) return;
              const allocatedDays = Math.max(1, allocatedDurations[index] || 1);
              const nextEndDateKey =
                shiftDateKeyByDaysForAssignmentSchedule(
                  nextStartDateKey,
                  allocatedDays - 1
                ) || nextStartDateKey;
              updateAssignmentRange({
                entry,
                nextStartDateKey,
                nextEndDateKey,
                epochOffset,
              });
              nextStartDateKey =
                shiftDateKeyByDaysForAssignmentSchedule(nextEndDateKey, 1) || null;
            });
          }
        } else {
          let nextStartDateKey: string | null = block[0]!.startDateKey;
          block.forEach((entry) => {
            if (!nextStartDateKey) return;
            const plannedDays = Math.max(
              1,
              countDateRangeDaysInclusiveForAssignmentSchedule(
                entry.startDateKey,
                entry.endDateKey
              )
            );
            const minEndDateKey =
              shiftDateKeyByDaysForAssignmentSchedule(nextStartDateKey, plannedDays - 1) ||
              nextStartDateKey;
            const completionDateKey = normalizeDateKey(entry?.completionDateKey);
            const nextEndDateKey =
              completionDateKey && completionDateKey > minEndDateKey
                ? completionDateKey
                : minEndDateKey;
            updateAssignmentRange({
              entry,
              nextStartDateKey,
              nextEndDateKey,
              epochOffset,
            });
            nextStartDateKey =
              shiftDateKeyByDaysForAssignmentSchedule(nextEndDateKey, 1) || null;
          });
        }

        const newBlockEndDateKey = block[block.length - 1]!.endDateKey;
        const shiftedDays = diffDateKeysByDaysForAssignmentSchedule(
          oldBlockEndDateKey,
          newBlockEndDateKey
        );
        if (shiftedDays != null && shiftedDays > 0) {
          for (let i = blockEndIndex + 1; i < chain.length; i += 1) {
            const target = chain[i]!;
            const shiftedStart =
              shiftDateKeyByDaysForAssignmentSchedule(target.startDateKey, shiftedDays) ||
              target.startDateKey;
            const shiftedEnd =
              shiftDateKeyByDaysForAssignmentSchedule(target.endDateKey, shiftedDays) ||
              target.endDateKey;
            updateAssignmentRange({
              entry: target,
              nextStartDateKey: shiftedStart,
              nextEndDateKey: shiftedEnd,
              epochOffset,
            });
          }
        }

        cursor = blockEndIndex + 1;
      }
    });

    lineEntries.forEach((entry) => {
      stateAssignments[entry.stateIndex] = normalizeStateAssignmentItem(entry.assignment);
    });
  });

  if (changedExternalIds.size === 0) {
    return { updatedAssignmentCount: 0 };
  }

  const nextAssignments = stateAssignments.map((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || !changedExternalIds.has(externalId)) {
      return normalizeStateAssignmentItem(assignment);
    }
    return normalizeStateAssignmentItem({
      ...assignment,
      id: externalId,
    });
  });

  const nextAssignmentByExternalId = nextAssignments.reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());
  const planUpdates = linePlans
    .filter((plan) => changedExternalIds.has(plan.externalId))
    .map((plan) => {
      const assignment = nextAssignmentByExternalId.get(plan.externalId);
      if (!assignment) return null;
      const startIndex = toSignedInt(assignment?.startIndex, plan.startIndex);
      const endIndex = Math.max(
        startIndex,
        toSignedInt(assignment?.endIndex, Math.max(startIndex, plan.endIndex))
      );
      return {
        id: plan.id,
        data: {
          startIndex,
          endIndex,
          startDayOffsetPercent: toOptionalFloat(
            assignment?.startDayOffsetPercent,
            plan.startDayOffsetPercent ?? null
          ),
          startDayPercent: toOptionalFloat(
            assignment?.startDayPercent,
            plan.startDayPercent ?? null
          ),
          endDayPercent: toOptionalFloat(
            assignment?.endDayPercent,
            plan.endDayPercent ?? null
          ),
          updatedAt: new Date(),
        } as Prisma.AssignmentPlanUncheckedUpdateInput,
      };
    })
    .filter((item): item is { id: number; data: Prisma.AssignmentPlanUncheckedUpdateInput } =>
      Boolean(item)
    );

  if (planUpdates.length > 0) {
    await prisma.$transaction(
      planUpdates.map((row) =>
        prisma.assignmentPlan.update({
          where: { id: row.id },
          data: row.data,
        })
      )
    );
  }

  return {
    updatedAssignmentCount: changedExternalIds.size,
  };
};
const syncAssignmentSchedulesFromWorkRecords = async ({
  orgId,
  records,
}: {
  orgId: number;
  records: any;
}): Promise<{ updatedAssignmentCount: number }> =>
  syncAssignmentSchedulesFromWorkRecordPlans({
    orgId,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(records),
  });
const normalizeAssignmentScheduleRepairPayload = (
  value: any,
  fallback: any = null
): {
  startIndex: number;
  endIndex: number;
  startDayOffsetPercent: number | null;
  startDayPercent: number | null;
  endDayPercent: number | null;
  startDateKey: string | null;
  endDateKey: string | null;
} | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const fallbackStartIndex = toSignedInt(fallback?.startIndex, 0);
  const startIndex = toSignedInt(value?.startIndex, fallbackStartIndex);
  const endIndex = Math.max(startIndex, toSignedInt(value?.endIndex, startIndex));
  const startDateKey = normalizeDateKey(value?.startDateKey) || null;
  const endDateKey = normalizeDateKey(value?.endDateKey) || startDateKey;

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: toOptionalFloat(value?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(value?.startDayPercent, null),
    endDayPercent: toOptionalFloat(value?.endDayPercent, null),
    startDateKey,
    endDateKey,
  };
};
const resolveWorkRecordProcessMetricFromRecord = (record: any) =>
  (() => {
    const styleProcessId = toPositiveIntOrNull(record?.styleProcessId);
    if (styleProcessId !== null) {
      return {
        processMetricKey: `styleProcess:${styleProcessId}`,
        processLabel:
          resolveWorkRecordProcessCode(record) ??
          resolveWorkRecordProcessName(record) ??
          `StyleProcess#${styleProcessId}`,
      };
    }
    return {
      processMetricKey: "",
      processLabel: "미계산 공정",
    };
  })();
const resolveWorkRecordStyleMetric = (record: any) => {
  const styleId = toPositiveIntOrNull(record?.styleId);
  if (styleId) {
    return {
      styleMetricKey: `style:${styleId}`,
      styleLabel:
        resolveWorkRecordStyleCode(record) ??
        resolveOptionalString(record?.styleName, null) ??
        `Style#${styleId}`,
    };
  }
  return { styleMetricKey: "", styleLabel: "미지정 스타일" };
};
const buildWorkRecordWorkerStyleProcessSignature = (record: any) => {
  const workerId = toPositiveIntOrNull(record?.workerId);
  if (!workerId) return null;
  // Scoped by assignmentPlanId (order x style), not styleId alone: the same
  // style can legitimately be produced under two different orders in the
  // same period, each with its own AssignmentPlan. Using styleId here used to
  // flag "same worker did the same process for the same style under two
  // different orders" as a false-positive duplicate. assignmentPlanId is
  // mandatory on every WorkRecord by the time this runs (rows without it are
  // already rejected earlier in the save/import pipeline), so this still
  // reliably catches a true duplicate: the same worker entering the same
  // order/style/process twice.
  const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
  if (!assignmentPlanId) return null;
  const processMetric = resolveWorkRecordProcessMetricFromRecord(record);
  if (!processMetric.processMetricKey || processMetric.processMetricKey === "unknown") {
    return null;
  }
  return `${workerId}::assignmentPlan:${assignmentPlanId}::${processMetric.processMetricKey}`;
};
const formatWorkerStyleProcessIdentityLabel = (record: any) => {
  const workerId = toPositiveIntOrNull(record?.workerId);
  const workerLabel =
    resolveOptionalString(record?.workerName, null) ??
    (workerId ? `worker#${workerId}` : "미지정 작업자");
  const styleLabel = resolveWorkRecordStyleMetric(record).styleLabel;
  const processLabel = resolveWorkRecordProcessMetricFromRecord(record).processLabel;
  return [workerLabel, styleLabel, processLabel].filter(Boolean).join(" / ");
};
const formatAssignmentPlanLabel = (plan: any) => {
  // orderNo/label dropped in Phase E - workOrder.orderNumber/style.name are
  // the only source now (see ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE).
  const parts = [
    resolveOptionalString(plan?.workOrder?.orderNumber, null),
    resolveOptionalString(plan?.style?.name, null),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) return parts.join(" · ");
  return resolveOptionalString(plan?.externalId, null) || `assignmentPlan#${plan?.id ?? "?"}`;
};
const loadLockedPayrollMonthSet = async (
  orgId: number,
  monthKeys: string[],
  db: any = prisma
): Promise<Set<string>> => {
  const normalizedMonths = Array.from(
    new Set(
      ensureArray(monthKeys).filter(
        (month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      )
    )
  );
  if (normalizedMonths.length === 0) return new Set<string>();
  const snapshots = await db.payrollSnapshot.findMany({
    where: {
      orgId,
      month: { in: normalizedMonths },
    },
    select: { month: true },
  });
  return new Set(
    snapshots
      .map((snapshot: any) => resolveOptionalString(snapshot?.month, null))
      .filter((month: string | null): month is string => Boolean(month))
  );
};
const validateAssignmentPlanPayrollLock = async ({
  orgId,
  assignmentPlanIds,
}: {
  orgId: number;
  assignmentPlanIds: number[];
}) => {
  const normalizedPlanIds = normalizePlanIdList(assignmentPlanIds);
  if (normalizedPlanIds.length === 0) {
    return { status: 200, error: null as string | null };
  }

  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId, id: { in: normalizedPlanIds } },
    select: {
      id: true,
      externalId: true,
      completedAt: true,
      closedAt: true,
      productionCompletedAt: true,
      // orderNo/label dropped in Phase E - see ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE.
      ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
    },
  });
  const monthByPlanId = new Map<number, string>();
  plans.forEach((plan) => {
    const monthKey = resolveAssignmentPlanPayrollLockMonth(plan);
    if (monthKey) monthByPlanId.set(Number(plan.id), monthKey);
  });
  const lockedMonthSet = await loadLockedPayrollMonthSet(
    orgId,
    Array.from(monthByPlanId.values())
  );
  const lockedPlans = plans.filter((plan) => {
    const monthKey = monthByPlanId.get(Number(plan.id));
    return monthKey ? lockedMonthSet.has(monthKey) : false;
  });
  if (lockedPlans.length === 0) {
    return { status: 200, error: null as string | null };
  }

  const preview = lockedPlans
    .slice(0, 3)
    .map((plan) => {
      const label = formatAssignmentPlanLabel(plan);
      const monthKey = monthByPlanId.get(Number(plan.id));
      return monthKey ? `${label} [${monthKey}]` : label;
    })
    .join(", ");
  const extraText =
    lockedPlans.length > 3 ? ` (+${lockedPlans.length - 3} more)` : "";
  return {
    status: 409,
    error: `assignment plan payroll locked (${preview}${extraText})`,
  };
};
const validateWorkLogAssignmentPlanCtSnapshot = async ({
  orgId,
  lineId,
  records,
  allowCompletedAssignmentPlanIds = [],
}: {
  orgId: number;
  lineId: number | null;
  records: any;
  allowCompletedAssignmentPlanIds?: number[];
}) => {
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(records);
  if (assignmentPlanIds.length === 0) {
    return { status: 200, error: null as string | null };
  }
  void lineId;
  const allowedCompletedPlanIdSet = new Set(
    normalizePlanIdList(allowCompletedAssignmentPlanIds)
  );

  let plans: any[] = [];
  try {
    plans = await prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: assignmentPlanIds } },
      select: {
        id: true,
        externalId: true,
        lineId: true,
        assignmentCtSnapshot: true,
        assignmentCtTotalSeconds: true,
        isCompleted: true,
        completedAt: true,
        // orderNo/label dropped in Phase E - see ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE.
        ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    plans = await prisma.assignmentPlan.findMany({
      where: { orgId, id: { in: assignmentPlanIds } },
      select: {
        id: true,
        externalId: true,
        lineId: true,
        assignmentCtSnapshot: true,
        isCompleted: true,
        completedAt: true,
        ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
      },
    });
  }
  const planById = new Map(plans.map((plan: any) => [plan.id, plan]));

  const missingPlanIds = assignmentPlanIds.filter(
    (planId) => !planById.has(planId)
  );
  if (missingPlanIds.length > 0) {
    return {
      status: 400,
      error: `assignment plan not found (${missingPlanIds.join(",")})`,
    };
  }

  const newlySelectedCompletedPlans = plans.filter((plan) => {
    if (plan?.isCompleted !== true) return false;
    return !allowedCompletedPlanIdSet.has(Number(plan.id));
  });
  if (newlySelectedCompletedPlans.length > 0) {
    const preview = newlySelectedCompletedPlans
      .slice(0, 3)
      .map((plan) => formatAssignmentPlanLabel(plan))
      .join(", ");
    const extraText =
      newlySelectedCompletedPlans.length > 3
        ? ` (+${newlySelectedCompletedPlans.length - 3} more)`
        : "";
    return {
      status: 409,
      error: `assignment plan already completed (${preview}${extraText})`,
    };
  }

  const missingSnapshotPlans = plans.filter((plan) => {
    const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
    return !ctSnapshot || resolveAssignmentCtTotalSeconds(plan) == null;
  });
  if (missingSnapshotPlans.length > 0) {
    const preview = missingSnapshotPlans
      .slice(0, 3)
      .map((plan) => formatAssignmentPlanLabel(plan))
      .join(", ");
    const extraText =
      missingSnapshotPlans.length > 3
        ? ` (+${missingSnapshotPlans.length - 3} more)`
        : "";
    return {
      status: 400,
      error: `ct snapshot required before work log (${preview}${extraText})`,
    };
  }

  return { status: 200, error: null as string | null };
};
const validateWorkLogWorkerStyleProcessDuplicates = async ({
  orgId,
  workDate,
  records,
  excludedWorkLogId = null,
}: {
  orgId: number;
  workDate: string;
  records: any;
  excludedWorkLogId?: number | null;
}) => {
  const normalizedWorkDate = normalizeDateKey(workDate);
  if (!normalizedWorkDate) {
    return {
      status: 400,
      error: "invalid workDate",
      incomingDuplicateRows: [],
      conflictRows: [],
    };
  }

  const incomingRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (incomingRecords.length === 0) {
    return {
      status: 200,
      error: null as string | null,
      incomingDuplicateRows: [],
      conflictRows: [],
    };
  }

  const firstIncomingRecordBySignature = new Map<string, any>();
  const incomingDuplicateRows: any[] = [];
  incomingRecords.forEach((record) => {
    const signature = buildWorkRecordWorkerStyleProcessSignature(record);
    if (!signature) return;
    if (firstIncomingRecordBySignature.has(signature)) {
      incomingDuplicateRows.push(record);
      return;
    }
    firstIncomingRecordBySignature.set(signature, record);
  });

  if (incomingDuplicateRows.length > 0) {
    const preview = incomingDuplicateRows
      .slice(0, 3)
      .map((record) => formatWorkerStyleProcessIdentityLabel(record))
      .join("; ");
    const extraText =
      incomingDuplicateRows.length > 3
        ? ` (+${incomingDuplicateRows.length - 3} more)`
        : "";
    return {
      status: 400,
      error: `duplicate worker-style-process on workDate: ${preview}${extraText}`,
      incomingDuplicateRows,
      conflictRows: [],
    };
  }

  const workerIds = collectPositiveIntSet(
    ...incomingRecords.map((record) => record?.workerId)
  );
  if (workerIds.length === 0 || firstIncomingRecordBySignature.size === 0) {
    return {
      status: 200,
      error: null as string | null,
      incomingDuplicateRows: [],
      conflictRows: [],
    };
  }

  const existingRows: any[] = await prisma.workRecord.findMany({
    where: {
      orgId,
      workerId: { in: workerIds },
      workLog: {
        orgId,
        displayDate: normalizedWorkDate,
        ...(excludedWorkLogId ? { id: { not: excludedWorkLogId } } : {}),
      },
    },
    select: {
      workerId: true,
      styleId: true,
      styleProcessId: true,
      assignmentPlanId: true,
      worker: {
        select: { name: true },
      },
      style: {
        select: { id: true, code: true, name: true },
      },
      styleProcess: {
        select: { id: true, processCode: true, processName: true },
      },
    } as any,
  });

  const existingSignatureSet = new Set<string>();
  existingRows.forEach((row) => {
    const signature = buildWorkRecordWorkerStyleProcessSignature({
      workerId: row.workerId,
      styleId: row.styleId,
      style: row.style,
      styleProcessId: row.styleProcessId,
      styleProcess: row.styleProcess,
      assignmentPlanId: row.assignmentPlanId,
    });
    if (signature) existingSignatureSet.add(signature);
  });

  const conflictRows = Array.from(firstIncomingRecordBySignature.entries())
    .filter(([signature]) => existingSignatureSet.has(signature))
    .map(([, record]) => record);
  if (conflictRows.length > 0) {
    const preview = conflictRows
      .slice(0, 3)
      .map((record) => formatWorkerStyleProcessIdentityLabel(record))
      .join("; ");
    const extraText =
      conflictRows.length > 3 ? ` (+${conflictRows.length - 3} more)` : "";
    return {
      status: 400,
      error: `duplicate worker-style-process on workDate: ${preview}${extraText}`,
      incomingDuplicateRows: [],
      conflictRows,
    };
  }

  return {
    status: 200,
    error: null as string | null,
    incomingDuplicateRows: [],
    conflictRows: [],
  };
};
const validateWorkLogLineWorkers = async ({
  orgId,
  lineId,
  factoryId,
  workDate,
  coverageEndDate = null,
  workerIds,
}: {
  orgId: number;
  lineId: number | null;
  factoryId: number | null;
  workDate: string;
  coverageEndDate?: string | null;
  workerIds: number[];
}) => {
  const normalizedWorkDate = normalizeDateKey(workDate);
  const normalizedCoverageEndDate =
    normalizeDateKey(coverageEndDate) || normalizedWorkDate;
  if (!normalizedWorkDate) {
    return {
      status: 400,
      error: "invalid workDate",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

  if (!lineId) {
    return {
      status: 400,
      error: "lineId is required",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

  const line = await prisma.line.findFirst({
    where: { id: lineId, orgId },
    select: { id: true, factoryId: true, name: true },
  });
  if (!line) {
    return {
      status: 404,
      error: "line not found",
      line: null as { id: number; factoryId: number; name: string } | null,
      missingWorkerIds: [] as number[],
    };
  }

  if (factoryId !== null && line.factoryId !== factoryId) {
    return {
      status: 400,
      error: "line does not belong to selected factory",
      line,
      missingWorkerIds: [] as number[],
    };
  }

  const startDateRange = buildWorkDateRange(normalizedWorkDate);
  const endDateRange = buildWorkDateRange(normalizedCoverageEndDate);
  if (
    !startDateRange ||
    !endDateRange ||
    normalizedWorkDate > normalizedCoverageEndDate
  ) {
    return {
      status: 400,
      error: "invalid workDate",
      line,
      missingWorkerIds: [] as number[],
    };
  }

  if (workerIds.length === 0) {
    return {
      status: 200,
      error: null as string | null,
      line,
      missingWorkerIds: [] as number[],
    };
  }

  const matchedAssignments = await prisma.lineAssignment.findMany({
    where: {
      lineId: line.id,
      employeeId: { in: workerIds },
      startAt: { lte: endDateRange.endAt },
      OR: [{ endAt: null }, { endAt: { gte: startDateRange.startAt } }],
    },
    select: { employeeId: true },
  });
  const matchedWorkerIdSet = new Set(
    matchedAssignments.map((assignment) => assignment.employeeId)
  );
  let missingWorkerIds = workerIds.filter(
    (workerId) => !matchedWorkerIdSet.has(workerId)
  );

  // 과거 작업일 기준 배정 이력이 비어 있는 경우(월말 일괄입력 등)에는
  // 현재 활성 배정(endAt = null)도 허용해 작업 기록 입력이 막히지 않도록 한다.
  if (missingWorkerIds.length > 0) {
    const fallbackAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        employeeId: { in: missingWorkerIds },
        endAt: null,
      },
      select: { employeeId: true },
    });
    fallbackAssignments.forEach((assignment) => {
      matchedWorkerIdSet.add(assignment.employeeId);
    });
    missingWorkerIds = workerIds.filter(
      (workerId) => !matchedWorkerIdSet.has(workerId)
    );
  }

  return {
    status: 200,
    error: null as string | null,
    line,
    missingWorkerIds,
  };
};
const validateWorkLogWorkerEmploymentWindow = async ({
  orgId,
  coverageStartDate,
  coverageEndDate,
  workerIds,
}: {
  orgId: number;
  coverageStartDate: string;
  coverageEndDate: string;
  workerIds: number[];
}) => {
  const normalizedCoverageStartDate = normalizeDateKey(coverageStartDate);
  const normalizedCoverageEndDate = normalizeDateKey(coverageEndDate);
  if (
    !normalizedCoverageStartDate ||
    !normalizedCoverageEndDate ||
    normalizedCoverageStartDate > normalizedCoverageEndDate
  ) {
    return {
      status: 400,
      error: "invalid workDate",
      invalidWorkerIds: [] as number[],
      coverageByWorkerId: new Map<
        number,
        { effectiveStartDate: string; effectiveEndDate: string }
      >(),
      adjustments: [] as WorkRecordEmploymentAdjustment[],
    };
  }

  if (workerIds.length === 0) {
    return {
      status: 200,
      error: null as string | null,
      invalidWorkerIds: [] as number[],
      coverageByWorkerId: new Map<
        number,
        { effectiveStartDate: string; effectiveEndDate: string }
      >(),
      adjustments: [] as WorkRecordEmploymentAdjustment[],
    };
  }

  const workers = await prisma.employee.findMany({
    where: {
      orgId,
      id: { in: workerIds },
    },
    select: {
      id: true,
      name: true,
      joinedAt: true,
      leftAt: true,
    },
  });
  const workerById = new Map<
    number,
    { name: string; joinedAt: unknown; leftAt: unknown }
  >();
  workers.forEach((worker) => {
    const workerId = toPositiveIntOrNull(worker.id);
    if (workerId === null) return;
    workerById.set(workerId, {
      name: resolveOptionalString(worker.name, "") || "",
      joinedAt: worker.joinedAt,
      leftAt: worker.leftAt,
    });
  });

  const invalidWorkerIds: number[] = [];
  const coverageByWorkerId = new Map<
    number,
    { effectiveStartDate: string; effectiveEndDate: string }
  >();
  const adjustments: WorkRecordEmploymentAdjustment[] = [];
  workerIds.forEach((workerId) => {
    const worker = workerById.get(workerId);
    if (!worker) {
      invalidWorkerIds.push(workerId);
      return;
    }
    const coverage = resolveWorkRecordEmploymentCoverage({
      coverageStartDate: normalizedCoverageStartDate,
      coverageEndDate: normalizedCoverageEndDate,
      joinedDateKey: toDateKeyInTimeZone(worker.joinedAt, BUSINESS_TIME_ZONE),
      leftDateKey: toDateKeyInTimeZone(worker.leftAt, BUSINESS_TIME_ZONE),
    });
    if (!coverage.valid) {
      invalidWorkerIds.push(workerId);
      return;
    }
    coverageByWorkerId.set(workerId, {
      effectiveStartDate: coverage.effectiveStartDate,
      effectiveEndDate: coverage.effectiveEndDate,
    });
    if (coverage.adjusted) {
      adjustments.push({
        workerId,
        workerName: worker.name,
        ...coverage,
      });
    }
  });

  return {
    status: 200,
    error: null as string | null,
    invalidWorkerIds,
    coverageByWorkerId,
    adjustments,
  };
};
const translateWorkLogErrorMessage = (error: any) => {
  const text = resolveOptionalString(error, "") || "";
  const missingAssignmentPlanMatch = text.match(
    /^records\[(\d+)\]\.assignmentPlanId is required$/
  );
  if (missingAssignmentPlanMatch) {
    const displayIndex = Number(missingAssignmentPlanMatch[1]) + 1;
    return `Work log row ${displayIndex} is missing an assignment link. Select an assignment card and save again.`;
  }
  if (!text) return "작업 기록 처리 중 오류가 발생했습니다.";
  const invalidWorkerMatch = text.match(/^records\[(\d+)\]\.workerId is required$/);
  if (invalidWorkerMatch) {
    const displayIndex = Number(invalidWorkerMatch[1]) + 1;
    return `${displayIndex}번째 작업 기록에 작업자가 없습니다. 작업자를 다시 선택해 주세요.`;
  }

  if (text === "organization not found") return "조직 정보를 찾을 수 없습니다.";
  if (text === "invalid id") return "작업 기록 ID가 올바르지 않습니다.";
  if (text === "factory not found") return "선택한 공장을 찾을 수 없습니다.";
  if (text === "work log not found") return "작업 기록을 찾을 수 없습니다.";
  if (text === "lineId is required") return "라인을 선택해 주세요.";
  if (text === "line not found") return "선택한 라인을 찾을 수 없습니다.";
  if (text === "line does not belong to selected factory") {
    return "선택한 라인이 현재 공장에 속하지 않습니다.";
  }
  if (text === "invalid workDate") return "작업일자가 올바르지 않습니다.";
  if (text.startsWith("duplicate worker-style-process on workDate")) {
    const detail = resolveOptionalString(text.split(":").slice(1).join(":").trim(), null);
    if (detail) {
      return `같은 작업자가 같은 배정의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다. (${detail})`;
    }
    return "같은 작업자가 같은 배정의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다.";
  }
  if (text.startsWith("line worker mismatch for workDate")) {
    return "선택한 작업일 기준으로 현재 라인에 속하지 않은 작업자가 포함되어 있습니다. 라인과 작업자를 다시 확인해 주세요.";
  }
  if (text.startsWith("worker employment mismatch for workDate")) {
    return "퇴사일(또는 입사일) 기준으로 입력할 수 없는 작업자가 포함되어 있습니다.";
  }
  if (text.startsWith("assignment plan not found")) {
    return "선택한 배정카드를 찾을 수 없습니다.";
  }
  if (text.startsWith("assignment plan line mismatch")) {
    return "선택한 라인과 맞지 않는 배정카드가 포함되어 있습니다.";
  }
  if (text.startsWith("assignment plan already completed")) {
    return "이미 마감완료된 배정카드가 포함되어 있습니다. 관리자에게 확인해 주세요.";
  }
  if (text.startsWith("assignment plan payroll locked")) {
    return "급여 잠금이 끝난 배정카드가 포함되어 있어 작업기록을 수정할 수 없습니다.";
  }
  if (
    text.startsWith("ct snapshot required before work log") ||
    text.startsWith("ct agreement required before work log")
  ) {
    return "CT snapshot이 저장된 배정 카드만 작업 기록으로 저장할 수 있습니다.";
  }
  if (/records\[\d+\]\.styleId is required/i.test(text)) {
    return "작업기록의 스타일 참조(styleId)를 확정할 수 없습니다. 배정 카드와 주문 스타일 연결을 확인해 주세요.";
  }
  if (/records\[\d+\]\.styleProcessId is required/i.test(text)) {
    return "작업기록의 스타일별 공정 참조(styleProcessId)를 확정할 수 없습니다. 스타일 공정과 배정 카드 연결을 확인해 주세요.";
  }

  return text;
};
const loadWorkRecordResponseDisplayContext = async ({
  orgId,
  records,
  db = prisma,
}: {
  orgId: number | null;
  records: any;
  db?: any;
}) => {
  const normalizedOrgId = toPositiveIntOrNull(orgId);
  const normalizedRecords = ensureArray(records).filter(
    (record) => record && typeof record === "object"
  );
  if (normalizedOrgId === null || normalizedRecords.length === 0) {
    return {
      workerNameById: new Map<number, string>(),
      assignmentPlanMetaById: new Map<number, any>(),
    };
  }

  const workerIds = collectWorkRecordWorkerIds(normalizedRecords);
  const assignmentPlanIds = collectWorkRecordAssignmentPlanIds(normalizedRecords);
  const [workers, plans] = await Promise.all([
    workerIds.length > 0
      ? db.employee.findMany({
          where: { orgId: normalizedOrgId, id: { in: workerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    assignmentPlanIds.length > 0
      ? db.assignmentPlan.findMany({
          where: { orgId: normalizedOrgId, id: { in: assignmentPlanIds } },
          select: {
            id: true,
            lineId: true,
            // orderNo/customer/label dropped in Phase E - workOrder.orderNumber/
            // buyerOrg.name/style.name are the only source now.
            workOrder: { select: { orderNumber: true } },
            buyerOrg: { select: { name: true } },
            style: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const styleMetaByPlanId = await resolveAssignmentPlanStyleMetaById({
    orgId: normalizedOrgId,
    assignmentPlanIds,
    db,
  });

  const workerNameById = new Map<number, string>();
  ensureArray(workers).forEach((worker) => {
    const workerId = toPositiveIntOrNull(worker?.id);
    const workerName = resolveOptionalString(worker?.name, null);
    if (workerId === null || !workerName) return;
    workerNameById.set(workerId, workerName);
  });

  const assignmentPlanMetaById = new Map<number, any>();
  ensureArray(plans).forEach((plan) => {
    const planId = toPositiveIntOrNull(plan?.id);
    if (planId === null) return;
    const styleMeta = styleMetaByPlanId.get(planId) ?? null;
    assignmentPlanMetaById.set(planId, {
      ...plan,
      // orderNo/customer/label dropped in Phase E - resolved here from the
      // workOrder/buyerOrg/style relations fetched above instead.
      orderNo: resolveOptionalString((plan as any)?.workOrder?.orderNumber, null),
      customer: resolveOptionalString((plan as any)?.buyerOrg?.name, null),
      label: resolveOptionalString((plan as any)?.style?.name, null),
      styleId: toPositiveIntOrNull(styleMeta?.styleId),
      styleCode: resolveOptionalString(styleMeta?.styleId, null),
      styleName: resolveOptionalString(styleMeta?.styleName, null),
    });
  });

  return {
    workerNameById,
    assignmentPlanMetaById,
  };
};
const hydrateWorkRecordResponseDisplayFields = (
  record: any,
  displayContext?: {
    workerNameById?: Map<number, string>;
    assignmentPlanMetaById?: Map<number, any>;
  } | null
) => {
  const workerId = toPositiveIntOrNull(record?.workerId);
  const assignmentPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
  const workerName =
    resolveOptionalString(record?.workerName, null) ??
    (workerId !== null
      ? resolveOptionalString(displayContext?.workerNameById?.get(workerId), null)
      : null);
  const assignmentPlanMeta =
    assignmentPlanId !== null
      ? displayContext?.assignmentPlanMetaById?.get(assignmentPlanId) ??
        record?.assignmentPlan ??
        null
      : record?.assignmentPlan ?? null;

  return {
    ...record,
    workerName:
      workerName ?? resolveOptionalString(record?.worker?.name, null),
    // assignmentPlanMeta is either the pre-resolved flat map entry from
    // loadWorkRecordResponseDisplayContext (already has orderNo/customer
    // flattened from the join) or the raw WorkRecord.assignmentPlan relation
    // (WORK_RECORD_WITH_REFS_INCLUDE - only has the nested workOrder/
    // buyerOrg/style relations, no flat orderNo/customer/label columns
    // anymore). Handle both shapes.
    customerName: resolveOptionalString(
      assignmentPlanMeta?.customer ?? assignmentPlanMeta?.buyerOrg?.name,
      null
    ),
    orderNo: resolveOptionalString(
      assignmentPlanMeta?.orderNo ?? assignmentPlanMeta?.workOrder?.orderNumber,
      null
    ),
    lineId:
      toPositiveIntOrNull(record?.lineId) ??
      toPositiveIntOrNull(assignmentPlanMeta?.lineId),
    styleId:
      resolveWorkRecordStyleRefId(record) ??
      toPositiveIntOrNull(assignmentPlanMeta?.styleId),
    styleCode:
      resolveWorkRecordStyleCode(record) ??
      resolveOptionalString(assignmentPlanMeta?.styleCode, null),
    styleName:
      resolveWorkRecordStyleName(record) ??
      resolveOptionalString(
        assignmentPlanMeta?.styleName ??
          assignmentPlanMeta?.label ??
          assignmentPlanMeta?.style?.name,
        null
      ),
    assignmentPlan: assignmentPlanMeta,
  };
};
const toWorkRecordResponse = (record: any) => {
  const hydrated = hydrateWorkRecordResponseDisplayFields(record);
  return {
    workerId: hydrated?.workerId ?? null,
    workerName: hydrated?.workerName ?? "",
    customerName: hydrated?.customerName ?? "",
    orderNo: resolveOptionalString(hydrated?.orderNo, "") ?? "",
    lineId: toPositiveIntOrNull(hydrated?.lineId),
    styleRefId: resolveWorkRecordStyleRefId(hydrated),
    styleId: resolveWorkRecordStyleRefId(hydrated),
    styleCode: resolveWorkRecordStyleCode(hydrated) ?? "",
    styleName: resolveWorkRecordStyleName(hydrated) ?? "",
    styleProcessId: toPositiveIntOrNull(
      hydrated?.styleProcess?.id ?? hydrated?.styleProcessId
    ),
    processCode: resolveWorkRecordProcessCode(hydrated) ?? "",
    processName: resolveWorkRecordProcessName(hydrated) ?? "",
    processNameKo: resolveOptionalString(hydrated?.processNameKo, null) ?? "",
    processNameEn: resolveOptionalString(hydrated?.processNameEn, null) ?? "",
    processNameVi: resolveOptionalString(hydrated?.processNameVi, null) ?? "",
    ctSeconds: toNonNegativeInt(hydrated?.ctSeconds, 0),
    quantity: toNonNegativeInt(hydrated?.quantity, 0),
    assignmentPlanId: hydrated?.assignmentPlanId ?? null,
    effectiveCoverageStartDate:
      normalizeDateKey(hydrated?.effectiveCoverageStartDate) || null,
    effectiveCoverageEndDate:
      normalizeDateKey(hydrated?.effectiveCoverageEndDate) || null,
  };
};
const resolveWorkLogCoverageStartDate = (source: any, fallbackDate: string | null = null) =>
  normalizeDateKey(source?.coverageStartDate) ||
  normalizeDateKey(fallbackDate) ||
  null;

const resolveWorkLogCoverageEndDate = (source: any, fallbackDate: string | null = null) =>
  normalizeDateKey(source?.coverageEndDate) ||
  normalizeDateKey(fallbackDate) ||
  null;

function resolveWorkRecordEffectiveCoverageStartDate(
  record: any,
  workLog: any = record?.workLog
): string | null {
  return (
    normalizeDateKey(record?.effectiveCoverageStartDate) ||
    normalizeDateKey(workLog?.coverageStartDate) ||
    null
  );
}

function resolveWorkRecordEffectiveCoverageEndDate(
  record: any,
  workLog: any = record?.workLog
): string | null {
  return (
    normalizeDateKey(record?.effectiveCoverageEndDate) ||
    normalizeDateKey(workLog?.coverageEndDate) ||
    null
  );
}

const resolveWorkLogEntryMode = ({
  coverageStartDate,
  coverageEndDate,
  requestedEntryMode = null,
}: {
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  requestedEntryMode?: any;
}): "daily" | "period_summary" => {
  const normalizedRequested = resolveOptionalString(requestedEntryMode, null)?.toLowerCase();
  if (normalizedRequested === "daily" || normalizedRequested === "period_summary") {
    return normalizedRequested;
  }
  if (!coverageStartDate || !coverageEndDate) return "daily";
  return coverageStartDate === coverageEndDate ? "daily" : "period_summary";
};
const normalizeWorkLogPayload = (payload: any = {}, fallback: any = null) => {
  const coverageEndInput =
    payload?.coverageEndDate !== undefined
      ? payload.coverageEndDate
      : payload?.workDate !== undefined
        ? payload.workDate
        : fallback?.coverageEndDate !== undefined
          ? fallback?.coverageEndDate
          : fallback?.displayDate;
  const normalizedCoverageEndDate = normalizeDateKey(coverageEndInput) || todayDateKey();
  const coverageStartInput =
    payload?.coverageStartDate !== undefined
      ? payload.coverageStartDate
      : fallback?.coverageStartDate !== undefined
        ? fallback?.coverageStartDate
        : normalizedCoverageEndDate;
  const normalizedCoverageStartDateCandidate =
    normalizeDateKey(coverageStartInput) || normalizedCoverageEndDate;
  const normalizedCoverageStartDate =
    normalizedCoverageStartDateCandidate <= normalizedCoverageEndDate
      ? normalizedCoverageStartDateCandidate
      : normalizedCoverageEndDate;
  const entryMode = resolveWorkLogEntryMode({
    coverageStartDate: normalizedCoverageStartDate,
    coverageEndDate: normalizedCoverageEndDate,
    requestedEntryMode:
      payload?.entryMode !== undefined ? payload.entryMode : fallback?.entryMode,
  });
  const fallbackLineMeta = resolveWorkLogLineMeta(fallback?.records);
  const normalizedRecords = normalizeWorkRecordPayloadList(
    payload?.records !== undefined ? payload.records : fallback?.records
  );
  const records = normalizedRecords.rows;

  return {
    displayDate: normalizedCoverageEndDate,
    coverageStartDate: normalizedCoverageStartDate,
    coverageEndDate: normalizedCoverageEndDate,
    entryMode,
    factoryId: toNumberOrNull(
      payload?.factoryId !== undefined ? payload.factoryId : fallback?.factoryId
    ),
    lineId: toPositiveIntOrNull(
      payload?.lineId !== undefined ? payload?.lineId : fallbackLineMeta.lineId
    ),
    lineName: resolveOptionalString(
      payload?.lineName,
      fallbackLineMeta.lineName ?? null
    ),
    factoryWagePerSecond: toOptionalFiniteNumber(
      payload?.factoryWagePerSecond,
      fallback?.factoryWagePerSecond ?? null
    ),
    ctBasis:
      resolveOptionalString(payload?.ctBasis, fallback?.ctBasis ?? "CT") ?? "CT",
    workerCount: toNonNegativeInt(
      payload?.workerCount !== undefined
        ? payload.workerCount
        : fallback?.workerCount,
      0
    ),
    itemCount: toNonNegativeInt(
      payload?.itemCount !== undefined ? payload.itemCount : fallback?.itemCount,
      0
    ),
    totalCtSeconds: toNonNegativeInt(
      payload?.totalCtSeconds !== undefined
        ? payload.totalCtSeconds
        : fallback?.totalCtSeconds,
      0
    ),
    note: resolveOptionalString(payload?.note, fallback?.note ?? null),
    records,
    invalidWorkerRecordIndex: normalizedRecords.invalidWorkerRecordIndex,
  };
};
type WorkLogImportIssue = {
  rowNumber: number;
  sheetName: string | null;
  code: string;
  message: string;
};

const formatWorkLogImportIssueLocation = (row: {
  rowNumber?: number | null;
  sheetName?: string | null;
}) => {
  const parts = [
    resolveOptionalString(row?.sheetName, null),
    row?.rowNumber ? `row ${row.rowNumber}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : "import row";
};

const buildWorkLogImportIssue = ({
  row,
  code,
  message,
}: {
  row: { rowNumber?: number | null; sheetName?: string | null };
  code: string;
  message: string;
}): WorkLogImportIssue => ({
  rowNumber: toPositiveIntOrNull(row?.rowNumber) ?? 0,
  sheetName: resolveOptionalString(row?.sheetName, null),
  code,
  message: `${formatWorkLogImportIssueLocation(row)}: ${message}`,
});

const summarizeWorkLogImportIssues = (
  issues: WorkLogImportIssue[],
  prefix = "Work-log import failed"
) => {
  const safeIssues = ensureArray(issues).filter(
    (issue) => issue && typeof issue === "object"
  ) as WorkLogImportIssue[];
  if (safeIssues.length === 0) return prefix;
  const preview = safeIssues
    .slice(0, 5)
    .map((issue) => issue.message)
    .join("; ");
  const extraCount = safeIssues.length - 5;
  return `${prefix} (${safeIssues.length} issues): ${preview}${
    extraCount > 0 ? `; +${extraCount} more` : ""
  }`;
};

const normalizeImportedWorkLogRows = (rows: any) =>
  ensureArray(rows)
    .filter((row) => row && typeof row === "object")
    .map((row: any, index: number) => {
      const rowNumber = toPositiveIntOrNull(row?.rowNumber) ?? index + 2;
      const coverageEndDate =
        normalizeDateKey(row?.coverageEndDate) ??
        normalizeDateKey(row?.workDate) ??
        null;
      const rawCoverageStartDate =
        normalizeDateKey(row?.coverageStartDate) ??
        normalizeDateKey(row?.dateStart) ??
        null;
      const coverageStartDate = rawCoverageStartDate || coverageEndDate;
      return {
        rowNumber,
        sheetName: resolveOptionalString(row?.sheetName, null),
        coverageStartDate,
        coverageEndDate,
        employeeNo: normalizeEmployeeNo(row?.employeeNo),
        employeeName: resolveOptionalString(row?.employeeName, null),
        orderNo: resolveOptionalString(row?.orderNo, null),
        styleId: resolveOptionalString(row?.styleId, null),
        processCode: resolveOptionalString(row?.processCode, null),
        quantity: toNonNegativeInt(row?.quantity, 0),
      };
    });

const buildWorkLogImportLineLookup = (lines: any[]) =>
  ensureArray(lines).reduce((map, line) => {
    const factoryId = toPositiveIntOrNull(line?.factoryId);
    const nameKey = normalizeComparableText(line?.name);
    if (!factoryId || !nameKey) return map;
    const key = `${factoryId}:${nameKey}`;
    const current = map.get(key) || [];
    current.push({
      id: toPositiveIntOrNull(line?.id),
      factoryId,
      name: resolveOptionalString(line?.name, "") ?? "",
    });
    map.set(key, current);
    return map;
  }, new Map<string, Array<{ id: number | null; factoryId: number; name: string }>>());

const doesWorkLogImportLineAssignmentCoverDate = ({
  assignment,
  coverageEndDate,
}: {
  assignment: any;
  coverageEndDate: string;
}) => {
  const dateRange = buildWorkDateRange(coverageEndDate);
  if (!dateRange) return false;
  const startAt = assignment?.startAt ? new Date(assignment.startAt) : null;
  const endAt = assignment?.endAt ? new Date(assignment.endAt) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) return false;
  if (startAt > dateRange.endAt) return false;
  if (endAt && !Number.isNaN(endAt.getTime()) && endAt < dateRange.startAt) {
    return false;
  }
  return true;
};

const resolveWorkLogImportLineForEmployee = ({
  employee,
  coverageEndDate,
  lineAssignmentsByEmployeeId,
}: {
  employee: any;
  coverageEndDate: string;
  lineAssignmentsByEmployeeId: Map<number, any[]>;
}) => {
  const employeeId = toPositiveIntOrNull(employee?.id);
  const assignments = employeeId
    ? ensureArray(lineAssignmentsByEmployeeId.get(employeeId))
    : [];
  const activeMatches = assignments.filter((assignment) =>
    doesWorkLogImportLineAssignmentCoverDate({
      assignment,
      coverageEndDate,
    })
  );
  const activeLineMatches = Array.from(
    new Map(
      activeMatches
        .map((assignment) => {
          const lineId = toPositiveIntOrNull(assignment?.line?.id ?? assignment?.lineId);
          const factoryId = toPositiveIntOrNull(assignment?.line?.factoryId);
          const lineName = resolveOptionalString(assignment?.line?.name, null);
          if (!lineId || !factoryId || !lineName) return null;
          return [
            lineId,
            {
              id: lineId,
              factoryId,
              name: lineName,
              source: "line_assignment",
            },
          ] as const;
        })
        .filter(Boolean) as Array<
        readonly [
          number,
          { id: number; factoryId: number; name: string; source: string }
        ]
      >
    ).values()
  );
  if (activeLineMatches.length === 1) {
    return { line: activeLineMatches[0], error: null as string | null };
  }
  if (activeLineMatches.length > 1) {
    return {
      line: null,
      error: "multiple line assignments matched the work date",
    };
  }

  const lineId = toPositiveIntOrNull(employee?.line?.id ?? employee?.lineId);
  const lineFactoryId = toPositiveIntOrNull(employee?.line?.factoryId);
  const lineName = resolveOptionalString(employee?.line?.name, null);
  if (lineId && lineFactoryId && lineName) {
    return {
      line: {
        id: lineId,
        factoryId: lineFactoryId,
        name: lineName,
        source: "employee_line_id",
      },
      error: null as string | null,
    };
  }

  return {
    line: null,
    error: "line could not be resolved for the employee on the work date",
  };
};

const buildWorkLogImportProcessCodeCandidates = (process: any): string[] =>
  Array.from(
    new Set(
      [
        process?.processCode,
        process?.code,
        process?.storageCode,
        process?.processKey,
      ]
        .map((value) => normalizeProcessCodeKey(value))
        .filter((value): value is string => Boolean(value))
    )
  );

const buildWorkLogImportProcessOptionIdentity = (process: any): string => {
  const codeKey = buildWorkLogImportProcessCodeCandidates(process)[0] ?? null;
  if (codeKey) return `code:${codeKey}`;
  const styleProcessId = toPositiveIntOrNull(process?.styleProcessId);
  if (styleProcessId !== null) return `style-process:${styleProcessId}`;
  const nameKey = normalizeProcessNameKey(
    process?.processName ?? process?.name ?? process?.nameEn
  );
  if (nameKey) return `name:${nameKey}`;
  return "";
};

const buildWorkLogImportOrderStyleKey = (orderKey: string, styleKey: string) =>
  `${orderKey}\u0000${styleKey}`;

const buildWorkLogImportLiveStyleProcessOptions = (plan: any) => {
  const orderQuantity = toPositiveInt(
    resolveAssignmentQuantity(plan) ??
      plan?.assignmentCtSnapshot?.quantity ??
      plan?.assignmentQuantity ??
      1,
    1
  );
  return normalizeStyleProcesses(plan?.style?.processes).map(
    (process: any, index: number) => ({
      styleProcessId: toPositiveIntOrNull(process?.styleProcessId ?? process?.id),
      processCode:
        resolveOptionalString(
          process?.code ?? process?.storageCode ?? process?.instanceId,
          null
        ) ?? `PROCESS-${index + 1}`,
      processName:
        resolveOptionalString(
          process?.name ??
            process?.processName ??
            process?.nameEn ??
            process?.nameKo ??
            process?.nameVi,
          null
        ) ?? `process ${index + 1}`,
      ctSeconds: Math.max(
        0,
        Math.round(
          Number(
            resolveStyleProcessExactStPerPieceSeconds(process, orderQuantity) ?? 0
          ) || 0
        )
      ),
    })
  );
};

const buildWorkLogImportPlanProcessOptions = (plan: any) => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const merged = new Map<string, any>();
  ensureArray(snapshot?.processes).forEach((process: any, index: number) => {
    const fallbackName =
      resolveOptionalString(process?.name, null) ??
      resolveOptionalString(process?.processName, null) ??
      `process ${index + 1}`;
    const option = {
      styleProcessId: toPositiveIntOrNull(process?.styleProcessId),
      processCode:
        resolveOptionalString(process?.processCode ?? process?.code, null) ??
        resolveOptionalString(process?.processKey, null),
      processName: fallbackName,
      ctSeconds: Math.max(
        0,
        Math.round(
          Number(
            process?.pieceCtSeconds ??
              process?.snapshotCtSeconds ??
              process?.ctPerPieceSeconds ??
              process?.ctSeconds
          ) || 0
        )
      ),
    };
    const identity = buildWorkLogImportProcessOptionIdentity(option);
    if (identity) merged.set(identity, option);
  });
  buildWorkLogImportLiveStyleProcessOptions(plan).forEach((option) => {
    const identity = buildWorkLogImportProcessOptionIdentity(option);
    if (!identity) return;
    const current = merged.get(identity);
    if (!current) {
      merged.set(identity, option);
      return;
    }
    merged.set(identity, {
      styleProcessId:
        toPositiveIntOrNull(option?.styleProcessId) ??
        toPositiveIntOrNull(current?.styleProcessId),
      processCode:
        resolveOptionalString(current?.processCode, null) ??
        resolveOptionalString(option?.processCode, null),
      processName:
        resolveOptionalString(current?.processName, null) ??
        resolveOptionalString(option?.processName, null),
      ctSeconds:
        Math.max(0, Math.round(Number(current?.ctSeconds ?? 0) || 0)) > 0
          ? Math.max(0, Math.round(Number(current?.ctSeconds ?? 0) || 0))
          : Math.max(0, Math.round(Number(option?.ctSeconds ?? 0) || 0)),
    });
  });
  return Array.from(merged.values());
};

const resolveWorkLogImportMatchedProcess = ({
  plan,
  processCode,
}: {
  plan: any;
  processCode: string;
}) => {
  const processToken = resolveOptionalString(processCode, null);
  if (!processToken) return null;
  const normalizedProcessCode = normalizeProcessCodeKey(processToken);
  const normalizedProcessName = normalizeProcessNameKey(processToken);
  return (
    buildWorkLogImportPlanProcessOptions(plan).find((process) =>
      buildWorkLogImportProcessCodeCandidates(process).includes(normalizedProcessCode) ||
      normalizeProcessNameKey(process?.processName) === normalizedProcessName
    ) ?? null
  );
};

const resolveWorkLogImportAssignmentCandidate = ({
  row,
  lineId,
  factoryLineIds,
  plans,
  assignmentCardsByOrderKey,
  assignmentCardsByOrderStyleKey,
}: {
  row: any;
  lineId: number;
  factoryLineIds: number[];
  plans: any[];
  assignmentCardsByOrderKey?: Map<string, any[]>;
  assignmentCardsByOrderStyleKey?: Map<string, any[]>;
}) => {
  const orderKey = normalizeComparableText(row?.orderNo);
  const styleKey = normalizeComparableText(row?.styleId);
  if (!orderKey || !styleKey || !normalizeProcessCodeKey(row?.processCode)) {
    return {
      plan: null,
      process: null,
      error: "order, style, and process are required to match an assignment",
    };
  }

  const factoryLineIdSet = new Set(
    ensureArray(factoryLineIds)
      .map((value) => toPositiveIntOrNull(value))
      .filter((value): value is number => value !== null)
  );
  const orderCandidates = ensureArray(plans).filter(
    (plan) =>
      factoryLineIdSet.has(toPositiveIntOrNull(plan?.lineId) ?? -1) &&
      // orderNo column dropped in Phase E - workOrder.orderNumber is the only
      // source now.
      normalizeComparableText(plan?.workOrder?.orderNumber) === orderKey
  );
  if (orderCandidates.length === 0) {
    if (ensureArray(assignmentCardsByOrderKey?.get(orderKey)).length > 0) {
      return {
        plan: null,
        process: null,
        error: `order ${row.orderNo} has assignment cards but is not assigned to a line in the worker factory`,
      };
    }
    return {
      plan: null,
      process: null,
      error: `order ${row.orderNo} has no assignment card in the worker factory`,
    };
  }

  const styleCandidates = orderCandidates.filter((plan) =>
    resolveAssignmentPlanStyleQueryValues(plan).some((value) => {
      return normalizeComparableText(value) === styleKey;
    })
  );
  if (styleCandidates.length === 0) {
    if (
      ensureArray(
        assignmentCardsByOrderStyleKey?.get(
          buildWorkLogImportOrderStyleKey(orderKey, styleKey)
        )
      ).length > 0
    ) {
      return {
        plan: null,
        process: null,
        error: `style ${row.styleId} for order ${row.orderNo} has an assignment card but is not assigned to a line in the worker factory`,
      };
    }
    return {
      plan: null,
      process: null,
      error: `style ${row.styleId} is not assigned for order ${row.orderNo} in the worker factory`,
    };
  }

  const findProcessMatches = (candidatePlans: any[]) =>
    candidatePlans
      .map((plan) => ({
        plan,
        process: resolveWorkLogImportMatchedProcess({
          plan,
          processCode: row.processCode,
        }),
      }))
      .filter((item) => item.process !== null);
  const sameLineStyleCandidates = styleCandidates.filter(
    (plan) => toPositiveIntOrNull(plan?.lineId) === lineId
  );
  const sameLineProcessMatches = findProcessMatches(sameLineStyleCandidates);
  if (sameLineProcessMatches.length > 1) {
    return {
      plan: null,
      process: null,
      error: `multiple assignment plans matched order ${row.orderNo} / style ${row.styleId} / process ${row.processCode}`,
    };
  }
  if (sameLineProcessMatches.length === 1) {
    return {
      plan: sameLineProcessMatches[0]?.plan ?? null,
      process: sameLineProcessMatches[0]?.process ?? null,
      error: null as string | null,
      matchedOnOtherLine: false,
    };
  }

  const otherLineStyleCandidates = styleCandidates.filter(
    (plan) => toPositiveIntOrNull(plan?.lineId) !== lineId
  );
  const otherLineProcessMatches = findProcessMatches(otherLineStyleCandidates);
  if (otherLineProcessMatches.length === 0) {
    return {
      plan: null,
      process: null,
      error: `process ${row.processCode} is not assigned for order ${row.orderNo} / style ${row.styleId} in the worker factory`,
    };
  }
  if (otherLineProcessMatches.length > 1) {
    return {
      plan: null,
      process: null,
      error: `multiple assignment plans matched order ${row.orderNo} / style ${row.styleId} / process ${row.processCode}`,
    };
  }

  const matched = otherLineProcessMatches[0] ?? null;
  return {
    plan: matched?.plan ?? null,
    process: matched?.process ?? null,
    error: null as string | null,
    matchedOnOtherLine: true,
  };
};

const collectMissingWorkRecordAssignmentPlanLinkIndices = (records: any): number[] =>
  ensureArray(records).reduce((indices, record, index) => {
    if (!record || typeof record !== "object") return indices;
    if (toPositiveIntOrNull(record?.assignmentPlanId) !== null) return indices;
    indices.push(index);
    return indices;
  }, [] as number[]);
const collectMissingWorkRecordCanonicalRefIssues = (records: any) =>
  ensureArray(records).reduce(
    (
      issues: Array<{
        index: number;
        field: "styleId" | "styleProcessId";
      }>,
      record,
      index
    ) => {
      if (!record || typeof record !== "object") return issues;
      if (toPositiveIntOrNull(record?.styleId) === null) {
        issues.push({ index, field: "styleId" });
      }
      if (toPositiveIntOrNull(record?.styleProcessId) === null) {
        issues.push({ index, field: "styleProcessId" });
      }
      return issues;
    },
    []
  );
const stripCoverageFieldsFromWorkLogData = <T extends Record<string, any>>(
  workLogData: T
): Omit<T, "coverageStartDate" | "coverageEndDate" | "entryMode"> => {
  const {
    coverageStartDate: _coverageStartDate,
    coverageEndDate: _coverageEndDate,
    entryMode: _entryMode,
    ...rest
  } = workLogData || {};
  return rest as Omit<T, "coverageStartDate" | "coverageEndDate" | "entryMode">;
};
const buildWorkLogWriteDataWithOptionalCoverage = <T extends Record<string, any>>(
  workLogData: T,
  options: { includeCoverage: boolean }
) =>
  options.includeCoverage
    ? workLogData
    : stripCoverageFieldsFromWorkLogData(workLogData);
const buildWorkLogResponseRecordList = async ({
  orgId,
  workLog,
  recordDisplayContext = null,
}: {
  orgId: number | null;
  workLog: any;
  recordDisplayContext?: {
    workerNameById?: Map<number, string>;
    assignmentPlanMetaById?: Map<number, any>;
  } | null;
}) => {
  const sourceRecords = resolveWorkLogRecordResponses(workLog);
  if (sourceRecords.length === 0) return [];
  const displayContext =
    recordDisplayContext ??
    (await loadWorkRecordResponseDisplayContext({
      orgId,
      records: sourceRecords,
    }));
  return sourceRecords.map((record: any) =>
    toWorkRecordResponse(hydrateWorkRecordResponseDisplayFields(record, displayContext))
  );
};
const buildWorkLogResponseList = async ({
  orgId,
  workLogs,
}: {
  orgId: number;
  workLogs: any[];
}) => {
  const normalizedWorkLogs = ensureArray(workLogs).filter(
    (workLog) => workLog && typeof workLog === "object"
  );
  if (normalizedWorkLogs.length === 0) return [];
  const recordDisplayContext = await loadWorkRecordResponseDisplayContext({
    orgId,
    records: normalizedWorkLogs.flatMap((workLog) => resolveWorkLogRecordResponses(workLog)),
  });
  return Promise.all(
    normalizedWorkLogs.map((workLog) =>
      toWorkLogResponse(workLog, { orgId, recordDisplayContext })
    )
  );
};
const toWorkLogResponse = async (
  workLog: any,
  options: {
    orgId?: number | null;
    recordDisplayContext?: {
      workerNameById?: Map<number, string>;
      assignmentPlanMetaById?: Map<number, any>;
    } | null;
  } = {}
) => {
  const lineMeta = resolveWorkLogLineMeta(workLog?.records);
  const coverageEndDate = resolveWorkLogCoverageEndDate(workLog, workLog?.displayDate);
  const coverageStartDate = resolveWorkLogCoverageStartDate(workLog, coverageEndDate);
  const entryMode = resolveWorkLogEntryMode({
    coverageStartDate,
    coverageEndDate,
    requestedEntryMode: workLog?.entryMode,
  });
  return {
    id: workLog.id,
    workDate: coverageEndDate || workLog.displayDate,
    coverageStartDate,
    coverageEndDate,
    entryMode,
    factoryId: workLog.factoryId ?? null,
    factoryName: resolveOptionalString(workLog.factory?.name, "") ?? "",
    lineId: lineMeta.lineId,
    lineName: lineMeta.lineName ?? "",
    factoryWagePerSecond: workLog.factoryWagePerSecond ?? null,
    ctBasis: workLog.ctBasis ?? "CT",
    workerCount: workLog.workerCount ?? 0,
    itemCount: workLog.itemCount ?? 0,
    totalCtSeconds: workLog.totalCtSeconds ?? 0,
    note: workLog.note ?? "",
    records: await buildWorkLogResponseRecordList({
      orgId: toPositiveIntOrNull(options.orgId),
      workLog,
      recordDisplayContext: options.recordDisplayContext ?? null,
    }),
    createdAt: workLog.createdAt,
    updatedAt: workLog.updatedAt,
    updatedBy: resolveOptionalString(workLog.updatedBy, null),
  };
};
const toWorkLogContextWorkerResponse = (row: any) => ({
  id: row?.employee?.id ?? row?.employeeId ?? null,
  orgMembershipId: row?.employee?.id ?? row?.employeeId ?? null,
  name: resolveOptionalString(row?.employee?.name, "") ?? "",
  email: resolveOptionalString(row?.employee?.email, "") ?? "",
  factoryId: row?.employee?.factoryId ?? null,
  currentLineId: row?.lineId ?? null,
});
const toWorkLogContextAssignmentResponse = (plan: any) => {
  const normalizedSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const closedAt = resolveAssignmentPlanClosedAt(plan);
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: resolveAssignmentQuantity(plan),
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);
  const completedAt = closedAt;
  const isCompleted = plan?.isCompleted === true;
  // Phase E (AssignmentCard/AssignmentPlan FK+join redesign): orderNo/
  // customer/label columns are gone - these joins are the only source now.
  const joinedOrderNo = resolveOptionalString(plan?.workOrder?.orderNumber, null);
  const joinedCustomer = resolveOptionalString(plan?.buyerOrg?.name, null);
  const joinedCustomerNameKo = resolveOptionalString(plan?.buyerOrg?.nameKo, null);
  const joinedCustomerNameVi = resolveOptionalString(plan?.buyerOrg?.nameVi, null);
  const joinedLabel = resolveOptionalString(plan?.style?.name, null);
  return {
    dbId: plan?.id ?? null,
    id: resolveOptionalString(plan?.externalId, "") ?? "",
    lineId: String(plan?.lineId ?? ""),
    lineName: resolveOptionalString(plan?.lineName, "") ?? "",
    styleId: joinedLabel ?? joinedOrderNo ?? "",
    styleCode: joinedLabel ?? joinedOrderNo ?? "",
    orderNo: joinedOrderNo ?? "",
    label: joinedLabel ?? "",
    customer: joinedCustomer ?? "",
    customerNameKo: joinedCustomerNameKo ?? "",
    customerNameVi: joinedCustomerNameVi ?? "",
    // colorId/colorName/color dropped in Phase D - see the comment in
    // toAssignmentPlanResponse for why these are static now.
    colorId: null,
    colorName: "",
    color: "",
    assignmentQuantity: resolveAssignmentQuantity(plan),
    assignmentCtTotalSeconds: resolveAssignmentCtTotalSeconds(plan),
    assignmentStTotalSeconds: resolvePersistedAssignmentPlanStTotalSeconds(plan),
    assignmentCtSnapshot: normalizedSnapshot,
    ctUpdatedBy: normalizedSnapshot?.updatedBy ?? "",
    ctUpdatedAt: normalizedSnapshot?.updatedAt ?? null,
    startIndex: plan?.startIndex ?? 0,
    endIndex: plan?.endIndex ?? 0,
    isCompleted,
    finalQuantity,
    closedQty,
    completedAt,
    closedAt,
    closeMode,
    closeBasis,
    closedBy: resolveOptionalString(plan?.closedBy, null),
  };
};
const buildWorkLogContextResponse = async ({
  orgId,
  factoryId = null,
  lineId = null,
  lineName = null,
  workDate = null,
  coverageStartDate = null,
  debug = false,
}: {
  orgId: number;
  factoryId?: number | null;
  lineId?: number | null;
  lineName?: string | null;
  workDate?: string | null;
  coverageStartDate?: string | null;
  debug?: boolean;
}) => {
  const normalizedLineId = toPositiveIntOrNull(lineId);
  const normalizedFactoryId = toPositiveIntOrNull(factoryId);
  const normalizedWorkDate = normalizeDateKey(workDate);
  const normalizedCoverageStartDate = normalizeDateKey(coverageStartDate);
  console.log(
    `[buildWorkLogContextResponse] called orgId=${orgId} factoryId=${normalizedFactoryId ?? "null"} lineId=${normalizedLineId ?? "null"} workDate=${normalizedWorkDate || "-"} coverageStartDate=${normalizedCoverageStartDate || "-"}`
  );
  const buildBaseResponse = ({
    line: currentLine = null,
    workers = [],
    assignments = [],
    previousCoverageEndDate = null,
    suggestedCoverageStartDate = null,
    isFirstLineWorkLog = false,
  }: {
    line?: { id: number; name: string } | null;
    workers?: any[];
    assignments?: any[];
    previousCoverageEndDate?: string | null;
    suggestedCoverageStartDate?: string | null;
    isFirstLineWorkLog?: boolean;
  }) => ({
    line: currentLine,
    workers,
    assignments,
    previousCoverageEndDate,
    suggestedCoverageStartDate,
    isFirstLineWorkLog,
  });
  if (!normalizedLineId || !normalizedWorkDate) {
    const response = buildBaseResponse({
      line: normalizedLineId
        ? {
            id: normalizedLineId,
            name: resolveOptionalString(lineName, "") ?? "",
          }
        : null,
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "missing_line_or_work_date",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: normalizedLineId,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  const line = await prisma.line.findFirst({
    where: {
      id: normalizedLineId,
      orgId,
      ...(normalizedFactoryId ? { factoryId: normalizedFactoryId } : {}),
    },
    select: { id: true, name: true, factoryId: true },
  });
  if (!line) {
    const response = buildBaseResponse({
      line: normalizedLineId
        ? {
            id: normalizedLineId,
            name: resolveOptionalString(lineName, "") ?? "",
          }
        : null,
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "line_not_found_or_factory_mismatch",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: normalizedLineId,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  // Keep employee.factoryId aligned with active line assignments so
  // line-based work-log worker queries stay consistent.
  try {
    const activeLineAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
      },
      select: {
        employeeId: true,
        employee: {
          select: {
            factoryId: true,
          },
        },
      },
    });
    const workerIdsToSync = activeLineAssignments
      .filter((assignment) => {
        const workerId = toPositiveIntOrNull(assignment?.employeeId);
        if (workerId === null) return false;
        const workerFactoryId = toPositiveIntOrNull(assignment?.employee?.factoryId);
        return workerFactoryId !== line.factoryId;
      })
      .map((assignment) => toPositiveIntOrNull(assignment?.employeeId))
      .filter((workerId): workerId is number => workerId !== null);

    if (workerIdsToSync.length > 0) {
      await prisma.employee.updateMany({
        where: {
          orgId,
          id: { in: workerIdsToSync },
        },
        data: {
          factoryId: line.factoryId,
        },
      });
      console.warn(
        `[work-log-context] orgId=${orgId} lineId=${line.id} synced employee.factoryId for ${workerIdsToSync.length} active line workers`
      );
    }
  } catch (error) {
    console.warn(
      `[work-log-context] orgId=${orgId} lineId=${line.id} failed to sync line worker factory links: ${
        resolveOptionalString((error as any)?.message, String(error || ""))
      }`
    );
  }

  const dateRange = buildWorkDateRange(normalizedWorkDate);
  if (!dateRange) {
    const response = buildBaseResponse({
      line: { id: line.id, name: line.name ?? "" },
    });
    if (debug) {
      return {
        ...response,
        _debug: {
          reason: "invalid_date_range",
          orgId,
          factoryId: normalizedFactoryId,
          lineId: line.id,
          workDate: normalizedWorkDate,
        },
      };
    }
    return response;
  }

  const factoryLines = await prisma.line.findMany({
    where: {
      orgId,
      factoryId: line.factoryId,
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const factoryLineIds = factoryLines
    .map((item) => toPositiveIntOrNull(item?.id))
    .filter((item): item is number => item !== null);
  const lineNameById = new Map(
    factoryLines.map((item) => [
      Number(item.id),
      resolveOptionalString(item.name, "") ?? "",
    ])
  );
  const lineAssignmentSelect = {
    employeeId: true,
    lineId: true,
    startAt: true,
    endAt: true,
    employee: {
      select: {
        id: true,
        email: true,
        orgRole: true,
        status: true,
        name: true,
        factoryId: true,
        lineId: true,
        line: {
          select: {
            id: true,
            factoryId: true,
            name: true,
          },
        },
        joinedAt: true,
        leftAt: true,
        role: {
          select: {
            code: true,
          },
        },
      },
    },
  } as const;
  const previousCoverage = await findPreviousWorkLogCoverageForLine({
    orgId,
    factoryId: line.factoryId,
    lineId: line.id,
    beforeWorkDate: normalizedWorkDate,
  });
  const previousCoverageEndDate =
    resolveWorkLogCoverageEndDate(previousCoverage, previousCoverage?.displayDate) || null;
  const suggestedCoverageStartDate = previousCoverageEndDate
    ? shiftDateKeyByDays(previousCoverageEndDate, 1)
    : null;
  const employmentFilterDateKey =
    normalizeDateKey(normalizedCoverageStartDate) ||
    normalizeDateKey(suggestedCoverageStartDate) ||
    normalizedWorkDate;

  const lineAssignmentsOnWorkDatePromise = prisma.lineAssignment.findMany({
    where: {
      lineId: line.id,
      startAt: { lte: dateRange.endAt },
      OR: [{ endAt: null }, { endAt: { gte: dateRange.startAt } }],
      employee: {
        is: {
          orgId,
        },
      },
    },
    select: lineAssignmentSelect,
    orderBy: [{ employeeId: "asc" }],
  });
  const loadAssignmentPlansForWorkLogContext = async () => {
    if (factoryLineIds.length === 0) return [] as any[];
    const where = { orgId, lineId: { in: factoryLineIds }, isCompleted: false };
    const orderBy: any[] = [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }];
    try {
      return await prisma.assignmentPlan.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          lineId: true,
          assignmentQuantity: true,
          assignmentStTotalSeconds: true,
          assignmentCtTotalSeconds: true,
          assignmentCtSnapshot: true,
          startIndex: true,
          endIndex: true,
          isCompleted: true,
          finalQuantity: true,
          completedAt: true,
          // orderNo/customer/label dropped in Phase E - these joins are the
          // only source now (see toAssignmentPlanResponse).
          ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
        },
        orderBy,
      });
    } catch (error) {
      if (!isAssignmentPlanMissingColumnError(error)) throw error;
      return prisma.assignmentPlan.findMany({
        where,
        select: {
          id: true,
          externalId: true,
          lineId: true,
          assignmentQuantity: true,
          assignmentCtSnapshot: true,
          startIndex: true,
          endIndex: true,
          isCompleted: true,
          finalQuantity: true,
          completedAt: true,
          ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
        },
        orderBy,
      });
    }
  };

  let [lineAssignmentsOnWorkDate, assignmentPlans] = await Promise.all([
    lineAssignmentsOnWorkDatePromise,
    loadAssignmentPlansForWorkLogContext(),
  ]);
  assignmentPlans = await attachLiveStyleProcessMirrorsToAssignmentPlans({
    orgId,
    plans: assignmentPlans,
  });

  const filterDebugStages: Array<{
    stage: string;
    total: number;
    passed: number;
    dropped: number;
    droppedByReason: Record<string, number>;
    droppedWorkers: Array<{
      employeeId: number | null;
      name: string;
      reason: string;
      workerFactoryId: number | null;
      joinedDateKey: string;
      leftDateKey: string;
      assignmentStartDateKey: string;
      assignmentEndDateKey: string;
      membershipStatus: string;
      membershipRole: string;
      roleCode: string;
    }>;
  }> = [];
  const filterWorkersByEmploymentWindow = (rows: any[], stage: string) => {
    const safeRows = ensureArray(rows);
    const passed: any[] = [];
    const droppedWorkers: Array<{
      employeeId: number | null;
      name: string;
      reason: string;
      workerFactoryId: number | null;
      joinedDateKey: string;
      leftDateKey: string;
      assignmentStartDateKey: string;
      assignmentEndDateKey: string;
      membershipStatus: string;
      membershipRole: string;
      roleCode: string;
    }> = [];

    safeRows.forEach((assignment) => {
      const employee = assignment?.employee;
      const employeeId = toPositiveIntOrNull(employee?.id ?? assignment?.employeeId);
      const joinedDateKey = toDateKeyInTimeZone(employee?.joinedAt, BUSINESS_TIME_ZONE);
      const leftDateKey = toDateKeyInTimeZone(employee?.leftAt, BUSINESS_TIME_ZONE);
      const assignmentStartDateKey = toDateKeyInTimeZone(
        assignment?.startAt,
        BUSINESS_TIME_ZONE
      );
      const assignmentEndDateKey = toDateKeyInTimeZone(
        assignment?.endAt,
        BUSINESS_TIME_ZONE
      );
      const membershipStatus = String(employee?.status ?? "").trim();
      const membershipRole = String(employee?.orgRole ?? "").trim();
      const roleCode = String(employee?.role?.code ?? "").trim();
      const baseInfo = {
        employeeId,
        name: resolveOptionalString(employee?.name, "") ?? "",
        workerFactoryId: toPositiveIntOrNull(employee?.factoryId),
        joinedDateKey,
        leftDateKey,
        assignmentStartDateKey,
        assignmentEndDateKey,
        membershipStatus,
        membershipRole,
        roleCode,
      };

      if (!employee) {
        droppedWorkers.push({
          ...baseInfo,
          reason: "missing_employee",
        });
        return;
      }
      const employmentCheck = evaluateWorkerEmploymentOnDateKey({
        joinedAt: employee?.joinedAt,
        leftAt: employee?.leftAt,
        targetDateKey: employmentFilterDateKey,
      });
      if (!employmentCheck.passed) {
        droppedWorkers.push({
          ...baseInfo,
          reason: employmentCheck.reason,
        });
        return;
      }
      passed.push(assignment);
    });

    const droppedByReason = droppedWorkers.reduce<Record<string, number>>(
      (acc, item) => {
        const key = item.reason || "unknown";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {}
    );
    filterDebugStages.push({
      stage,
      total: safeRows.length,
      passed: passed.length,
      dropped: droppedWorkers.length,
      droppedByReason,
      droppedWorkers,
    });
    return passed;
  };

  let workersForDate = filterWorkersByEmploymentWindow(
    lineAssignmentsOnWorkDate,
    "line_assignments_on_work_date"
  );

  if (workersForDate.length === 0) {
    const activeLineAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ employeeId: "asc" }],
    });
    const fallbackWorkers = filterWorkersByEmploymentWindow(
      activeLineAssignments,
      "fallback_active_line_assignments"
    );
    if (fallbackWorkers.length > 0) {
      workersForDate = fallbackWorkers;
      console.log(
        `[work-log-context] orgId=${orgId} lineId=${line.id} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} workers=fallback_active_assignments`
      );
    }
  }

  // Last fallback for data-recovery cases:
  // if active assignment rows are missing but the line has historical members,
  // surface workers from the latest historical assignment on this line.
  if (workersForDate.length === 0) {
    const historicalAssignments = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: { not: null },
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ endAt: "desc" }, { id: "desc" }],
    });

    const latestHistoricalByEmployeeId = new Map<number, any>();
    historicalAssignments.forEach((assignment) => {
      const employeeId = toPositiveIntOrNull(assignment?.employeeId);
      if (employeeId === null) return;
      if (latestHistoricalByEmployeeId.has(employeeId)) return;
      latestHistoricalByEmployeeId.set(employeeId, assignment);
    });

    const historicalEmployeeIds = Array.from(latestHistoricalByEmployeeId.keys());
    if (historicalEmployeeIds.length > 0) {
      const activeAssignmentsOnAnyLine = await prisma.lineAssignment.findMany({
        where: {
          employeeId: { in: historicalEmployeeIds },
          endAt: null,
          employee: {
            is: {
              orgId,
            },
          },
        },
        select: { employeeId: true, lineId: true },
      });
      const activeLineByEmployeeId = new Map<number, number>();
      activeAssignmentsOnAnyLine.forEach((assignment) => {
        const employeeId = toPositiveIntOrNull(assignment?.employeeId);
        const activeLineId = toPositiveIntOrNull(assignment?.lineId);
        if (employeeId === null || activeLineId === null) return;
        if (activeLineByEmployeeId.has(employeeId)) return;
        activeLineByEmployeeId.set(employeeId, activeLineId);
      });

      const historicalCandidates = Array.from(latestHistoricalByEmployeeId.values()).filter(
        (assignment) => {
          const employeeId = toPositiveIntOrNull(assignment?.employeeId);
          if (employeeId === null) return false;
          const activeLineId = activeLineByEmployeeId.get(employeeId);
          if (activeLineId === undefined) return true;
          return activeLineId === line.id;
        }
      );
      const fallbackWorkers = filterWorkersByEmploymentWindow(
        historicalCandidates,
        "fallback_historical_line_assignments"
      );
      if (fallbackWorkers.length > 0) {
        workersForDate = fallbackWorkers;
        console.log(
          `[work-log-context] orgId=${orgId} lineId=${line.id} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} workers=fallback_historical_line_assignments`
        );
      }
    }
  }

  if (workersForDate.length === 0) {
    const activeAssignmentsAllFactories = await prisma.lineAssignment.findMany({
      where: {
        lineId: line.id,
        endAt: null,
        employee: {
          is: {
            orgId,
          },
        },
      },
      select: lineAssignmentSelect,
      orderBy: [{ employeeId: "asc" }],
    });
    const activeAssignmentsOnSelectedFactory = activeAssignmentsAllFactories.filter(
      (assignment) => {
        if (!normalizedFactoryId) return true;
        const workerFactoryId = toPositiveIntOrNull(assignment?.employee?.factoryId);
        return workerFactoryId === normalizedFactoryId;
      }
    );

    console.log(
      `[work-log-context][debug] orgId=${orgId} lineId=${line.id} lineName=${line.name ?? ""} factoryId=${normalizedFactoryId ?? "null"} workDate=${normalizedWorkDate} filterDate=${employmentFilterDateKey} finalWorkers=0`
    );
    console.log(
      `[work-log-context][debug] baseCounts onWorkDate=${lineAssignmentsOnWorkDate.length} activeAnyFactory=${activeAssignmentsAllFactories.length} activeSelectedFactory=${activeAssignmentsOnSelectedFactory.length} assignmentPlans=${assignmentPlans.length}`
    );
    filterDebugStages.forEach((stageSummary) => {
      console.log(
        `[work-log-context][debug] stage=${stageSummary.stage} total=${stageSummary.total} passed=${stageSummary.passed} dropped=${stageSummary.dropped} droppedByReason=${JSON.stringify(
          stageSummary.droppedByReason
        )}`
      );
      stageSummary.droppedWorkers.slice(0, 40).forEach((worker) => {
        console.log(
          `[work-log-context][debug] stage=${stageSummary.stage} drop workerId=${worker.employeeId ?? "null"} name=${worker.name || "-"} reason=${worker.reason} workerFactoryId=${worker.workerFactoryId ?? "null"} joined=${worker.joinedDateKey || "-"} left=${worker.leftDateKey || "-"} assignmentStart=${worker.assignmentStartDateKey || "-"} assignmentEnd=${worker.assignmentEndDateKey || "-"} membershipStatus=${worker.membershipStatus || "-"} membershipRole=${worker.membershipRole || "-"} roleCode=${worker.roleCode || "-"}`
        );
      });
    });
  }

  const response = buildBaseResponse({
    line: { id: line.id, name: line.name ?? "" },
    workers: workersForDate.map(toWorkLogContextWorkerResponse),
    assignments: assignmentPlans
      .map((plan) =>
        toWorkLogContextAssignmentResponse({
          ...plan,
          lineName: lineNameById.get(Number(plan?.lineId)) || "",
        })
      ),
    previousCoverageEndDate,
    suggestedCoverageStartDate,
    isFirstLineWorkLog: !previousCoverageEndDate,
  });
  console.log(
    `[buildWorkLogContextResponse] result orgId=${orgId} lineId=${line.id} workers=${response.workers.length} assignments=${response.assignments.length} previousCoverageEndDate=${response.previousCoverageEndDate ?? "-"} suggestedCoverageStartDate=${response.suggestedCoverageStartDate ?? "-"}`
  );
  if (!debug) return response;

  return {
    ...response,
    _debug: {
      orgId,
      factoryId: normalizedFactoryId,
      lineId: line.id,
      lineName: line.name ?? "",
      workDate: normalizedWorkDate,
      filterWorkDate: employmentFilterDateKey,
      baseCounts: {
        lineAssignmentsOnWorkDate: lineAssignmentsOnWorkDate.length,
        assignmentPlansInFactory: assignmentPlans.length,
      },
      lineAssignmentsOnWorkDateWorkers: lineAssignmentsOnWorkDate.map((assignment) => {
        const employee = assignment?.employee;
        const membershipStatus = String(employee?.status ?? "")
          .trim()
          .toUpperCase();
        const joinedDateKey = toDateKeyInTimeZone(employee?.joinedAt, BUSINESS_TIME_ZONE);
        const leftDateKey = toDateKeyInTimeZone(employee?.leftAt, BUSINESS_TIME_ZONE);
        const employmentCheck = evaluateWorkerEmploymentOnDateKey({
          joinedAt: employee?.joinedAt,
          leftAt: employee?.leftAt,
          targetDateKey: employmentFilterDateKey,
        });
        const joinedPass = employmentCheck.reason !== "workDate_before_joinedAt";
        const leftPass = employmentCheck.reason !== "workDate_after_leftAt";
        const membershipPass = true;
        return {
          workerId: toPositiveIntOrNull(employee?.id ?? assignment?.employeeId),
          workerName: resolveOptionalString(employee?.name, "") ?? "",
          membershipStatus,
          membershipRole: String(employee?.orgRole ?? "").trim().toUpperCase(),
          roleCode: String(employee?.role?.code ?? "").trim().toUpperCase(),
          workerFactoryId: toPositiveIntOrNull(employee?.factoryId),
          joinedAtRaw: employee?.joinedAt ?? null,
          leftAtRaw: employee?.leftAt ?? null,
          joinedDateKey,
          leftDateKey,
          joinedPass,
          membershipPass,
          leftPass,
          finalPass: employmentCheck.passed && membershipPass,
          employmentReason: employmentCheck.reason,
        };
      }),
      stageSummaries: filterDebugStages,
      stageReasonTotals: filterDebugStages.map((stage) => ({
        stage: stage.stage,
        droppedByReason: stage.droppedByReason,
      })),
      stageDropExamples: filterDebugStages.map((stage) => ({
        stage: stage.stage,
        examples: stage.droppedWorkers.slice(0, 5),
      })),
      finalWorkerCount: response.workers.length,
      finalWorkerIds: response.workers
        .map((worker) => toPositiveIntOrNull(worker?.id))
        .filter((workerId): workerId is number => workerId !== null),
      fallbackUsed:
        workersForDate.length > 0 && lineAssignmentsOnWorkDate.length === 0
          ? "fallback"
          : "on_work_date_assignments",
    },
  };
};
const resolveWorkLogUpdatedBy = async (orgId: number, req: Request): Promise<string | null> => {
  const requesterEmail = resolveOptionalString(getRequesterEmail(req), null);
  if (!requesterEmail) return null;

  const employee = await prisma.employee.findFirst({
    where: {
      orgId,
      email: requesterEmail,
    },
  });

  const employeeName = resolveOptionalString(employee?.name, null);
  if (employeeName) return employeeName;
  return requesterEmail;
};
const toOptionalNonNegativeInt = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};
const toOptionalFloat = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};
const toOptionalDateValue = (value: any, fallback: any = null) => {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
};
const toIsoDateStringOrNull = (value: any): string | null => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
const resolveAssignmentExternalId = (item: any): string | null =>
  resolveOptionalString(item?.id ?? item?.externalId, null);

const normalizeAssignmentCtSnapshotSchedule = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    startIndex: toOptionalNonNegativeInt(value?.startIndex, null),
    endIndex: toOptionalNonNegativeInt(value?.endIndex, null),
    startDayOffsetPercent: toOptionalFloat(value?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(value?.startDayPercent, null),
    endDayPercent: toOptionalFloat(value?.endDayPercent, null),
    startDateKey: resolveOptionalString(value?.startDateKey, null),
    endDateKey: resolveOptionalString(value?.endDateKey, null),
  };
};

const normalizeAssignmentCtSnapshotProcess = (value: any, index = 0) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const processKey =
    resolveOptionalString(
      value?.processKey ?? value?.code ?? value?.id,
      null
    );
  const styleProcessId =
    toPositiveIntOrNull(value?.styleProcessId ?? value?.processId);
  const timesPerPiece = Math.max(
    1,
    toOptionalNonNegativeInt(value?.timesPerPiece ?? value?.quantity, 1) ?? 1
  );
  const rawPieceCtSeconds = toOptionalFloat(value?.pieceCtSeconds ?? value?.ctPerPieceSeconds, null);
  const snapshotCtSeconds =
    toOptionalProcessSeconds(value?.snapshotCtSeconds ?? value?.ctSeconds) ??
    rawPieceCtSeconds;
  if (snapshotCtSeconds == null || snapshotCtSeconds <= 0) return null;
  const pieceCtSeconds = toOptionalFloat(rawPieceCtSeconds ?? snapshotCtSeconds, snapshotCtSeconds);
  const processCode = resolveOptionalString(
    value?.processCode ?? value?.code,
    null
  );
  return {
    styleProcessId,
    ...(processKey ? { processKey } : {}),
    processCode,
    name:
      resolveOptionalString(
        value?.name ?? value?.processName ?? value?.label,
        null
      ) ?? `공정 ${index + 1}`,
    nameKo: resolveOptionalString(
      value?.nameKo ?? value?.processNameKo ?? value?.labelKo,
      null
    ),
    nameEn: resolveOptionalString(
      value?.nameEn ?? value?.processNameEn ?? value?.labelEn,
      null
    ),
    nameVi: resolveOptionalString(
      value?.nameVi ?? value?.processNameVi ?? value?.labelVi,
      null
    ),
    timesPerPiece,
    basis: resolveOptionalString(value?.basis, null),
    snapshotCtSeconds,
    pieceCtSeconds,
  };
};

const normalizeAssignmentCtSnapshot = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const processes = ensureArray(value?.processes)
    .map((item, index) => normalizeAssignmentCtSnapshotProcess(item, index))
    .filter((item): item is any => Boolean(item));
  const quantity = toOptionalNonNegativeInt(value?.quantity, null);
  const pieceCtTotalSeconds =
    toOptionalFloat(value?.pieceCtTotalSeconds ?? value?.totalCtPerPieceSeconds, null) ??
    (processes.length > 0
      ? processes.reduce(
          (sum, item) => sum + (Number(item?.pieceCtSeconds) || 0),
          0
        )
      : null);
  const assignmentCtTotalSeconds =
    toOptionalNonNegativeInt(value?.assignmentCtTotalSeconds ?? value?.totalCtSeconds, null) ??
    (quantity != null && pieceCtTotalSeconds != null
      ? Math.max(0, Math.round(pieceCtTotalSeconds * quantity))
      : null);

  return {
    updatedAt: toIsoDateStringOrNull(value?.updatedAt),
    updatedBy: resolveOptionalString(value?.updatedBy, null),
    quantity,
    schedule: normalizeAssignmentCtSnapshotSchedule(value?.schedule),
    pieceCtTotalSeconds,
    assignmentCtTotalSeconds,
    processes,
  };
};
const resolveAssignmentCtSnapshotInput = (item: any) =>
  item?.assignmentCtSnapshot ?? item?.ctSnapshot ?? null;
const resolveNormalizedAssignmentCtSnapshot = (item: any) =>
  normalizeAssignmentCtSnapshot(resolveAssignmentCtSnapshotInput(item));
const toComparableAssignmentCtSnapshot = (snapshot: any) => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const {
    updatedAt: _updatedAt,
    updatedBy: _updatedBy,
    unresolvedProcessKeys: _unresolvedProcessKeys,
    coverageIncomplete: _coverageIncomplete,
    ...rest
  } = snapshot;
  return rest;
};
const resolveAssignmentCtSnapshotProcessSeconds = (process: any): number | null =>
  toOptionalProcessSeconds(
    process?.pieceCtSeconds ??
      process?.snapshotCtSeconds ??
      process?.ctPerPieceSeconds ??
      process?.ctSeconds
  );

const resolveAssignmentCtTotalSeconds = (item: any) => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(item);
  if (snapshot?.assignmentCtTotalSeconds != null) {
    return Math.max(0, Math.round(Number(snapshot.assignmentCtTotalSeconds) || 0));
  }
  const ctTotalSeconds = toOptionalNonNegativeInt(
    item?.assignmentCtTotalSeconds ?? item?.ctTotalSeconds,
    null
  );
  if (ctTotalSeconds != null) return ctTotalSeconds;
  return null;
};
const resolveAssignmentQuantity = (item: any): number | null =>
  toOptionalNonNegativeInt(item?.assignmentQuantity ?? item?.quantity, null);
const resolveStateAssignmentStTotalSeconds = (item: any): number | null => {
  const canonical = toOptionalNonNegativeInt(item?.stTotalSeconds, null);
  if (canonical != null && canonical > 0) return canonical;
  const compatibility = toOptionalNonNegativeInt(
    item?.assignmentStTotalSeconds,
    null
  );
  if (compatibility != null && compatibility > 0) return compatibility;
  return canonical ?? compatibility ?? null;
};
const resolvePersistedAssignmentPlanStTotalSeconds = (
  item: any
): number | null => {
  const persisted = toOptionalNonNegativeInt(
    item?.assignmentStTotalSeconds,
    null
  );
  if (persisted != null && persisted > 0) return persisted;
  const compatibility = toOptionalNonNegativeInt(item?.stTotalSeconds, null);
  if (compatibility != null && compatibility > 0) return compatibility;
  return persisted ?? compatibility ?? null;
};
const resolveComparableAssignmentStTotalSeconds = (item: any): number | null => {
  const stateStTotalSeconds = resolveStateAssignmentStTotalSeconds(item);
  if (stateStTotalSeconds != null && stateStTotalSeconds > 0) {
    return stateStTotalSeconds;
  }
  const persistedStTotalSeconds = resolvePersistedAssignmentPlanStTotalSeconds(item);
  if (persistedStTotalSeconds != null && persistedStTotalSeconds > 0) {
    return persistedStTotalSeconds;
  }
  return stateStTotalSeconds ?? persistedStTotalSeconds ?? null;
};

const normalizeStateAssignmentItem = (item: any): any => {
  if (!item || typeof item !== "object") return item;
  const externalId = resolveAssignmentExternalId(item);
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds(item);
  const stTotalSeconds = resolveStateAssignmentStTotalSeconds(item);
  const version = toNonNegativeInt(item?.version, 0);
  const versionUpdatedAt = toIsoDateStringOrNull(item?.versionUpdatedAt);
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
  const {
    ctSnapshot: _ctSnapshot,
    assignmentCtSnapshot: _assignmentCtSnapshot,
    assignmentStTotalSeconds: _assignmentStTotalSeconds,
    proposalSeconds: _proposalSeconds,
    ctStatus: _ctStatus,
    ctSource: _ctSource,
    ctAgreedBy: _ctAgreedBy,
    ctAgreedAt: _ctAgreedAt,
    ctNote: _ctNote,
    ctSentAt: _ctSentAt,
    ctEscalatedAt: _ctEscalatedAt,
    ctEscalationReason: _ctEscalationReason,
    ctEscalationTargetRole: _ctEscalationTargetRole,
    ctEscalationStatus: _ctEscalationStatus,
    ctAgreedSnapshot: _ctAgreedSnapshot,
    ctOverride: _ctOverride,
    plannedQuantity: _plannedQuantity,
    plannedStTotalSeconds: _plannedStTotalSeconds,
    remainingStTotalSeconds: _remainingStTotalSeconds,
    completedStTotalSeconds: _completedStTotalSeconds,
    progressPercent: _progressPercent,
    schedulerProgressPercent: _schedulerProgressPercent,
    operationalProgressPercent: _operationalProgressPercent,
    operationalProgressRatio: _operationalProgressRatio,
    producedRatio: _producedRatio,
    progressForRemainingRatio: _progressForRemainingRatio,
    progressImbalanceGapRatio: _progressImbalanceGapRatio,
    hasProgressImbalanceWarning: _hasProgressImbalanceWarning,
    producedQuantity: _producedQuantity,
    candidateEndDate: _candidateEndDate,
    renderStartDate: _renderStartDate,
    renderEndDate: _renderEndDate,
    actualProducedCompletedAt: _actualProducedCompletedAt,
    forecastCompletedAt: _forecastCompletedAt,
    forecastBasis: _forecastBasis,
    firstWorkDate: _firstWorkDate,
    lastWorkDate: _lastWorkDate,
    elapsedDays: _elapsedDays,
    confidence: _confidence,
    scheduleStatus: _scheduleStatus,
    isStUnknown: _isStUnknown,
    isProgressUnknown: _isProgressUnknown,
    useRenderDateRange: _useRenderDateRange,
    renderStartIndex: _renderStartIndex,
    renderEndIndex: _renderEndIndex,
    workProgressPercent: _workProgressPercent,
    qcDisplayQuantity: _qcDisplayQuantity,
    qcProgressPercent: _qcProgressPercent,
    completionDateIsEstimated: _completionDateIsEstimated,
    queuePosition: _queuePosition,
    queueStatus: _queueStatus,
    estimatedRemainingWorkDays: _estimatedRemainingWorkDays,
    forecastStartDateKey: _forecastStartDateKey,
    forecastEndDateKey: _forecastEndDateKey,
    statusType: _statusType,
    hasOrphanWorkRecords: _hasOrphanWorkRecords,
    ...rest
  } = item;

  return {
    ...rest,
    ...(externalId ? { id: externalId } : {}),
    ctTotalSeconds,
    assignmentCtSnapshot,
    stTotalSeconds,
    version,
    versionUpdatedAt,
  };
};
const normalizeStateAssignments = (items: any): any[] =>
  ensureArray(items).map((item) => normalizeStateAssignmentItem(item));
const buildAssignmentVersionMap = (items: any[]): Map<string, number> =>
  ensureArray(items).reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, toNonNegativeInt(item?.version, 0));
    return map;
  }, new Map<string, number>());
const toStableJsonText = (value: any): string => {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJsonText(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${toStableJsonText((value as any)[key])}`)
    .join(",")}}`;
};
const isDeepEqualByStableJson = (left: any, right: any) =>
  toStableJsonText(left) === toStableJsonText(right);
const toComparableAssignmentStateItem = (item: any) => {
  const normalized = normalizeStateAssignmentItem(item);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }
  const {
    version: _version,
    versionUpdatedAt: _versionUpdatedAt,
    // assignmentPlan merge 과정에서 변하는 메타 필드는 버전 충돌/변경감지에서 제외한다.
    dbId: _dbId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    isCompleted: _isCompleted,
    finalQuantity: _finalQuantity,
    completedAt: _completedAt,
    // Read-only display copies now come only from FK joins. Ignore them here
    // so malformed client strings never look like write-relevant changes.
    orderNo: _orderNo,
    customer: _customer,
    customerNameKo: _customerNameKo,
    customerNameVi: _customerNameVi,
    label: _label,
    previewUrl: _previewUrl,
    colorId: _colorId,
    colorName: _colorName,
    imageUrl: _imageUrl,
    thumbnailUrl: _thumbnailUrl,
    color: _color,
    stripeColor: _stripeColor,
    ...rest
  } = normalized;
  return rest;
};
const isSameAssignmentStateContent = (left: any, right: any) =>
  isDeepEqualByStableJson(
    toComparableAssignmentStateItem(left),
    toComparableAssignmentStateItem(right)
  );
const buildAssignmentByExternalId = (items: any[]) =>
  ensureArray(items).reduce((map, item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, item);
    return map;
  }, new Map<string, any>());
const normalizeAssignmentDisplayKey = (value: any) =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const normalizeAssignmentCardColorKey = (value: any): string =>
  normalizeAssignmentDisplayKey(value);
const normalizeAssignmentCardGender = (value: any): string => {
  const key = normalizeAssignmentDisplayKey(value);
  if (key === "M" || key === "MEN" || key === "MALE" || key === "남성") return "M";
  if (key === "W" || key === "WOMEN" || key === "FEMALE" || key === "여성") return "W";
  if (key === "U" || key === "UNISEX" || key === "공용") return "U";
  return "U";
};
const resolveAssignmentCardLegacyColorKey = (row: any): string => {
  const fromCode = normalizeAssignmentCardColorKey(
    row?.colorCode ?? row?.color ?? row?.colorName
  );
  if (fromCode) return fromCode;
  const fromId = normalizeAssignmentCardColorKey(row?.colorId);
  if (!fromId || fromId === "M" || fromId === "W" || fromId === "U") return "UNSPEC";
  return fromId;
};
const resolveAssignmentCardVariantBucketsFromLegacyRows = (
  rows: any[] = [],
  itemGender = "U"
) => {
  const bucket = new Map<string, { colorId: string; gender: string; quantity: number }>();
  ensureArray(rows).forEach((row) => {
    const quantity = Number(row?.quantity) || 0;
    if (quantity <= 0) return;
    const colorId = resolveAssignmentCardLegacyColorKey(row);
    const rawGender = normalizeAssignmentDisplayKey(row?.gender ?? "");
    const gender =
      rawGender === "M" || rawGender === "W" || rawGender === "U"
        ? rawGender
        : itemGender;
    const bucketKey = `${colorId}::${gender}`;
    const existing = bucket.get(bucketKey);
    if (!existing) {
      bucket.set(bucketKey, { colorId, gender, quantity });
      return;
    }
    existing.quantity += quantity;
  });
  return Array.from(bucket.values());
};
const resolveAssignmentCardVariantBuckets = (item: any) => {
  const itemGender = normalizeAssignmentCardGender(item?.gender);
  const fromLegacyRows = resolveAssignmentCardVariantBucketsFromLegacyRows(
    ensureArray(item?.quantities),
    itemGender
  );
  if (fromLegacyRows.length > 0) return fromLegacyRows;

  const fallbackQuantity = sumOrderItemQuantity(item);
  if (fallbackQuantity <= 0) return [];

  const fallbackColor = normalizeAssignmentCardColorKey(
    item?.colorCode ?? item?.colorId ?? item?.color ?? "UNSPEC"
  );
  return [
    {
      colorId: fallbackColor || "UNSPEC",
      gender: normalizeAssignmentCardGender(item?.gender),
      quantity: fallbackQuantity,
    },
  ];
};
const resolveAssignmentCardAtTotalSecondsForOrderQuantity = (
  process: any,
  orderQuantity = 1
) => {
  const normalized = normalizeStyleProcess(process);
  return resolveStyleProcessAtTotalSecondsForOrderQuantity(normalized, orderQuantity);
};
const resolveAssignmentCardAtPerPieceSeconds = (process: any, orderQuantity = 1) => {
  const normalized = normalizeStyleProcess(process);
  const totalAt = resolveAssignmentCardAtTotalSecondsForOrderQuantity(
    normalized,
    orderQuantity
  );
  if (totalAt == null || !Number.isFinite(totalAt) || totalAt <= 0) return null;
  return resolveStyleProcessAtPerPieceSecondsForOrderQuantity(normalized, orderQuantity);
};
const resolveAssignmentCardStSeedSeconds = ({
  process,
  orderQuantity = 1,
}: {
  process: any;
  orderQuantity?: number;
}) => {
  const normalized = normalizeStyleProcess(process);
  const manualSt = resolveStyleProcessExactStPerPieceSeconds(
    normalized,
    orderQuantity
  );
  if (manualSt != null) return manualSt;
  return null;
};
const calculateAssignmentCardTotalForOrderQuantity = (
  processes: any,
  key: "pt" | "at",
  orderQuantity = 1
) => {
  const total = normalizeStyleProcesses(processes).reduce((acc, process) => {
    const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
    if (key === "at") {
      const atTotal = resolveAssignmentCardAtTotalSecondsForOrderQuantity(
        process,
        resolvedOrderQuantity
      );
      return atTotal == null ? acc : acc + atTotal;
    }
    const time = toOptionalSeconds((process as any)?.pt);
    if (time == null) return acc;
    return acc + time * resolvedOrderQuantity;
  }, 0);
  return Math.round(total);
};
const calculateAssignmentCardStTotalForOrderQuantity = (
  processes: any,
  orderQuantity = 1
) => {
  const normalizedProcesses = normalizeStyleProcesses(processes);
  if (normalizedProcesses.length === 0) return null;
  let hasMissingSt = false;
  const total = normalizedProcesses.reduce((acc, process) => {
    const stPerPiece = resolveAssignmentCardStSeedSeconds({
      process,
      orderQuantity,
    });
    if (stPerPiece == null) {
      hasMissingSt = true;
      return acc;
    }
    return acc + stPerPiece * toPositiveInt(orderQuantity, 1);
  }, 0);
  if (hasMissingSt) return null;
  return Math.round(total);
};
const resolveAssignmentCardStatus = ({
  totalPt,
  cardStTotalSeconds,
}: {
  totalPt: number;
  cardStTotalSeconds: number;
}) => {
  if (Number(cardStTotalSeconds) > 0) return "ST";
  if (Number(totalPt) > 0) return "PT";
  return "NONE";
};
const createAssignmentCardId = (orderId: any, styleId: any) =>
  `${String(orderId ?? "").trim()}::${String(styleId ?? "").trim()}`;
const buildAssignmentCardsFromOrders = ({
  orders,
  styles,
}: {
  orders: any[];
  styles: any[];
}) => {
  const cards: any[] = [];
  // Style.id uniquely identifies one row, so this is a plain FK lookup - no
  // candidate disambiguation needed. This used to be keyed by style.code
  // (a string) while item.styleId is the numeric FK, so resolveOptionalString
  // silently returned "" for every item (it only accepts real strings) and
  // every order item was skipped before a card could ever be built. That is
  // the root cause AssignmentCard stayed empty even before the 2026-07-03
  // incident (see AGENTS.md 39/40).
  const styleById = ensureArray(styles).reduce((map, style) => {
    const styleId = toPositiveIntOrNull(style?.id);
    if (styleId === null) return map;
    map.set(styleId, style);
    return map;
  }, new Map<number, any>());

  ensureArray(orders).forEach((order, orderIndex) => {
    const itemsFromRelation = Array.isArray(order?.workOrderItems) && order.workOrderItems.length > 0
      ? [...order.workOrderItems]
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map(workOrderItemToItemShape)
      : null;
    const items = itemsFromRelation ?? [];
    const groupedByStyleId = new Map<
      number,
      {
        quantity: number;
        itemIndex: number;
        style: any;
        styleId: number | null;
        styleName: string | null;
        styleCode: string | null;
      }
    >();

    items.forEach((item, itemIndex) => {
      const styleId = toPositiveIntOrNull(item?.styleId);
      if (styleId === null) return;
      const quantity = toPositiveIntOrNull(sumOrderItemQuantity(item));
      if (quantity === null) return;

      const style = styleById.get(styleId) ?? null;
      const current = groupedByStyleId.get(styleId);
      if (!current) {
        groupedByStyleId.set(styleId, {
          quantity,
          itemIndex,
          style,
          styleId,
          styleName: resolveOptionalString(item?.styleName, null),
          styleCode: resolveOptionalString(item?.styleCode, null),
        });
        return;
      }
      current.quantity += quantity;
      if (!current.style && style) current.style = style;
      if (current.styleId === null) {
        current.styleId = styleId;
      }
      if (!current.styleName) {
        current.styleName = resolveOptionalString(item?.styleName, null);
      }
      if (!current.styleCode) {
        current.styleCode = resolveOptionalString(item?.styleCode, null);
      }
    });

    groupedByStyleId.forEach((group, styleId) => {
      const processes = normalizeStyleProcesses(group.style?.processes);
      const processCount = processes.length;
      const previewUrl =
        ensureArray(group.style?.imageUrls).length > 0 ? group.style.imageUrls[0] : "";
      const totalPt = calculateAssignmentCardTotalForOrderQuantity(
        processes,
        "pt",
        group.quantity
      );
      const totalAt = calculateAssignmentCardTotalForOrderQuantity(
        processes,
        "at",
        group.quantity
      );
      const totalSt = calculateAssignmentCardStTotalForOrderQuantity(
        processes,
        group.quantity
      );
      const status = resolveAssignmentCardStatus({
        totalPt,
        cardStTotalSeconds: totalSt ?? 0,
      });
      const resolvedOrderId =
        resolveOptionalString(order?.orderId ?? order?.id, null) ??
        `order-${orderIndex}`;
      const cardId = createAssignmentCardId(resolvedOrderId, styleId);

      cards.push({
        id: cardId,
        originOrderId: cardId,
        workOrderId: toPositiveIntOrNull(order?.id),
        orderNo: resolveOptionalString(order?.orderNumber, null) || resolvedOrderId || "-",
        dueDate: resolveOptionalString(order?.dueDate, null) || "",
        // order.customerName/order.customer never existed on this query's
        // select shape (it only fetches the buyerOrg/customerOrg relations) -
        // reading them here always fell through to "-". Same styleId-style
        // mismatch as AGENTS.md 42: the FK+join was already correct, this
        // card-building code just never read the join result.
        // customer stays the default/English name for backward compatibility
        // (older card consumers only read this field). customerNameKo/Vi are
        // sent alongside so the frontend can show the viewer's own UI
        // language instead of always English - see resolveCardCustomerDisplay.
        customer:
          resolveOptionalString(order?.customerOrg?.name ?? order?.buyerOrg?.name, null) ||
          "-",
        customerNameKo: resolveOptionalString(
          order?.customerOrg?.nameKo ?? order?.buyerOrg?.nameKo,
          null
        ),
        customerNameVi: resolveOptionalString(
          order?.customerOrg?.nameVi ?? order?.buyerOrg?.nameVi,
          null
        ),
        // Real FK (Phase B of the AssignmentCard/AssignmentPlan FK+join
        // redesign) - same buyer-org identity the customer display name
        // above already resolves, just as an id instead of a name.
        buyerOrgId: toPositiveIntOrNull(order?.customerOrg?.id ?? order?.buyerOrg?.id),
        styleId: toPositiveIntOrNull(group.style?.id ?? group.styleId),
        styleName:
          resolveOptionalString(group.style?.name, null) ??
          group.styleName ??
          `스타일 ${group.itemIndex + 1}`,
        styleCode:
          resolveOptionalString(group.style?.code, null) ??
          group.styleCode ??
          "",
        // colorId/colorName/gender dropped in Phase D (AssignmentCard/
        // AssignmentPlan FK+join redesign) - color/gender were never
        // tracked at the assignment-card level (cards group only by
        // style+quantity), so these were always hardcoded null anyway.
        cardQuantity: group.quantity,
        processCount,
        status,
        cardPtTotalSeconds: totalPt,
        cardAtTotalSeconds: totalAt,
        cardStTotalSeconds: totalSt ?? 0,
        previewUrl,
      });
    });
  });

  return cards;
};
const mergeAssignmentCardsWithSaved = (baseCards: any, savedCards: any) => {
  const merged: any[] = [];
  const indexById = new Map<string, number>();
  const isDeltaCard = (card: any) =>
    (resolveOptionalString(card?.type, "") ?? "").toUpperCase() === "DELTA";

  ensureArray(baseCards).forEach((card) => {
    if (!card?.id) return;
    indexById.set(String(card.id), merged.length);
    merged.push(card);
  });

  ensureArray(savedCards).forEach((card) => {
    if (!card?.id) return;
    const key = String(card.id);
    const existingIndex = indexById.get(key);
    if (existingIndex == null) {
      if (!isDeltaCard(card)) return;
      indexById.set(key, merged.length);
      merged.push(card);
      return;
    }
    const baseCard = merged[existingIndex];
    merged[existingIndex] = {
      ...card,
      ...baseCard,
      id: baseCard.id,
      originOrderId: baseCard.originOrderId || card.originOrderId || baseCard.id,
    };
  });

  return merged;
};
type AssignmentCardStoreClient = Prisma.TransactionClient | typeof prisma;
const resolveAssignmentCardPayloadStatus = (card: any) => {
  const status = (resolveOptionalString(card?.status, "") ?? "").toUpperCase();
  if (status === "ST" || status === "PT" || status === "CT" || status === "AT") {
    return status === "ST" ? "ST" : "PT";
  }
  const cardStTotalSeconds = toOptionalNonNegativeInt(
    card?.cardStTotalSeconds ?? card?.totalSt,
    null
  );
  if (cardStTotalSeconds !== null && cardStTotalSeconds > 0) return "ST";
  const cardPtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardPtTotalSeconds ?? card?.totalPt,
    null
  );
  if (cardPtTotalSeconds !== null && cardPtTotalSeconds > 0) return "PT";
  return status || "NONE";
};

const stripLegacyAssignmentCardPayload = (card: any) => {
  if (!card || typeof card !== "object" || Array.isArray(card)) return card;
  const status = resolveAssignmentCardPayloadStatus(card);
  const cardQuantity = toOptionalNonNegativeInt(
    card?.cardQuantity ?? card?.quantity,
    null
  );
  const cardPtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardPtTotalSeconds ??
      card?.totalPt ??
      (status !== "ST" ? card?.stTotalSeconds : null),
    null
  );
  const cardAtTotalSeconds = toOptionalNonNegativeInt(
    card?.cardAtTotalSeconds ?? card?.totalAt,
    null
  );
  const cardStTotalSeconds = toOptionalNonNegativeInt(
    card?.cardStTotalSeconds ??
      card?.totalSt ??
      (status === "ST" ? card?.stTotalSeconds : null),
    null
  );
  const {
    quantity: _quantity,
    totalPt: _totalPt,
    totalAt: _totalAt,
    totalSt: _totalSt,
    stTotalSeconds: _stTotalSeconds,
    totalSeconds: _totalSeconds,
    stSeconds: _stSeconds,
    contractedSeconds: _contractedSeconds,
    operatorCtProposal: _operatorCtProposal,
    pendingCtProposal: _pendingCtProposal,
    ctAgreedSnapshot: _ctAgreedSnapshot,
    ctAgreementHistory: _ctAgreementHistory,
    // styleCode/styleName/previewUrl/orderNo/dueDate/customer/customerNameKo/
    // customerNameVi/colorName/gender/styleId/workOrderId/buyerOrgId dropped
    // from the stored payload (AssignmentCard/AssignmentPlan FK+join redesign).
    // The first group are pure text copies already reachable through the real
    // styleId/workOrderId/buyerOrgId FK columns; color/gender are no longer an
    // assignment-card identity dimension. toAssignmentCardFromStoreRow resolves
    // display fields from joins at read time. styleId/workOrderId/
    // buyerOrgId themselves are also stripped here so the row's real FK
    // columns are the only place they're stored - normalizeAssignmentCardsForStore
    // captures them from the incoming card BEFORE calling this function and
    // writes them straight to the AssignmentCard row columns, and
    // toAssignmentCardFromStoreRow reattaches them from those same row
    // columns on read, so a duplicate copy inside payload would just be a
    // second, driftable source of truth. Not stripped: cardQuantity/
    // cardPtTotalSeconds/cardAtTotalSeconds/cardStTotalSeconds/processCount/
    // status, which are computed aggregates (not pure duplicates of joinable
    // data) and out of scope for this phase.
    styleCode: _styleCode,
    styleName: _styleName,
    previewUrl: _previewUrl,
    orderNo: _orderNo,
    dueDate: _dueDate,
    customer: _customer,
    customerNameKo: _customerNameKo,
    customerNameVi: _customerNameVi,
    colorName: _colorName,
    gender: _gender,
    styleId: _payloadStyleId,
    workOrderId: _payloadWorkOrderId,
    buyerOrgId: _payloadBuyerOrgId,
    ...rest
  } = card as Record<string, unknown>;
  return {
    ...rest,
    status,
    ...(cardQuantity !== null ? { cardQuantity } : {}),
    ...(cardPtTotalSeconds !== null ? { cardPtTotalSeconds } : {}),
    ...(cardAtTotalSeconds !== null ? { cardAtTotalSeconds } : {}),
    ...(cardStTotalSeconds !== null ? { cardStTotalSeconds } : {}),
  };
};

type NormalizedAssignmentCardForStore = {
  payload: Record<string, unknown>;
  styleId: number | null;
  workOrderId: number | null;
  buyerOrgId: number | null;
};

const normalizeAssignmentCardsForStore = (
  cards: any
): NormalizedAssignmentCardForStore[] => {
  const seen = new Set<string>();
  const normalized: NormalizedAssignmentCardForStore[] = [];
  ensureArray(cards).forEach((card) => {
    if (!card || typeof card !== "object" || Array.isArray(card)) return;
    const cardId = resolveOptionalString((card as any)?.id, null);
    if (!cardId || seen.has(cardId)) return;
    seen.add(cardId);
    // AssignmentCard.styleId/workOrderId/buyerOrgId are the real FK columns
    // (AGENTS.md AssignmentCard/AssignmentPlan FK+join redesign) - capture
    // them from the incoming card here, before stripLegacyAssignmentCardPayload
    // strips them out of the persisted JSON payload below, so the row's FK
    // columns stay the single write source instead of a second copy inside
    // payload.
    const styleId = toPositiveIntOrNull((card as any)?.styleId);
    const workOrderId = toPositiveIntOrNull((card as any)?.workOrderId);
    const buyerOrgId = toPositiveIntOrNull((card as any)?.buyerOrgId);
    const sanitizedCard = stripLegacyAssignmentCardPayload(card);
    const payload = {
      ...(sanitizedCard as Record<string, unknown>),
      id: cardId,
      originOrderId:
        resolveOptionalString((sanitizedCard as any)?.originOrderId, null) ?? cardId,
    };
    normalized.push({ payload, styleId, workOrderId, buyerOrgId });
  });
  return normalized;
};
const toAssignmentCardFromStoreRow = (row: any): any | null => {
  if (!row || typeof row !== "object") return null;
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : null;
  if (!payload) return null;
  const cardId =
    resolveOptionalString((payload as any)?.id, null) ??
    resolveOptionalString(row.cardId, null);
  if (!cardId) return null;
  const sanitizedPayload = stripLegacyAssignmentCardPayload(payload);
  // Phase C/E + 2026-07-11 follow-up: use only the live joins through the
  // row's real FK columns for display fields. Legacy payload text copies are
  // intentionally not read here anymore; if the joins are missing, the row
  // should surface that problem instead of silently rendering stale text.
  const style = row.style ?? null;
  const workOrder = row.workOrder ?? null;
  const buyerOrg = row.buyerOrg ?? null;
  const previewUrl =
    Array.isArray(style?.imageUrls) && style.imageUrls.length > 0
      ? style.imageUrls[0]
      : null;
  return {
    ...(sanitizedPayload as Record<string, unknown>),
    id: cardId,
    originOrderId:
      resolveOptionalString((sanitizedPayload as any)?.originOrderId, null) ?? cardId,
    // styleId/workOrderId/buyerOrgId are the row's real FK columns - the
    // single source of truth now that normalizeAssignmentCardsForStore no
    // longer persists them inside payload.
    styleId: toPositiveIntOrNull(row.styleId),
    workOrderId: toPositiveIntOrNull(row.workOrderId),
    buyerOrgId: toPositiveIntOrNull(row.buyerOrgId),
    styleName: resolveOptionalString(style?.name, null),
    styleCode: resolveOptionalString(style?.code, null),
    previewUrl: previewUrl ?? "",
    orderNo: resolveOptionalString(workOrder?.orderNumber, null),
    dueDate: resolveOptionalString(workOrder?.dueDate, null),
    customer: resolveOptionalString(buyerOrg?.name, null),
    customerNameKo: resolveOptionalString(buyerOrg?.nameKo, null),
    customerNameVi: resolveOptionalString(buyerOrg?.nameVi, null),
  };
};
const syncAssignmentCardsForOrg = async ({
  orgId,
  cards,
  db = prisma,
}: {
  orgId: number;
  cards: any;
  db?: AssignmentCardStoreClient;
}): Promise<any[]> => {
  const normalizedCards = normalizeAssignmentCardsForStore(cards);
  const nextCardIdSet = new Set(
    normalizedCards.map((card) => String(card.payload.id))
  );
  await db.assignmentCard.deleteMany({
    where: {
      orgId,
      ...(nextCardIdSet.size > 0
        ? { cardId: { notIn: Array.from(nextCardIdSet.values()) } }
        : {}),
    },
  });
  for (const [index, entry] of normalizedCards.entries()) {
    const { payload, styleId, workOrderId, buyerOrgId } = entry;
    const cardId = String(payload.id);
    await db.assignmentCard.upsert({
      where: {
        orgId_cardId: {
          orgId,
          cardId,
        },
      },
      update: {
        sortOrder: index,
        payload: payload as Prisma.InputJsonValue,
        styleId,
        workOrderId,
        buyerOrgId,
      },
      create: {
        orgId,
        cardId,
        sortOrder: index,
        payload: payload as Prisma.InputJsonValue,
        styleId,
        workOrderId,
        buyerOrgId,
      },
    });
  }

  // The stored JSON intentionally excludes joinable display fields
  // (orderNo/styleName/customer/etc.). Return the freshly persisted rows
  // through the same FK+join read path as normal GET responses, otherwise
  // board-save responses temporarily show stripped cards until the next reload.
  return loadAssignmentCardsForOrg({ orgId, db });
};
const hydrateAssignmentFkRefsFromCards = (assignments: any[], cards: any[]): any[] => {
  const cardById = new Map<string, any>();
  ensureArray(cards).forEach((card) => {
    const cardId = resolveOptionalString(card?.id ?? card?.cardId, null);
    if (cardId && !cardById.has(cardId)) cardById.set(cardId, card);
  });
  return ensureArray(assignments).map((assignment) => {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
      return assignment;
    }
    const cardId = resolveOptionalString(assignment?.cardId, null);
    const card = cardId ? cardById.get(cardId) ?? null : null;
    if (!card) return assignment;
    return {
      ...assignment,
      workOrderId:
        toPositiveIntOrNull(assignment?.workOrderId) ?? toPositiveIntOrNull(card?.workOrderId),
      styleId: toPositiveIntOrNull(assignment?.styleId) ?? toPositiveIntOrNull(card?.styleId),
      buyerOrgId:
        toPositiveIntOrNull(assignment?.buyerOrgId) ?? toPositiveIntOrNull(card?.buyerOrgId),
    };
  });
};
const loadAssignmentCardsForOrg = async ({
  orgId,
  db = prisma,
}: {
  orgId: number;
  db?: AssignmentCardStoreClient;
}): Promise<any[]> => {
  const rows = await db.assignmentCard.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      cardId: true,
      styleId: true,
      workOrderId: true,
      buyerOrgId: true,
      payload: true,
      // Phase C (AssignmentCard/AssignmentPlan FK+join redesign): join
      // through the real FK columns instead of trusting the payload JSON
      // copies. Selected here so toAssignmentCardFromStoreRow can prefer
      // these over payload's baked-in strings.
      style: { select: { id: true, name: true, code: true, imageUrls: true } },
      workOrder: { select: { id: true, orderNumber: true, dueDate: true } },
      buyerOrg: { select: { id: true, name: true, nameKo: true, nameVi: true } },
    },
  });
  const cards = rows
    .map((row) => toAssignmentCardFromStoreRow(row))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  return cards;
};
const rebuildAssignmentCardsForOrg = async (orgId: number) => {
  const diagPrefix = `[rebuildAssignmentCardsForOrg] orgId=${orgId}`;
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, type: true },
  });
  if (!organization) {
    console.warn(`${diagPrefix} organization not found, skipping`);
    return [];
  }

  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  const [styles, orders, savedCards] = await Promise.all([
    prisma.style.findMany({
      where: { orgId: { in: accessibleOwnerOrgIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        orgId: true,
        code: true,
        name: true,
        imageUrls: true,
        processes: true,
        updatedAt: true,
        organization: {
          select: { id: true, name: true, nameKo: true, nameVi: true },
        },
      },
    }),
    prisma.workOrder.findMany({
      // Cards only ever reflect locked orders (AGENTS.md 40번) - an unlocked
      // order is a draft with no production commitment yet, so it must not
      // contribute any pool card here regardless of which trigger (style
      // save, color sync, order lock, ...) called this rebuild.
      where: { OR: getOrderAccessWhere(orgId), modificationLockedAt: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        orderId: true,
        orderNumber: true,
        dueDate: true,
        buyerOrg: {
          select: { id: true, name: true, nameKo: true, nameVi: true },
        },
        customerOrg: {
          select: { id: true, name: true, nameKo: true, nameVi: true },
        },
        items: true,
        workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE,
      },
    }),
    loadAssignmentCardsForOrg({ orgId }),
  ]);
  let initialProcessMirrorMap: Map<number, any[]>;
  try {
    initialProcessMirrorMap = await ensureStyleProcessStorageForStyles(styles, {
      processOrgId: orgId,
    });
  } catch (error) {
    console.error(`${diagPrefix} ensureStyleProcessStorageForStyles threw`, error);
    throw error;
  }
  const stylesWithProcesses = styles.map((style) => ({
    ...style,
    processes: initialProcessMirrorMap.get(Number(style.id)) ?? [],
  }));
  const quantityByStyleId = collectStyleQuantityRequirementsFromOrders({
    orders,
    styles: stylesWithProcesses,
  });
  let processMirrorMap: Map<number, any[]>;
  try {
    processMirrorMap = await ensureStyleStandardsForQuantities({
      styles,
      quantityByStyleId,
      processOrgId: orgId,
    });
  } catch (error) {
    console.error(`${diagPrefix} ensureStyleStandardsForQuantities threw`, error);
    throw error;
  }
  const hydratedStyles = styles.map((style) => ({
    ...style,
    processes:
      processMirrorMap.get(Number(style.id)) ??
      initialProcessMirrorMap.get(Number(style.id)) ??
      [],
  }));

  const baseCards = buildAssignmentCardsFromOrders({
    orders,
    styles: hydratedStyles,
  });
  const cards = mergeAssignmentCardsWithSaved(baseCards, savedCards);
  // syncAssignmentCardsForOrg does a deleteMany followed by a loop of
  // upserts with no transaction of its own - run it inside one here so a
  // mid-loop failure can't leave the org's card catalog partially wiped
  // with nothing to show for it (suspected cause of an earlier incident
  // where AssignmentCard ended up empty for every org).
  let syncedCards: any[];
  try {
    syncedCards = await prisma.$transaction(
      (tx) => syncAssignmentCardsForOrg({ orgId, cards, db: tx }),
      { timeout: 30000 }
    );
  } catch (error) {
    console.error(`${diagPrefix} syncAssignmentCardsForOrg transaction threw`, error);
    throw error;
  }
  try {
    await syncOrderProgressStatusesForOrg({
      orgId,
      cards: syncedCards,
    });
    await refreshUnlinkedAssignmentPlanSnapshotsForOrg({
      orgId,
      cards: syncedCards,
      styles: hydratedStyles,
    });
  } catch (error) {
    console.error(
      `${diagPrefix} post-sync step (syncOrderProgressStatusesForOrg/refreshUnlinkedAssignmentPlanSnapshotsForOrg) threw`,
      error
    );
    throw error;
  }
  return syncedCards;
};
const ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES = new Set([
  "P2034",
  "P2024",
  "P1008",
]);
const ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS = 3;
const ASSIGNMENT_CARD_REBUILD_RETRY_DELAY_MS = 120;
const assignmentCardRebuildChainByOrgId = new Map<number, Promise<any>>();
const waitMs = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const isRetryableAssignmentCardRebuildError = (error: unknown) => {
  const code = getErrorCode(error);
  if (!code) return false;
  return ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES.has(code);
};
const rebuildAssignmentCardsForOrgWithRetry = async (orgId: number) => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await rebuildAssignmentCardsForOrg(orgId);
    } catch (error) {
      lastError = error;
      if (
        attempt >= ASSIGNMENT_CARD_REBUILD_MAX_ATTEMPTS ||
        !isRetryableAssignmentCardRebuildError(error)
      ) {
        throw error;
      }
      await waitMs(ASSIGNMENT_CARD_REBUILD_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
};
const enqueueAssignmentCardRebuildForOrg = async (orgId: number) => {
  const previous = assignmentCardRebuildChainByOrgId.get(orgId) ?? Promise.resolve();
  const current = previous
    .catch(() => null)
    .then(() => rebuildAssignmentCardsForOrgWithRetry(orgId));
  assignmentCardRebuildChainByOrgId.set(orgId, current);
  try {
    return await current;
  } finally {
    if (assignmentCardRebuildChainByOrgId.get(orgId) === current) {
      assignmentCardRebuildChainByOrgId.delete(orgId);
    }
  }
};
const rebuildAssignmentCardsForOrgIds = async (orgIds: Array<number | null | undefined>) => {
  const uniqueOrgIds = Array.from(
    new Set(
      orgIds
        .map((orgId) => toPositiveIntOrNull(orgId))
        .filter((orgId): orgId is number => orgId !== null)
    )
  );
  await Promise.all(
    uniqueOrgIds.map((orgId) => enqueueAssignmentCardRebuildForOrg(orgId))
  );
};
const getOrderRelatedOrgIds = (order: any): number[] =>
  Array.from(
    new Set(
      [order?.orgId, order?.buyerOrgId, order?.sellerOrgId]
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const loadAccessibleWorkOrderIdsForAssignmentOrder = async ({
  orderId,
  orgIds,
  db = prisma,
}: {
  orderId: string;
  orgIds: number[];
  db?: any;
}): Promise<number[]> => {
  const normalizedOrderId = resolveOptionalString(orderId, null);
  const normalizedOrgIds = Array.from(
    new Set(
      ensureArray(orgIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
  if (!normalizedOrderId || normalizedOrgIds.length === 0) return [];

  const rows = await db.workOrder.findMany({
    where: {
      orderId: normalizedOrderId,
      OR: [
        { orgId: { in: normalizedOrgIds } },
        { buyerOrgId: { in: normalizedOrgIds } },
        { sellerOrgId: { in: normalizedOrgIds } },
      ],
    },
    select: { id: true },
  });
  return collectPositiveIntSet(...rows.map((row: any) => row?.id));
};
const resolveAssignmentStartDateKey = (assignment: any): string | null => {
  const direct = normalizeDateKey(assignment?.startDateKey);
  if (direct) return direct;
  const snapshot = resolveNormalizedAssignmentCtSnapshot(assignment);
  return normalizeDateKey(snapshot?.schedule?.startDateKey);
};
const normalizePlanIdList = (planIds: any): number[] =>
  Array.from(
    new Set(
      ensureArray(planIds)
        .map((value) => toPositiveIntOrNull(value))
        .filter((value): value is number => value !== null)
    )
  );
const loadLinkedWorkRecordPlanIds = async ({
  planIds,
  db = prisma,
}: {
  planIds: any;
  db?: any;
}): Promise<number[]> => {
  const normalizedPlanIds = normalizePlanIdList(planIds);
  if (normalizedPlanIds.length === 0) return [];
  const rows = await db.workRecord.findMany({
    where: { assignmentPlanId: { in: normalizedPlanIds } },
    select: { assignmentPlanId: true },
    distinct: ["assignmentPlanId"],
  });
  return normalizePlanIdList(rows.map((row: any) => row?.assignmentPlanId));
};

const toTimestampMsOrNull = (value: any): number | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const resolveStyleProcessSnapshotKeyForAssignment = (process: any, index: number) =>
  resolveOptionalString(
    process?.instanceId ?? process?.id ?? process?.code,
    null
  ) ?? `PROCESS-${index + 1}`;

const buildAssignmentCtSnapshotProcessLookup = (snapshot: any) => {
  const byStyleProcessId = new Map<number, any>();
  const processes = ensureArray(snapshot?.processes)
    .map((process, index) => normalizeAssignmentCtSnapshotProcess(process, index))
    .filter((process): process is any => Boolean(process));

  processes.forEach((process) => {
    const styleProcessId = toPositiveIntOrNull(
      process?.styleProcessId ?? process?.processId
    );
    if (styleProcessId !== null && !byStyleProcessId.has(styleProcessId)) {
      byStyleProcessId.set(styleProcessId, process);
    }
  });

  return {
    processes,
    byStyleProcessId,
  };
};

const resolveSnapshotProcessForLiveStyleProcess = ({
  styleProcess,
  lookup,
}: {
  styleProcess: any;
  lookup: ReturnType<typeof buildAssignmentCtSnapshotProcessLookup>;
}) => {
  const styleProcessId = toPositiveIntOrNull(
    styleProcess?.styleProcessId ?? styleProcess?.id
  );
  if (styleProcessId !== null) {
    const matchedById = lookup.byStyleProcessId.get(styleProcessId) ?? null;
    if (matchedById) return matchedById;
  }
  return null;
};

const buildAssignmentCtSnapshotScheduleForSave = (assignment: any) => {
  const startIndex = toSignedInt(assignment?.startIndex, 0);
  const endIndex = Math.max(
    startIndex,
    toSignedInt(assignment?.endIndex, startIndex)
  );
  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: toOptionalFloat(
      assignment?.startDayOffsetPercent,
      null
    ),
    startDayPercent: toOptionalFloat(assignment?.startDayPercent, null),
    endDayPercent: toOptionalFloat(assignment?.endDayPercent, null),
    startDateKey: normalizeDateKey(assignment?.startDateKey),
    endDateKey: normalizeDateKey(assignment?.endDateKey),
  };
};

const buildEditableAssignmentCtSnapshotFromLiveStyle = ({
  assignment,
  card,
  style,
  existingSnapshot = null,
  updatedAt,
  updatedBy,
}: {
  assignment: any;
  card: any;
  style: any;
  existingSnapshot?: any;
  updatedAt: string;
  updatedBy: string;
}) => {
  const liveProcesses = normalizeStyleProcesses(style?.processes);
  const incomingSnapshot = resolveNormalizedAssignmentCtSnapshot(assignment);
  const normalizedExistingSnapshot = normalizeAssignmentCtSnapshot(existingSnapshot);
  const incomingLookup = buildAssignmentCtSnapshotProcessLookup(incomingSnapshot);
  const existingLookup = buildAssignmentCtSnapshotProcessLookup(
    normalizedExistingSnapshot
  );
  const orderQuantity = toPositiveInt(
    resolveAssignmentQuantity(assignment) ??
      card?.cardQuantity ??
      card?.quantity ??
      incomingSnapshot?.quantity ??
      normalizedExistingSnapshot?.quantity ??
      1,
    1
  );
  const incomingAssignmentStTotalSeconds = resolveStateAssignmentStTotalSeconds(
    assignment
  );
  const fallbackAssignmentStTotalSeconds =
    resolveAssignmentCardStTotalSecondsForSnapshot(card) ??
    calculateAssignmentCardStTotalForOrderQuantity(liveProcesses, orderQuantity);
  const assignmentStTotalSeconds =
    incomingAssignmentStTotalSeconds != null
      ? incomingAssignmentStTotalSeconds
      : fallbackAssignmentStTotalSeconds;
  const unresolvedProcessKeys: string[] = [];
  const processes = liveProcesses
    .map((process, index) => {
      const processKey = resolveStyleProcessSnapshotKeyForAssignment(process, index);
      const incomingProcess = resolveSnapshotProcessForLiveStyleProcess({
        styleProcess: process,
        lookup: incomingLookup,
      });
      const existingProcess = resolveSnapshotProcessForLiveStyleProcess({
        styleProcess: process,
        lookup: existingLookup,
      });
      const manualCtSeconds =
        resolveAssignmentCtSnapshotProcessSeconds(incomingProcess) ??
        resolveAssignmentCtSnapshotProcessSeconds(existingProcess);
      const stSeedSeconds = resolveAssignmentCardStSeedSeconds({
        process,
        orderQuantity,
      });
      const resolvedCtSeconds = manualCtSeconds ?? stSeedSeconds;
      if (resolvedCtSeconds === null || resolvedCtSeconds <= 0) {
        unresolvedProcessKeys.push(processKey);
        return null;
      }

      const styleProcessId = toPositiveIntOrNull(
        process?.styleProcessId ?? process?.id
      );
      return {
        styleProcessId,
        processCode:
          resolveOptionalString(
            process?.code ??
              process?.storageCode ??
              incomingProcess?.processCode ??
              existingProcess?.processCode,
            null
          ) ?? null,
        name:
          resolveOptionalString(
            process?.name ??
              process?.processName ??
              incomingProcess?.name ??
              existingProcess?.name,
            null
          ) ?? `Process ${index + 1}`,
        nameKo: resolveOptionalString(
          process?.nameKo ??
            process?.processNameKo ??
            incomingProcess?.nameKo ??
            existingProcess?.nameKo,
          null
        ),
        nameEn: resolveOptionalString(
          process?.nameEn ??
            process?.processNameEn ??
            incomingProcess?.nameEn ??
            existingProcess?.nameEn,
          null
        ),
        nameVi: resolveOptionalString(
          process?.nameVi ??
            process?.processNameVi ??
            incomingProcess?.nameVi ??
            existingProcess?.nameVi,
          null
        ),
        timesPerPiece: Math.max(
          1,
          toOptionalNonNegativeInt(
            process?.timesPerPiece ??
              process?.quantity ??
              incomingProcess?.timesPerPiece ??
              existingProcess?.timesPerPiece,
            1
          ) ?? 1
        ),
        basis:
          resolveOptionalString(
            incomingProcess?.basis ?? existingProcess?.basis,
            null
          ) ?? (stSeedSeconds !== null ? "ST" : "CT"),
        snapshotCtSeconds: resolvedCtSeconds,
        pieceCtSeconds: resolvedCtSeconds,
      };
    })
    .filter((process): process is any => Boolean(process));

  const pieceCtTotalSeconds =
    processes.length > 0
      ? processes.reduce(
          (sum, process) => sum + (Number(process?.pieceCtSeconds) || 0),
          0
        )
      : null;
  const assignmentCtTotalSeconds =
    pieceCtTotalSeconds != null
      ? Math.max(0, Math.round(pieceCtTotalSeconds * orderQuantity))
      : null;
  const snapshotCore =
    processes.length > 0
      ? {
          sourceAssignmentId: resolveAssignmentExternalId(assignment),
          lineId: assignment?.lineId ?? null,
          quantity: orderQuantity,
          schedule: buildAssignmentCtSnapshotScheduleForSave(assignment),
          pieceCtTotalSeconds,
          assignmentCtTotalSeconds,
          processes,
        }
      : null;
  const comparableSnapshotCore = toComparableAssignmentCtSnapshot(snapshotCore);
  const previousSnapshotForMeta =
    comparableSnapshotCore === null
      ? null
      : [incomingSnapshot, normalizedExistingSnapshot].find((snapshot) => {
          const comparableSnapshot = toComparableAssignmentCtSnapshot(snapshot);
          return (
            comparableSnapshot !== null &&
            toStableJsonText(comparableSnapshot) ===
              toStableJsonText(comparableSnapshotCore)
          );
        }) ?? null;
  const normalizedSnapshot = snapshotCore
    ? normalizeAssignmentCtSnapshot({
        ...snapshotCore,
        updatedAt: previousSnapshotForMeta?.updatedAt ?? updatedAt ?? null,
        updatedBy: previousSnapshotForMeta?.updatedBy ?? updatedBy ?? null,
      })
    : null;
  const readinessReason =
    liveProcesses.length === 0
      ? "style processes missing"
      : !normalizedSnapshot
        ? "missing snapshot"
        : normalizedSnapshot.quantity !== orderQuantity
          ? "snapshot quantity mismatch"
          : unresolvedProcessKeys.length > 0
            ? "live style process CT unresolved"
            : normalizedSnapshot.processes.length !== liveProcesses.length
              ? "snapshot process coverage mismatch"
              : pieceCtTotalSeconds === null || pieceCtTotalSeconds <= 0
                ? "snapshot piece CT total missing"
                : assignmentCtTotalSeconds === null
                  ? "snapshot assignment CT total missing"
                  : null;

  return {
    assignment: {
      ...assignment,
      quantity: orderQuantity,
      ...(assignmentStTotalSeconds != null
        ? {
            stTotalSeconds: assignmentStTotalSeconds,
            assignmentStTotalSeconds: assignmentStTotalSeconds,
          }
        : {}),
      assignmentCtSnapshot: normalizedSnapshot,
      assignmentCtTotalSeconds,
      ctTotalSeconds: assignmentCtTotalSeconds,
    },
    readiness: {
      ready: readinessReason === null,
      reason: readinessReason,
      expectedProcessCount: liveProcesses.length,
      resolvedProcessCount: normalizedSnapshot?.processes?.length ?? 0,
      missingProcessKeys: unresolvedProcessKeys,
    },
  };
};

const shouldRefreshAssignmentSnapshotFromStyle = ({
  style,
  existingSnapshot,
  styleProcesses,
}: {
  style: any;
  existingSnapshot: any;
  styleProcesses: any[];
}) => {
  if (!style || !Array.isArray(styleProcesses) || styleProcesses.length === 0) {
    return false;
  }
  const existingProcesses = ensureArray(existingSnapshot?.processes);
  if (existingProcesses.length === 0) return true;

  const styleKeys = styleProcesses.map((process, index) =>
    resolveStyleProcessSnapshotKeyForAssignment(process, index)
  );
  const snapshotKeys = existingProcesses.map(
    (process, index) =>
      resolveOptionalString(process?.processKey, null) ?? `PROCESS-${index + 1}`
  );
  if (
    styleKeys.length !== snapshotKeys.length ||
    styleKeys.some((key, index) => key !== snapshotKeys[index])
  ) {
    return true;
  }

  const styleUpdatedAt = toTimestampMsOrNull(style?.updatedAt);
  const snapshotUpdatedAt = toTimestampMsOrNull(existingSnapshot?.updatedAt);
  if (styleUpdatedAt === null) return false;
  if (snapshotUpdatedAt === null) return true;
  return styleUpdatedAt > snapshotUpdatedAt + 1000;
};

const resolveAssignmentCardStTotalSecondsForSnapshot = (card: any): number | null => {
  const direct = toOptionalNonNegativeInt(card?.cardStTotalSeconds ?? card?.totalSt, null);
  if (direct !== null && direct > 0) return direct;
  const status = resolveAssignmentCardPayloadStatus(card);
  if (status === "ST") {
    const legacy = toOptionalNonNegativeInt(card?.stTotalSeconds, null);
    if (legacy !== null && legacy > 0) return legacy;
  }
  return null;
};

const buildRefreshedUnlinkedAssignmentSnapshot = ({
  assignment,
  card,
  style,
  existingSnapshot = null,
  updatedAt,
  updatedBy,
}: {
  assignment: any;
  card: any;
  style: any;
  existingSnapshot?: any;
  updatedAt: string;
  updatedBy: string;
}) => {
  const styleProcesses = normalizeStyleProcesses(style?.processes);
  const currentSnapshot =
    normalizeAssignmentCtSnapshot(existingSnapshot) ??
    resolveNormalizedAssignmentCtSnapshot(assignment);
  if (
    !shouldRefreshAssignmentSnapshotFromStyle({
      style,
      existingSnapshot: currentSnapshot,
      styleProcesses,
    })
  ) {
    return assignment;
  }
  const refreshed = buildEditableAssignmentCtSnapshotFromLiveStyle({
    assignment,
    card,
    style,
    existingSnapshot: currentSnapshot,
    updatedAt,
    updatedBy,
  });
  return refreshed.readiness.ready ? refreshed.assignment : assignment;
};

const refreshUnlinkedAssignmentPlanSnapshotsForOrg = async ({
  orgId,
  cards,
  styles,
}: {
  orgId: number;
  cards: any[];
  styles: any[];
}) => {
  const plans = await prisma.assignmentPlan.findMany({
    where: { orgId },
    select: ASSIGNMENT_PLAN_SELECT_WITH_CLOSE as any,
  });
  if (plans.length === 0) return;
  const assignments = plans.map((plan: any) => toAssignmentPlanResponse(plan));
  const linkedPlanIds = await loadLinkedWorkRecordPlanIds({
    planIds: plans.map((plan: any) => plan?.id),
  });
  const linkedPlanIdSet = new Set(linkedPlanIds);
  const planByExternalId = ensureArray(plans).reduce((map, plan) => {
    const externalId = resolveOptionalString(plan?.externalId, null);
    if (externalId && !map.has(externalId)) map.set(externalId, plan);
    return map;
  }, new Map<string, any>());
  const cardById = ensureArray(cards).reduce((map, card) => {
    const cardId = resolveOptionalString(card?.id, null);
    if (cardId && !map.has(cardId)) map.set(cardId, card);
    return map;
  }, new Map<string, any>());
  // Style.id (numeric FK) uniquely identifies a style - keying by style.code
  // here while looking it up by the numeric card.styleId (see
  // buildAssignmentCardsFromOrders) meant this map lookup always missed and
  // this function was silently a no-op for every assignment.
  const styleByStyleId = ensureArray(styles).reduce((map, style) => {
    const styleId = toPositiveIntOrNull(style?.id);
    if (styleId !== null && !map.has(styleId)) map.set(styleId, style);
    return map;
  }, new Map<number, any>());

  const updatedAt = new Date().toISOString();
  const updatedBy = "SYSTEM:STYLE_SYNC";
  const refreshedAssignments = assignments.map((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    const plan = externalId ? planByExternalId.get(externalId) ?? null : null;
    if (Boolean(assignment?.isCompleted) || Boolean(plan?.isCompleted)) return assignment;
    if (plan?.id && linkedPlanIdSet.has(Number(plan.id))) return assignment;

    const cardId =
      resolveOptionalString(assignment?.cardId, null) ??
      resolveOptionalString(plan?.cardId, null);
    const card = cardId ? cardById.get(cardId) ?? null : null;
    if (!card) return assignment;
    const styleId = toPositiveIntOrNull(card?.styleId);
    const style = styleId !== null ? styleByStyleId.get(styleId) ?? null : null;
    if (!style) return assignment;
    const planCtTotalSeconds = resolveAssignmentCtTotalSeconds(plan);
    const planStTotalSeconds = resolvePersistedAssignmentPlanStTotalSeconds(plan);

    const mergedAssignment = {
      ...assignment,
      ...(plan
        ? {
            assignmentCtSnapshot:
              assignment?.assignmentCtSnapshot ?? plan?.assignmentCtSnapshot,
            assignmentCtTotalSeconds:
              (assignment as any)?.assignmentCtTotalSeconds ?? planCtTotalSeconds,
            ctTotalSeconds: assignment?.ctTotalSeconds ?? planCtTotalSeconds,
            assignmentStTotalSeconds:
              (assignment as any)?.assignmentStTotalSeconds ?? planStTotalSeconds,
            stTotalSeconds: assignment?.stTotalSeconds ?? planStTotalSeconds,
          }
        : {}),
    };
    const refreshed = buildRefreshedUnlinkedAssignmentSnapshot({
      assignment: mergedAssignment,
      card,
      style,
      existingSnapshot: plan?.assignmentCtSnapshot ?? null,
      updatedAt,
      updatedBy,
    });
    return refreshed;
  });

  const planUpdates = refreshedAssignments
    .map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      const plan = externalId ? planByExternalId.get(externalId) ?? null : null;
      if (!plan?.id || linkedPlanIdSet.has(Number(plan.id))) return null;
      const before = {
        quantity: resolveAssignmentQuantity({
          assignmentQuantity: plan.assignmentQuantity,
        }),
        stTotalSeconds: plan.assignmentStTotalSeconds,
        ctTotalSeconds: plan.assignmentCtTotalSeconds,
        assignmentCtSnapshot: resolveNormalizedAssignmentCtSnapshot(plan),
      };
      const after = {
        quantity: resolveAssignmentQuantity(assignment),
        stTotalSeconds: resolveStateAssignmentStTotalSeconds(assignment),
        ctTotalSeconds: resolveAssignmentCtTotalSeconds(assignment),
        assignmentCtSnapshot: resolveNormalizedAssignmentCtSnapshot(assignment),
      };
      if (isDeepEqualByStableJson(before, after)) return null;
      return {
        id: Number(plan.id),
        data: {
          assignmentQuantity: resolveAssignmentQuantity(assignment),
          assignmentStTotalSeconds: resolveStateAssignmentStTotalSeconds(assignment),
          assignmentCtTotalSeconds: resolveAssignmentCtTotalSeconds(assignment),
          assignmentCtSnapshot: (resolveNormalizedAssignmentCtSnapshot(assignment) ??
            Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
          updatedAt: new Date(updatedAt),
        },
      };
    })
    .filter((value): value is { id: number; data: any } => Boolean(value));

  if (planUpdates.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const update of planUpdates) {
      await tx.assignmentPlan.update({
        where: { id: update.id },
        data: update.data,
      });
    }
  });
};

const refreshIncomingAssignmentCtSnapshotsFromStyles = async ({
  organization,
  cards,
  assignments,
  skippedExternalIds = new Set<string>(),
  existingPlanByExternalId = new Map<string, any>(),
  db,
}: {
  organization: any;
  cards: any[];
  assignments: any[];
  skippedExternalIds?: Set<string>;
  existingPlanByExternalId?: Map<string, any>;
  db: any;
}) => {
  const normalizedAssignments = ensureArray(assignments).filter(
    (assignment) => assignment && typeof assignment === "object"
  );
  const emptyCardById = new Map<string, any>();
  const emptyStyleByStyleId = new Map<number, any>();
  if (normalizedAssignments.length === 0) {
    return {
      assignments: normalizedAssignments,
      cardById: emptyCardById,
      styleByStyleId: emptyStyleByStyleId,
    };
  }

  const cardById = ensureArray(cards).reduce((map, card) => {
    const cardId = resolveOptionalString(card?.id, null);
    if (!cardId || map.has(cardId)) return map;
    map.set(cardId, card);
    return map;
  }, new Map<string, any>());

  const quantityByStyleId = new Map<number, Set<number>>();
  const targetStyleIds = Array.from(
    new Set(
      normalizedAssignments
        .map((assignment) => {
          const externalId = resolveAssignmentExternalId(assignment);
          if (!externalId || skippedExternalIds.has(externalId)) return null;
          if (Boolean(assignment?.isCompleted)) return null;
          const styleId = resolveAssignmentStyleIdForStCalculation({
            assignment,
            cardById,
          });
          if (styleId === null) return null;
          const assignmentQuantity = toPositiveInt(
            resolveAssignmentQuantity(assignment),
            1
          );
          const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
          const current = quantityByStyleId.get(styleId) ?? new Set<number>();
          current.add(bucketQuantity);
          quantityByStyleId.set(styleId, current);
          return styleId;
        })
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  if (targetStyleIds.length === 0) {
    return {
      assignments: normalizedAssignments,
      cardById,
      styleByStyleId: emptyStyleByStyleId,
    };
  }

  const styles = await db.style.findMany({
    where: {
      id: { in: targetStyleIds },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      orgId: true,
      updatedAt: true,
      processes: true,
    },
  });
  if (styles.length === 0) {
    return {
      assignments: normalizedAssignments,
      cardById,
      styleByStyleId: emptyStyleByStyleId,
    };
  }

  const processMirrorMap = await ensureStyleStandardsForQuantities({
    styles,
    quantityByStyleId,
    processOrgId: organization.id,
    db,
  });
  const styleByStyleId = ensureArray(styles).reduce((map, style) => {
    const styleId = toPositiveIntOrNull(style?.id);
    if (styleId === null || map.has(styleId)) return map;
    map.set(styleId, {
      ...style,
      processes:
        processMirrorMap.get(styleId) ?? normalizeStyleProcesses(style?.processes),
    });
    return map;
  }, new Map<number, any>());

  const updatedAt = new Date().toISOString();
  const updatedBy = "SYSTEM:BOARD_SAVE_STYLE_SYNC";
  return {
    cardById,
    styleByStyleId,
    assignments: normalizedAssignments.map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId || skippedExternalIds.has(externalId)) return assignment;
      if (Boolean(assignment?.isCompleted)) return assignment;

      const cardId = resolveOptionalString(assignment?.cardId, null);
      const card = cardId ? cardById.get(cardId) ?? null : null;
      if (!card) return assignment;
      const styleId = toPositiveIntOrNull(assignment?.styleId ?? card?.styleId);
      if (styleId === null) return assignment;
      const style = styleByStyleId.get(styleId) ?? null;
      if (!style) return assignment;

      const refreshed = buildEditableAssignmentCtSnapshotFromLiveStyle({
        assignment,
        card,
        style,
        existingSnapshot: resolveNormalizedAssignmentCtSnapshot(
          existingPlanByExternalId.get(externalId) ?? null
        ),
        updatedAt,
        updatedBy,
      });
      return refreshed.assignment;
    }),
  };
};

const resolveAssignmentCtSnapshotSaveReadiness = ({
  assignment,
  cardById = new Map<string, any>(),
  styleByStyleId = new Map<number, any>(),
  existingPlanByExternalId = new Map<string, any>(),
}: {
  assignment: any;
  cardById?: Map<string, any>;
  styleByStyleId?: Map<number, any>;
  existingPlanByExternalId?: Map<string, any>;
}) => {
  const externalId = resolveAssignmentExternalId(assignment);
  const snapshot = resolveNormalizedAssignmentCtSnapshot(assignment);
  const processes = ensureArray(snapshot?.processes);
  const pieceCtTotalSeconds = toOptionalFloat(snapshot?.pieceCtTotalSeconds, null);
  const ctTotalSeconds =
    snapshot && processes.length > 0
      ? resolveAssignmentCtTotalSeconds({
          ...assignment,
          assignmentCtSnapshot: snapshot,
        })
      : null;
  const cardId = resolveOptionalString(assignment?.cardId, null);
  const card = cardId ? cardById.get(cardId) ?? null : null;
  const styleId = toPositiveIntOrNull(assignment?.styleId ?? card?.styleId);
  const style = styleId !== null ? styleByStyleId.get(styleId) ?? null : null;

  let reason: string | null = null;
  let canonicalSnapshotResult:
    | ReturnType<typeof buildEditableAssignmentCtSnapshotFromLiveStyle>
    | null = null;
  if (!cardId || !card) {
    reason = "assignment card missing";
  } else if (styleId === null || !style) {
    reason = "assignment style missing";
  } else if (!snapshot) {
    reason = "missing snapshot";
  } else if (processes.length === 0) {
    reason = "snapshot has no processes";
  } else if (pieceCtTotalSeconds === null || pieceCtTotalSeconds <= 0) {
    reason = "snapshot piece CT total missing";
  } else if (ctTotalSeconds === null) {
    reason = "snapshot assignment CT total missing";
  } else {
    canonicalSnapshotResult = buildEditableAssignmentCtSnapshotFromLiveStyle({
      assignment,
      card,
      style,
      existingSnapshot: resolveNormalizedAssignmentCtSnapshot(
        (externalId ? existingPlanByExternalId.get(externalId) : null) ?? null
      ),
      updatedAt:
        snapshot?.updatedAt ?? assignment?.ctUpdatedAt ?? new Date(0).toISOString(),
      updatedBy:
        snapshot?.updatedBy ??
        resolveOptionalString(assignment?.ctUpdatedBy, null) ??
        "SYSTEM:VALIDATION",
    });
    if (!canonicalSnapshotResult.readiness.ready) {
      reason =
        canonicalSnapshotResult.readiness.reason ?? "live style CT unresolved";
    } else {
      const comparableCurrentSnapshot = toComparableAssignmentCtSnapshot(snapshot);
      const comparableCanonicalSnapshot = toComparableAssignmentCtSnapshot(
        canonicalSnapshotResult.assignment.assignmentCtSnapshot
      );
      if (
        comparableCurrentSnapshot === null ||
        comparableCanonicalSnapshot === null ||
        toStableJsonText(comparableCurrentSnapshot) !==
          toStableJsonText(comparableCanonicalSnapshot)
      ) {
        reason = "snapshot mismatch with live style";
      } else {
        const expectedCtTotalSeconds = resolveAssignmentCtTotalSeconds(
          canonicalSnapshotResult.assignment
        );
        if (
          expectedCtTotalSeconds === null ||
          expectedCtTotalSeconds !== ctTotalSeconds
        ) {
          reason = "snapshot assignment CT total mismatch";
        }
      }
    }
  }

  return {
    ready: reason === null,
    reason,
    snapshot,
    ctTotalSeconds,
    processCount: processes.length,
    pieceCtTotalSeconds,
    expectedProcessCount:
      canonicalSnapshotResult?.readiness.expectedProcessCount ?? null,
    resolvedProcessCount:
      canonicalSnapshotResult?.readiness.resolvedProcessCount ?? null,
    missingProcessKeys:
      canonicalSnapshotResult?.readiness.missingProcessKeys ?? [],
  };
};

const assertAssignmentCtSnapshotsReadyForBoardSave = ({
  orgId,
  assignments,
  skippedExternalIds = new Set<string>(),
  cardById = new Map<string, any>(),
  styleByStyleId = new Map<number, any>(),
  existingPlanByExternalId = new Map<string, any>(),
}: {
  orgId: number;
  assignments: any[];
  skippedExternalIds?: Set<string>;
  cardById?: Map<string, any>;
  styleByStyleId?: Map<number, any>;
  existingPlanByExternalId?: Map<string, any>;
}) => {
  const issues = ensureArray(assignments)
    .map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId) return null;
      if (Boolean(assignment?.isCompleted)) return null;
      if (skippedExternalIds.has(externalId)) return null;
      const cardId = resolveOptionalString(assignment?.cardId, null);
      const card = cardId ? cardById.get(cardId) ?? null : null;

      const readiness = resolveAssignmentCtSnapshotSaveReadiness({
        assignment,
        cardById,
        styleByStyleId,
        existingPlanByExternalId,
      });
      if (readiness.ready) return null;
      return {
        externalId,
        cardId,
        styleId: toPositiveIntOrNull(assignment?.styleId ?? card?.styleId),
        workOrderId: toPositiveIntOrNull(assignment?.workOrderId),
        quantity: resolveAssignmentQuantity(assignment),
        reason: readiness.reason ?? "unknown CT snapshot issue",
      };
    })
    .filter((issue): issue is {
      externalId: string;
      cardId: string | null;
      styleId: number | null;
      workOrderId: number | null;
      quantity: number | null;
      reason: string;
    } => Boolean(issue));

  if (issues.length === 0) return;

  console.warn(
    `[assignment-board-state] orgId=${orgId} blocked save because editable assignments have no usable CT snapshot: ${issues
      .slice(0, 20)
      .map(
        (issue) =>
          `${issue.externalId} card=${issue.cardId ?? "-"} styleId=${issue.styleId ?? "-"} workOrderId=${issue.workOrderId ?? "-"} qty=${issue.quantity ?? "-"} reason=${issue.reason}`
      )
      .join("; ")}${issues.length > 20 ? `; ... +${issues.length - 20}` : ""}`
  );

  throw createHttpError(
    409,
    `assignment CT snapshot required before save: ${issues
      .slice(0, 10)
      .map((issue) => `${issue.externalId} (${issue.reason})`)
      .join(", ")}`
  );
};

const assertAssignmentPlansCanBeDetached = async ({
  planIds,
  db = prisma,
}: {
  planIds: any;
  db?: any;
}) => {
  const linkedPlanIds = await loadLinkedWorkRecordPlanIds({ planIds, db });
  if (linkedPlanIds.length === 0) return;
  throw createHttpError(
    409,
    `assignment plan has linked work records and cannot be removed (${linkedPlanIds
      .slice(0, 10)
      .join(",")})`
  );
};
const detachWorkRecordsAndDeleteAssignmentPlans = async ({
  planIds,
  db = prisma,
}: {
  planIds: any;
  db?: any;
}): Promise<{ detachedCount: number; deletedCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(planIds);
  if (normalizedPlanIds.length === 0) {
    return { detachedCount: 0, deletedCount: 0 };
  }
  await assertAssignmentPlansCanBeDetached({
    planIds: normalizedPlanIds,
    db,
  });
  const detachedResult = await db.workRecord.updateMany({
    where: { assignmentPlanId: { in: normalizedPlanIds } },
    data: { assignmentPlanId: null },
  });
  const deletedResult = await db.assignmentPlan.deleteMany({
    where: { id: { in: normalizedPlanIds } },
  });
  return {
    detachedCount: toNonNegativeInt(detachedResult?.count, 0),
    deletedCount: toNonNegativeInt(deletedResult?.count, 0),
  };
};
type OrderStyleRemovalIssue = {
  styleId: number;
  styleCode: string;
  styleName: string;
  code: string;
  message: string;
};
// STYLE_HAS_WORK_RECORDS hard-block on style removal was retired in favor of
// the zero-quantity overflow handling in syncAssignmentPlansForOrderLock
// (AGENTS.md 40번). DELETE /orders/:orderId keeps its own separate hard block
// (see the ORDER_HAS_WORK_RECORDS guard below) since deleting the whole order
// leaves no order left to reopen for later re-billing.
const resolveOrderStyleQuantityMap = (order: any): Map<number, number> => {
  const map = new Map<number, number>();
  ensureArray(order?.workOrderItems).forEach((row: any) => {
    const item = workOrderItemToItemShape(row);
    const styleId = toPositiveIntOrNull(item?.styleId);
    if (styleId === null) return;
    const quantity = Math.max(0, Math.round(Number(sumOrderItemQuantity(item)) || 0));
    map.set(styleId, (map.get(styleId) ?? 0) + quantity);
  });
  return map;
};

// Runs once, when an order transitions to locked (AGENTS.md 40번). Reconciles
// existing AssignmentPlan rows for this order against the current
// WorkOrderItem quantities:
//  - quantity unchanged -> untouched
//  - quantity changed, style still on the order -> assignmentQuantity/ST
//    recalculated from the latest StyleProcessStandard buckets (same
//    structural-change math the board save path uses)
//  - style removed from the order entirely:
//      - no linked WorkRecord -> safe to delete, same as the old save-time
//        guard used to do
//      - has a linked WorkRecord -> kept, forced to 0 quantity/0 ST instead of
//        deleted, so the already-produced amount becomes pure overflow
//        instead of silently disappearing
// Completed and payroll-locked plans are never touched. Plans split across
// more than one line (several AssignmentPlan rows sharing the same cardId)
// are also left untouched - redistributing a changed total across existing
// splits is ambiguous and was not decided, see AGENTS.md 40번 known limitation.
const syncAssignmentPlansForOrderLock = async ({
  orgId,
  order,
  db = prisma,
}: {
  orgId: number;
  order: any;
  db?: any;
}): Promise<{ zeroedStyles: OrderStyleRemovalIssue[] }> => {
  const orderId = resolveOptionalString(order?.orderId, null);
  if (!orderId) return { zeroedStyles: [] };

  const styleQuantityMap = resolveOrderStyleQuantityMap(order);
  const workOrderIds = collectPositiveIntSet(order?.id);
  if (workOrderIds.length === 0) {
    throw createHttpError(409, "order is missing WorkOrder.id; cannot sync assignment plans accurately");
  }
  const plans = await db.assignmentPlan.findMany({
    where: {
      orgId,
      OR: [
        { workOrderId: { in: workOrderIds } },
        { assignmentCard: { is: { workOrderId: { in: workOrderIds } } } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      cardId: true,
      workOrderId: true,
      styleId: true,
      isCompleted: true,
      assignmentQuantity: true,
      assignmentStTotalSeconds: true,
      productionCompletedAt: true,
      closedAt: true,
      completedAt: true,
    },
  });
  if (plans.length === 0) return { zeroedStyles: [] };

  const annotatedPlans = await annotateAssignmentPlanRowsWithPayrollLocks(orgId, plans);
  const planById = new Map<number, any>(
    annotatedPlans.map((plan) => [Number(plan.id), plan])
  );

  const plansByStyleId = new Map<number, any[]>();
  const workOrderIdSet = new Set(workOrderIds);
  const missingWorkOrderFkPlanIds: string[] = [];
  const missingStyleFkPlanIds: string[] = [];
  plans.forEach((plan: any) => {
    const annotatedPlan = planById.get(Number(plan.id)) ?? plan;
    if (annotatedPlan.isCompleted === true || annotatedPlan.isPayrollLocked) return;
    const planWorkOrderId = toPositiveIntOrNull(annotatedPlan?.workOrderId ?? plan?.workOrderId);
    if (planWorkOrderId === null || !workOrderIdSet.has(planWorkOrderId)) {
      missingWorkOrderFkPlanIds.push(
        resolveOptionalString(annotatedPlan?.externalId ?? plan?.externalId, null) ??
          String(annotatedPlan?.id ?? plan?.id ?? "")
      );
      return;
    }
    const styleId = toPositiveIntOrNull(annotatedPlan?.styleId ?? plan?.styleId);
    if (styleId === null) {
      missingStyleFkPlanIds.push(
        resolveOptionalString(annotatedPlan?.externalId ?? plan?.externalId, null) ??
          String(annotatedPlan?.id ?? plan?.id ?? "")
      );
      return;
    }
    const bucket = plansByStyleId.get(styleId) ?? [];
    bucket.push(plan);
    plansByStyleId.set(styleId, bucket);
  });
  if (missingWorkOrderFkPlanIds.length > 0) {
    throw createHttpError(
      409,
      `assignment plan is missing workOrderId FK; cannot sync order lock accurately (${missingWorkOrderFkPlanIds.join(", ")})`
    );
  }
  if (missingStyleFkPlanIds.length > 0) {
    throw createHttpError(
      409,
      `assignment plan is missing styleId FK; cannot sync order lock accurately (${missingStyleFkPlanIds.join(", ")})`
    );
  }

  const linkedPlanIdSet = new Set(
    await loadLinkedWorkRecordPlanIds({
      planIds: plans.map((plan: any) => plan.id),
      db,
    })
  );

  const pendingZero: { plan: any; styleId: number; linked: boolean }[] = [];
  const pendingRecalc: { plan: any; styleId: number; targetQuantity: number }[] = [];

  plansByStyleId.forEach((group, styleId) => {
    if (group.length > 1) return; // split across lines - left untouched, see comment above
    const plan = planById.get(Number(group[0].id));
    if (!plan) return;
    if (plan.isCompleted === true || plan.isPayrollLocked) return;

    const targetQuantity = styleQuantityMap.get(styleId) ?? 0;
    const currentQuantity = resolveAssignmentQuantity(plan) ?? 0;
    if (targetQuantity === currentQuantity) return;

    if (targetQuantity === 0) {
      pendingZero.push({ plan, styleId, linked: linkedPlanIdSet.has(Number(plan.id)) });
      return;
    }
    pendingRecalc.push({ plan, styleId, targetQuantity });
  });

  const zeroedStyles: OrderStyleRemovalIssue[] = [];

  if (pendingZero.length > 0) {
    const cardIds = pendingZero
      .map((item) => resolveOptionalString(item.plan.cardId, null))
      .filter((value): value is string => Boolean(value));
    const existingCardRows =
      cardIds.length > 0
        ? await db.assignmentCard.findMany({
            where: { orgId, cardId: { in: cardIds } },
            select: { cardId: true, payload: true },
          })
        : [];
    const cardPayloadByCardId = new Map<string, any>(
      existingCardRows.map((row: any) => [row.cardId, row.payload])
    );

    const notLinked = pendingZero.filter((item) => !item.linked);
    if (notLinked.length > 0) {
      const notLinkedCardIds = notLinked
        .map((item) => resolveOptionalString(item.plan.cardId, null))
        .filter((value): value is string => Boolean(value));
      if (notLinkedCardIds.length > 0) {
        await db.assignmentCard.deleteMany({
          where: { orgId, cardId: { in: notLinkedCardIds } },
        });
      }
      await detachWorkRecordsAndDeleteAssignmentPlans({
        planIds: notLinked.map((item) => item.plan.id),
        db,
      });
    }

    for (const item of pendingZero) {
      if (!item.linked) continue;
      const cardId = resolveOptionalString(item.plan.cardId, null);
      await db.assignmentPlan.update({
        where: { id: item.plan.id },
        data: { assignmentQuantity: 0, assignmentStTotalSeconds: 0 },
      });
      const existingPayload = cardId ? cardPayloadByCardId.get(cardId) ?? {} : {};
      const styleName =
        resolveOptionalString(existingPayload?.styleName, null) ?? `Style ${item.styleId}`;
      if (cardId) {
        const nextPayload = {
          ...existingPayload,
          id: cardId,
          originOrderId: resolveOptionalString(existingPayload?.originOrderId, null) ?? cardId,
          cardQuantity: 0,
          type: "DELTA",
        };
        await db.assignmentCard.upsert({
          where: { orgId_cardId: { orgId, cardId } },
          // update: style/order identity didn't change here, only quantity -
          // the real FK columns from whenever this card was first created
          // stay as they were.
          update: { payload: nextPayload },
          // Repair path for a zero-quantity overflow card row that is missing
          // entirely. The FK columns come from the already-validated
          // WorkOrder/AssignmentPlan scope, never from payload parsing.
          create: {
            orgId,
            cardId,
            sortOrder: 0,
            payload: nextPayload,
            styleId: item.styleId,
            workOrderId: toPositiveIntOrNull(order?.id),
            buyerOrgId: toPositiveIntOrNull(order?.buyerOrgId ?? order?.customerId),
          },
        });
      }
      zeroedStyles.push({
        styleId: item.styleId,
        styleCode: resolveOptionalString(existingPayload?.styleCode, null) ?? "",
        styleName,
        code: "STYLE_ZEROED_HAS_WORK_RECORDS",
        message: `${styleName}: removed from the order but kept as a zero-quantity overflow assignment because it already has work records.`,
      });
    }
  }

  if (pendingRecalc.length > 0) {
    const styleIds = Array.from(new Set(pendingRecalc.map((item) => item.styleId)));
    const styles = await db.style.findMany({
      where: { id: { in: styleIds } },
      select: { id: true, orgId: true, processes: true },
    });
    const quantityByStyleId = new Map<number, Set<number>>();
    pendingRecalc.forEach((item) => {
      const bucketQuantity = resolveStBucketQuantity(item.targetQuantity);
      const current = quantityByStyleId.get(item.styleId) ?? new Set<number>();
      current.add(bucketQuantity);
      quantityByStyleId.set(item.styleId, current);
    });
    await ensureStyleStandardsForQuantities({
      styles,
      quantityByStyleId,
      processOrgId: orgId,
      db,
    });
    const styleProcessRowsByStyleId = await loadStyleProcessRowsByStyleId(styleIds, {
      processOrgId: orgId,
      db,
    });

    for (const item of pendingRecalc) {
      const bucketQuantity = resolveStBucketQuantity(item.targetQuantity);
      const styleProcessRows = styleProcessRowsByStyleId.get(item.styleId) ?? [];
      const assignmentStTotalSeconds = calculateAssignmentStTotalSecondsFromStyleRows({
        styleProcessRows,
        assignmentQuantity: item.targetQuantity,
        bucketQuantity,
      });
      await db.assignmentPlan.update({
        where: { id: item.plan.id },
        data: {
          assignmentQuantity: item.targetQuantity,
          ...(assignmentStTotalSeconds !== null ? { assignmentStTotalSeconds } : {}),
        },
      });
    }
  }

  return { zeroedStyles };
};
const buildOrderModificationLockState = ({
  order,
  isAssignmentLocked = false,
}: {
  order: any;
  isAssignmentLocked?: boolean;
}) => {
  const isManualLocked = Boolean(order?.modificationLockedAt);
  const assignmentLocked = Boolean(isAssignmentLocked);
  return {
    isManualLocked,
    isAssignmentLocked: assignmentLocked,
    canToggle: true,
    isLocked: isManualLocked,
  };
};
const loadOrderAssignmentModificationLockMap = async (
  orders: any[]
): Promise<Map<string, boolean>> => {
  const safeOrders = ensureArray(orders).filter((order) => order && typeof order === "object");
  const orderIds = Array.from(
    new Set(
      safeOrders
        .map((order) => resolveOptionalString(order?.orderId ?? order?.id, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const lockMap = new Map<string, boolean>();
  if (orderIds.length === 0) return lockMap;

  const workOrderIdSet = new Set(
    safeOrders
      .map((order) => toPositiveIntOrNull(order?.id))
      .filter((value): value is number => value !== null)
  );
  if (workOrderIdSet.size === 0) return lockMap;
  const workOrderIds = Array.from(workOrderIdSet);
  const orgIds = Array.from(
    new Set(safeOrders.flatMap((order) => getOrderRelatedOrgIds(order)))
  );
  if (orgIds.length === 0) return lockMap;

  let lockedPlans: Array<{
    workOrderId: number | null;
    assignmentCard: { workOrderId: number | null } | null;
  }> = [];
  try {
    lockedPlans = await prisma.assignmentPlan.findMany({
      where: {
        orgId: { in: orgIds },
        assignmentCtTotalSeconds: { not: null },
        OR: [
          { workOrderId: { in: workOrderIds } },
          { assignmentCard: { is: { workOrderId: { in: workOrderIds } } } },
        ],
      },
      select: {
        workOrderId: true,
        assignmentCard: { select: { workOrderId: true } },
      },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    lockedPlans = await prisma.assignmentPlan.findMany({
      where: {
        orgId: { in: orgIds },
        assignmentCtSnapshot: { not: Prisma.JsonNull },
        OR: [
          { workOrderId: { in: workOrderIds } },
          { assignmentCard: { is: { workOrderId: { in: workOrderIds } } } },
        ],
      },
      select: {
        workOrderId: true,
        assignmentCard: { select: { workOrderId: true } },
      },
    });
  }
  lockedPlans.forEach((plan) => {
    const planWorkOrderId = toPositiveIntOrNull(plan?.workOrderId);
    const cardWorkOrderId = toPositiveIntOrNull(plan?.assignmentCard?.workOrderId);
    if (
      planWorkOrderId !== null &&
      cardWorkOrderId !== null &&
      planWorkOrderId !== cardWorkOrderId
    ) {
      console.warn(
        `[order-lock] AssignmentPlan.workOrderId drift: planWorkOrderId=${planWorkOrderId} cardWorkOrderId=${cardWorkOrderId}`
      );
    }
    const workOrderId =
      planWorkOrderId !== null && workOrderIdSet.has(planWorkOrderId)
        ? planWorkOrderId
        : cardWorkOrderId !== null && workOrderIdSet.has(cardWorkOrderId)
          ? cardWorkOrderId
          : null;
    if (workOrderId !== null && workOrderIdSet.has(workOrderId)) {
      const matchingOrder = safeOrders.find(
        (order) => toPositiveIntOrNull(order?.id) === workOrderId
      );
      const matchingOrderId = resolveOptionalString(matchingOrder?.orderId, null);
      if (matchingOrderId) {
        lockMap.set(matchingOrderId, true);
      }
      return;
    }
  });
  return lockMap;
};
const isOrderAssignmentModificationLocked = async (order: any): Promise<boolean> => {
  const workOrderId = toPositiveIntOrNull(order?.id);
  if (workOrderId === null) return false;
  const orgIds = getOrderRelatedOrgIds(order);
  if (orgIds.length === 0) return false;

  let lockedPlan: { id: number } | null = null;
  try {
    lockedPlan = await prisma.assignmentPlan.findFirst({
      where: {
        orgId: { in: orgIds },
        assignmentCtTotalSeconds: { not: null },
        OR: [
          { workOrderId },
          { assignmentCard: { is: { workOrderId } } },
        ],
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isAssignmentPlanMissingColumnError(error)) throw error;
    lockedPlan = await prisma.assignmentPlan.findFirst({
      where: {
        orgId: { in: orgIds },
        assignmentCtSnapshot: { not: Prisma.JsonNull },
        OR: [
          { workOrderId },
          { assignmentCard: { is: { workOrderId } } },
        ],
      },
      select: { id: true },
    });
  }
  return Boolean(lockedPlan);
};
const getOrderModificationLockState = async (order: any) =>
  buildOrderModificationLockState({
    order,
    isAssignmentLocked: await isOrderAssignmentModificationLocked(order),
  });
const isOrderModificationLocked = async (order: any): Promise<boolean> => {
  return (await getOrderModificationLockState(order)).isLocked;
};
// repairAssignmentPlanDisplayRows was retired here (Phase C of the
// AssignmentCard/AssignmentPlan FK+join redesign): it re-derived
// orderNo/customer/label/colorName by string-parsing AssignmentPlan.cardId
// through string-derived identity matching, which had a known-broken style
// match (Style.code string key vs the numeric styleId embedded in cardId) -
// the same bug class as AGENTS.md 42. Now that toAssignmentPlanResponse/GET
// /assignment-plans join through the real workOrderId/styleId/buyerOrgId FKs
// directly, and PUT /assignment-board-state no longer tries to "repair"
// display text from parsed strings, there is no remaining server-side display
// fallback path for assignments.
const toAssignmentPlanResponse = (plan: any) => {
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const snapshotSchedule =
    assignmentCtSnapshot && typeof assignmentCtSnapshot === "object"
      ? (assignmentCtSnapshot as any).schedule
      : null;
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...plan,
    assignmentCtSnapshot,
  });
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const completedAt = resolveAssignmentPlanClosedAt(plan);
  const isCompleted = plan?.isCompleted === true;
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: resolveAssignmentQuantity(plan),
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);
  // Phase E (AssignmentCard/AssignmentPlan FK+join redesign): orderNo/
  // customer/label/previewUrl are no longer stored columns at all - these are
  // now the only source, resolved purely from workOrderId/styleId/buyerOrgId.
  const joinedOrderNo = resolveOptionalString(plan?.workOrder?.orderNumber, null);
  const joinedCustomer = resolveOptionalString(plan?.buyerOrg?.name, null);
  const joinedCustomerNameKo = resolveOptionalString(plan?.buyerOrg?.nameKo, null);
  const joinedCustomerNameVi = resolveOptionalString(plan?.buyerOrg?.nameVi, null);
  const joinedLabel = resolveOptionalString(plan?.style?.name, null);
  const joinedPreviewUrl =
    Array.isArray(plan?.style?.imageUrls) && plan.style.imageUrls.length > 0
      ? plan.style.imageUrls[0]
      : null;
  return {
    id: plan.externalId,
    lineId: String(plan.lineId),
    cardId: plan.cardId ?? "",
    workOrderId: toPositiveIntOrNull(plan?.workOrderId),
    // styleId/buyerOrgId: read via the joined relation first (every current
    // select variant includes `style`/`buyerOrg`), falling back to the raw
    // scalar for any caller that selects the FK column directly instead.
    // Without these, board-state comparisons (isSameAssignmentStateContent)
    // saw an extra key on the incoming side only (hydrateAssignmentFkRefsFromCards
    // always sets styleId/buyerOrgId from the card) and treated every
    // untouched assignment as "changed" - fatal for completed assignments,
    // whose write guard doesn't compare these fields either.
    styleId: toPositiveIntOrNull(plan?.style?.id ?? plan?.styleId),
    buyerOrgId: toPositiveIntOrNull(plan?.buyerOrg?.id ?? plan?.buyerOrgId),
    orderNo: joinedOrderNo ?? "",
    customer: joinedCustomer ?? "",
    // Organization.nameKo/nameVi via the buyerOrg FK - lets the frontend show
    // a localized name the same way AssignmentCard already does
    // (resolveCardCustomerDisplay), instead of always showing whatever
    // single language buyerOrg.name happens to be in.
    customerNameKo: joinedCustomerNameKo ?? "",
    customerNameVi: joinedCustomerNameVi ?? "",
    label: joinedLabel ?? "",
    // colorId/colorName/color/stripeColor/imageUrl/thumbnailUrl were dropped
    // in Phase D (AssignmentCard/AssignmentPlan FK+join redesign) - color/
    // gender were never tracked at the assignment level (confirmed always
    // empty), and color/stripeColor/imageUrl/thumbnailUrl were write-only
    // (never read back by the frontend, which recomputes basis-color at
    // render time and only ever reads previewUrl for the image). Kept as
    // static empty values here, not read from any column, so the response
    // shape is unchanged for any client still checking these fields.
    colorId: null,
    colorName: "",
    previewUrl: joinedPreviewUrl ?? "",
    imageUrl: "",
    thumbnailUrl: "",
    quantity: resolveAssignmentQuantity(plan),
    originOrderId: plan.originOrderId ?? "",
    basis: plan.basis ?? "",
    ctTotalSeconds,
    assignmentCtSnapshot,
    ctUpdatedBy: assignmentCtSnapshot?.updatedBy ?? "",
    ctUpdatedAt: assignmentCtSnapshot?.updatedAt ?? null,
    color: "",
    stripeColor: "",
    stTotalSeconds: resolvePersistedAssignmentPlanStTotalSeconds(plan),
    startIndex: plan.startIndex,
    endIndex: plan.endIndex,
    startDateKey: normalizeDateKey(snapshotSchedule?.startDateKey),
    endDateKey: normalizeDateKey(snapshotSchedule?.endDateKey),
    startDayOffsetPercent: plan.startDayOffsetPercent ?? null,
    startDayPercent: plan.startDayPercent ?? null,
    endDayPercent: plan.endDayPercent ?? null,
    isCompleted,
    finalQuantity,
    closedQty,
    completedAt,
    closedAt: completedAt,
    closedBy: resolveOptionalString(plan?.closedBy, null),
    closeMode,
    closeBasis,
    isPayrollLocked: Boolean(plan?.isPayrollLocked),
    payrollLockMonth: resolveOptionalString(plan?.payrollLockMonth, null),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};
const annotateAssignmentPlanRowsWithPayrollLocks = async (
  orgId: number,
  plans: any[]
) => {
  const monthByExternalId = new Map<string, string>();
  ensureArray(plans).forEach((plan) => {
    const externalId = resolveOptionalString(plan?.externalId, null);
    const monthKey = resolveAssignmentPlanPayrollLockMonth(plan);
    if (externalId && monthKey) monthByExternalId.set(externalId, monthKey);
  });
  const lockedMonthSet = await loadLockedPayrollMonthSet(
    orgId,
    Array.from(monthByExternalId.values())
  );
  return ensureArray(plans).map((plan) => {
    const externalId = resolveOptionalString(plan?.externalId, null);
    const payrollLockMonth = externalId ? monthByExternalId.get(externalId) || null : null;
    const isPayrollLocked = payrollLockMonth ? lockedMonthSet.has(payrollLockMonth) : false;
    return {
      ...plan,
      payrollLockMonth,
      isPayrollLocked,
    };
  });
};
const syncAssignmentPlanWorkOrderRefs = async (
  orgId: number,
  items: any[],
  db: any = prisma
) => {
  const normalizedItems = ensureArray(items).filter(
    (item) => item && typeof item === "object"
  );
  if (normalizedItems.length === 0) return [];

  const cardIds = Array.from(
    new Set(
      normalizedItems
        .map((item) => resolveOptionalString(item?.cardId, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const assignmentCardByCardId = new Map<string, any>();
  if (cardIds.length > 0) {
    const assignmentCards = await db.assignmentCard.findMany({
      where: { orgId, cardId: { in: cardIds } },
      select: {
        cardId: true,
        styleId: true,
        workOrderId: true,
        buyerOrgId: true,
      },
    });
    assignmentCards.forEach((card: any) => {
      const cardId = resolveOptionalString(card?.cardId, null);
      if (cardId) assignmentCardByCardId.set(cardId, card);
    });
  }
  const itemsWithCardRefs = normalizedItems.map((item) => {
    const cardId = resolveOptionalString(item?.cardId, null);
    const card = cardId ? assignmentCardByCardId.get(cardId) ?? null : null;
    return {
      ...item,
      workOrderId:
        toPositiveIntOrNull(item?.workOrderId) ?? toPositiveIntOrNull(card?.workOrderId),
      styleId: toPositiveIntOrNull(item?.styleId) ?? toPositiveIntOrNull(card?.styleId),
      buyerOrgId:
        toPositiveIntOrNull(item?.buyerOrgId) ?? toPositiveIntOrNull(card?.buyerOrgId),
    };
  });

  const directWorkOrderIds = collectPositiveIntSet(
    ...itemsWithCardRefs.map((item) => item?.workOrderId)
  );
  if (directWorkOrderIds.length === 0) {
    console.warn(
      `[assignment-board-state] orgId=${orgId} missing workOrderId FK after AssignmentCard lookup; cardIds=${cardIds
        .slice(0, 10)
        .join(",")}`
    );
    throw createHttpError(
      409,
      "assignment plan payload is missing workOrderId FK; cannot save assignment plans accurately"
    );
  }

  const workOrders = await db.workOrder.findMany({
    where: {
      AND: [
        { OR: getOrderAccessWhere(orgId) },
        { id: { in: directWorkOrderIds } },
      ],
    },
    select: {
      id: true,
      orgId: true,
      buyerOrgId: true,
      sellerOrgId: true,
      orderId: true,
      orderNumber: true,
      buyerOrg: {
        select: { id: true, name: true, nameKo: true, nameVi: true },
      },
      customerOrg: {
        select: { id: true, name: true, nameKo: true, nameVi: true },
      },
    },
  });
  const workOrderById = new Map<number, any>();
  ensureArray(workOrders).forEach((row) => {
    const workOrderId = toPositiveIntOrNull(row?.id);
    if (workOrderId !== null && !workOrderById.has(workOrderId)) {
      workOrderById.set(workOrderId, row);
    }
  });

  return itemsWithCardRefs.map((item) => {
    const externalId = resolveAssignmentExternalId(item) ?? "(unknown assignment)";
    const directWorkOrderId = toPositiveIntOrNull(item?.workOrderId);
    if (directWorkOrderId === null) {
      console.warn(
        `[assignment-board-state] orgId=${orgId} assignment=${externalId} cardId=${resolveOptionalString(item?.cardId, null) ?? ""} missing workOrderId FK`
      );
      throw createHttpError(
        409,
        `assignment ${externalId} is missing workOrderId FK; cannot save assignment plan accurately`
      );
    }
    const matchedWorkOrder = workOrderById.get(directWorkOrderId) ?? null;
    if (!matchedWorkOrder) {
      console.warn(
        `[assignment-board-state] orgId=${orgId} assignment=${externalId} inaccessible workOrderId=${directWorkOrderId}`
      );
      throw createHttpError(
        409,
        `assignment ${externalId} references an inaccessible or missing workOrderId FK (${directWorkOrderId})`
      );
    }
    // orderNo/customer display copies are not written to AssignmentPlan
    // anymore. This function only verifies workOrderId and resolves buyerOrgId
    // through the WorkOrder relation.
    return {
      ...item,
      workOrderId: toPositiveIntOrNull(matchedWorkOrder?.id),
      // Real FK (Phase B) - resolved from the same matchedWorkOrder used for
      // the orderNo/customer matching above.
      buyerOrgId:
        toPositiveIntOrNull(matchedWorkOrder?.customerOrg?.id ?? matchedWorkOrder?.buyerOrg?.id) ??
        toPositiveIntOrNull(item?.buyerOrgId),
    };
  });
};
const normalizeAssignmentPlanPayload = (items: any, lineIdSet: Set<number> | null = null) =>
  ensureArray(items)
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const externalId = resolveOptionalString(item.id ?? item.externalId, null);
      const lineId = toNumberOrNull(item.lineId);
      const lineIdNum =
        typeof lineId === "number" && Number.isFinite(lineId)
          ? Math.round(lineId)
          : null;
      if (!externalId || !lineIdNum) return null;
      if (lineIdSet && !lineIdSet.has(lineIdNum)) return null;

      const startIndex = toSignedInt(item.startIndex, 0);
      const endIndex = Math.max(startIndex, toSignedInt(item.endIndex, startIndex));
      const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
      const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
        ...item,
        assignmentCtSnapshot,
      });
      const stTotalSeconds = resolveStateAssignmentStTotalSeconds(item);
      return {
        lineId: lineIdNum,
        externalId,
        cardId: resolveOptionalString(item.cardId, null),
        workOrderId: toPositiveIntOrNull(item?.workOrderId),
        // customer/label/previewUrl and the already-dead
        // colorId/colorName/imageUrl/thumbnailUrl/color/stripeColor keys are
        // not carried through anymore: none of them are written to
        // AssignmentPlan (Phase D/E), so normalizing them here was pointless.
        orderNo: resolveOptionalString(item.orderNo, null),
        quantity: resolveAssignmentQuantity(item),
        originOrderId: resolveOptionalString(item.originOrderId, null),
        basis: resolveOptionalString(item.basis, null),
        ctTotalSeconds,
        assignmentCtSnapshot,
        stTotalSeconds,
        startIndex,
        endIndex,
        startDayOffsetPercent: toOptionalFloat(item.startDayOffsetPercent, null),
        startDayPercent: toOptionalFloat(item.startDayPercent, null),
        endDayPercent: toOptionalFloat(item.endDayPercent, null),
        updatedAt: new Date(),
      };
    })
    .filter((item): item is any => Boolean(item))
    .reduce((acc: any, item: any) => {
      if (acc.seen.has(item.externalId)) return acc;
      acc.seen.add(item.externalId);
      acc.rows.push(item);
      return acc;
    }, { seen: new Set<string>(), rows: [] as any[] }).rows;
const assertFiniteAssignmentScheduleIndices = (items: any[]) => {
  ensureArray(items).forEach((item, index) => {
    const externalId = resolveAssignmentExternalId(item) ?? `#${index + 1}`;
    const startIndex = Number(item?.startIndex);
    const endIndex = Number(item?.endIndex);
    if (!Number.isFinite(startIndex)) {
      throw createHttpError(400, `assignment ${externalId} has invalid startIndex`);
    }
    if (!Number.isFinite(endIndex)) {
      throw createHttpError(400, `assignment ${externalId} has invalid endIndex`);
    }
  });
};
const resolveAssignmentSnapshotProcessCodeCandidates = (process: any): string[] => {
  const bucket = new Set<string>();
  const pushCode = (value: any) => {
    const key = normalizeProcessCodeKey(value);
    if (key) bucket.add(key);
  };

  pushCode(process?.processCode);
  pushCode(process?.code);
  const processKey = resolveOptionalString(process?.processKey, null);
  if (processKey) {
    pushCode(processKey);
    const instancePatternMatch = processKey.match(/^(.*)-\d+-\d+$/);
    if (instancePatternMatch?.[1]) {
      pushCode(instancePatternMatch[1]);
    }
  }
  return Array.from(bucket.values());
};
// syncAssignmentPlanColorRefs was retired in Phase D
// (AssignmentCard/AssignmentPlan FK+join redesign) along with
// AssignmentPlan.colorId/colorName - color/gender were never tracked at the
// assignment level (the frontend never sent a real color, so this function's
// AttrColor lookup always no-op'd in practice).
const toAssignmentPlanWriteData = (
  item: any,
  cardIdToAssignmentCardId?: Map<
    string,
    { id: number; styleId: number | null; workOrderId: number | null; buyerOrgId: number | null }
  >
) => {
  const assignmentCtSnapshot = resolveNormalizedAssignmentCtSnapshot(item);
  const ctTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...item,
    assignmentCtSnapshot,
  });
  const cardIdString = resolveOptionalString(item?.cardId, null);
  const matchedCard =
    cardIdString && cardIdToAssignmentCardId
      ? cardIdToAssignmentCardId.get(cardIdString) ?? null
      : null;
  // Real FK (AGENTS.md 43), replacing the "cardId string happens to match"
  // convention. cardId itself is still written below as the stable external
  // board identifier, but joins must use assignmentCardId/styleId/workOrderId.
  const assignmentCardId = matchedCard?.id ?? null;
  // Real FK (Phase B of the AssignmentCard/AssignmentPlan FK+join redesign):
  // styleId/buyerOrgId always come from the matched AssignmentCard, never
  // re-derived independently, so a plan always agrees with the card it was
  // scheduled from.
  const styleId = matchedCard?.styleId ?? null;
  const buyerOrgId = matchedCard?.buyerOrgId ?? null;
  const workOrderId =
    toPositiveIntOrNull(matchedCard?.workOrderId) ?? toPositiveIntOrNull(item?.workOrderId);
  // Completion state is owned by dedicated completion endpoints.
  // Assignment board save must not overwrite completion-related fields.
  return {
    lineId: item.lineId,
    cardId: item.cardId ?? null,
    assignmentCardId,
    styleId,
    buyerOrgId,
    workOrderId,
    // orderNo/customer/label/previewUrl dropped in Phase E, and
    // colorId/colorName/color/stripeColor/imageUrl/thumbnailUrl dropped in
    // Phase D - see the comment in toAssignmentPlanResponse. Not written
    // anymore even if a client still sends them (harmless extra JSON keys).
    assignmentQuantity: item.assignmentQuantity ?? item.quantity ?? null,
    originOrderId: item.originOrderId ?? null,
    basis: item.basis ?? null,
    assignmentCtTotalSeconds: ctTotalSeconds,
    assignmentCtSnapshot: (assignmentCtSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
    assignmentStTotalSeconds: resolveStateAssignmentStTotalSeconds(item),
    startIndex: item.startIndex,
    endIndex: item.endIndex,
    startDayOffsetPercent: item.startDayOffsetPercent ?? null,
    startDayPercent: item.startDayPercent ?? null,
    endDayPercent: item.endDayPercent ?? null,
    updatedAt: new Date(),
  };
};
// Diagnostic-only coverage check for newly created AssignmentPlan rows. The
// save path now refreshes editable CT snapshots from the live style-process
// mirror and then blocks if a usable CT snapshot still cannot be built, so
// this helper should not be the final safety gate. It remains useful for
// surfacing process-code coverage drift after a create.
const validateNewAssignmentPlanCtSnapshotProcesses = async ({
  createPlanRows,
  cardIdToAssignmentCardId,
  db,
}: {
  createPlanRows: any[];
  cardIdToAssignmentCardId: Map<
    string,
    { id: number; styleId: number | null; workOrderId: number | null; buyerOrgId: number | null }
  >;
  db: any;
}) => {
  if (createPlanRows.length === 0) return;

  const styleIdByExternalId = new Map<string, number>();
  const styleIdsToCheck = new Set<number>();
  createPlanRows.forEach((item) => {
    const externalId = resolveAssignmentExternalId(item);
    const cardId = resolveOptionalString(item?.cardId, null);
    const styleId = cardId ? cardIdToAssignmentCardId.get(cardId)?.styleId ?? null : null;
    if (externalId && styleId !== null) {
      styleIdByExternalId.set(externalId, styleId);
      styleIdsToCheck.add(styleId);
    }
  });
  if (styleIdsToCheck.size === 0) return;

  const styleProcessRowsByStyleId = await loadStyleProcessRowsByStyleId(
    Array.from(styleIdsToCheck),
    { db }
  );

  const issues: { externalId: string; styleId: number; missingProcessCodes: string[] }[] = [];
  createPlanRows.forEach((item) => {
    const externalId = resolveAssignmentExternalId(item);
    if (!externalId) return;
    const styleId = styleIdByExternalId.get(externalId);
    if (styleId === undefined) return;
    const liveProcessRows = styleProcessRowsByStyleId.get(styleId) ?? [];
    if (liveProcessRows.length === 0) return;

    const snapshot = resolveNormalizedAssignmentCtSnapshot(item);
    const snapshotCodes = new Set<string>();
    ensureArray(snapshot?.processes).forEach((process: any) => {
      resolveAssignmentSnapshotProcessCodeCandidates(process).forEach((code) =>
        snapshotCodes.add(code)
      );
    });

    const missingProcessCodes = liveProcessRows
      .filter((row: any) => {
        const key = normalizeProcessCodeKey(row?.processCode);
        return key && !snapshotCodes.has(key);
      })
      .map((row: any) => row.processCode);

    if (missingProcessCodes.length > 0) {
      issues.push({ externalId, styleId, missingProcessCodes });
    }
  });

  if (issues.length > 0) {
    // Non-blocking diagnostic only. The final save gate runs earlier in the
    // PUT flow after the server has attempted a live style-process refresh;
    // if CT is still unusable there, the save has already been rejected.
    console.warn(
      `[assignment-board-state] new assignment CT snapshot missing current style processes (not blocking save): ${issues
        .map(
          (issue) =>
            `${issue.externalId} (style ${issue.styleId}: ${issue.missingProcessCodes.join(", ")})`
        )
        .join("; ")}`
    );
  }
};
const COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  workOrderId: true,
  // styleId/buyerOrgId: real scalar FK columns on AssignmentPlan (not a join-
  // only value), so selecting them directly here is safe. Added alongside the
  // toAssignmentPlanResponse fix so a genuine attempt to change a completed
  // assignment's style/buyer FK is caught here with an explicit field name
  // instead of silently passing this guard and failing opaquely later at the
  // updateMany(isCompleted:false) fallback.
  styleId: true,
  buyerOrgId: true,
  // orderNo/customer/label/previewUrl dropped in Phase E - see the comment in
  // toAssignmentPlanResponse. They're no longer real write fields, so they're
  // no longer part of the completed-assignment structural-change comparison
  // below either.
  assignmentQuantity: true,
  originOrderId: true,
  basis: true,
  assignmentCtTotalSeconds: true,
  assignmentCtSnapshot: true,
  assignmentStTotalSeconds: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  isCompleted: true,
};
const normalizeAssignmentLineIdForWriteCompare = (value: any): number | null => {
  const lineId = toNumberOrNull(value);
  return typeof lineId === "number" && Number.isFinite(lineId)
    ? Math.round(lineId)
    : null;
};
const buildCompletedAssignmentWriteComparable = (item: any) => {
  const assignmentCtSnapshot = normalizeAssignmentCtSnapshot(
    item?.assignmentCtSnapshot ?? item?.ctSnapshot
  );
  const assignmentCtTotalSeconds = resolveAssignmentCtTotalSeconds({
    ...item,
    assignmentCtSnapshot,
  });
  return {
    lineId: normalizeAssignmentLineIdForWriteCompare(item?.lineId),
    cardId: resolveOptionalString(item?.cardId, null),
    workOrderId: toPositiveIntOrNull(item?.workOrderId),
    // Accept either shape: a raw AssignmentPlan row (scalar styleId/buyerOrgId,
    // e.g. COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT) or a normalized board-state
    // item (flat styleId/buyerOrgId once present, or the style/buyerOrg join
    // objects some callers still pass through).
    styleId: toPositiveIntOrNull(item?.styleId ?? item?.style?.id),
    buyerOrgId: toPositiveIntOrNull(item?.buyerOrgId ?? item?.buyerOrg?.id),
    assignmentQuantity: toOptionalNonNegativeInt(
      item?.assignmentQuantity ?? item?.quantity,
      null
    ),
    originOrderId: resolveOptionalString(item?.originOrderId, null),
    basis: resolveOptionalString(item?.basis, null),
    assignmentCtTotalSeconds,
    assignmentCtSnapshot,
    assignmentStTotalSeconds: resolveComparableAssignmentStTotalSeconds(item),
    startIndex: toSignedInt(item?.startIndex, 0),
    endIndex: Math.max(
      toSignedInt(item?.startIndex, 0),
      toSignedInt(item?.endIndex, toSignedInt(item?.startIndex, 0))
    ),
    startDayOffsetPercent: toOptionalFloat(item?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(item?.startDayPercent, null),
    endDayPercent: toOptionalFloat(item?.endDayPercent, null),
  };
};
const listCompletedAssignmentWriteDiffFields = (current: any, incoming: any): string[] => {
  const currentComparable = buildCompletedAssignmentWriteComparable(current);
  const incomingComparable = buildCompletedAssignmentWriteComparable(incoming);
  return Object.keys(currentComparable).filter(
    (key) =>
      toStableJsonText((currentComparable as any)[key]) !==
      toStableJsonText((incomingComparable as any)[key])
  );
};
const normalizeAssignmentStDraftsPayload = (value: any) => {
  if (value === undefined) return new Map<string, Map<string, number>>();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "invalid stDrafts payload");
  }

  const result = new Map<string, Map<string, number>>();
  Object.entries(value).forEach(([rawExternalId, rawDraft]) => {
    const externalId = resolveOptionalString(rawExternalId, null);
    if (!externalId) return;
    if (rawDraft === undefined) return;
    if (rawDraft === null || typeof rawDraft !== "object" || Array.isArray(rawDraft)) {
      throw createHttpError(400, "invalid stDrafts assignment entry");
    }

    const processDrafts = new Map<string, number>();
    Object.entries(rawDraft).forEach(([rawProcessKey, rawSeconds]) => {
      const processKey = resolveOptionalString(rawProcessKey, null);
      if (!processKey) return;
      const seconds = toOptionalProcessSeconds(rawSeconds);
      if (seconds === null || seconds <= 0) {
        throw createHttpError(400, "invalid stDrafts seconds");
      }
      processDrafts.set(processKey, seconds);
    });

    if (processDrafts.size > 0) {
      result.set(externalId, processDrafts);
    }
  });
  return result;
};

const buildAssignmentStDraftWarnings = ({
  assignmentExternalId,
  processKeys,
  reason,
}: {
  assignmentExternalId: string;
  processKeys: string[];
  reason: string;
}) =>
  processKeys.map((processKey) => ({
    type: "ST_DRAFT_PROCESS_IGNORED",
    assignmentId: assignmentExternalId,
    processKey,
    reason,
  }));

const resolveAssignmentStyleIdForStCalculation = ({
  assignment,
  cardById,
}: {
  assignment: any;
  cardById: Map<string, any>;
}) => {
  const cardId = resolveOptionalString(
    assignment?.cardId ?? assignment?.originOrderId,
    null
  );
  const linkedCard = cardId ? cardById.get(cardId) ?? null : null;
  return toPositiveIntOrNull(assignment?.styleId ?? linkedCard?.styleId);
};

const buildStyleProcessLookupForStCalculation = (styleProcessRows: any[]) => {
  const byStyleIdAndProcessId = new Map<string, any>();

  ensureArray(styleProcessRows).forEach((row) => {
    const styleId = toPositiveIntOrNull(row?.styleId);
    const rowId = toPositiveIntOrNull(row?.id);
    if (styleId === null || rowId === null) return;
    byStyleIdAndProcessId.set(`${styleId}::${rowId}`, row);
  });

  const resolveRowForSnapshotProcess = (styleId: number, process: any) => {
    const styleProcessId = toPositiveIntOrNull(
      process?.styleProcessId ?? process?.processId
    );
    if (styleProcessId !== null) {
      const byId = byStyleIdAndProcessId.get(`${styleId}::${styleProcessId}`);
      if (byId) return byId;
    }
    return null;
  };

  return {
    resolveRowForSnapshotProcess,
  };
};

const resolveStyleProcessBucketStSeconds = (row: any, bucketQuantity: number) => {
  const standard = ensureArray(row?.standards).find(
    (item) =>
      toPositiveIntOrNull((item as any)?.bucketQuantity) ===
      bucketQuantity
  );
  const bucketStSeconds = toOptionalProcessSeconds((standard as any)?.bucketStSeconds);
  if (bucketStSeconds !== null) return bucketStSeconds;
  return null;
};

const calculateAssignmentStTotalSecondsFromStyleRows = ({
  styleProcessRows,
  assignmentQuantity,
  bucketQuantity,
}: {
  styleProcessRows: any[];
  assignmentQuantity: number;
  bucketQuantity: number;
}) => {
  let pieceStTotalSeconds = 0;
  const rows = ensureArray(styleProcessRows);
  if (rows.length === 0) return null;
  for (const row of rows) {
    const bucketStSeconds = resolveStyleProcessBucketStSeconds(row, bucketQuantity);
    if (bucketStSeconds === null) return null;
    pieceStTotalSeconds += bucketStSeconds;
  }
  return Math.max(0, Math.round(pieceStTotalSeconds * assignmentQuantity));
};

const calculateAssignmentStTotalSecondsFromSnapshotProcesses = ({
  snapshotProcesses,
  assignmentQuantity,
  bucketQuantity,
  styleId,
  styleProcessLookup,
}: {
  snapshotProcesses: any[];
  assignmentQuantity: number;
  bucketQuantity: number;
  styleId: number | null;
  styleProcessLookup: ReturnType<typeof buildStyleProcessLookupForStCalculation>;
}) => {
  let pieceStTotalSeconds = 0;
  const processes = ensureArray(snapshotProcesses);
  if (processes.length === 0) return null;
  for (const process of processes) {
    const matchedRow =
      styleId === null
        ? null
        : styleProcessLookup.resolveRowForSnapshotProcess(styleId, process);
    const bucketStSeconds =
      matchedRow !== null
        ? resolveStyleProcessBucketStSeconds(matchedRow, bucketQuantity)
        : null;
    if (bucketStSeconds === null) return null;
    pieceStTotalSeconds += bucketStSeconds;
  }
  return Math.max(0, Math.round(pieceStTotalSeconds * assignmentQuantity));
};

const hasAssignmentStructuralStChange = (assignment: any, existingPlan: any) => {
  if (!existingPlan) return true;
  const assignmentQuantity = toOptionalNonNegativeInt(assignment?.quantity, null);
  const existingQuantity = resolveAssignmentQuantity(existingPlan);
  if (assignmentQuantity !== existingQuantity) return true;

  const lineId = normalizeAssignmentLineIdForWriteCompare(assignment?.lineId);
  const existingLineId = normalizeAssignmentLineIdForWriteCompare(existingPlan?.lineId);
  if (lineId !== existingLineId) return true;

  const startIndex = toSignedInt(assignment?.startIndex, 0);
  const existingStartIndex = toSignedInt(existingPlan?.startIndex, 0);
  if (startIndex !== existingStartIndex) return true;

  const endIndex = Math.max(startIndex, toSignedInt(assignment?.endIndex, startIndex));
  const existingEndIndex = Math.max(
    existingStartIndex,
    toSignedInt(existingPlan?.endIndex, existingStartIndex)
  );
  return endIndex !== existingEndIndex;
};
const prepareAssignmentBoardStTotalsForSave = async ({
  organization,
  cards,
  assignments,
  existingPlanByExternalId,
  stDraftsByExternalId,
  db,
}: {
  organization: any;
  cards: any[];
  assignments: any[];
  existingPlanByExternalId: Map<string, any>;
  stDraftsByExternalId: Map<string, Map<string, number>>;
  db: any;
}) => {
  const normalizedAssignments = ensureArray(assignments).filter(
    (item) => item && typeof item === "object"
  );
  const warnings: any[] = [];
  const changedExternalIds = new Set<string>();
  if (normalizedAssignments.length === 0) {
    return { assignments: normalizedAssignments, warnings, changedExternalIds };
  }

  const cardById = ensureArray(cards).reduce((map, card) => {
    const cardId = resolveOptionalString(card?.id, null);
    if (!cardId || map.has(cardId)) return map;
    map.set(cardId, card);
    return map;
  }, new Map<string, any>());

  const targetByExternalId = new Map<string, any>();
  const assignmentStyleIds = new Set<number>();
  normalizedAssignments.forEach((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || Boolean(assignment?.isCompleted)) return;

    const existingPlan = existingPlanByExternalId.get(externalId) ?? null;
    const incomingAssignmentStTotalSeconds =
      resolveStateAssignmentStTotalSeconds(assignment);
    const stDrafts = stDraftsByExternalId.get(externalId) ?? new Map<string, number>();
    const hasStDrafts = stDrafts.size > 0;
    const hasStructuralChange = hasAssignmentStructuralStChange(assignment, existingPlan);
    const existingAssignmentStTotalSeconds =
      resolvePersistedAssignmentPlanStTotalSeconds(existingPlan);
    const hasUsableIncomingAssignmentSt =
      incomingAssignmentStTotalSeconds != null &&
      incomingAssignmentStTotalSeconds > 0;
    const isExistingAssignmentStMissingOrInvalid =
      existingAssignmentStTotalSeconds == null ||
      existingAssignmentStTotalSeconds <= 0;

    const styleId = resolveAssignmentStyleIdForStCalculation({
      assignment,
      cardById,
    });
    const shouldRecalculate =
      hasStDrafts ||
      (!hasUsableIncomingAssignmentSt &&
        (hasStructuralChange || isExistingAssignmentStMissingOrInvalid));
    if (shouldRecalculate && styleId !== null) assignmentStyleIds.add(styleId);

    targetByExternalId.set(externalId, {
      assignment,
      existingPlan,
      incomingAssignmentStTotalSeconds,
      hasUsableIncomingAssignmentSt,
      existingAssignmentStTotalSeconds,
      stDrafts,
      hasStDrafts,
      hasStructuralChange,
      styleId,
      shouldRecalculate,
    });
  });

  const recalcTargets = Array.from(targetByExternalId.values()).filter(
    (target) => target.shouldRecalculate
  );
  if (assignmentStyleIds.size === 0 && recalcTargets.length === 0) {
    const assignmentsWithExistingTotals = normalizedAssignments.map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      const target = externalId ? targetByExternalId.get(externalId) : null;
      const canonicalAssignmentStTotalSeconds =
        target?.hasUsableIncomingAssignmentSt
          ? target?.incomingAssignmentStTotalSeconds ?? null
          : target?.existingAssignmentStTotalSeconds ?? null;
      if (canonicalAssignmentStTotalSeconds === null) return assignment;
      if (
        externalId &&
        toOptionalNonNegativeInt(assignment?.stTotalSeconds, null) !==
        canonicalAssignmentStTotalSeconds
      ) {
        changedExternalIds.add(externalId);
      }
      return {
        ...assignment,
        stTotalSeconds: canonicalAssignmentStTotalSeconds,
      };
    });
    return { assignments: assignmentsWithExistingTotals, warnings, changedExternalIds };
  }

  const styles =
    assignmentStyleIds.size > 0
      ? await db.style.findMany({
          where: {
            id: { in: Array.from(assignmentStyleIds.values()) },
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            orgId: true,
            processes: true,
          },
        })
      : [];
  const styleByStyleId = ensureArray(styles).reduce((map, style) => {
    const styleId = toPositiveIntOrNull(style?.id);
    if (!styleId || styleId === null || map.has(styleId)) return map;
    map.set(styleId, style);
    return map;
  }, new Map<number, any>());

  const quantityByStyleId = new Map<number, Set<number>>();
  recalcTargets.forEach((target) => {
    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleId = toPositiveIntOrNull(style?.id);
    if (styleId === null) return;
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    const current = quantityByStyleId.get(styleId) ?? new Set<number>();
    current.add(bucketQuantity);
    quantityByStyleId.set(styleId, current);
  });

  const styleRowsForStCalculation = Array.from(styleByStyleId.values()) as any[];
  const styleIds = Array.from(
    new Set(
      styleRowsForStCalculation
        .map((style) => toPositiveIntOrNull(style?.id))
        .filter((styleId): styleId is number => styleId !== null)
    )
  );
  if (styleIds.length > 0) {
    await ensureStyleStandardsForQuantities({
      styles: styleRowsForStCalculation,
      quantityByStyleId,
      processOrgId: organization.id,
      db,
    });
  }

  let styleProcessRowsByStyleId =
    styleIds.length > 0
      ? await loadStyleProcessRowsByStyleId(styleIds, {
          processOrgId: organization.id,
          db,
        })
      : new Map<number, any[]>();
  let styleProcessLookup = buildStyleProcessLookupForStCalculation(
    Array.from(styleProcessRowsByStyleId.values()).flat()
  );

  const standardUpserts = new Map<
    string,
    { styleProcessId: number; bucketQuantity: number; bucketStSeconds: number }
  >();
  recalcTargets.forEach((target) => {
    if (!target.hasStDrafts) return;
    const externalId = resolveAssignmentExternalId(target.assignment);
    if (!externalId) return;

    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleId = toPositiveIntOrNull(style?.id);
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(target.assignment);
    const snapshotProcessByKey = ensureArray(ctSnapshot?.processes).reduce(
      (map, process) => {
        const styleProcessId = toPositiveIntOrNull(
          process?.styleProcessId ?? process?.processId
        );
        if (styleProcessId !== null) {
          const numericKey = String(styleProcessId);
          if (!map.has(numericKey)) map.set(numericKey, process);
          const canonicalKey = `style-process:${styleProcessId}`;
          if (!map.has(canonicalKey)) map.set(canonicalKey, process);
        }
        const processKey = resolveOptionalString(process?.processKey, null);
        if (!processKey || map.has(processKey)) return map;
        map.set(processKey, process);
        return map;
      },
      new Map<string, any>()
    );

    const missingProcessKeys: string[] = [];
    const unmatchedProcessKeys: string[] = [];
    target.stDrafts.forEach((bucketStSeconds: number, processKey: string) => {
      const snapshotProcess = snapshotProcessByKey.get(processKey) ?? null;
      if (!snapshotProcess) {
        missingProcessKeys.push(processKey);
        return;
      }
      if (styleId === null) {
        unmatchedProcessKeys.push(processKey);
        return;
      }
      const styleProcessRow = styleProcessLookup.resolveRowForSnapshotProcess(
        styleId,
        snapshotProcess
      );
      const styleProcessId = toPositiveIntOrNull(styleProcessRow?.id);
      if (styleProcessId === null) {
        unmatchedProcessKeys.push(processKey);
        return;
      }
      standardUpserts.set(`${styleProcessId}::${bucketQuantity}`, {
        styleProcessId,
        bucketQuantity,
        bucketStSeconds,
      });
    });

    warnings.push(
      ...buildAssignmentStDraftWarnings({
        assignmentExternalId: externalId,
        processKeys: missingProcessKeys,
        reason: "processKey not found in assignment snapshot",
      }),
      ...buildAssignmentStDraftWarnings({
        assignmentExternalId: externalId,
        processKeys: unmatchedProcessKeys,
        reason: "processKey not matched to style process standard",
      })
    );
  });

  if (standardUpserts.size > 0) {
    const now = new Date();
    await Promise.all(
      Array.from(standardUpserts.values()).map((item) =>
        db.styleProcessStandard.upsert({
          where: {
            styleProcessId_bucketQuantity: {
              styleProcessId: item.styleProcessId,
              bucketQuantity: item.bucketQuantity,
            },
          },
          create: {
            orgId: organization.id,
            styleProcessId: item.styleProcessId,
            bucketQuantity: item.bucketQuantity,
            bucketStSeconds: item.bucketStSeconds,
            setBy: "ASSIGNMENT_DETAIL",
            setAt: now,
          },
          update: {
            bucketStSeconds: item.bucketStSeconds,
            setBy: "ASSIGNMENT_DETAIL",
            setAt: now,
          },
        })
      )
    );

    styleProcessRowsByStyleId = await loadStyleProcessRowsByStyleId(styleIds, {
      processOrgId: organization.id,
      db,
    });
    styleProcessLookup = buildStyleProcessLookupForStCalculation(
      Array.from(styleProcessRowsByStyleId.values()).flat()
    );
  }

  const assignmentStTotalSecondsByExternalId = new Map<string, number>();
  targetByExternalId.forEach((target, externalId) => {
    if (!target.shouldRecalculate) {
      const canonicalAssignmentStTotalSeconds =
        target.hasUsableIncomingAssignmentSt
          ? target.incomingAssignmentStTotalSeconds
          : target.existingAssignmentStTotalSeconds;
      if (canonicalAssignmentStTotalSeconds !== null) {
        assignmentStTotalSecondsByExternalId.set(
          externalId,
          canonicalAssignmentStTotalSeconds
        );
      }
      return;
    }

    const style = target.styleId ? styleByStyleId.get(target.styleId) ?? null : null;
    const styleId = toPositiveIntOrNull(style?.id);
    const assignmentQuantity = toPositiveInt(target.assignment?.quantity, 1);
    const bucketQuantity = resolveStBucketQuantity(assignmentQuantity);
    let assignmentStTotalSeconds: number | null = null;

    if (target.hasStructuralChange) {
      const styleProcessRows =
        styleId === null ? [] : styleProcessRowsByStyleId.get(styleId) ?? [];
      assignmentStTotalSeconds = calculateAssignmentStTotalSecondsFromStyleRows({
        styleProcessRows,
        assignmentQuantity,
        bucketQuantity,
      });
    } else {
      const ctSnapshot = resolveNormalizedAssignmentCtSnapshot(target.assignment);
      assignmentStTotalSeconds = calculateAssignmentStTotalSecondsFromSnapshotProcesses({
        snapshotProcesses: ensureArray(ctSnapshot?.processes),
        assignmentQuantity,
        bucketQuantity,
        styleId,
        styleProcessLookup,
      });
    }

    if (assignmentStTotalSeconds === null) {
      throw createHttpError(
        409,
        `assignment ST total cannot be recalculated: ${externalId}`
      );
    }
    assignmentStTotalSecondsByExternalId.set(externalId, assignmentStTotalSeconds);
  });

  const nextAssignments = normalizedAssignments.map((assignment) => {
    const externalId = resolveAssignmentExternalId(assignment);
    if (!externalId || !assignmentStTotalSecondsByExternalId.has(externalId)) {
      return assignment;
    }
    const assignmentStTotalSeconds =
      assignmentStTotalSecondsByExternalId.get(externalId) ?? null;
    if (
      assignmentStTotalSeconds !== null &&
      toOptionalNonNegativeInt(assignment?.stTotalSeconds, null) !==
        assignmentStTotalSeconds
    ) {
      changedExternalIds.add(externalId);
    }
    return {
      ...assignment,
      stTotalSeconds: assignmentStTotalSeconds,
    };
  });

  return { assignments: nextAssignments, warnings, changedExternalIds };
};
const toAssignmentBoardStateResponse = (
  state: any,
  assignmentPlans: any[] | null = null,
  cards: any[] | null = null
) => {
  const planAssignments = Array.isArray(assignmentPlans)
    ? assignmentPlans.map((plan) => toAssignmentPlanResponse(plan))
    : [];
  return {
    cards: Array.isArray(cards) ? cards : [],
    assignments: normalizeStateAssignments(planAssignments),
    createdAt: state?.createdAt ?? null,
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  };
};
// Shared relation shape for any `findUnique`/`findFirst` call that needs
// orderNo/customer/label/previewUrl (Phase E dropped those as stored
// columns - this is the only remaining source, same fields as
// ASSIGNMENT_PLAN_SELECT_CORE's relations below, just for `include` instead
// of `select` call sites that otherwise want every scalar column).
const ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE = {
  workOrder: { select: { id: true, orderNumber: true } },
  style: { select: { id: true, name: true, code: true, imageUrls: true } },
  buyerOrg: { select: { id: true, name: true, nameKo: true, nameVi: true } },
} as const;
const ASSIGNMENT_PLAN_SELECT_CORE = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  workOrderId: true,
  // orderNo/customer/label/previewUrl dropped in Phase E, and
  // colorId/colorName/color/stripeColor/imageUrl/thumbnailUrl dropped in
  // Phase D - see the comment in toAssignmentPlanResponse.
  assignmentQuantity: true,
  originOrderId: true,
  basis: true,
  assignmentCtTotalSeconds: true,
  assignmentCtSnapshot: true,
  assignmentStTotalSeconds: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  createdAt: true,
  updatedAt: true,
  // Phase C (AssignmentCard/AssignmentPlan FK+join redesign): the only source
  // of orderNo/customer/label/previewUrl now that Phase E dropped the text
  // columns. workOrderId/styleId/buyerOrgId are enforced present by the
  // startup hasField gate, so these relations are safe on every select
  // attempt including the "legacy" one below.
  workOrder: { select: { id: true, orderNumber: true } },
  style: { select: { id: true, name: true, code: true, imageUrls: true } },
  buyerOrg: { select: { id: true, name: true, nameKo: true, nameVi: true } },
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_CLOSE = {
  ...ASSIGNMENT_PLAN_SELECT_CORE,
  isCompleted: true,
  finalQuantity: true,
  completedAt: true,
  closedQty: true,
  closedAt: true,
  closedBy: true,
  closeMode: true,
  closeBasis: true,
} as const;
const ASSIGNMENT_PLAN_SELECT_FOR_BOARD_SAVE = {
  ...ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
  productionCompletedAt: true,
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION = {
  ...ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
  productionCompletedAt: true,
  actualProducedCompletedAt: true,
  candidateEndDate: true,
  renderEndDate: true,
  forecastCompletedAt: true,
  forecastBasis: true,
  confidence: true,
  scheduleStatus: true,
} as const;
// Legacy fallback: excludes stTotalSeconds/ctTotalSeconds for DB schema drift tolerance
const ASSIGNMENT_PLAN_SELECT_LEGACY = {
  id: true,
  externalId: true,
  lineId: true,
  cardId: true,
  assignmentQuantity: true,
  originOrderId: true,
  basis: true,
  assignmentCtSnapshot: true,
  startIndex: true,
  endIndex: true,
  startDayOffsetPercent: true,
  startDayPercent: true,
  endDayPercent: true,
  createdAt: true,
  updatedAt: true,
  // See the comment on ASSIGNMENT_PLAN_SELECT_CORE above - orderNo/customer/
  // label/previewUrl only ever come from these relations now, so this
  // "legacy" (schema-drift-tolerant) select needs them just as much.
  workOrder: { select: { id: true, orderNumber: true } },
  style: { select: { id: true, name: true, code: true, imageUrls: true } },
  buyerOrg: { select: { id: true, name: true, nameKo: true, nameVi: true } },
} as const;
const ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY = {
  ...ASSIGNMENT_PLAN_SELECT_LEGACY,
  isCompleted: true,
  finalQuantity: true,
  completedAt: true,
  closedQty: true,
  closedAt: true,
  closedBy: true,
  closeMode: true,
  closeBasis: true,
} as const;
const isAssignmentPlanMissingColumnError = (error: any): boolean => {
  const code = resolveOptionalString(error?.code, null);
  if (code === "P2022") return true;
  const message = resolveOptionalString(error?.message, String(error || "")) || "";
  return /column/i.test(message) && /does not exist/i.test(message);
};
const findAssignmentPlansWithSelectFallback = async ({
  where,
  orderBy,
  selectAttempts,
  context,
}: {
  where: Prisma.AssignmentPlanWhereInput;
  orderBy: Prisma.AssignmentPlanOrderByWithRelationInput[];
  selectAttempts: ReadonlyArray<Record<string, any>>;
  context: string;
}): Promise<any[]> => {
  let lastError: any = null;
  for (let index = 0; index < selectAttempts.length; index += 1) {
    const select = selectAttempts[index]!;
    try {
      return await prisma.assignmentPlan.findMany({
        where,
        orderBy,
        select: select as any,
      });
    } catch (error) {
      lastError = error;
      if (!isAssignmentPlanMissingColumnError(error) || index >= selectAttempts.length - 1) {
        throw error;
      }
      const missingColumn =
        resolveOptionalString((error as any)?.meta?.column, null) || "unknown";
      console.warn(
        `[assignment-plan] ${context}: missing column '${missingColumn}', retrying with legacy select`
      );
    }
  }
  throw lastError;
};
const repairAssignmentPlanFkRefsFromAssignmentCards = async (
  orgId: number,
  db: any = prisma
): Promise<{ updatedCount: number; skippedCount: number }> => {
  const plans = await db.assignmentPlan.findMany({
    where: {
      orgId,
      assignmentCardId: { not: null },
      OR: [{ workOrderId: null }, { styleId: null }, { buyerOrgId: null }],
    },
    select: {
      id: true,
      externalId: true,
      workOrderId: true,
      styleId: true,
      buyerOrgId: true,
      assignmentCard: {
        select: {
          workOrderId: true,
          styleId: true,
          buyerOrgId: true,
        },
      },
    },
  });

  let updatedCount = 0;
  let skippedCount = 0;
  for (const plan of plans) {
    const card = plan?.assignmentCard ?? null;
    const data: Record<string, number> = {};
    const cardWorkOrderId = toPositiveIntOrNull(card?.workOrderId);
    const cardStyleId = toPositiveIntOrNull(card?.styleId);
    const cardBuyerOrgId = toPositiveIntOrNull(card?.buyerOrgId);
    if (toPositiveIntOrNull(plan?.workOrderId) === null && cardWorkOrderId !== null) {
      data.workOrderId = cardWorkOrderId;
    }
    if (toPositiveIntOrNull(plan?.styleId) === null && cardStyleId !== null) {
      data.styleId = cardStyleId;
    }
    if (toPositiveIntOrNull(plan?.buyerOrgId) === null && cardBuyerOrgId !== null) {
      data.buyerOrgId = cardBuyerOrgId;
    }
    if (Object.keys(data).length === 0) {
      skippedCount += 1;
      continue;
    }
    await db.assignmentPlan.update({
      where: { id: plan.id },
      data,
    });
    updatedCount += 1;
  }

  if (updatedCount > 0 || skippedCount > 0) {
    console.warn(
      `[assignment-board-state] orgId=${orgId} repaired missing AssignmentPlan FK refs from AssignmentCard: updated=${updatedCount} skipped=${skippedCount}`
    );
  }

  return { updatedCount, skippedCount };
};
const loadAssignmentPlansForBoardState = async (orgId: number) => {
  return findAssignmentPlansWithSelectFallback({
    where: { orgId },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
    context: "loadAssignmentPlansForBoardState",
  });
};
const loadAssignmentPlanRowsForBoardTx = async (orgId: number, db: any) =>
  db.assignmentPlan.findMany({
    where: { orgId },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    select: ASSIGNMENT_PLAN_SELECT_FOR_BOARD_SAVE as any,
  });
const buildReadOnlyAssignmentBoardStateResponse = async (
  orgId: number,
  state: any,
  options: {
    includeCards?: boolean;
    includePlans?: boolean;
  } = {}
) => {
  const includeCards = options.includeCards !== false;
  const includePlans = options.includePlans !== false;
  const nextState = state ?? null;
  if (includePlans) {
    await repairAssignmentPlanFkRefsFromAssignmentCards(orgId);
  }
  const assignmentPlans = includePlans
    ? await annotateAssignmentPlanRowsWithPayrollLocks(
        orgId,
        await loadAssignmentPlansForBoardState(orgId)
      )
    : null;
  const cards = includeCards ? await loadAssignmentCardsForOrg({ orgId }) : [];
  return toAssignmentBoardStateResponse(nextState, assignmentPlans, cards);
};

const closeActiveLineAssignments = async (employeeId: number, endedAt: Date = new Date()) => {
  const activeAssignments = await prisma.lineAssignment.findMany({
    where: { employeeId, endAt: null },
    select: { lineId: true },
  });

  if (activeAssignments.length === 0) {
    return [];
  }

  const lineIds = activeAssignments.map((item) => item.lineId);
  await prisma.lineAssignment.updateMany({
    where: { employeeId, endAt: null },
    data: { endAt: endedAt },
  });

  await prisma.line.updateMany({
    where: { id: { in: lineIds }, managerEmployeeId: employeeId },
    data: { managerEmployeeId: null },
  });

  await prisma.employee.updateMany({
    where: { id: employeeId },
    data: { lineId: null },
  });

  return lineIds;
};

const seedAttributesIfEmpty = async (
  orgId: number,
  options: {
    includeColors?: boolean;
    includeCategories?: boolean;
    includeProcesses?: boolean;
  } = {}
) => {
  const includeColors = options.includeColors !== false;
  const includeCategories = options.includeCategories !== false;
  const includeProcesses = options.includeProcesses !== false;
  const [colorCount, categoryCount, processCount] = await Promise.all([
    includeColors ? prisma.attrColor.count() : Promise.resolve(0),
    includeCategories
      ? prisma.attrCategory.count({ where: { orgId } })
      : Promise.resolve(0),
    includeProcesses
      ? prisma.attrProcess.count({ where: { orgId } })
      : Promise.resolve(0),
  ]);

  const tasks: Prisma.PrismaPromise<any>[] = [];
  if (includeColors && colorCount === 0) {
    tasks.push(
      prisma.attrColor.createMany({
        data: DEFAULT_ATTRIBUTES.colors.map((item) => ({
          ...item,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (includeCategories && categoryCount === 0) {
    tasks.push(
      prisma.attrCategory.createMany({
        data: DEFAULT_ATTRIBUTES.categories.map((item) => ({
          ...item,
          orgId,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (includeProcesses && processCount === 0) {
    tasks.push(
      prisma.attrProcess.createMany({
        data: DEFAULT_ATTRIBUTES.processes.map((item) => ({
          ...item,
          orgId,
          nameEn: item.name,
        })),
        skipDuplicates: true,
      })
    );
  }
  if (tasks.length > 0) {
    await prisma.$transaction(tasks);
  }
};

const resolveEmployeeStoredPayType = async ({
  orgId,
  membershipRole,
  roleId,
  payType,
}: {
  orgId: number;
  membershipRole: OrgUserRole;
  roleId: number | null;
  payType: unknown;
}): Promise<"CT" | "FIXED"> => {
  if (membershipRole !== "WORKER") return "FIXED";

  const explicitPayType = normalizePayType(payType, null);
  if (explicitPayType) return explicitPayType;

  const normalizedRoleId = Number(roleId);
  if (Number.isSafeInteger(normalizedRoleId) && normalizedRoleId > 0) {
    const role = await prisma.attrRole.findFirst({
      where: { id: normalizedRoleId, orgId },
      select: { defaultPayType: true },
    });
    return resolveRoleDefaultPayType(role);
  }

  return "FIXED";
};

const toAttrRoleResponse = (role: any) => ({
  id: role?.id ?? null,
  code: String(role?.code ?? "").trim(),
  name: String(role?.name ?? "").trim(),
  defaultPayType: resolveRoleDefaultPayType(role),
  sortOrder: toSortOrder(role?.sortOrder, 0),
});

const resolveManagedAttributeNameData = (item: any) => {
  const fallbackName = resolveOptionalString(item?.name, null);
  const nameKo = resolveOptionalString(item?.nameKo, null);
  const nameEn = resolveOptionalString(item?.nameEn, null) ?? fallbackName;
  const nameVi = resolveOptionalString(item?.nameVi, null);
  const name = nameEn ?? fallbackName ?? nameKo ?? nameVi ?? "";
  return {
    name,
    nameKo,
    nameEn,
    nameVi,
  };
};

const capitalizeAttributeDisplayName = (value: string | null) => {
  const text = resolveOptionalString(value, null);
  if (!text) return null;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const resolveManagedColorNameData = (item: any) => {
  const base = resolveManagedAttributeNameData(item);
  const nameEn = capitalizeAttributeDisplayName(base.nameEn);
  const nameVi = capitalizeAttributeDisplayName(base.nameVi);
  const name = capitalizeAttributeDisplayName(nameEn ?? base.name) ?? "";
  return {
    name,
    nameKo: base.nameKo,
    nameEn,
    nameVi,
  };
};

type ProcessMasterOptionType =
  | "LOCATION"
  | "TARGET"
  | "TARGET_SPEC"
  | "ACTION"
  | "ACTION_SPEC";

type ProcessMasterOptionGroupKey =
  | "locations"
  | "targets"
  | "targetSpecs"
  | "actions"
  | "actionSpecs";

type ProcessMasterRelationType =
  | "TARGET_TARGET_SPEC"
  | "ACTION_ACTION_SPEC"
  | "TARGET_TARGET";

type ProcessMasterRelationGroupKey =
  | "targetToTargetSpecs"
  | "actionToActionSpecs"
  | "targetToTargets";

type ProcessMasterOptionRow = {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string | null;
  nameEn: string | null;
  nameVi: string | null;
  sortOrder: number;
};

type ProcessMasterRelationRow = {
  id: number;
  type: ProcessMasterRelationType;
  parentOptionId: number;
  childOptionId: number;
  parentCode: string;
  childCode: string;
};

const PROCESS_MASTER_TYPE_KEYS = [
  "LOCATION",
  "TARGET",
  "TARGET_SPEC",
  "ACTION",
  "ACTION_SPEC",
] as const;

const PROCESS_MASTER_GROUP_BY_TYPE: Record<
  ProcessMasterOptionType,
  ProcessMasterOptionGroupKey
> = {
  LOCATION: "locations",
  TARGET: "targets",
  TARGET_SPEC: "targetSpecs",
  ACTION: "actions",
  ACTION_SPEC: "actionSpecs",
};
const PROCESS_MASTER_COMPOSITION_GROUP_BY_TYPE: Record<
  ProcessMasterOptionType,
  ProcessMasterOptionGroupKey
> = {
  LOCATION: "locations",
  TARGET: "targets",
  ACTION: "actions",
  TARGET_SPEC: "targetSpecs",
  ACTION_SPEC: "actionSpecs",
};

const PROCESS_MASTER_FALLBACK_CODE_BY_TYPE: Record<ProcessMasterOptionType, string> = {
  LOCATION: "LOCATION",
  TARGET: "TARGET",
  ACTION: "ACTION",
  TARGET_SPEC: "TARGET_SPEC",
  ACTION_SPEC: "ACTION_SPEC",
};

const PROCESS_MASTER_RELATION_TYPE_KEYS = [
  "TARGET_TARGET_SPEC",
  "ACTION_ACTION_SPEC",
  "TARGET_TARGET",
] as const;

const PROCESS_MASTER_RELATION_META: Record<
  ProcessMasterRelationType,
  {
    groupKey: ProcessMasterRelationGroupKey;
    parentType: ProcessMasterOptionType;
    childType: ProcessMasterOptionType;
  }
> = {
  TARGET_TARGET_SPEC: {
    groupKey: "targetToTargetSpecs",
    parentType: "TARGET",
    childType: "TARGET_SPEC",
  },
  ACTION_ACTION_SPEC: {
    groupKey: "actionToActionSpecs",
    parentType: "ACTION",
    childType: "ACTION_SPEC",
  },
  TARGET_TARGET: {
    groupKey: "targetToTargets",
    parentType: "TARGET",
    childType: "TARGET",
  },
};

type ProcessMasterSeedItem = {
  ko: string;
  en: string;
  vi: string;
};

const PROCESS_MASTER_DEFAULT_OPTIONS: Record<
  ProcessMasterOptionType,
  ProcessMasterSeedItem[]
> = {
  LOCATION: [
    { ko: "앞여밈", en: "Front opening", vi: "Nep truoc" },
    { ko: "앞목", en: "Front neckline", vi: "Co truoc" },
    { ko: "앞판", en: "Front panel", vi: "Than truoc" },
    { ko: "뒤목", en: "Back neckline", vi: "Co sau" },
    { ko: "뒤판", en: "Back panel", vi: "Than sau" },
    { ko: "소매", en: "Sleeve", vi: "Tay" },
    { ko: "어깨", en: "Shoulder", vi: "Vai" },
    { ko: "옆선", en: "Side seam", vi: "Suon" },
    { ko: "허리", en: "Waist", vi: "Eo" },
    { ko: "밑단", en: "Hem", vi: "Lai" },
    { ko: "칼라", en: "Collar", vi: "Co ao" },
  ],
  TARGET: [
    { ko: "주머니", en: "Pocket", vi: "Tui" },
    { ko: "지퍼", en: "Zipper", vi: "Day keo" },
    { ko: "페이싱", en: "Facing", vi: "Nep lot" },
    { ko: "요크", en: "Yoke", vi: "Cau vai" },
    { ko: "테이프", en: "Tape", vi: "Bang" },
    { ko: "바이어스", en: "Bias", vi: "Vien xeo" },
    { ko: "고무줄", en: "Elastic", vi: "Thun" },
    { ko: "시보리", en: "Rib", vi: "Cua bo" },
    { ko: "안감", en: "Lining", vi: "Lot trong" },
    { ko: "겉감", en: "Outer fabric", vi: "Lot ngoai" },
    { ko: "단추", en: "Button", vi: "Nut" },
    { ko: "스냅", en: "Snap", vi: "Nut bam" },
  ],
  ACTION: [
    { ko: "부착", en: "Attach", vi: "Gan" },
    { ko: "상침", en: "Topstitch", vi: "Di top" },
    { ko: "봉제", en: "Sew", vi: "May" },
    { ko: "연결", en: "Join", vi: "Noi" },
    { ko: "접기", en: "Fold", vi: "Gap" },
    { ko: "뒤집어 박기", en: "Turn-and-stitch", vi: "Lat va may" },
    { ko: "오버록", en: "Overlock", vi: "Vat so" },
    { ko: "시접정리", en: "Seam finish", vi: "Hoan tat duong may" },
    { ko: "검사", en: "Inspect", vi: "Kiem tra" },
    { ko: "다림", en: "Press", vi: "Ui" },
  ],
  TARGET_SPEC: [
  ],
  ACTION_SPEC: [
  ],
};

const normalizeProcessMasterType = (value: any): ProcessMasterOptionType | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    normalized === "LOCATION" ||
    normalized === "LOCATIONS" ||
    normalized === "PART" ||
    normalized === "PARTS"
  ) {
    return "LOCATION";
  }
  if (normalized === "TARGET" || normalized === "TARGETS") return "TARGET";
  if (
    normalized === "TARGET_SPEC" ||
    normalized === "TARGET_SPECS" ||
    normalized === "TARGETSPEC" ||
    normalized === "TARGETSPECS" ||
    normalized === "SPEC" ||
    normalized === "SPECS"
  ) {
    return "TARGET_SPEC";
  }
  if (normalized === "ACTION" || normalized === "ACTIONS") return "ACTION";
  if (
    normalized === "ACTION_SPEC" ||
    normalized === "ACTION_SPECS" ||
    normalized === "ACTIONSPEC" ||
    normalized === "ACTIONSPECS"
  ) {
    return "ACTION_SPEC";
  }
  return null;
};

const normalizeProcessMasterRelationType = (
  value: any
): ProcessMasterRelationType | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "TARGET_TARGET_SPEC" ||
    normalized === "TARGET_TO_TARGET_SPEC" ||
    normalized === "TARGET_SPEC_LINK"
  ) {
    return "TARGET_TARGET_SPEC";
  }
  if (
    normalized === "ACTION_ACTION_SPEC" ||
    normalized === "ACTION_TO_ACTION_SPEC" ||
    normalized === "ACTION_SPEC_LINK"
  ) {
    return "ACTION_ACTION_SPEC";
  }
  if (
    normalized === "TARGET_TARGET" ||
    normalized === "TARGET_TO_TARGET" ||
    normalized === "TARGET_LINK"
  ) {
    return "TARGET_TARGET";
  }
  return null;
};

const normalizeProcessMasterCode = (value: any): string =>
  normalizeManagedAttributeCode(value).replace(/-/g, "_");

const normalizeProcessMasterLabel = (value: any): string =>
  resolveOptionalString(value, null) ?? "";

const resolveProcessMasterNameData = (item: any) => {
  const nameKo = normalizeProcessMasterLabel(item?.nameKo);
  const nameEn = normalizeProcessMasterLabel(item?.nameEn);
  const nameVi = normalizeProcessMasterLabel(item?.nameVi);
  const fallback = normalizeProcessMasterLabel(
    item?.label ?? item?.name ?? item?.value
  );
  const resolvedNameKo = nameKo || fallback;
  const resolvedLabel = resolvedNameKo || nameEn || nameVi || fallback;

  return {
    nameKo: resolvedNameKo,
    nameEn,
    nameVi,
    label: resolvedLabel,
  };
};

const toProcessMasterOptionResponse = (row: any) => ({
  id: toPositiveIntOrNull(row?.id),
  type: normalizeProcessMasterType(row?.type),
  code: normalizeProcessMasterCode(row?.code),
  label: normalizeProcessMasterLabel(
    row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi
  ),
  nameKo: normalizeProcessMasterLabel(row?.nameKo ?? row?.label),
  nameEn: normalizeProcessMasterLabel(row?.nameEn),
  nameVi: normalizeProcessMasterLabel(row?.nameVi),
  sortOrder: toPositiveIntOrNull(row?.sortOrder) ?? 0,
});

const groupProcessMasterOptions = (rows: any[] = []) => {
  const grouped = {
    locations: [] as any[],
    targets: [] as any[],
    targetSpecs: [] as any[],
    actions: [] as any[],
    actionSpecs: [] as any[],
  };

  rows.forEach((row) => {
    const normalized = toProcessMasterOptionResponse(row);
    const type = normalizeProcessMasterType(normalized.type);
    if (!type) return;
    const groupKey = PROCESS_MASTER_GROUP_BY_TYPE[type];
    if (!groupKey) return;
    grouped[groupKey].push(normalized);
  });

  return grouped;
};

const toProcessMasterRelationResponse = (row: any) => ({
  id: toPositiveIntOrNull(row?.id),
  type: normalizeProcessMasterRelationType(row?.type),
  parentOptionId: toPositiveIntOrNull(row?.parentOptionId),
  childOptionId: toPositiveIntOrNull(row?.childOptionId),
  parentCode: normalizeProcessMasterCode(row?.parentCode),
  childCode: normalizeProcessMasterCode(row?.childCode),
});

const groupProcessMasterRelations = (rows: any[] = []) => {
  const grouped = {
    targetToTargetSpecs: [] as any[],
    actionToActionSpecs: [] as any[],
    targetToTargets: [] as any[],
  };

  rows.forEach((row) => {
    const normalized = toProcessMasterRelationResponse(row);
    const type = normalizeProcessMasterRelationType(normalized.type);
    if (!type) return;
    const meta = PROCESS_MASTER_RELATION_META[type];
    if (!meta) return;
    const relation = {
      id: normalized.id,
      type,
      parentOptionId: normalized.parentOptionId,
      childOptionId: normalized.childOptionId,
      parentCode: normalized.parentCode,
      childCode: normalized.childCode,
      ...(type === "TARGET_TARGET_SPEC"
        ? {
            targetCode: normalized.parentCode,
            targetSpecCode: normalized.childCode,
          }
        : type === "ACTION_ACTION_SPEC"
          ? {
              actionCode: normalized.parentCode,
              actionSpecCode: normalized.childCode,
            }
          : {
              targetCode: normalized.parentCode,
              linkedTargetCode: normalized.childCode,
            }),
    };
    grouped[meta.groupKey].push(relation);
  });

  return grouped;
};

const buildProcessMasterOptionsResponse = (
  optionRows: any[] = [],
  relationRows: any[] = [],
  usageConflicts: any[] = []
) => {
  const groupedOptions = groupProcessMasterOptions(optionRows);
  const groupedRelations = groupProcessMasterRelations(relationRows);
  return {
    ...groupedOptions,
    ...groupedRelations,
    relations: groupedRelations,
    usageConflicts: ensureArray(usageConflicts),
  };
};

const generateUniqueProcessMasterCode = ({
  type,
  label,
  usedCodes,
}: {
  type: ProcessMasterOptionType;
  label: string;
  usedCodes: Set<string>;
}) => {
  const fallback = PROCESS_MASTER_FALLBACK_CODE_BY_TYPE[type];
  const baseCode = normalizeProcessMasterCode(label) || fallback;
  let candidate = baseCode;
  let suffix = 2;
  while (usedCodes.has(candidate)) {
    candidate = `${baseCode}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const listProcessMasterOptionsWithDb = async (
  db: ProcessMasterStoreClient = prisma
): Promise<ProcessMasterOptionRow[]> =>
  db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    ORDER BY "type" ASC, "sortOrder" ASC, "id" ASC
  `);

const listProcessMasterOptions = async (): Promise<ProcessMasterOptionRow[]> =>
  listProcessMasterOptionsWithDb(prisma);

const countProcessMasterOptions = async () => {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ProcessMasterOption"
  `);
  return Number(rows[0]?.count ?? 0);
};

const insertProcessMasterOptions = async (
  rows: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }>
) => {
  if (rows.length === 0) return;
  const actor = getCurrentRequestActor();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProcessMasterOption" (
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder",
      "createdBy",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.type}::"ProcessMasterOptionType",
        ${row.code},
        ${row.label},
        ${row.nameKo || null},
        ${row.nameEn || null},
        ${row.nameVi || null},
        ${row.sortOrder},
        ${actor},
        NOW(),
        NOW()
      )`)
    )}
    ON CONFLICT ("type", "code") DO NOTHING
  `);
};

const deleteProcessMasterOptionsByIds = async (ids: number[]) => {
  if (ids.length === 0) return;
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "ProcessMasterOption" WHERE "id" IN (${Prisma.join(ids)})`
  );
};

const updateProcessMasterOptionRow = async (row: {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string;
  nameEn: string;
  nameVi: string;
  sortOrder: number;
}) => {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProcessMasterOption"
    SET
      "type" = ${row.type}::"ProcessMasterOptionType",
      "code" = ${row.code},
      "label" = ${row.label},
      "nameKo" = ${row.nameKo || null},
      "nameEn" = ${row.nameEn || null},
      "nameVi" = ${row.nameVi || null},
      "sortOrder" = ${row.sortOrder},
      "updatedAt" = NOW()
    WHERE "id" = ${row.id}
  `);
};

const listProcessMasterOptionRelations = async (): Promise<
  ProcessMasterRelationRow[]
> =>
  prisma.$queryRaw<ProcessMasterRelationRow[]>(Prisma.sql`
    SELECT
      relation."id",
      relation."type",
      relation."parentOptionId",
      relation."childOptionId",
      parent."code" AS "parentCode",
      child."code" AS "childCode"
    FROM "ProcessMasterOptionRelation" relation
    JOIN "ProcessMasterOption" parent
      ON parent."id" = relation."parentOptionId"
    JOIN "ProcessMasterOption" child
      ON child."id" = relation."childOptionId"
    ORDER BY
      relation."type" ASC,
      parent."sortOrder" ASC,
      parent."id" ASC,
      child."sortOrder" ASC,
      child."id" ASC,
      relation."id" ASC
  `);

const deleteProcessMasterOptionRelationsByIds = async (ids: number[]) => {
  if (ids.length === 0) return;
  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "ProcessMasterOptionRelation"
      WHERE "id" IN (${Prisma.join(ids)})
    `
  );
};

const insertProcessMasterOptionRelationsWithDb = async (
  db: ProcessMasterStoreClient,
  rows: Array<{
    type: ProcessMasterRelationType;
    parentOptionId: number;
    childOptionId: number;
  }>
) => {
  if (rows.length === 0) return;
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "ProcessMasterOptionRelation" (
        "type",
        "parentOptionId",
        "childOptionId",
        "createdAt",
        "updatedAt"
      )
      VALUES ${Prisma.join(
        rows.map((row) => Prisma.sql`(
          ${row.type},
          ${row.parentOptionId},
          ${row.childOptionId},
          NOW(),
          NOW()
        )`)
      )}
      ON CONFLICT ("type", "parentOptionId", "childOptionId") DO NOTHING
    `
  );
};

const insertProcessMasterOptionRelations = async (
  rows: Array<{
    type: ProcessMasterRelationType;
    parentOptionId: number;
    childOptionId: number;
  }>
) => insertProcessMasterOptionRelationsWithDb(prisma, rows);

const normalizeProcessMasterMatchToken = (value: any): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildProcessMasterMatchTokenSet = (row: Partial<ProcessMasterOptionRow>) => {
  const tokens = new Set<string>();
  [
    row?.code,
    row?.label,
    row?.nameKo,
    row?.nameEn,
    row?.nameVi,
  ].forEach((value) => {
    const token = normalizeProcessMasterMatchToken(value);
    if (token) tokens.add(token);
  });
  return tokens;
};

const PROCESS_MASTER_TYPE_CORRECTIONS: Array<{
  expectedType: ProcessMasterOptionType;
  aliases: string[];
}> = [
  {
    expectedType: "TARGET",
    aliases: ["주머니", "Pocket", "Tui", "POCKET"],
  },
];

const rowMatchesAliases = (row: Partial<ProcessMasterOptionRow>, aliases: Set<string>) => {
  const rowTokens = buildProcessMasterMatchTokenSet(row);
  for (const token of rowTokens) {
    if (aliases.has(token)) return true;
  }
  return false;
};

const applyProcessMasterTypeCorrections = async () => {
  const existing = await listProcessMasterOptions();
  if (existing.length === 0) return existing;

  let workingRows = [...existing];
  let hasChanges = false;

  for (const correction of PROCESS_MASTER_TYPE_CORRECTIONS) {
    const aliasSet = new Set(
      correction.aliases
        .map((alias) => normalizeProcessMasterMatchToken(alias))
        .filter(Boolean)
    );
    if (aliasSet.size === 0) continue;

    const misplacedRows = workingRows.filter(
      (row) =>
        row.type !== correction.expectedType &&
        rowMatchesAliases(row, aliasSet)
    );

    for (const row of misplacedRows) {
      const normalizedCode = normalizeProcessMasterCode(row.code);
      const duplicateInExpectedType = workingRows.find(
        (candidate) =>
          candidate.id !== row.id &&
          candidate.type === correction.expectedType &&
          (rowMatchesAliases(candidate, aliasSet) ||
            (normalizedCode &&
              normalizeProcessMasterCode(candidate.code) === normalizedCode))
      );

      if (duplicateInExpectedType) {
        await deleteProcessMasterOptionsByIds([row.id]);
        workingRows = workingRows.filter((candidate) => candidate.id !== row.id);
      } else {
        await updateProcessMasterOptionRow({
          id: row.id,
          type: correction.expectedType,
          code: row.code,
          label: row.label,
          nameKo: row.nameKo || "",
          nameEn: row.nameEn || "",
          nameVi: row.nameVi || "",
          sortOrder: row.sortOrder,
        });
        workingRows = workingRows.map((candidate) =>
          candidate.id === row.id
            ? { ...candidate, type: correction.expectedType }
            : candidate
        );
      }

      hasChanges = true;
    }
  }

  if (!hasChanges) return existing;
  return listProcessMasterOptions();
};

const ensureDefaultProcessMasterOptions = async () => {
  const existingCount = await countProcessMasterOptions();
  if (existingCount === 0) {
    const seedRows: Array<{
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number;
    }> = [];

    PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
      const type = typeKey as ProcessMasterOptionType;
      const usedCodes = new Set<string>();
      PROCESS_MASTER_DEFAULT_OPTIONS[type].forEach((item, index) => {
        const nameKo = normalizeProcessMasterLabel(item?.ko);
        const nameEn = normalizeProcessMasterLabel(item?.en);
        const nameVi = normalizeProcessMasterLabel(item?.vi);
        const label = nameKo || nameEn || nameVi;
        const codeSeedLabel = nameEn || nameKo || nameVi || label;
        const code = generateUniqueProcessMasterCode({
          type,
          label: codeSeedLabel,
          usedCodes,
        });
        usedCodes.add(code);
        seedRows.push({
          type,
          code,
          label,
          nameKo,
          nameEn,
          nameVi,
          sortOrder: index + 1,
        });
      });
    });

    if (seedRows.length > 0) {
      await insertProcessMasterOptions(seedRows);
    }
  }

  return applyProcessMasterTypeCorrections();
};

const flattenProcessMasterPayloadItems = (payload: any) => {
  const pushItems = (
    items: any[],
    type: ProcessMasterOptionType,
    target: Array<{
      id: number | null;
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number | null;
    }>
  ) => {
    ensureArray(items).forEach((item: any, index: number) => {
      if (typeof item === "string") {
        target.push({
          id: null,
          type,
          code: "",
          label: normalizeProcessMasterLabel(item),
          nameKo: normalizeProcessMasterLabel(item),
          nameEn: "",
          nameVi: "",
          sortOrder: index + 1,
        });
        return;
      }
      const itemType = normalizeProcessMasterType(item?.type) ?? type;
      if (!itemType) return;
      const nameData = resolveProcessMasterNameData(item);
      target.push({
        id: isNumericId(item?.id) ? toId(item.id) : null,
        type: itemType,
        code: normalizeProcessMasterCode(item?.code),
        label: nameData.label,
        nameKo: nameData.nameKo,
        nameEn: nameData.nameEn,
        nameVi: nameData.nameVi,
        sortOrder: toPositiveIntOrNull(item?.sortOrder),
      });
    });
  };

  const flattened: Array<{
    id: number | null;
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number | null;
  }> = [];

  if (Array.isArray(payload)) {
    payload.forEach((item: any, index: number) => {
      const type = normalizeProcessMasterType(item?.type);
      if (!type) return;
      const nameData = resolveProcessMasterNameData(item);
      flattened.push({
        id: isNumericId(item?.id) ? toId(item.id) : null,
        type,
        code: normalizeProcessMasterCode(item?.code),
        label: nameData.label,
        nameKo: nameData.nameKo,
        nameEn: nameData.nameEn,
        nameVi: nameData.nameVi,
        sortOrder: toPositiveIntOrNull(item?.sortOrder) ?? index + 1,
      });
    });
    return flattened;
  }

  pushItems(payload?.locations ?? payload?.parts, "LOCATION", flattened);
  pushItems(payload?.targets, "TARGET", flattened);
  pushItems(payload?.targetSpecs ?? payload?.specs, "TARGET_SPEC", flattened);
  pushItems(payload?.actions, "ACTION", flattened);
  pushItems(payload?.actionSpecs, "ACTION_SPEC", flattened);
  return flattened;
};

type ProcessMasterDeletionUsageConflict = {
  id: number;
  type: ProcessMasterOptionType;
  code: string;
  label: string;
  nameKo: string;
  nameEn: string;
  nameVi: string;
  styleProcessCount: number;
  referenceCount: number;
  sampleStyleProcessIds: number[];
};

type ProcessMasterOptionInUseError = Error & {
  status: number;
  code: "PROCESS_MASTER_OPTION_IN_USE";
  reason: "PROCESS_MASTER_OPTION_IN_USE";
  usageCount: number;
  conflicts: ProcessMasterDeletionUsageConflict[];
};

const findProcessMasterDeletionUsageConflicts = async (
  deleteRows: ProcessMasterOptionRow[]
): Promise<ProcessMasterDeletionUsageConflict[]> => {
  if (deleteRows.length === 0) return [];

  const tracked = new Map<
    string,
    {
      id: number;
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      styleProcessIds: Set<number>;
      referenceCount: number;
      sampleStyleProcessIds: number[];
    }
  >();

  deleteRows.forEach((row) => {
    const id = toPositiveIntOrNull(row?.id);
    const type = normalizeProcessMasterType(row?.type);
    const code = normalizeProcessMasterCode(row?.code);
    if (!id || !type || !code) return;
    const key = `${type}:${code}`;
    if (tracked.has(key)) return;
    const label =
      normalizeProcessMasterLabel(
        row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi ?? row?.code
      ) || code;
    tracked.set(key, {
      id,
      type,
      code,
      label,
      nameKo: normalizeProcessMasterLabel(row?.nameKo) || label,
      nameEn: normalizeProcessMasterLabel(row?.nameEn) || label,
      nameVi: normalizeProcessMasterLabel(row?.nameVi) || label,
      styleProcessIds: new Set<number>(),
      referenceCount: 0,
      sampleStyleProcessIds: [],
    });
  });
  if (tracked.size === 0) return [];

  const styleProcesses = await prisma.styleProcess.findMany({
    select: { id: true, processComposition: true },
    orderBy: { id: "asc" },
  });

  styleProcesses.forEach((styleProcess) => {
    const styleProcessId = toPositiveIntOrNull(styleProcess?.id);
    if (!styleProcessId) return;
    const composition = normalizeStyleProcessComposition(styleProcess?.processComposition);
    if (!composition) return;

    PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
      const type = typeKey as ProcessMasterOptionType;
      const groupKey = PROCESS_MASTER_COMPOSITION_GROUP_BY_TYPE[type];
      const entries = ensureArray((composition as any)?.[groupKey]);
      entries.forEach((entry) => {
        const code = normalizeProcessMasterCode((entry as any)?.code);
        if (!code) return;
        const key = `${type}:${code}`;
        const candidate = tracked.get(key);
        if (!candidate) return;
        candidate.referenceCount += 1;
        candidate.styleProcessIds.add(styleProcessId);
        if (
          candidate.sampleStyleProcessIds.length < 5 &&
          !candidate.sampleStyleProcessIds.includes(styleProcessId)
        ) {
          candidate.sampleStyleProcessIds.push(styleProcessId);
        }
      });
    });
  });

  return Array.from(tracked.values())
    .map((item) => ({
      id: item.id,
      type: item.type,
      code: item.code,
      label: item.label,
      nameKo: item.nameKo,
      nameEn: item.nameEn,
      nameVi: item.nameVi,
      styleProcessCount: item.styleProcessIds.size,
      referenceCount: item.referenceCount,
      sampleStyleProcessIds: item.sampleStyleProcessIds,
    }))
    .filter((item) => item.styleProcessCount > 0)
    .sort((left, right) => {
      if (right.styleProcessCount !== left.styleProcessCount) {
        return right.styleProcessCount - left.styleProcessCount;
      }
      return left.code.localeCompare(right.code, "en-US");
    });
};

const createProcessMasterOptionInUseError = (
  conflicts: ProcessMasterDeletionUsageConflict[]
): ProcessMasterOptionInUseError => {
  const usageCount = conflicts.reduce(
    (sum, item) => sum + (Number(item.referenceCount) || 0),
    0
  );
  const error = createHttpError(
    409,
    `사용 중인 공정 항목은 삭제할 수 없습니다. ${usageCount}건 참조 중입니다.`
  ) as ProcessMasterOptionInUseError;
  error.code = "PROCESS_MASTER_OPTION_IN_USE";
  error.reason = "PROCESS_MASTER_OPTION_IN_USE";
  error.usageCount = usageCount;
  error.conflicts = conflicts;
  return error;
};

const isProcessMasterOptionInUseError = (
  error: unknown
): error is ProcessMasterOptionInUseError => {
  const record = toErrorRecord(error);
  const code = String(record?.code || record?.reason || "");
  return code === "PROCESS_MASTER_OPTION_IN_USE";
};

const syncProcessMasterOptions = async (payload: any) => {
  const incomingItems = flattenProcessMasterPayloadItems(payload).filter(
    (item) =>
      item.type &&
      (item.label || item.nameKo || item.nameEn || item.nameVi)
  );
  const incomingIds = incomingItems
    .filter((item) => item.id !== null)
    .map((item) => item.id as number);
  const incomingIdSet = new Set(incomingIds);

  const existing = await listProcessMasterOptions();
  const deleteRows = existing.filter((row) => !incomingIdSet.has(row.id));
  if (deleteRows.length > 0) {
    const conflicts = await findProcessMasterDeletionUsageConflicts(deleteRows);
    if (conflicts.length > 0) {
      throw createProcessMasterOptionInUseError(conflicts);
    }
  }
  const deleteIds = deleteRows.map((row) => row.id);
  if (deleteIds.length > 0) {
    await deleteProcessMasterOptionsByIds(deleteIds);
  }

  const existingById = new Map(
    existing.map((row) => [row.id, { type: row.type, code: row.code }])
  );
  const usedCodesByType = PROCESS_MASTER_TYPE_KEYS.reduce((map, typeKey) => {
    map.set(typeKey as ProcessMasterOptionType, new Set<string>());
    return map;
  }, new Map<ProcessMasterOptionType, Set<string>>());

  existing.forEach((row) => {
    if (deleteIds.includes(row.id)) return;
    const type = normalizeProcessMasterType(row.type);
    if (!type) return;
    const used = usedCodesByType.get(type);
    if (!used) return;
    const code = normalizeProcessMasterCode(row.code);
    if (code) used.add(code);
  });

  const nextSortOrderByType = new Map<ProcessMasterOptionType, number>();
  const creates: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }> = [];
  const updates: Array<{
    id: number;
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }> = [];

  incomingItems.forEach((item) => {
    const type = normalizeProcessMasterType(item.type);
    if (!type) return;
    const usedCodes = usedCodesByType.get(type) ?? new Set<string>();

    const itemId = item.id;
    const existingInfo = itemId ? existingById.get(itemId) : null;
    if (existingInfo && normalizeProcessMasterType(existingInfo.type) === type) {
      const currentCode = normalizeProcessMasterCode(existingInfo.code);
      if (currentCode) {
        usedCodes.delete(currentCode);
      }
    }

    let code = normalizeProcessMasterCode(item.code);
    if (!code || usedCodes.has(code)) {
      const codeSeedLabel =
        normalizeProcessMasterLabel(item.nameEn) ||
        normalizeProcessMasterLabel(item.label) ||
        normalizeProcessMasterLabel(item.nameKo) ||
        normalizeProcessMasterLabel(item.nameVi);
      code = generateUniqueProcessMasterCode({
        type,
        label: codeSeedLabel,
        usedCodes,
      });
    }
    usedCodes.add(code);
    usedCodesByType.set(type, usedCodes);

    const nextSortOrder =
      item.sortOrder ?? ((nextSortOrderByType.get(type) || 0) + 1);
    nextSortOrderByType.set(type, nextSortOrder);

    if (itemId) {
      updates.push({
        id: itemId,
        type,
        code,
        label: item.label,
        nameKo: item.nameKo,
        nameEn: item.nameEn,
        nameVi: item.nameVi,
        sortOrder: nextSortOrder,
      });
    } else {
      creates.push({
        type,
        code,
        label: item.label,
        nameKo: item.nameKo,
        nameEn: item.nameEn,
        nameVi: item.nameVi,
        sortOrder: nextSortOrder,
      });
    }
  });

  if (creates.length > 0) {
    await insertProcessMasterOptions(creates);
  }

  if (updates.length > 0) {
    for (const row of updates) {
      await updateProcessMasterOptionRow(row);
    }
  }

  return listProcessMasterOptions();
};

const parseProcessMasterRelationPayload = (payload: any) => {
  const relationContainer =
    payload && typeof payload === "object" && payload.relations && typeof payload.relations === "object"
      ? payload.relations
      : payload;
  const hasTargetSpecRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "targetToTargetSpecs"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "targetSpecLinks"
        ))
  );
  const hasTargetTargetRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "targetToTargets"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "targetLinks"
        ))
  );
  const hasActionRelationKey = Boolean(
    relationContainer &&
      typeof relationContainer === "object" &&
      (Object.prototype.hasOwnProperty.call(
        relationContainer,
        "actionToActionSpecs"
      ) ||
        Object.prototype.hasOwnProperty.call(
          relationContainer,
          "actionSpecLinks"
        ))
  );
  const providedTypes = new Set<ProcessMasterRelationType>();
  const entriesByType = new Map<
    ProcessMasterRelationType,
    Array<{ parentCode: string; childCode: string }>
  >();

  const collectEntries = (
    type: ProcessMasterRelationType,
    items: any[],
    resolveCodes: (item: any) => { parentCode: string; childCode: string }
  ) => {
    providedTypes.add(type);
    const dedup = new Set<string>();
    const collected: Array<{ parentCode: string; childCode: string }> = [];

    ensureArray(items).forEach((item) => {
      const { parentCode, childCode } = resolveCodes(item);
      if (!parentCode || !childCode) return;
      const key = `${parentCode}:${childCode}`;
      if (dedup.has(key)) return;
      dedup.add(key);
      collected.push({ parentCode, childCode });
    });

    entriesByType.set(type, collected);
  };

  if (hasTargetSpecRelationKey) {
    collectEntries(
      "TARGET_TARGET_SPEC",
      relationContainer?.targetToTargetSpecs ?? relationContainer?.targetSpecLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.targetCode ?? item?.target?.code ?? item?.target
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.targetSpecCode ??
            item?.targetSpec?.code ??
            item?.targetSpec
        ),
      })
    );
  }

  if (hasTargetTargetRelationKey) {
    collectEntries(
      "TARGET_TARGET",
      relationContainer?.targetToTargets ?? relationContainer?.targetLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.targetCode ?? item?.target?.code ?? item?.target
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.linkedTargetCode ??
            item?.linkedTarget?.code ??
            item?.linkedTarget
        ),
      })
    );
  }

  if (hasActionRelationKey) {
    collectEntries(
      "ACTION_ACTION_SPEC",
      relationContainer?.actionToActionSpecs ?? relationContainer?.actionSpecLinks,
      (item) => ({
        parentCode: normalizeProcessMasterCode(
          item?.parentCode ?? item?.actionCode ?? item?.action?.code ?? item?.action
        ),
        childCode: normalizeProcessMasterCode(
          item?.childCode ??
            item?.actionSpecCode ??
            item?.actionSpec?.code ??
            item?.actionSpec
        ),
      })
    );
  }

  return {
    hasProvidedKeys:
      hasTargetSpecRelationKey || hasTargetTargetRelationKey || hasActionRelationKey,
    providedTypes,
    entriesByType,
  };
};

const syncProcessMasterRelations = async ({
  payload,
  processMasterRows,
}: {
  payload: any;
  processMasterRows: ProcessMasterOptionRow[];
}) => {
  const parsedPayload = parseProcessMasterRelationPayload(payload);
  if (!parsedPayload.hasProvidedKeys) {
    return listProcessMasterOptionRelations();
  }

  const optionCodeLookupByType = new Map<
    ProcessMasterOptionType,
    Map<string, number>
  >();
  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    optionCodeLookupByType.set(typeKey as ProcessMasterOptionType, new Map());
  });
  processMasterRows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    const code = normalizeProcessMasterCode(row?.code);
    if (!type || !code) return;
    const typeMap = optionCodeLookupByType.get(type);
    if (!typeMap) return;
    typeMap.set(code, row.id);
  });

  const existingRelations = await listProcessMasterOptionRelations();
  for (const relationType of parsedPayload.providedTypes) {
    const meta = PROCESS_MASTER_RELATION_META[relationType];
    if (!meta) continue;
    const parentLookup = optionCodeLookupByType.get(meta.parentType) ?? new Map();
    const childLookup = optionCodeLookupByType.get(meta.childType) ?? new Map();
    const desiredTuples = parsedPayload.entriesByType.get(relationType) ?? [];

    const desiredLinks: Array<{
      type: ProcessMasterRelationType;
      parentOptionId: number;
      childOptionId: number;
    }> = [];
    const desiredKeySet = new Set<string>();

    desiredTuples.forEach(({ parentCode, childCode }) => {
      const parentOptionId = parentLookup.get(parentCode);
      const childOptionId = childLookup.get(childCode);
      if (!parentOptionId || !childOptionId) return;
      if (
        relationType === "TARGET_TARGET" &&
        Number(parentOptionId) === Number(childOptionId)
      ) {
        return;
      }
      const key = `${parentOptionId}:${childOptionId}`;
      if (desiredKeySet.has(key)) return;
      desiredKeySet.add(key);
      desiredLinks.push({
        type: relationType,
        parentOptionId,
        childOptionId,
      });
    });

    const existingByType = existingRelations.filter(
      (row) => normalizeProcessMasterRelationType(row?.type) === relationType
    );
    const existingKeyToRow = new Map<string, ProcessMasterRelationRow>();
    existingByType.forEach((row) => {
      const parentOptionId = toPositiveIntOrNull(row?.parentOptionId);
      const childOptionId = toPositiveIntOrNull(row?.childOptionId);
      if (!parentOptionId || !childOptionId) return;
      existingKeyToRow.set(`${parentOptionId}:${childOptionId}`, row);
    });

    const deleteIds = existingByType
      .filter((row) => {
        const parentOptionId = toPositiveIntOrNull(row?.parentOptionId);
        const childOptionId = toPositiveIntOrNull(row?.childOptionId);
        if (!parentOptionId || !childOptionId) return true;
        return !desiredKeySet.has(`${parentOptionId}:${childOptionId}`);
      })
      .map((row) => toPositiveIntOrNull(row?.id))
      .filter((id): id is number => id !== null);

    const creates = desiredLinks.filter(
      (row) => !existingKeyToRow.has(`${row.parentOptionId}:${row.childOptionId}`)
    );

    if (deleteIds.length > 0) {
      await deleteProcessMasterOptionRelationsByIds(deleteIds);
    }
    if (creates.length > 0) {
      await insertProcessMasterOptionRelations(creates);
    }
  }

  return listProcessMasterOptionRelations();
};

type ProcessMasterStoreClient = Prisma.TransactionClient | typeof prisma;
type ProcessCompositionKind =
  | "location"
  | "target"
  | "targetSpec"
  | "action"
  | "actionSpec"
  | "part"
  | "spec";

const toCanonicalProcessCompositionKind = (
  kind: ProcessCompositionKind
): "location" | "target" | "targetSpec" | "action" | "actionSpec" => {
  if (kind === "part") return "location";
  if (kind === "spec") return "targetSpec";
  return kind;
};

const listProcessMasterOptionsByType = async (
  db: ProcessMasterStoreClient,
  type: ProcessMasterOptionType
): Promise<ProcessMasterOptionRow[]> =>
  db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    WHERE "type" = ${type}::"ProcessMasterOptionType"
    ORDER BY "sortOrder" ASC, "id" ASC
  `);

const listActionProcessMasterOptions = async (
  db: ProcessMasterStoreClient
): Promise<ProcessMasterOptionRow[]> =>
  listProcessMasterOptionsByType(db, "ACTION");

const insertProcessMasterOptionsWithDb = async (
  db: ProcessMasterStoreClient,
  rows: Array<{
    type: ProcessMasterOptionType;
    code: string;
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
    sortOrder: number;
  }>
) => {
  if (rows.length === 0) return;
  const actor = getCurrentRequestActor();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "ProcessMasterOption" (
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder",
      "createdBy",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(
      rows.map((row) => Prisma.sql`(
        ${row.type}::"ProcessMasterOptionType",
        ${row.code},
        ${row.label},
        ${row.nameKo || null},
        ${row.nameEn || null},
        ${row.nameVi || null},
        ${row.sortOrder},
        ${actor},
        NOW(),
        NOW()
      )`)
    )}
    ON CONFLICT ("type", "code") DO NOTHING
  `);
};

const PROCESS_MASTER_TYPE_BY_COMPOSITION_KIND: Record<
  ProcessCompositionKind,
  ProcessMasterOptionType
> = {
  location: "LOCATION",
  part: "LOCATION",
  target: "TARGET",
  targetSpec: "TARGET_SPEC",
  action: "ACTION",
  actionSpec: "ACTION_SPEC",
  spec: "TARGET_SPEC",
};

const collectStyleProcessMasterCandidatesByKind = (
  processes: any,
  kind: ProcessCompositionKind
) => {
  const canonicalKind = toCanonicalProcessCompositionKind(kind);
  const candidates: Array<{
    label: string;
    nameKo: string;
    nameEn: string;
    nameVi: string;
  }> = [];

  normalizeStyleProcesses(processes).forEach((process) => {
    const composition = normalizeStyleProcessComposition(
      (process as any)?.processComposition
    );
    const targetPairs = ensureArray((composition as any)?.targetPairs);
    const actionPairs = ensureArray((composition as any)?.actionPairs);
    const entries =
      canonicalKind === "location"
        ? ensureArray((composition as any)?.locations)
        : canonicalKind === "target"
          ? targetPairs.map((pair: any) => (pair as any)?.target).filter(Boolean)
          : canonicalKind === "targetSpec"
            ? targetPairs
                .map((pair: any) => (pair as any)?.targetSpec)
                .filter(Boolean)
            : canonicalKind === "actionSpec"
              ? actionPairs
                  .map((pair: any) => (pair as any)?.actionSpec)
                  .filter(Boolean)
              : actionPairs.map((pair: any) => (pair as any)?.action).filter(Boolean);
    entries.forEach((entry) => {
      const label = normalizeProcessMasterLabel(
        (entry as any)?.label ??
          (entry as any)?.nameKo ??
          (entry as any)?.nameEn ??
          (entry as any)?.nameVi
      );
      if (!label) return;

      if (canonicalKind === "action") {
        const token = normalizeProcessMasterMatchToken(label);
        if (
          token.includes("작업 누락") ||
          token.includes("action missing") ||
          token.includes("thieu thao tac")
        ) {
          return;
        }
      }

      const nameKo = normalizeProcessMasterLabel((entry as any)?.nameKo || label);
      const nameEn = normalizeProcessMasterLabel((entry as any)?.nameEn || label);
      const nameVi = normalizeProcessMasterLabel((entry as any)?.nameVi || label);

      candidates.push({
        label,
        nameKo: nameKo || label,
        nameEn: nameEn || label,
        nameVi: nameVi || label,
      });
    });
  });

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const tokenKey = [
      normalizeProcessMasterMatchToken(candidate.label),
      normalizeProcessMasterMatchToken(candidate.nameKo),
      normalizeProcessMasterMatchToken(candidate.nameEn),
      normalizeProcessMasterMatchToken(candidate.nameVi),
    ]
      .filter(Boolean)
      .sort()
      .join("|");
    if (!tokenKey || seen.has(tokenKey)) return false;
    seen.add(tokenKey);
    return true;
  });
};

const ensureProcessMasterOptionsFromStyleProcesses = async ({
  processes,
  kinds = [
    "location",
    "target",
    "targetSpec",
    "action",
    "actionSpec",
  ] as ProcessCompositionKind[],
  db,
}: {
  processes: any;
  kinds?: ProcessCompositionKind[];
  db: ProcessMasterStoreClient;
}) => {
  for (const kind of kinds) {
    const type = PROCESS_MASTER_TYPE_BY_COMPOSITION_KIND[kind];
    if (!type) continue;
    const candidates = collectStyleProcessMasterCandidatesByKind(processes, kind);
    if (candidates.length === 0) continue;

    const existingRows = await listProcessMasterOptionsByType(db, type);
    const usedCodes = existingRows.reduce((set, row) => {
      const normalizedCode = normalizeProcessMasterCode(row.code);
      if (normalizedCode) set.add(normalizedCode);
      return set;
    }, new Set<string>());
    const existingTokens = existingRows.reduce((set, row) => {
      buildProcessMasterMatchTokenSet(row).forEach((token) => set.add(token));
      return set;
    }, new Set<string>());
    let nextSortOrder = existingRows.reduce(
      (maxValue, row) => Math.max(maxValue, toPositiveIntOrNull(row?.sortOrder) ?? 0),
      0
    );

    const creates: Array<{
      type: ProcessMasterOptionType;
      code: string;
      label: string;
      nameKo: string;
      nameEn: string;
      nameVi: string;
      sortOrder: number;
    }> = [];

    candidates.forEach((candidate) => {
      const candidateTokens = new Set<string>();
      [
        candidate.label,
        candidate.nameKo,
        candidate.nameEn,
        candidate.nameVi,
      ].forEach((value) => {
        const token = normalizeProcessMasterMatchToken(value);
        if (token) candidateTokens.add(token);
      });

      const isAlreadyExists = Array.from(candidateTokens).some((token) =>
        existingTokens.has(token)
      );
      if (isAlreadyExists) return;

      const codeSeedLabel =
        normalizeProcessMasterLabel(candidate.nameEn) ||
        normalizeProcessMasterLabel(candidate.label) ||
        normalizeProcessMasterLabel(candidate.nameKo) ||
        normalizeProcessMasterLabel(candidate.nameVi);
      const code = generateUniqueProcessMasterCode({
        type,
        label: codeSeedLabel,
        usedCodes,
      });
      usedCodes.add(code);
      nextSortOrder += 1;

      creates.push({
        type,
        code,
        label: candidate.label,
        nameKo: candidate.nameKo || candidate.label,
        nameEn: candidate.nameEn || candidate.label,
        nameVi: candidate.nameVi || candidate.label,
        sortOrder: nextSortOrder,
      });

      existingTokens.add(normalizeProcessMasterMatchToken(code));
      candidateTokens.forEach((token) => existingTokens.add(token));
    });

    if (creates.length > 0) {
      await insertProcessMasterOptionsWithDb(db, creates);
    }
  }
};

const ensureActionProcessMasterOptionsFromStyleProcesses = async ({
  processes,
  db,
}: {
  processes: any;
  db: ProcessMasterStoreClient;
}) =>
  ensureProcessMasterOptionsFromStyleProcesses({
    processes,
    kinds: ["action"],
    db,
  });

type ProcessMasterResolverState = {
  rowsByType: Map<ProcessMasterOptionType, ProcessMasterOptionRow[]>;
  usedCodesByType: Map<ProcessMasterOptionType, Set<string>>;
  nextSortOrderByType: Map<ProcessMasterOptionType, number>;
};

const createProcessMasterResolverState = (
  rows: ProcessMasterOptionRow[] = []
): ProcessMasterResolverState => {
  const rowsByType = new Map<ProcessMasterOptionType, ProcessMasterOptionRow[]>();
  const usedCodesByType = new Map<ProcessMasterOptionType, Set<string>>();
  const nextSortOrderByType = new Map<ProcessMasterOptionType, number>();

  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    rowsByType.set(typeKey as ProcessMasterOptionType, []);
    usedCodesByType.set(typeKey as ProcessMasterOptionType, new Set<string>());
    nextSortOrderByType.set(typeKey as ProcessMasterOptionType, 0);
  });

  rows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    if (!type) return;
    const group = rowsByType.get(type) ?? [];
    group.push(row);
    rowsByType.set(type, group);

    const code = normalizeProcessMasterCode(row?.code);
    if (code) {
      const usedCodes = usedCodesByType.get(type) ?? new Set<string>();
      usedCodes.add(code);
      usedCodesByType.set(type, usedCodes);
    }

    const sortOrder = toPositiveIntOrNull(row?.sortOrder) ?? 0;
    const currentSort = nextSortOrderByType.get(type) ?? 0;
    if (sortOrder > currentSort) {
      nextSortOrderByType.set(type, sortOrder);
    }
  });

  return {
    rowsByType,
    usedCodesByType,
    nextSortOrderByType,
  };
};

const appendProcessMasterResolverRow = (
  state: ProcessMasterResolverState,
  row: ProcessMasterOptionRow
) => {
  const type = normalizeProcessMasterType(row?.type);
  if (!type) return;

  const currentRows = state.rowsByType.get(type) ?? [];
  const nextRows = [...currentRows, row].sort((left, right) => {
    const leftSort = toPositiveIntOrNull(left?.sortOrder) ?? 0;
    const rightSort = toPositiveIntOrNull(right?.sortOrder) ?? 0;
    if (leftSort !== rightSort) return leftSort - rightSort;
    return (toPositiveIntOrNull(left?.id) ?? 0) - (toPositiveIntOrNull(right?.id) ?? 0);
  });
  state.rowsByType.set(type, nextRows);

  const code = normalizeProcessMasterCode(row?.code);
  if (code) {
    const usedCodes = state.usedCodesByType.get(type) ?? new Set<string>();
    usedCodes.add(code);
    state.usedCodesByType.set(type, usedCodes);
  }

  const sortOrder = toPositiveIntOrNull(row?.sortOrder) ?? 0;
  const currentSort = state.nextSortOrderByType.get(type) ?? 0;
  if (sortOrder > currentSort) {
    state.nextSortOrderByType.set(type, sortOrder);
  }
};

const listProcessMasterEntryLabelTokens = (entry: any) =>
  [
    normalizeProcessMasterMatchToken(entry?.label),
    normalizeProcessMasterMatchToken(entry?.nameKo),
    normalizeProcessMasterMatchToken(entry?.nameEn),
    normalizeProcessMasterMatchToken(entry?.nameVi),
  ].filter(Boolean);

const findMatchingProcessMasterOptionRow = ({
  rows,
  entry,
}: {
  rows: ProcessMasterOptionRow[];
  entry: any;
}): ProcessMasterOptionRow | null => {
  if (!rows.length || !entry) return null;

  const entryCode = normalizeProcessMasterCode(entry?.code);
  if (entryCode) {
    const codeMatched =
      rows.find((row) => normalizeProcessMasterCode(row?.code) === entryCode) ?? null;
    if (codeMatched) return codeMatched;
  }

  const labelTokens = new Set(listProcessMasterEntryLabelTokens(entry));
  if (labelTokens.size === 0) return null;

  const primaryToken =
    normalizeProcessMasterMatchToken(
      entry?.label ?? entry?.nameKo ?? entry?.nameEn ?? entry?.nameVi
    ) || null;

  const matchedRows = rows.filter((row) => {
    const rowTokens = buildProcessMasterMatchTokenSet(row);
    for (const token of labelTokens) {
      if (rowTokens.has(token)) return true;
    }
    return false;
  });
  if (matchedRows.length === 0) return null;
  if (matchedRows.length === 1) return matchedRows[0] ?? null;

  if (primaryToken) {
    const primaryMatched =
      matchedRows.find((row) => {
        const rowPrimaryToken =
          normalizeProcessMasterMatchToken(
            row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi
          ) || null;
        if (rowPrimaryToken && rowPrimaryToken === primaryToken) return true;
        const rowTokens = buildProcessMasterMatchTokenSet(row);
        return rowTokens.has(primaryToken);
      }) ?? null;
    if (primaryMatched) return primaryMatched;
  }

  return (
    [...matchedRows].sort((left, right) => {
      const leftSort = toPositiveIntOrNull(left?.sortOrder) ?? 0;
      const rightSort = toPositiveIntOrNull(right?.sortOrder) ?? 0;
      if (leftSort !== rightSort) return leftSort - rightSort;
      return (toPositiveIntOrNull(left?.id) ?? 0) - (toPositiveIntOrNull(right?.id) ?? 0);
    })[0] ?? null
  );
};

const findProcessMasterOptionByTypeAndCodeWithDb = async (
  db: ProcessMasterStoreClient,
  type: ProcessMasterOptionType,
  code: string
): Promise<ProcessMasterOptionRow | null> => {
  if (!code) return null;
  const rows = await db.$queryRaw<ProcessMasterOptionRow[]>(Prisma.sql`
    SELECT
      "id",
      "type",
      "code",
      "label",
      "nameKo",
      "nameEn",
      "nameVi",
      "sortOrder"
    FROM "ProcessMasterOption"
    WHERE "type" = ${type}::"ProcessMasterOptionType"
      AND "code" = ${code}
    ORDER BY "id" ASC
    LIMIT 1
  `);
  return rows[0] ?? null;
};

const toCanonicalStyleProcessCompositionEntry = (
  row: ProcessMasterOptionRow,
  fallbackEntry: any = null
) => {
  const code = normalizeProcessMasterCode(row?.code);
  const label =
    normalizeProcessMasterLabel(
      row?.label ??
        row?.nameKo ??
        row?.nameEn ??
        row?.nameVi ??
        fallbackEntry?.label ??
        fallbackEntry?.nameKo ??
        fallbackEntry?.nameEn ??
        fallbackEntry?.nameVi
    ) || code;
  return {
    code: code || null,
    label,
    nameKo:
      normalizeProcessMasterLabel(row?.nameKo) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameKo) ||
      label,
    nameEn:
      normalizeProcessMasterLabel(row?.nameEn) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameEn) ||
      label,
    nameVi:
      normalizeProcessMasterLabel(row?.nameVi) ||
      normalizeProcessMasterLabel(fallbackEntry?.nameVi) ||
      label,
    isCustom: false,
  };
};

const resolveOrCreateProcessMasterOptionFromStyleEntry = async ({
  db,
  state,
  type,
  entry,
}: {
  db: ProcessMasterStoreClient;
  state: ProcessMasterResolverState;
  type: ProcessMasterOptionType;
  entry: any;
}): Promise<ProcessMasterOptionRow | null> => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const rows = state.rowsByType.get(type) ?? [];
  const matchedRow = findMatchingProcessMasterOptionRow({ rows, entry });
  if (matchedRow) return matchedRow;

  if (!Boolean(entry?.isCustom)) {
    return null;
  }

  const usedCodes = state.usedCodesByType.get(type) ?? new Set<string>();
  const codeCandidate = normalizeProcessMasterCode(entry?.code);
  let code = codeCandidate;
  if (!code || usedCodes.has(code)) {
    const codeSeedLabel =
      normalizeProcessMasterLabel(entry?.nameEn) ||
      normalizeProcessMasterLabel(entry?.label) ||
      normalizeProcessMasterLabel(entry?.nameKo) ||
      normalizeProcessMasterLabel(entry?.nameVi);
    code = generateUniqueProcessMasterCode({
      type,
      label: codeSeedLabel,
      usedCodes,
    });
  }

  const label =
    normalizeProcessMasterLabel(
      entry?.label ?? entry?.nameKo ?? entry?.nameEn ?? entry?.nameVi
    ) || code;
  const nameKo = normalizeProcessMasterLabel(entry?.nameKo) || label;
  const nameEn = normalizeProcessMasterLabel(entry?.nameEn) || label;
  const nameVi = normalizeProcessMasterLabel(entry?.nameVi) || label;
  const nextSortOrder = (state.nextSortOrderByType.get(type) ?? 0) + 1;

  await insertProcessMasterOptionsWithDb(db, [
    {
      type,
      code,
      label,
      nameKo,
      nameEn,
      nameVi,
      sortOrder: nextSortOrder,
    },
  ]);

  const createdRow = await findProcessMasterOptionByTypeAndCodeWithDb(db, type, code);
  if (!createdRow) return null;

  appendProcessMasterResolverRow(state, createdRow);
  return createdRow;
};

const syncProcessMasterFromStyleProcesses = async ({
  processes,
  db,
}: {
  processes: any;
  db: ProcessMasterStoreClient;
}) => {
  await ensureProcessMasterOptionTypeSchemaReady();
  await ensureProcessMasterOptionRelationSchemaReady();

  const normalizedProcesses = normalizeStyleProcesses(processes);
  if (normalizedProcesses.length === 0) return normalizedProcesses;

  const processMasterRows = await listProcessMasterOptionsWithDb(db);
  const resolverState = createProcessMasterResolverState(processMasterRows);
  const pendingTargetSpecRelations = new Map<string, { parentOptionId: number; childOptionId: number }>();
  const pendingActionSpecRelations = new Map<string, { parentOptionId: number; childOptionId: number }>();

  const canonicalizedProcesses: any[] = [];

  for (const process of normalizedProcesses) {
    const normalizedProcess = normalizeStyleProcess(process);
    const composition = normalizeStyleProcessComposition(
      (normalizedProcess as any)?.processComposition
    );
    if (!composition) {
      canonicalizedProcesses.push(normalizedProcess);
      continue;
    }

    const canonicalLocations: any[] = [];
    for (const rawLocationEntry of ensureArray((composition as any)?.locations)) {
      const locationEntry = normalizeStyleProcessCompositionEntry(rawLocationEntry, "location");
      if (!locationEntry) continue;
      const locationRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "LOCATION",
        entry: locationEntry,
      });
      canonicalLocations.push(
        locationRow
          ? toCanonicalStyleProcessCompositionEntry(locationRow, locationEntry)
          : locationEntry
      );
    }

    const canonicalTargetPairs: Array<{ target: any; targetSpec: any | null }> = [];
    for (const rawPair of ensureArray((composition as any)?.targetPairs)) {
      if (!rawPair || typeof rawPair !== "object" || Array.isArray(rawPair)) continue;
      const targetEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.target,
        "target"
      );
      if (!targetEntry) continue;
      const targetRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "TARGET",
        entry: targetEntry,
      });
      const canonicalTarget = targetRow
        ? toCanonicalStyleProcessCompositionEntry(targetRow, targetEntry)
        : targetEntry;

      const targetSpecEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.targetSpec,
        "targetSpec"
      );
      let targetSpecRow: ProcessMasterOptionRow | null = null;
      let canonicalTargetSpec: any | null = null;
      if (targetSpecEntry) {
        targetSpecRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
          db,
          state: resolverState,
          type: "TARGET_SPEC",
          entry: targetSpecEntry,
        });
        canonicalTargetSpec = targetSpecRow
          ? toCanonicalStyleProcessCompositionEntry(targetSpecRow, targetSpecEntry)
          : targetSpecEntry;
      }

      canonicalTargetPairs.push({
        target: canonicalTarget,
        targetSpec: canonicalTargetSpec,
      });

      if (targetRow && targetSpecRow) {
        pendingTargetSpecRelations.set(
          `${targetRow.id}:${targetSpecRow.id}`,
          {
            parentOptionId: targetRow.id,
            childOptionId: targetSpecRow.id,
          }
        );
      }
    }

    const canonicalActionPairs: Array<{ action: any; actionSpec: any | null }> = [];
    for (const rawPair of ensureArray((composition as any)?.actionPairs)) {
      if (!rawPair || typeof rawPair !== "object" || Array.isArray(rawPair)) continue;
      const actionEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.action,
        "action"
      );
      if (!actionEntry) continue;
      const actionRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
        db,
        state: resolverState,
        type: "ACTION",
        entry: actionEntry,
      });
      const canonicalAction = actionRow
        ? toCanonicalStyleProcessCompositionEntry(actionRow, actionEntry)
        : actionEntry;

      const actionSpecEntry = normalizeStyleProcessCompositionEntry(
        (rawPair as any)?.actionSpec,
        "actionSpec"
      );
      let actionSpecRow: ProcessMasterOptionRow | null = null;
      let canonicalActionSpec: any | null = null;
      if (actionSpecEntry) {
        actionSpecRow = await resolveOrCreateProcessMasterOptionFromStyleEntry({
          db,
          state: resolverState,
          type: "ACTION_SPEC",
          entry: actionSpecEntry,
        });
        canonicalActionSpec = actionSpecRow
          ? toCanonicalStyleProcessCompositionEntry(actionSpecRow, actionSpecEntry)
          : actionSpecEntry;
      }

      canonicalActionPairs.push({
        action: canonicalAction,
        actionSpec: canonicalActionSpec,
      });

      if (actionRow && actionSpecRow) {
        pendingActionSpecRelations.set(
          `${actionRow.id}:${actionSpecRow.id}`,
          {
            parentOptionId: actionRow.id,
            childOptionId: actionSpecRow.id,
          }
        );
      }
    }

    const canonicalComposition = {
      locations: canonicalLocations,
      targetPairs: canonicalTargetPairs,
      actionPairs: canonicalActionPairs,
    };

    canonicalizedProcesses.push(
      normalizeStyleProcess({
        ...normalizedProcess,
        processComposition: canonicalComposition,
      })
    );
  }

  const relationCreates = [
    ...Array.from(pendingTargetSpecRelations.values()).map((item) => ({
      type: "TARGET_TARGET_SPEC" as ProcessMasterRelationType,
      parentOptionId: item.parentOptionId,
      childOptionId: item.childOptionId,
    })),
    ...Array.from(pendingActionSpecRelations.values()).map((item) => ({
      type: "ACTION_ACTION_SPEC" as ProcessMasterRelationType,
      parentOptionId: item.parentOptionId,
      childOptionId: item.childOptionId,
    })),
  ];
  if (relationCreates.length > 0) {
    await insertProcessMasterOptionRelationsWithDb(db, relationCreates);
  }

  return canonicalizedProcesses;
};

const PROCESS_COMPOSITION_KIND_BY_MASTER_TYPE: Record<
  ProcessMasterOptionType,
  "location" | "target" | "targetSpec" | "action" | "actionSpec"
> = {
  LOCATION: "location",
  TARGET: "target",
  ACTION: "action",
  TARGET_SPEC: "targetSpec",
  ACTION_SPEC: "actionSpec",
};

const buildProcessMasterNameLookupByTypeAndCode = (
  rows: Array<Partial<ProcessMasterOptionRow>> = []
) => {
  const lookup = new Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >();
  PROCESS_MASTER_TYPE_KEYS.forEach((typeKey) => {
    lookup.set(typeKey as ProcessMasterOptionType, new Map());
  });

  rows.forEach((row) => {
    const type = normalizeProcessMasterType(row?.type);
    if (!type) return;
    const codeKey = normalizeProcessMasterCode(row?.code);
    if (!codeKey) return;
    const typeLookup = lookup.get(type);
    if (!typeLookup) return;
    const label =
      normalizeProcessMasterLabel(row?.label ?? row?.nameKo ?? row?.nameEn ?? row?.nameVi) ||
      codeKey;
    typeLookup.set(codeKey, {
      label,
      nameKo: normalizeProcessMasterLabel(row?.nameKo) || label,
      nameEn: normalizeProcessMasterLabel(row?.nameEn) || label,
      nameVi: normalizeProcessMasterLabel(row?.nameVi) || label,
    });
  });

  return lookup;
};

const applyProcessMasterNamesToCompositionEntry = (
  entry: any,
  type: ProcessMasterOptionType,
  lookupByTypeAndCode: Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >
) => {
  const kind = PROCESS_COMPOSITION_KIND_BY_MASTER_TYPE[type];
  const normalizedEntry = normalizeStyleProcessCompositionEntry(entry, kind);
  if (!normalizedEntry) return null;

  const codeKey = normalizeProcessMasterCode(normalizedEntry.code);
  if (!codeKey) return normalizedEntry;

  const masterNames = lookupByTypeAndCode.get(type)?.get(codeKey);
  if (!masterNames) return normalizedEntry;

  const label = masterNames.label || normalizedEntry.label;
  return {
    ...normalizedEntry,
    code: codeKey || normalizedEntry.code,
    label: label || normalizedEntry.label,
    nameKo: masterNames.nameKo || label || normalizedEntry.nameKo,
    nameEn: masterNames.nameEn || label || normalizedEntry.nameEn,
    nameVi: masterNames.nameVi || label || normalizedEntry.nameVi,
  };
};

const applyProcessMasterNamesToComposition = (
  composition: any,
  lookupByTypeAndCode: Map<
    ProcessMasterOptionType,
    Map<
      string,
      {
        label: string;
        nameKo: string;
        nameEn: string;
        nameVi: string;
      }
    >
  >
) => {
  const normalizedComposition = normalizeStyleProcessComposition(composition);
  if (!normalizedComposition) return null;

  const locations = ensureArray(normalizedComposition.locations)
    .map((entry) =>
      applyProcessMasterNamesToCompositionEntry(entry, "LOCATION", lookupByTypeAndCode)
    )
    .filter(Boolean);
  const targetPairs = ensureArray((normalizedComposition as any)?.targetPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const target = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.target,
        "TARGET",
        lookupByTypeAndCode
      );
      if (!target) return null;
      const targetSpec = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.targetSpec,
        "TARGET_SPEC",
        lookupByTypeAndCode
      );
      return {
        target,
        targetSpec: targetSpec ?? null,
      };
    })
    .filter(Boolean);
  const actionPairs = ensureArray((normalizedComposition as any)?.actionPairs)
    .map((pair: any) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return null;
      const action = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.action,
        "ACTION",
        lookupByTypeAndCode
      );
      if (!action) return null;
      const actionSpec = applyProcessMasterNamesToCompositionEntry(
        (pair as any)?.actionSpec,
        "ACTION_SPEC",
        lookupByTypeAndCode
      );
      return {
        action,
        actionSpec: actionSpec ?? null,
      };
    })
    .filter(Boolean);

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

const syncStyleProcessCompositionNamesWithMasterOptions = async ({
  processMasterRows = null,
  db = prisma,
}: {
  processMasterRows?: Array<Partial<ProcessMasterOptionRow>> | null;
  db?: Prisma.TransactionClient | typeof prisma;
}) => {
  const rows =
    processMasterRows && processMasterRows.length > 0
      ? processMasterRows
      : await listProcessMasterOptions();
  if (rows.length === 0) return 0;

  const lookupByTypeAndCode = buildProcessMasterNameLookupByTypeAndCode(rows);
  const styleProcesses = await db.styleProcess.findMany({
    select: {
      id: true,
      processCode: true,
      processName: true,
      processComposition: true,
    },
    orderBy: { id: "asc" },
  });

  let updatedCount = 0;
  for (const row of styleProcesses) {
    const previousComposition = normalizeStyleProcessComposition(row.processComposition);
    if (!previousComposition) continue;

    const nextComposition = applyProcessMasterNamesToComposition(
      previousComposition,
      lookupByTypeAndCode
    );
    if (!nextComposition) continue;

    const previousKey = JSON.stringify(previousComposition);
    const nextKey = JSON.stringify(nextComposition);
    const localizedNames = buildStyleProcessLocalizedNamesFromComposition(nextComposition, {
      name: row.processName,
      nameEn: row.processName,
    });
    const nextProcessName =
      resolveOptionalString(localizedNames.nameEn, null) ??
      resolveOptionalString(row.processName, null) ??
      resolveOptionalString(row.processCode, null) ??
      "";

    const isCompositionChanged = previousKey !== nextKey;
    const isProcessNameChanged =
      resolveOptionalString(row.processName, null) !== nextProcessName;
    if (!isCompositionChanged && !isProcessNameChanged) continue;

    await db.styleProcess.update({
      where: { id: row.id },
      data: {
        processComposition: nextComposition ?? Prisma.JsonNull,
        processName: nextProcessName,
      },
    });
    updatedCount += 1;
  }

  return updatedCount;
};

const PROCESS_TEXT_PLACEHOLDERS = {
  ko: {
    target: "((주대상 누락))",
    action: "((작업 누락))",
  },
  en: {
    target: "((Primary target missing))",
    action: "((Action missing))",
  },
  vi: {
    target: "((Thieu doi tuong chinh))",
    action: "((Thieu thao tac))",
  },
} as const;

const splitProcessTokens = (value: string, separatorPattern: RegExp): string[] =>
  String(value ?? "")
    .split(separatorPattern)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeOptionalProcessDisplayText = (
  value: any,
  placeholders: { target: string; action: string }
) => {
  const text = resolveOptionalString(value, null);
  if (!text) return null;
  return normalizeProcessDisplayText(text, placeholders);
};

const normalizeProcessPlaceholderText = (
  text: string,
  placeholders: { target: string; action: string }
) => {
  const normalized = String(text ?? "").trim();
  if (!normalized) return normalized;
  const compact = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /(primary|주대상|doi tuong chinh)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.target;
  }
  if (
    /(action|작업|thao tac)/i.test(compact) &&
    /(missing|누락|thieu)/i.test(compact)
  ) {
    return placeholders.action;
  }
  return normalized;
};

const normalizeProcessDisplayText = (
  value: any,
  placeholders: { target: string; action: string }
) => {
  const rawText = resolveOptionalString(value, null);
  if (!rawText) {
    return `${placeholders.target} - ${placeholders.action}`;
  }

  const [leftChunk, rightChunk] = String(rawText).split(/\s*-\s*/, 2);
  const rawLeft = normalizeProcessPlaceholderText(
    resolveOptionalString(leftChunk, null) ?? placeholders.target,
    placeholders
  );
  const rawRight = normalizeProcessPlaceholderText(
    resolveOptionalString(rightChunk, null) ?? placeholders.action,
    placeholders
  );

  let partText = rawLeft;
  let targetText = "";
  let shouldRequireTarget = false;
  const hasHangul = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(rawLeft);
  const isPlaceholderLeft = rawLeft.includes("((") && rawLeft.includes("))");

  const colonIndex = rawLeft.indexOf(":");
  if (!isPlaceholderLeft && colonIndex >= 0) {
    partText = rawLeft.slice(0, colonIndex).trim();
    targetText = rawLeft.slice(colonIndex + 1).trim();
    shouldRequireTarget = true;
  } else if (!isPlaceholderLeft && rawLeft.includes("/")) {
    const slashTokens = splitProcessTokens(rawLeft, /[·/]/g);
    if (slashTokens.length > 1) {
      partText = slashTokens[0] ?? "";
      targetText = slashTokens.slice(1).join("·");
      shouldRequireTarget = true;
    }
  } else {
    const firstSpaceMatch = rawLeft.match(/\s+/);
    const firstSpaceIndex = firstSpaceMatch?.index ?? -1;
    if (hasHangul && !isPlaceholderLeft && firstSpaceIndex > 0) {
      partText = rawLeft.slice(0, firstSpaceIndex).trim();
      targetText = rawLeft.slice(firstSpaceIndex + firstSpaceMatch![0].length).trim();
      shouldRequireTarget = true;
    }
  }

  const normalizedPart = partText || placeholders.target;
  const normalizedTargets = splitProcessTokens(targetText, /[·/]/g).join("·");
  const leftText =
    shouldRequireTarget || normalizedTargets
      ? `${normalizedPart}: ${normalizedTargets || placeholders.target}`
      : normalizedPart;

  const specTokens = Array.from(rawRight.matchAll(/\(([^)]*)\)/g))
    .map((match) => match?.[1] ?? "")
    .flatMap((specValue) => splitProcessTokens(specValue, /[·/+]/g));
  const normalizedSpec = specTokens.join("·");
  const actionChunk = rawRight.replace(/\([^)]*\)/g, " ");
  const normalizedActions = splitProcessTokens(actionChunk, /[·+]/g).join("·");
  const rightText = normalizedActions || placeholders.action;

  return normalizedSpec
    ? `${leftText} - ${rightText} (${normalizedSpec})`
    : `${leftText} - ${rightText}`;
};

const resolveManagedProcessNameData = (item: any) => {
  const base = resolveManagedAttributeNameData(item);
  const nameEn = normalizeProcessDisplayText(
    resolveOptionalString(base.nameEn, null) ?? base.name,
    PROCESS_TEXT_PLACEHOLDERS.en
  );
  const nameKo = normalizeOptionalProcessDisplayText(
    base.nameKo,
    PROCESS_TEXT_PLACEHOLDERS.ko
  );
  const nameVi = normalizeOptionalProcessDisplayText(
    base.nameVi,
    PROCESS_TEXT_PLACEHOLDERS.vi
  );
  return {
    name: nameEn,
    nameKo,
    nameEn,
    nameVi,
  };
};

const buildCombinedLocalizedProcessName = (item: {
  code?: any;
  nameEn?: any;
  nameKo?: any;
  nameVi?: any;
}) => {
  const nameKo = resolveOptionalString(item?.nameKo, null);
  const nameVi = resolveOptionalString(item?.nameVi, null);
  const nameEn = resolveOptionalString(item?.nameEn, null);
  const code = resolveOptionalString(item?.code, null);
  const localizedParts = [nameKo, nameVi].filter(Boolean);
  if (localizedParts.length > 0) {
    return localizedParts.join(" / ");
  }
  return (
    nameEn ??
    code ??
    `${PROCESS_TEXT_PLACEHOLDERS.ko.target} / ${PROCESS_TEXT_PLACEHOLDERS.vi.target}`
  );
};

const sameTrimmedText = (left: any, right: any) =>
  resolveOptionalString(left, "") === resolveOptionalString(right, "");

const syncStyleProcessNamesFromMaster = async ({
  orgId,
  processes,
  db = prisma,
}: {
  orgId: number;
  processes: any[];
  db?: Prisma.TransactionClient | typeof prisma;
}) => {
  const codeToName = new Map<string, string>();

  ensureArray(processes).forEach((item) => {
    const codeKey = normalizeProcessCodeKey(item?.code);
    if (!codeKey) return;
    const normalized = resolveManagedProcessNameData(item);
    const combinedName = buildCombinedLocalizedProcessName({
      code: item?.code,
      nameEn: normalized.nameEn,
      nameKo: normalized.nameKo,
      nameVi: normalized.nameVi,
    });
    if (!combinedName) return;
    codeToName.set(codeKey, combinedName);
  });

  if (codeToName.size === 0) {
    return {
      touchedCodes: 0,
      updatedStyleProcessCount: 0,
      updatedStyleCount: 0,
    };
  }

  const targetCodes = Array.from(codeToName.keys());
  const styleProcessRows = await db.styleProcess.findMany({
    where: {
      orgId,
      processCode: { in: targetCodes },
    },
    select: {
      id: true,
      processCode: true,
      processName: true,
    },
  });

  // StyleProcess.processName is the source of truth for process names; Style.processes
  // JSON is no longer written here (or anywhere else). Callers that need display names
  // read them from the StyleProcess relation, not from this JSON column.
  let updatedStyleProcessCount = 0;
  for (const row of styleProcessRows) {
    const nextName = codeToName.get(normalizeProcessCodeKey(row.processCode));
    if (!nextName || sameTrimmedText(row.processName, nextName)) continue;
    await db.styleProcess.update({
      where: { id: row.id },
      data: { processName: nextName },
    });
    updatedStyleProcessCount += 1;
  }

  return {
    touchedCodes: targetCodes.length,
    updatedStyleProcessCount,
    updatedStyleCount: 0,
  };
};

const ensureDefaultEmployeeRoles = async (orgId: number) => {
  const existingRoles = await prisma.attrRole.findMany({
    where: { orgId },
    select: { id: true, code: true, name: true, defaultPayType: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const usedRoleIds = new Set<number>();
  const writes: Prisma.PrismaPromise<any>[] = [];

  DEFAULT_EMPLOYEE_ROLES.forEach((defaultRole) => {
    const matchedRole =
      existingRoles.find(
        (role) => !usedRoleIds.has(role.id) && role.code === defaultRole.code
      ) ||
      existingRoles.find(
        (role) => !usedRoleIds.has(role.id) && role.name === defaultRole.name
      ) ||
      (defaultRole.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING
        ? existingRoles.find(
            (role) =>
              !usedRoleIds.has(role.id) &&
              (role.code === "WORKER" || role.name === "작업자")
          )
        : null);

    if (matchedRole) {
      usedRoleIds.add(matchedRole.id);
      writes.push(
        prisma.attrRole.update({
          where: { id: matchedRole.id },
          data: {
            code: defaultRole.code,
            name: defaultRole.name,
            defaultPayType: defaultRole.defaultPayType,
            sortOrder: defaultRole.sortOrder,
          },
        })
      );
      return;
    }

    writes.push(
      prisma.attrRole.create({
        data: {
          orgId,
          code: defaultRole.code,
          name: defaultRole.name,
          defaultPayType: defaultRole.defaultPayType,
          sortOrder: defaultRole.sortOrder,
        },
      })
    );
  });

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }

  const roles = await prisma.attrRole.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const sewingRole =
    roles.find((role) => role.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING) ?? null;
  if (!sewingRole) return roles;

  const workerEmployees = await prisma.employee.findMany({
    where: {
      orgId,
    },
    include: {
      role: {
        select: { code: true, defaultPayType: true },
      },
    },
  });
  const migrateEmployeeIds = workerEmployees
    .filter(
      (employee) =>
        employee.orgRole === "WORKER" &&
        (!employee.roleId || !isWorkerEmployeeRoleCode(employee.role?.code))
    )
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const clearEmployeeRoleIds = workerEmployees
    .filter((employee) => employee.orgRole !== "WORKER" && employee.roleId !== null)
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const workerIdsNeedingCtPayType = workerEmployees
    .filter((employee) => {
      if (employee.orgRole !== "WORKER") return false;
      if (normalizePayType(employee.payType, null)) return false;
      const nextPayType =
        employee.roleId && isWorkerEmployeeRoleCode(employee.role?.code)
          ? resolveRoleDefaultPayType(employee.role)
          : resolveRoleDefaultPayType(sewingRole);
      return nextPayType === "CT";
    })
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const workerIdsNeedingFixedPayType = workerEmployees
    .filter((employee) => {
      if (employee.orgRole !== "WORKER") return false;
      if (normalizePayType(employee.payType, null)) return false;
      const nextPayType =
        employee.roleId && isWorkerEmployeeRoleCode(employee.role?.code)
          ? resolveRoleDefaultPayType(employee.role)
          : resolveRoleDefaultPayType(sewingRole);
      return nextPayType === "FIXED";
    })
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));
  const nonWorkerIdsNeedingFixedPayType = workerEmployees
    .filter(
      (employee) =>
        employee.orgRole !== "WORKER" &&
        normalizePayType(employee.payType, null) !== "FIXED"
    )
    .map((employee) => Number(employee.id))
    .filter((employeeId) => Number.isFinite(employeeId));

  if (
    migrateEmployeeIds.length > 0 ||
    clearEmployeeRoleIds.length > 0 ||
    workerIdsNeedingCtPayType.length > 0 ||
    workerIdsNeedingFixedPayType.length > 0 ||
    nonWorkerIdsNeedingFixedPayType.length > 0
  ) {
    const reconciliationWrites: Prisma.PrismaPromise<any>[] = [];
    if (migrateEmployeeIds.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: migrateEmployeeIds } },
          data: { roleId: sewingRole.id },
        })
      );
    }
    if (clearEmployeeRoleIds.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: clearEmployeeRoleIds } },
          data: { roleId: null },
        })
      );
    }
    if (workerIdsNeedingCtPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: workerIdsNeedingCtPayType } },
          data: { payType: "CT" },
        })
      );
    }
    if (workerIdsNeedingFixedPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: workerIdsNeedingFixedPayType } },
          data: { payType: "FIXED" },
        })
      );
    }
    if (nonWorkerIdsNeedingFixedPayType.length > 0) {
      reconciliationWrites.push(
        prisma.employee.updateMany({
          where: { id: { in: nonWorkerIdsNeedingFixedPayType } },
          data: { payType: "FIXED" },
        })
      );
    }
    await prisma.$transaction(reconciliationWrites);
  }

  return roles;
};

const resolveDefaultEmployeeRoleId = async (orgId: number) => {
  const roles = await ensureDefaultEmployeeRoles(orgId);
  const sewingRole = roles.find((role) => role.code === DEFAULT_EMPLOYEE_ROLE_CODE_SEWING);
  return sewingRole?.id ?? null;
};

const normalizeManagedAttributeCode = (value: any): string =>
  String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const buildAutoManagedAttributeCodeBase = (
  name: any,
  fallbackPrefix = "ITEM"
): string => normalizeManagedAttributeCode(name) || fallbackPrefix;

const generateUniqueManagedAttributeCode = ({
  usedCodes,
  name,
  fallbackPrefix = "ITEM",
}: {
  usedCodes: Set<string>;
  name: any;
  fallbackPrefix?: string;
}) => {
  const baseCode = buildAutoManagedAttributeCodeBase(name, fallbackPrefix);
  let candidate = baseCode;
  let suffix = 2;

  while (usedCodes.has(candidate)) {
    candidate = `${baseCode}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const resolveColorAttributeCode = ({
  code,
  name,
  usedCodes,
}: {
  code: any;
  name: any;
  usedCodes: Set<string>;
}) => {
  const explicitCode = normalizeManagedAttributeCode(code);
  if (explicitCode) return explicitCode;
  if (!String(name ?? "").trim()) return "";
  return generateUniqueManagedAttributeCode({
    usedCodes,
    name,
    fallbackPrefix: "COLOR",
  });
};

const resolveCategoryAttributeCode = ({
  code,
  name,
  usedCodes,
}: {
  code: any;
  name: any;
  usedCodes: Set<string>;
}) => {
  const explicitCode = normalizeManagedAttributeCode(code);
  if (explicitCode) return explicitCode;
  if (!String(name ?? "").trim()) return "";
  return generateUniqueManagedAttributeCode({
    usedCodes,
    name,
    fallbackPrefix: "CATEGORY",
  });
};

const syncSection = async (model: any, orgId: number, items: any, options: any = {}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await model.findMany({
    where: { orgId },
    select: { id: true, code: true },
  });
  const existingIds = existing.map((item: any) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id: any) => !incomingIdSet.has(id));
  const deleteIdSet = new Set(deleteIds);
  if (deleteIds.length > 0 && typeof options.beforeDeleteIds === "function") {
    await options.beforeDeleteIds(deleteIds);
  }
  if (deleteIds.length > 0) {
    await model.deleteMany({ where: { orgId, id: { in: deleteIds } } });
  }

  const creates = [];
  const updates = [];
  const existingCodeById = existing.reduce((map: Map<number, string>, item: any) => {
    map.set(item.id, String(item.code ?? "").trim());
    return map;
  }, new Map<number, string>());
  const usedCodes = existing.reduce((set: Set<string>, item: any) => {
    if (deleteIdSet.has(item.id)) return set;
    const trackedCode =
      typeof options.trackCode === "function"
        ? options.trackCode(item.code)
        : String(item.code ?? "").trim();
    if (trackedCode) {
      set.add(trackedCode);
    }
    return set;
  }, new Set<string>());

  for (const item of safeItems) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const existingCode = itemId ? existingCodeById.get(itemId) ?? "" : "";
    const trackedExistingCode =
      typeof options.trackCode === "function"
        ? options.trackCode(existingCode)
        : String(existingCode ?? "").trim();
    if (trackedExistingCode) {
      usedCodes.delete(trackedExistingCode);
    }

    let code = (item.code ?? "").trim();
    const {
      name,
      nameKo,
      nameEn,
      nameVi,
    } = (
      typeof options.resolveNameData === "function"
        ? options.resolveNameData(item, { orgId, itemId, existingCode })
        : resolveManagedColorNameData(item)
    ) as {
      name: string;
      nameKo: string | null;
      nameEn: string | null;
      nameVi: string | null;
    };
    if (typeof options.resolveCode === "function") {
      code = options.resolveCode({
        code,
        name,
        item,
        itemId,
        existingCode,
        usedCodes,
      });
    }

    if (!code && !name) {
      if (trackedExistingCode) {
        usedCodes.add(trackedExistingCode);
      }
      continue;
    }

    if (itemId) {
      updates.push(
        model.updateMany({
          where: { id: itemId, orgId },
          data: { code, name, nameKo, nameEn, nameVi },
        })
      );
    } else {
      creates.push({ orgId, code, name, nameKo, nameEn, nameVi });
    }

    const trackedNextCode =
      typeof options.trackCode === "function"
        ? options.trackCode(code)
        : String(code ?? "").trim();
    if (trackedNextCode) {
      usedCodes.add(trackedNextCode);
    }
  }

  if (creates.length > 0) {
    await model.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return model.findMany({ where: { orgId }, orderBy: { id: "asc" } });
};
const syncGlobalColorSection = async (items: any) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await prisma.attrColor.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
  });
  const existingIds = existing.map((item) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id) => !incomingIdSet.has(id));
  const deleteIdSet = new Set(deleteIds);
  if (deleteIds.length > 0) {
    await prisma.attrColor.deleteMany({ where: { id: { in: deleteIds } } });
  }

  const existingById = existing.reduce(
    (map: Map<number, { code: string; name: string }>, item) => {
      map.set(item.id, {
        code: String(item.code ?? "").trim(),
        name: String(item.name ?? "").trim(),
      });
      return map;
    },
    new Map<number, { code: string; name: string }>()
  );
  const usedCodes = existing.reduce((set: Set<string>, item) => {
    if (deleteIdSet.has(item.id)) return set;
    const trackedCode = normalizeManagedAttributeCode(item.code);
    if (trackedCode) set.add(trackedCode);
    return set;
  }, new Set<string>());

  const creates: Array<{
    code: string;
    name: string;
    nameKo: string | null;
    nameEn: string | null;
    nameVi: string | null;
  }> = [];
  const updates: Array<{
    id: number;
    code: string;
    name: string;
    nameKo: string | null;
    nameEn: string | null;
    nameVi: string | null;
  }> = [];
  const changedCodes: Array<{ id: number; code: string }> = [];
  const changedNames: Array<{ id: number; name: string }> = [];

  for (const item of safeItems) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const existingRow = itemId
      ? existingById.get(itemId) ?? { code: "", name: "" }
      : { code: "", name: "" };
    const trackedExistingCode = normalizeManagedAttributeCode(existingRow.code);
    if (trackedExistingCode) {
      usedCodes.delete(trackedExistingCode);
    }

    const { name, nameKo, nameEn, nameVi } = resolveManagedAttributeNameData(item);
    const code = resolveColorAttributeCode({
      code: String(item?.code ?? "").trim(),
      name,
      usedCodes,
    });

    if (!code && !name) {
      if (trackedExistingCode) {
        usedCodes.add(trackedExistingCode);
      }
      continue;
    }

    if (itemId) {
      updates.push({
        id: itemId,
        code,
        name,
        nameKo,
        nameEn,
        nameVi,
      });
      if (existingRow.code !== code) {
        changedCodes.push({ id: itemId, code });
      }
      if (existingRow.name !== name) {
        changedNames.push({ id: itemId, name });
      }
    } else {
      creates.push({ code, name, nameKo, nameEn, nameVi });
    }

    const trackedNextCode = normalizeManagedAttributeCode(code);
    if (trackedNextCode) {
      usedCodes.add(trackedNextCode);
    }
  }

  if (creates.length > 0) {
    await prisma.attrColor.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((row) =>
        prisma.attrColor.update({
          where: { id: row.id },
          data: {
            code: row.code,
            name: row.name,
            nameKo: row.nameKo,
            nameEn: row.nameEn,
            nameVi: row.nameVi,
          },
        })
      )
    );
  }

  // AssignmentPlan.colorId/colorName were dropped in Phase D (see the comment
  // near AssignmentPlan.colorId/colorName in assertGeneratedPrismaClientShape) -
  // color/gender were never tracked at the assignment level, so there is no
  // longer a denormalized AssignmentPlan.colorName copy to keep in sync here.

  return prisma.attrColor.findMany({ orderBy: { id: "asc" } });
};

const listGlobalCategorySection = async (fallbackOrgId: number | null = null) => {
  const firstCategory = await prisma.attrCategory.findFirst({
    select: { orgId: true },
    orderBy: [{ orgId: "asc" }, { id: "asc" }],
  });
  const sourceOrgId = firstCategory?.orgId ?? fallbackOrgId;
  if (!sourceOrgId) return [];
  return prisma.attrCategory.findMany({
    where: { orgId: sourceOrgId },
    orderBy: { id: "asc" },
  });
};

const syncGlobalCategorySection = async (
  items: any,
  options: {
    fallbackOrgId?: number | null;
  } = {}
) => {
  const organizations = await prisma.organization.findMany({
    where: {
      type: { in: ["MANUFACTURER", "BRAND"] },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const organizationIds = organizations
    .map((item) => toPositiveIntOrNull(item.id))
    .filter((id): id is number => id !== null);
  const fallbackOrgId = toPositiveIntOrNull(options.fallbackOrgId) ?? organizationIds[0] ?? null;
  if (!fallbackOrgId) return [];

  const sourceRows = await syncSection(prisma.attrCategory, fallbackOrgId, items, {
    resolveCode: ({ code, name, usedCodes }: { code: string; name: string; usedCodes: Set<string> }) =>
      resolveCategoryAttributeCode({ code, name, usedCodes }),
    trackCode: normalizeManagedAttributeCode,
  });

  const replicatedRows = sourceRows.map((row: any) => ({
    code: row.code,
    name: row.name,
    nameKo: row.nameKo,
    nameEn: row.nameEn,
    nameVi: row.nameVi,
  }));

  await Promise.all(
    organizationIds
      .filter((orgId) => orgId !== fallbackOrgId)
      .map((orgId) =>
        syncSection(prisma.attrCategory, orgId, replicatedRows, {
          resolveCode: ({
            code,
            name,
            usedCodes,
          }: {
            code: string;
            name: string;
            usedCodes: Set<string>;
          }) => resolveCategoryAttributeCode({ code, name, usedCodes }),
          trackCode: normalizeManagedAttributeCode,
        })
      )
  );

  return sourceRows;
};

const syncRoleSection = async (orgId: number, items: any) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const existing = await prisma.attrRole.findMany({
    where: { orgId },
    select: { id: true, code: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const existingIds = existing.map((item) => item.id);
  const incomingIdSet = new Set(incomingIds);
  const deleteIds = existingIds.filter((id) => !incomingIdSet.has(id));

  if (deleteIds.length > 0) {
    await prisma.employee.updateMany({
      where: {
        orgId,
        roleId: { in: deleteIds },
      },
      data: { roleId: null },
    });
    await prisma.attrRole.deleteMany({ where: { orgId, id: { in: deleteIds } } });
  }

  const creates = [];
  const updates = [];
  for (const [index, item] of safeItems.entries()) {
    const itemId = isNumericId(item.id) ? toId(item.id) : null;
    const code = resolveOptionalString(item.code, null);
    const name = resolveOptionalString(item.name, null);
    const defaultPayType = normalizePayType(item.defaultPayType, "FIXED") ?? "FIXED";
    const sortOrder = toSortOrder(item.sortOrder, index + 1);

    if (!code && !name) continue;

    const data = {
      code: code ?? "",
      name: name ?? "",
      defaultPayType,
      sortOrder,
    };

    if (itemId) {
      updates.push(
        prisma.attrRole.updateMany({
          where: { id: itemId, orgId },
          data,
        })
      );
    } else {
      creates.push({
        orgId,
        ...data,
      });
    }
  }

  if (creates.length > 0) {
    await prisma.attrRole.createMany({ data: creates, skipDuplicates: true });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  const roles = await prisma.attrRole.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return roles.map(toAttrRoleResponse);
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ready: startupLifecycleState === "ready",
    startupState: startupLifecycleState,
  });
});

app.get("/ready", (_req, res) => {
  if (startupLifecycleState !== "ready") {
    return res.status(503).json({
      ok: false,
      ready: false,
      startupState: startupLifecycleState,
    });
  }
  return res.json({ ok: true, ready: true });
});

app.get("/auth/context", async (req, res) => {
  const requesterEmail = getRequesterEmail(req);
  if (!requesterEmail || !requesterEmail.includes("@")) {
    return res.status(401).json({ ok: false, error: "authentication is required" });
  }
  const roleAccessPolicy = (await loadRoleAccessPolicySetting()).policy;

  const systemUser = await prisma.systemUser.findUnique({
    where: { email: requesterEmail },
    select: { systemRole: true },
  });
  if (systemUser?.systemRole === "SYSTEM_ADMIN") {
    let organization = null;
    try {
      organization = await getOrganizationByQuery(req, { allowSuspended: true });
    } catch (error) {
      const status = getErrorStatus(error) ?? 500;
      const message = getErrorMessage(error, "failed to resolve organization");
      return res.status(status).json({ ok: false, error: message });
    }

    return res.json({
      email: requesterEmail,
      entryType: "SYSTEM",
      systemRole: systemUser.systemRole,
      orgId: organization?.id ?? null,
      orgName: organization?.name ?? null,
      orgType: organization?.type ?? null,
      orgRole: null,
      employeeName: null,
      subscription: buildSubscriptionResponse(organization?.subscription),
      accessPolicy: roleAccessPolicy,
      systemAdminContactEmail: getSystemAdminContactEmail(),
    });
  }

  const requestedOrgIdText = getRequestedOrgIdText(req);
  if (requestedOrgIdText) {
    if (!/^\d+$/.test(requestedOrgIdText)) {
      return res.status(400).json({ ok: false, error: "invalid orgId" });
    }
    const requestedOrgId = Number(requestedOrgIdText);
    if (!Number.isSafeInteger(requestedOrgId) || requestedOrgId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid orgId" });
    }

    const employee = await prisma.employee.findUnique({
      where: {
        orgId_email: {
          orgId: requestedOrgId,
          email: requesterEmail,
        },
      },
      include: { organization: true },
    });
    if (employee && employee.status === "ACTIVE" && employee.organization) {
      const organization = await attachOrganizationSubscription(employee.organization);
      return res.json({
        email: requesterEmail,
        entryType: "ORG",
        systemRole: "USER",
        orgId: organization?.id ?? employee.organization.id,
        orgName: organization?.name ?? employee.organization.name ?? null,
        orgType: organization?.type ?? employee.organization.type ?? null,
        orgRole: employee.orgRole,
        factoryId: employee.factoryId ?? null,
        employeeName: employee.name ?? null,
        subscription: buildSubscriptionResponse(organization?.subscription),
        accessPolicy: roleAccessPolicy,
        systemAdminContactEmail: getSystemAdminContactEmail(),
      });
    }
    // If requested org is stale/unauthorized, fall through and resolve by user's actual access.
  }

  const employee = await prisma.employee.findFirst({
    where: {
      email: requesterEmail,
      status: "ACTIVE",
    },
    include: { organization: true },
    orderBy: { id: "asc" },
  });
  if (!employee || !employee.organization) {
    const [pendingMembershipCount, latestRegistrationRequest] = await Promise.all([
      prisma.employee.count({
        where: {
          email: requesterEmail,
          status: "PENDING",
        },
      }),
      prisma.onboardingRequest.findFirst({
        where: {
          requesterEmail,
          status: "PENDING",
        },
        orderBy: { id: "desc" },
      }),
    ]);

    return res.json({
      email: requesterEmail,
      entryType: "ONBOARDING",
      systemRole: "USER",
      orgId: null,
      orgName: null,
      orgType: null,
      orgRole: null,
      employeeName: null,
      onboardingRequired: true,
      pendingMembershipCount,
      latestRegistrationRequest: latestRegistrationRequest
        ? toOnboardingRequestSummary(latestRegistrationRequest)
        : null,
      accessPolicy: roleAccessPolicy,
      systemAdminContactEmail: getSystemAdminContactEmail(),
    });
  }

  const organization = await attachOrganizationSubscription(employee.organization);
  res.json({
    email: requesterEmail,
    entryType: "ORG",
    systemRole: "USER",
    orgId: organization?.id ?? employee.organization.id,
    orgName: organization?.name ?? employee.organization.name ?? null,
    orgType: organization?.type ?? employee.organization.type ?? null,
    orgRole: employee.orgRole,
    factoryId: employee.factoryId ?? null,
    employeeName: employee.name ?? null,
    subscription: buildSubscriptionResponse(organization?.subscription),
    accessPolicy: roleAccessPolicy,
    systemAdminContactEmail: getSystemAdminContactEmail(),
  });
});

app.get("/system/access-policy", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;
  return res.json(await loadRoleAccessPolicySetting());
});

app.put("/system/access-policy", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const policy = sanitizeRoleAccessPolicy(req.body?.policy ?? req.body);
  await ensureSystemSettingStorageReady();
  const saved = await prisma.systemSetting.upsert({
    where: { key: ROLE_ACCESS_POLICY_SETTING_KEY },
    create: {
      key: ROLE_ACCESS_POLICY_SETTING_KEY,
      value: serializeRoleAccessPolicy(policy) as Prisma.InputJsonValue,
      updatedBy: systemAdmin.requesterEmail,
    },
    update: {
      value: serializeRoleAccessPolicy(policy) as Prisma.InputJsonValue,
      updatedBy: systemAdmin.requesterEmail,
    },
    select: {
      value: true,
      updatedAt: true,
      updatedBy: true,
    },
  });

  return res.json({
    policy: serializeRoleAccessPolicy(sanitizeRoleAccessPolicy(saved.value)),
    stored: true,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  });
});

app.post("/onboarding/company-requests", async (req, res) => {
  let requesterEmail = "";
  try {
    requesterEmail = resolveOnboardingRequesterEmail(
      req,
      req.body?.requesterEmail ?? req.body?.email
    );
  } catch (error) {
    const status = getErrorStatus(error) ?? 400;
    const message = getErrorMessage(error, "failed to resolve requester email");
    return res.status(status).json({ ok: false, error: message });
  }
  if (!requesterEmail || !requesterEmail.includes("@")) {
    return res.status(401).json({ ok: false, error: "authentication is required" });
  }

  const organizationNameEn = resolveOptionalString(
    req.body?.organizationName ?? req.body?.organizationNameEn,
    null
  );
  if (
    !organizationNameEn ||
    organizationNameEn.length < ONBOARDING_COMPANY_NAME_MIN_LENGTH ||
    organizationNameEn.length > ONBOARDING_COMPANY_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `organizationName must be ${ONBOARDING_COMPANY_NAME_MIN_LENGTH}-${ONBOARDING_COMPANY_NAME_MAX_LENGTH} chars`,
    });
  }

  const rawOrganizationType =
    req.body?.organizationType ?? req.body?.orgType ?? req.body?.industryType;
  const organizationType =
    rawOrganizationType === undefined || rawOrganizationType === null || rawOrganizationType === ""
      ? ORGANIZATION_TYPE_KEYS.MANUFACTURER
      : resolveOnboardingOrganizationType(rawOrganizationType);
  if (!organizationType) {
    return res.status(400).json({
      ok: false,
      error: `organizationType must be ${ORGANIZATION_TYPE_KEYS.MANUFACTURER} or ${ORGANIZATION_TYPE_KEYS.BRAND}`,
    });
  }

  const country = resolveOnboardingCountry(req.body?.country ?? req.body?.countryCode);
  if (!country) {
    return res.status(400).json({ ok: false, error: "country must be KR or VN" });
  }

  const companyAddress = resolveOptionalString(
    req.body?.companyAddress ?? req.body?.address,
    null
  );
  if (!companyAddress || companyAddress.length > ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: `companyAddress is required (max ${ONBOARDING_COMPANY_ADDRESS_MAX_LENGTH} chars)`,
    });
  }

  const businessNumber = normalizeOnboardingBusinessNumber(req.body?.businessNumber);
  if (!businessNumber) {
    return res.status(400).json({ ok: false, error: "businessNumber is required" });
  }
  if (!isValidOnboardingBusinessNumber(country, businessNumber)) {
    return res.status(400).json({
      ok: false,
      error:
        country === "KR"
          ? "invalid KR businessNumber format (10 digits or 3-2-5)"
          : "invalid VN businessNumber format (10 digits or 13 digits)",
    });
  }
  const businessNumberIdentity = getOnboardingBusinessNumberIdentity(businessNumber);

  const contactName = resolveOptionalString(
    req.body?.representativeName ?? req.body?.contactName,
    null
  );
  if (
    !contactName ||
    contactName.length > ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `contactName is required (max ${ONBOARDING_REPRESENTATIVE_NAME_MAX_LENGTH} chars)`,
    });
  }

  const contactEmail = normalizeEmail(req.body?.representativeEmail ?? req.body?.contactEmail);
  if (!contactEmail || !contactEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "contactEmail is required" });
  }

  const contactPhone = resolveOptionalString(
    req.body?.representativeContact ?? req.body?.contactPhone,
    null
  );
  if (
    !contactPhone ||
    contactPhone.length > ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: `contactPhone is required (max ${ONBOARDING_REPRESENTATIVE_CONTACT_MAX_LENGTH} chars)`,
    });
  }

  const hasActiveMembership = await prisma.employee.count({
    where: {
      email: requesterEmail,
      status: "ACTIVE",
    },
  });
  if (hasActiveMembership > 0) {
    return res.status(409).json({
      ok: false,
      error: "active org membership already exists",
    });
  }

  const existingPendingRequest = await prisma.onboardingRequest.findFirst({
    where: {
      requesterEmail,
      status: "PENDING",
      requestType: "REGISTER_ORG",
    },
    orderBy: { id: "desc" },
  });

  const [existingOrganization, duplicatePendingRequest] = await Promise.all([
    findOrganizationByBusinessNumberIdentity(businessNumberIdentity),
    findPendingOnboardingRequestByBusinessNumberIdentity(
      businessNumberIdentity,
      existingPendingRequest?.id
        ? { excludeRequestId: existingPendingRequest.id }
        : {}
    ),
  ]);

  if (existingOrganization) {
    return res.status(409).json({
      ok: false,
      error: "organization already exists for this businessNumber",
    });
  }

  if (duplicatePendingRequest) {
    return res.status(409).json({
      ok: false,
      error: "pending company request already exists for this businessNumber",
    });
  }

  const savedRequest = existingPendingRequest
    ? await prisma.onboardingRequest.update({
        where: { id: existingPendingRequest.id },
        data: {
          organizationNameEn,
          organizationType,
          country,
          companyAddress,
          businessNumber,
          contactName,
          contactEmail,
          contactPhone,
        },
      })
    : await prisma.onboardingRequest.create({
        data: {
          requesterEmail,
          requestType: "REGISTER_ORG",
          organizationNameEn,
          organizationType,
          country,
          companyAddress,
          businessNumber,
          contactName,
          contactEmail,
          contactPhone,
          status: "PENDING",
        },
      });

  return res.status(existingPendingRequest ? 200 : 201).json({
    ok: true,
    request: toOnboardingRequestSummary(savedRequest),
  });
});

app.get("/system/onboarding-requests", async (req, res) => {
  if (!(await requireSystemAdmin(req, res))) return;

  const pendingCompanyRequests = await prisma.onboardingRequest.findMany({
    where: { status: "PENDING" },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return res.json({
    pendingMembershipRequests: [],
    pendingCompanyRequests: pendingCompanyRequests.map(toOnboardingRequestSummary),
  });
});

app.patch("/system/company-requests/:id/approve", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const companyRequest = await prisma.onboardingRequest.findUnique({
    where: { id },
  });
  if (!companyRequest) {
    return res.status(404).json({ ok: false, error: "request not found" });
  }
  if (companyRequest.status !== "PENDING") {
    return res.status(409).json({ ok: false, error: "request is not pending" });
  }

  const rawSubscriptionStatus = req.body?.subscriptionStatus ?? req.body?.status;
  const normalizedSubscriptionStatus =
    rawSubscriptionStatus === undefined
      ? undefined
      : resolveSubscriptionStatus(rawSubscriptionStatus);
  if (rawSubscriptionStatus !== undefined && !normalizedSubscriptionStatus) {
    return res.status(400).json({ ok: false, error: "invalid subscription status" });
  }

  const normalizedServiceContactEmail = normalizeEmail(
    req.body?.serviceContactEmail ?? req.body?.membershipEmail
  );
  const normalizedBillingEmail = normalizeEmail(req.body?.billingEmail);
  const subscriptionPayload: Record<string, unknown> = {};
  subscriptionPayload.subscriptionStatus =
    normalizedSubscriptionStatus ?? "TRIAL";
  if (normalizedSubscriptionStatus === "ACTIVE") {
    subscriptionPayload.serviceContactEmail =
      normalizedServiceContactEmail || companyRequest.contactEmail;
    subscriptionPayload.billingEmail =
      normalizedBillingEmail || companyRequest.contactEmail;
    subscriptionPayload.activeEndsAt = req.body?.activeEndsAt ?? null;
  } else {
    if (normalizedServiceContactEmail) {
      subscriptionPayload.serviceContactEmail = normalizedServiceContactEmail;
    }
    if (normalizedBillingEmail) {
      subscriptionPayload.billingEmail = normalizedBillingEmail;
    }
  }

  const now = new Date();
  const businessNumberIdentity = getOnboardingBusinessNumberIdentity(
    companyRequest.businessNumber
  );
  const existingOrganization = await findOrganizationByBusinessNumberIdentity(
    businessNumberIdentity
  );
  if (existingOrganization) {
    return res.status(409).json({
      ok: false,
      error: "organization already exists for this businessNumber",
    });
  }

  const organizationType =
    resolveOnboardingOrganizationType(companyRequest.organizationType) ??
    ORGANIZATION_TYPE_KEYS.MANUFACTURER;
  const organizationCountry = resolveOnboardingCountry(companyRequest.country);
  const organization = await prisma.organization.create({
    data: {
      name: companyRequest.organizationNameEn,
      businessNumber: companyRequest.businessNumber,
      representative: companyRequest.contactName || null,
      address: companyRequest.companyAddress || null,
      country: organizationCountry ?? null,
      email: companyRequest.contactEmail,
      phone: companyRequest.contactPhone,
      type: organizationType,
    },
  });

  await applySubscriptionPayload(organization, subscriptionPayload);
  const organizationWithSubscription = await attachOrganizationSubscription(organization);

  const approvedEmployee = await prisma.$transaction(async (tx) => {
    const approvedEmployee = await tx.employee.upsert({
      where: {
        orgId_email: {
          orgId: organization.id,
          email: companyRequest.requesterEmail,
        },
      },
      update: {
        orgRole: "ADMIN",
        status: "ACTIVE",
        requestedAt: now,
        requestedName: companyRequest.contactName || null,
        approvedAt: now,
        approvedBy: systemAdmin.requesterEmail,
        name: companyRequest.contactName || null,
        phone: companyRequest.contactPhone || null,
        joinedAt: now,
        leftAt: null,
      },
      create: {
        orgId: organization.id,
        email: companyRequest.requesterEmail,
        orgRole: "ADMIN",
        status: "ACTIVE",
        requestedAt: now,
        requestedName: companyRequest.contactName || null,
        approvedAt: now,
        approvedBy: systemAdmin.requesterEmail,
        name: companyRequest.contactName || null,
        phone: companyRequest.contactPhone || null,
        joinedAt: now,
        leftAt: null,
      },
    });
    return approvedEmployee;
  });

  const updatedRequest = await prisma.onboardingRequest.update({
    where: { id: companyRequest.id },
    data: {
      status: "APPROVED",
      approvedAt: now,
      approvedBy: systemAdmin.requesterEmail,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      organizationId: organization.id,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return res.json({
    ok: true,
    request: toOnboardingRequestSummary(updatedRequest),
    organization: toOrganizationResponse(organizationWithSubscription),
    membership: {
      id: approvedEmployee.id,
      orgId: approvedEmployee.orgId,
      email: approvedEmployee.email,
      role: approvedEmployee.orgRole,
      status: approvedEmployee.status,
      requestedAt: approvedEmployee.requestedAt,
      requestedName: approvedEmployee.requestedName,
      approvedAt: approvedEmployee.approvedAt,
      approvedBy: approvedEmployee.approvedBy,
    },
  });
});

app.patch("/system/company-requests/:id/reject", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const companyRequest = await prisma.onboardingRequest.findUnique({
    where: { id },
  });
  if (!companyRequest) {
    return res.status(404).json({ ok: false, error: "request not found" });
  }
  if (companyRequest.status !== "PENDING") {
    return res.status(409).json({ ok: false, error: "request is not pending" });
  }

  const rejectionReason = resolveOptionalString(req.body?.reason, null);
  const now = new Date();
  const updatedRequest = await prisma.onboardingRequest.update({
    where: { id: companyRequest.id },
    data: {
      status: "REJECTED",
      rejectedAt: now,
      rejectedBy: systemAdmin.requesterEmail,
      rejectionReason,
      approvedAt: null,
      approvedBy: null,
      organizationId: null,
    },
  });

  return res.json({
    ok: true,
    request: toOnboardingRequestSummary(updatedRequest),
  });
});

app.use(
  createOrganizationRouter({
    applySubscriptionPayload,
    toOrganizationResponse,
  })
);

app.use(
  createOrgMembershipRouter({
    closeActiveLineAssignments,
    hasOrgFeatureAccess: hasRoleAccessPolicyFeature,
    isManufacturerOrg,
    resolveDefaultEmployeeRoleId,
    resolveEmployeeStoredPayType,
    resolveRole,
    resolveStatus,
  })
);

app.use(
  createEmployeeRouter({
    hasOrgFeatureAccess: hasRoleAccessPolicyFeature,
    isManufacturerOrg,
    resolveDefaultEmployeeRoleId,
    resolveEmployeeStoredPayType,
  })
);

app.use(
  createFactoryRouter({
    isManufacturerOrg,
  })
);

app.use(
  createLineRouter({
    closeActiveLineAssignments,
    isManufacturerOrg,
  })
);
app.get("/assignment-plans", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const lineId = Number(req.query.lineId);
  const hasLineFilter = Number.isFinite(lineId) && lineId > 0;
  const factoryId = Number(req.query.factoryId);
  const hasFactoryFilter = Number.isFinite(factoryId) && factoryId > 0;
  if (!hasLineFilter && !hasFactoryFilter) {
    return res
      .status(400)
      .json({ ok: false, error: "lineId or factoryId is required" });
  }

  let lineIds: number[] = [];
  if (hasLineFilter) {
    const line = await prisma.line.findFirst({
      where: {
        id: lineId,
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
      },
      select: { id: true },
    });
    if (!line) {
      return res.status(404).json({ ok: false, error: "line not found" });
    }
    lineIds = [line.id];
  } else {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
      select: { id: true },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }

    const factoryLines = await prisma.line.findMany({
      where: { orgId: organization.id, factoryId },
      select: { id: true },
    });
    lineIds = factoryLines
      .map((line) => Number(line.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (lineIds.length === 0) {
      return res.json([]);
    }
  }

  const assignmentPlanLineFilter: Prisma.AssignmentPlanWhereInput["lineId"] =
    lineIds.length === 1 ? lineIds[0]! : { in: lineIds };
  let plans = await findAssignmentPlansWithSelectFallback({
    where: {
      orgId: organization.id,
      lineId: assignmentPlanLineFilter,
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    selectAttempts: [ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY, ASSIGNMENT_PLAN_SELECT_LEGACY],
    context: "GET /assignment-plans",
  });
  plans = await annotateAssignmentPlanRowsWithPayrollLocks(organization.id, plans);

  const stateByExternalId = new Map<string, any>();

  res.json(
    plans.map((plan) => {
      const cardId =
        resolveOptionalString(plan.cardId, null) ??
        resolveOptionalString(plan.originOrderId, null) ??
        null;
      const stateAssignment =
        stateByExternalId.get(resolveOptionalString(plan.externalId, null) || "") || null;
      const snapshotSchedule = resolveNormalizedAssignmentCtSnapshot(plan)?.schedule || null;
      const startDateKey =
        normalizeDateKey(stateAssignment?.startDateKey) ||
        normalizeDateKey(snapshotSchedule?.startDateKey) ||
        normalizeDateKey(resolveAssignmentStartDateKey(stateAssignment));
      const endDateKey =
        normalizeDateKey(stateAssignment?.endDateKey) ||
        normalizeDateKey(snapshotSchedule?.endDateKey) ||
        (startDateKey
          ? shiftDateKeyByDaysForAssignmentSchedule(
              startDateKey,
              Math.max(0, toSignedInt(plan.endIndex, plan.startIndex) - toSignedInt(plan.startIndex, 0))
            )
          : null);
      const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
      const closedQty = resolveAssignmentPlanClosedQty(plan);
      const completedAt = resolveAssignmentPlanClosedAt(plan);
      const isCompleted = plan?.isCompleted === true;
      const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
      const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
      const closeMode =
        resolveOptionalString(plan?.closeMode, null) ??
        resolveAssignmentPlanCloseMode({
          closedQty,
          targetQty: resolveAssignmentQuantity(plan),
        });
      const closeBasis = resolveAssignmentPlanCloseBasis(plan);
      // Phase C (AssignmentCard/AssignmentPlan FK+join redesign): response
      // values come from AssignmentPlan's real FK joins, not cardId/payload
      // lookups.
      return {
        dbId: plan.id,
        id: plan.externalId,
        lineId: String(plan.lineId),
        cardId,
        workOrderId: toPositiveIntOrNull(plan?.workOrderId),
        styleId: toPositiveIntOrNull(plan?.style?.id),
        styleCode: resolveOptionalString(plan?.style?.code, null) ?? "",
        orderNo: resolveOptionalString(plan?.workOrder?.orderNumber, null) ?? "",
        label: resolveOptionalString(plan?.style?.name, null) ?? "",
        customer: resolveOptionalString(plan?.buyerOrg?.name, null) ?? "",
        customerNameKo: resolveOptionalString(plan?.buyerOrg?.nameKo, null) ?? "",
        customerNameVi: resolveOptionalString(plan?.buyerOrg?.nameVi, null) ?? "",
        // colorId/colorName/color dropped in Phase D - see the comment in
        // toAssignmentPlanResponse.
        colorId: null,
        colorName: "",
        color: "",
        quantity: resolveAssignmentQuantity(plan),
        ctTotalSeconds: resolveAssignmentCtTotalSeconds(plan),
        assignmentCtSnapshot: resolveNormalizedAssignmentCtSnapshot(plan),
        ctUpdatedBy:
          resolveNormalizedAssignmentCtSnapshot(plan)?.updatedBy ?? "",
        ctUpdatedAt:
          resolveNormalizedAssignmentCtSnapshot(plan)?.updatedAt ?? null,
        startIndex: plan.startIndex,
        endIndex: plan.endIndex,
        startDateKey,
        endDateKey,
        isCompleted,
        finalQuantity,
        qcPassedTotal,
        latestQcDate,
        closedQty,
        completedAt,
        closedAt: completedAt,
        closedBy: resolveOptionalString(plan?.closedBy, null),
        closeMode,
        closeBasis,
      };
    })
  );
});

const ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE = "UNAVAILABLE";
const ASSIGNMENT_FORECAST_BASIS_WORKLOG_RATIO = "WORKLOG_RATIO";
const ASSIGNMENT_CONFIDENCE_UNAVAILABLE = "UNAVAILABLE";
const ASSIGNMENT_CONFIDENCE_LOW = "LOW";
const ASSIGNMENT_CONFIDENCE_MEDIUM = "MEDIUM";
const ASSIGNMENT_CONFIDENCE_HIGH = "HIGH";
const ASSIGNMENT_STATUS_IN_PROGRESS = "IN_PROGRESS";
const ASSIGNMENT_STATUS_REVIEW_REQUIRED = "REVIEW_REQUIRED";
const ASSIGNMENT_STATUS_READY_TO_COMPLETE = "READY_TO_COMPLETE";
const ASSIGNMENT_STATUS_PRODUCTION_COMPLETED = "PRODUCTION_COMPLETED";
const AUTO_WORKLOG_COMPLETED_BY = "system:auto-worklog";

type AssignmentPlanWorkStats = {
  processTotalsByKey: Map<string, number>;
  dailyProcessTotalsByDate: Map<string, Map<string, number>>;
  firstWorkDate: string | null;
  lastWorkDate: string | null;
  hasRangeCoverage: boolean;
};

const SCHEDULER_PROGRESS_IMBALANCE_WARNING_THRESHOLD = 0.2;

const toDateValueFromDateKeyForAssignmentSchedule = (
  dateKeyInput: any
): Date | null => {
  const utcDate = toUtcDateFromDateKeyForAssignmentSchedule(dateKeyInput);
  if (!utcDate) return null;
  return new Date(utcDate.getTime());
};

const resolveAssignmentPlanRequiredProcessGroups = (plan: any): string[][] => {
  const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
  const processRows = ensureArray(snapshot?.processes);
  if (processRows.length === 0) return [];

  const groups = processRows
    .map((process) => {
      const candidates: string[] = [];
      const styleProcessId = toPositiveIntOrNull(process?.styleProcessId);
      if (styleProcessId) candidates.push(`style-process:${styleProcessId}`);
      return Array.from(new Set(candidates));
    })
    .filter((group) => group.length > 0);

  return groups;
};

const resolveAssignmentPlanStyleQueryValues = (plan: any): string[] => {
  const styleId = toPositiveIntOrNull(plan?.styleId) ?? toPositiveIntOrNull(plan?.style?.id);
  return Array.from(
    new Set(
      [
        styleId !== null ? String(styleId) : null,
        plan?.style?.code,
        plan?.style?.name,
      ]
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );
};

const resolveOrphanWorkRecordLineId = (record: any): number | null =>
  toPositiveIntOrNull(record?.lineId) ??
  resolveWorkLogLineMeta(record?.workLog?.records).lineId;

const loadAssignmentPlanProgressWorkRows = async ({
  orgId,
  plans,
  stateAssignmentsByExternalId,
  context,
}: {
  orgId: number;
  plans: any[];
  stateAssignmentsByExternalId: Map<string, any>;
  context: string;
}) => {
  const normalizedPlans = ensureArray(plans).filter(Boolean);
  const planIds = normalizedPlans
    .map((plan) => toPositiveIntOrNull(plan?.id))
    .filter((planId): planId is number => planId !== null);
  if (planIds.length === 0) return [];

  const selectWorkRows = async ({
    where,
    includeCoverage,
    includeEffectiveCoverage,
  }: {
    where: Prisma.WorkRecordWhereInput;
    includeCoverage: boolean;
    includeEffectiveCoverage: boolean;
  }): Promise<any[]> =>
    prisma.workRecord.findMany({
      where,
      select: {
        id: true,
        workLogId: true,
        assignmentPlanId: true,
        workerId: true,
        lineId: true,
        styleId: true,
        styleProcessId: true,
        worker: {
          select: { name: true },
        },
        style: {
          select: { id: true, code: true, name: true },
        },
        styleProcess: {
          select: {
            id: true,
            styleId: true,
            processCode: true,
            processName: true,
          },
        },
        ctSeconds: true,
        quantity: true,
        ...(includeEffectiveCoverage
          ? {
              effectiveCoverageStartDate: true,
              effectiveCoverageEndDate: true,
            }
          : {}),
        workLog: {
          select: {
            displayDate: true,
            records: true,
            ...(includeCoverage
              ? {
                  coverageStartDate: true,
                  coverageEndDate: true,
                  entryMode: true,
                }
              : {}),
          },
        },
      } as any,
    });

  let directRows: any[] = [];
  try {
    directRows = await selectWorkRows({
      where: {
        orgId,
        assignmentPlanId: { in: planIds },
      },
      includeCoverage: true,
      includeEffectiveCoverage: true,
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    const fallbackModes = [
      { includeCoverage: true, includeEffectiveCoverage: false },
      { includeCoverage: false, includeEffectiveCoverage: true },
      { includeCoverage: false, includeEffectiveCoverage: false },
    ];
    let recovered = false;
    for (const mode of fallbackModes) {
      try {
        directRows = await selectWorkRows({
          where: {
            orgId,
            assignmentPlanId: { in: planIds },
          },
          includeCoverage: mode.includeCoverage,
          includeEffectiveCoverage: mode.includeEffectiveCoverage,
        });
        recovered = true;
        break;
      } catch (fallbackError) {
        if (!isWorkLogCoverageMissingColumnError(fallbackError)) {
          throw fallbackError;
        }
      }
    }
    if (!recovered) throw error;
    console.warn(
      `[assignment-plan-progress] orgId=${orgId} ${context}: missing work-log/work-record coverage columns; fallback work-record projection activated`
    );
  }

  void stateAssignmentsByExternalId;
  return directRows;
};

const resolveAssignmentProcessGroupTotals = ({
  processTotalsByKey,
  processKeyGroups = [],
}: {
  processTotalsByKey: Map<string, number>;
  processKeyGroups?: string[][];
}): number[] => {
  const normalizedGroups = ensureArray(processKeyGroups).filter(
    (group): group is string[] => Array.isArray(group) && group.length > 0
  );

  if (normalizedGroups.length > 0) {
    return normalizedGroups.map((group) =>
      group.reduce(
        (max, key) => Math.max(max, Math.max(0, Math.round(Number(processTotalsByKey.get(key) || 0)))),
        0
      )
    );
  }

  return [];
};

const resolveProducedQtyFromProcessKeyTotals = ({
  processTotalsByKey,
  processKeyGroups = [],
}: {
  processTotalsByKey: Map<string, number>;
  processKeyGroups?: string[][];
}): number => {
  const processTotals = resolveAssignmentProcessGroupTotals({
    processTotalsByKey,
    processKeyGroups,
  });

  return resolveAssignmentProducedQuantityFromProcessTotals({
    processTotals,
    baselineQuantity: null,
  });
};

const resolveStyleProcessIdFromAssignmentProcessKey = (value: any): number | null => {
  const processKey = resolveOptionalString(value, null);
  if (!processKey) return null;
  const prefix = "style-process:";
  if (!processKey.startsWith(prefix)) return null;
  return toPositiveIntOrNull(processKey.slice(prefix.length));
};

const collectStyleProcessIdsFromProcessKeyGroups = (processKeyGroups: string[][] = []) =>
  collectPositiveIntSet(
    ...ensureArray(processKeyGroups).flatMap((group) =>
      ensureArray(group).map((key) => resolveStyleProcessIdFromAssignmentProcessKey(key))
    )
  );

const calculateRemainingStTotalSecondsFromProcessProgress = ({
  processTotalsByKey,
  processKeyGroups = [],
  plannedQuantity,
  bucketQuantity,
  styleProcessRowsById,
}: {
  processTotalsByKey: Map<string, number>;
  processKeyGroups?: string[][];
  plannedQuantity: number;
  bucketQuantity: number;
  styleProcessRowsById: Map<number, any>;
}): number | null => {
  const normalizedPlannedQuantity = Math.max(
    0,
    Math.round(Number(plannedQuantity) || 0)
  );
  if (normalizedPlannedQuantity <= 0) return null;
  const normalizedGroups = ensureArray(processKeyGroups).filter(
    (group): group is string[] => Array.isArray(group) && group.length > 0
  );
  if (normalizedGroups.length === 0) return null;

  let totalRemainingSeconds = 0;
  for (const group of normalizedGroups) {
    const completedQuantity = group.reduce(
      (max, key) =>
        Math.max(max, Math.max(0, Math.round(Number(processTotalsByKey.get(key) || 0)))),
      0
    );
    const remainingQuantity = Math.max(0, normalizedPlannedQuantity - completedQuantity);
    if (remainingQuantity <= 0) continue;
    const styleProcessRow =
      group
        .map((key) => resolveStyleProcessIdFromAssignmentProcessKey(key))
        .filter((value): value is number => value !== null)
        .map((styleProcessId) => styleProcessRowsById.get(styleProcessId) ?? null)
        .find((row) => Boolean(row)) ?? null;
    if (!styleProcessRow) return null;
    const bucketStSeconds = resolveStyleProcessBucketStSeconds(
      styleProcessRow,
      bucketQuantity
    );
    if (bucketStSeconds === null) return null;
    totalRemainingSeconds += remainingQuantity * bucketStSeconds;
  }

  return Math.max(0, Math.round(totalRemainingSeconds));
};

const resolveWorklogRatioConfidence = ({
  producedQty,
  planQty,
  elapsedDays,
  isProxy = false,
}: {
  producedQty: number;
  planQty: number | null;
  elapsedDays: number | null;
  isProxy?: boolean;
}): "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE" => {
  const normalizedProducedQty = Math.max(0, Math.round(Number(producedQty) || 0));
  if (normalizedProducedQty <= 0) return ASSIGNMENT_CONFIDENCE_UNAVAILABLE;

  const normalizedPlanQty =
    planQty != null && Number.isFinite(planQty) && planQty > 0
      ? Math.round(planQty)
      : null;
  const normalizedElapsedDays =
    elapsedDays != null && Number.isFinite(elapsedDays) && elapsedDays > 0
      ? Math.round(elapsedDays)
      : 1;

  let confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE" =
    ASSIGNMENT_CONFIDENCE_LOW;
  const producedRatio =
    normalizedPlanQty && normalizedPlanQty > 0
      ? normalizedProducedQty / normalizedPlanQty
      : null;

  if (producedRatio != null && producedRatio < 0.1) {
    confidence = ASSIGNMENT_CONFIDENCE_LOW;
  } else if (normalizedElapsedDays >= 7) {
    confidence =
      producedRatio != null && producedRatio >= 0.3
        ? ASSIGNMENT_CONFIDENCE_HIGH
        : ASSIGNMENT_CONFIDENCE_MEDIUM;
  } else if (normalizedElapsedDays >= 3) {
    confidence = ASSIGNMENT_CONFIDENCE_MEDIUM;
  } else {
    confidence = ASSIGNMENT_CONFIDENCE_LOW;
  }

  if (isProxy) {
    return ASSIGNMENT_CONFIDENCE_LOW;
  }
  return confidence;
};

const resolveNextWorkingDateKeyForAssignmentSchedule = ({
  fromDateKey,
  holidaySet,
}: {
  fromDateKey: string;
  holidaySet: Set<string>;
}): string => {
  let cursor = normalizeDateKey(fromDateKey) || fromDateKey;
  for (let i = 0; i < 366 * 3; i += 1) {
    const shifted = shiftDateKeyByDaysForAssignmentSchedule(cursor, 1);
    if (!shifted) return cursor;
    const date = toUtcDateFromDateKeyForAssignmentSchedule(shifted);
    if (!date) {
      cursor = shifted;
      continue;
    }
    const isSunday = date.getUTCDay() === 0;
    if (!isSunday && !holidaySet.has(shifted)) return shifted;
    cursor = shifted;
  }
  return cursor;
};

const DEFAULT_LINE_DAILY_WORK_SECONDS = 8 * 60 * 60;
const MAX_LINE_MONTH_CAPACITY_MONTH_SPAN = 18;


const resolveStrictWorkLogCoverageStartDate = (source: any): string | null =>
  normalizeDateKey(source?.coverageStartDate) || null;

const resolveStrictWorkLogCoverageEndDate = (source: any): string | null =>
  normalizeDateKey(source?.coverageEndDate) || null;

const getMonthStartDateKeyForLineMonthCapacity = (
  monthKeyInput: string
): string | null => {
  const monthKey = normalizeMonthKey(monthKeyInput);
  return monthKey ? `${monthKey}-01` : null;
};

const getMonthEndDateKeyForLineMonthCapacity = (
  monthKeyInput: string
): string | null => {
  const monthKey = normalizeMonthKey(monthKeyInput);
  if (!monthKey) return null;
  const nextMonthKey = shiftMonthKey(monthKey, 1);
  if (!nextMonthKey) return null;
  return (
    shiftDateKeyByDaysForAssignmentSchedule(`${nextMonthKey}-01`, -1) || null
  );
};

const buildMonthKeyRangeForLineMonthCapacity = (
  monthFromInput: string,
  monthToInput: string
): string[] => {
  const monthFrom = normalizeMonthKey(monthFromInput);
  const monthTo = normalizeMonthKey(monthToInput);
  if (!monthFrom || !monthTo || monthFrom > monthTo) return [];
  const monthKeys: string[] = [];
  let cursor = monthFrom;
  for (let i = 0; i < MAX_LINE_MONTH_CAPACITY_MONTH_SPAN; i += 1) {
    monthKeys.push(cursor);
    if (cursor === monthTo) break;
    const shifted = shiftMonthKey(cursor, 1);
    if (!shifted || shifted === cursor) break;
    cursor = shifted;
  }
  return monthKeys;
};

const listDateKeysInclusiveForLineMonthCapacity = (
  startDateKeyInput: string,
  endDateKeyInput: string
): string[] => {
  const startDateKey = normalizeDateKey(startDateKeyInput);
  const endDateKey = normalizeDateKey(endDateKeyInput);
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];
  const dateKeys: string[] = [];
  let cursor = startDateKey;
  for (let i = 0; i < 366 * 4; i += 1) {
    dateKeys.push(cursor);
    if (cursor === endDateKey) break;
    const shifted = shiftDateKeyByDaysForAssignmentSchedule(cursor, 1);
    if (!shifted || shifted === cursor) break;
    cursor = shifted;
  }
  return dateKeys;
};

const isWorkingDateKeyForLineMonthCapacity = ({
  dateKey,
  holidaySet,
}: {
  dateKey: string;
  holidaySet: Set<string>;
}) => {
  const date = toUtcDateFromDateKeyForAssignmentSchedule(dateKey);
  if (!date) return false;
  return date.getUTCDay() !== 0 && !holidaySet.has(dateKey);
};

const resolveSameOrNextWorkingDateKeyForLineMonthCapacity = ({
  fromDateKey,
  holidaySet,
}: {
  fromDateKey: string;
  holidaySet: Set<string>;
}): string => {
  let cursor = normalizeDateKey(fromDateKey) || fromDateKey;
  for (let i = 0; i < 366 * 3; i += 1) {
    if (isWorkingDateKeyForLineMonthCapacity({ dateKey: cursor, holidaySet })) {
      return cursor;
    }
    const shifted = shiftDateKeyByDaysForAssignmentSchedule(cursor, 1);
    if (!shifted) return cursor;
    cursor = shifted;
  }
  return cursor;
};

const countWorkingDateKeysInRangeForLineMonthCapacity = ({
  startDateKey,
  endDateKey,
  holidaySet,
}: {
  startDateKey: string;
  endDateKey: string;
  holidaySet: Set<string>;
}) =>
  listDateKeysInclusiveForLineMonthCapacity(startDateKey, endDateKey).reduce(
    (sum, dateKey) =>
      isWorkingDateKeyForLineMonthCapacity({ dateKey, holidaySet })
        ? sum + 1
        : sum,
    0
  );

const countCalendarDateKeysInRangeForLineMonthCapacity = ({
  startDateKey,
  endDateKey,
}: {
  startDateKey: string;
  endDateKey: string;
}) => countDateRangeDaysInclusiveForAssignmentSchedule(startDateKey, endDateKey);

const buildLineMonthCapacityWeightRows = ({
  coverageStartDate,
  coverageEndDate,
  monthKeys,
  holidaySet,
}: {
  coverageStartDate: string;
  coverageEndDate: string;
  monthKeys: string[];
  holidaySet: Set<string>;
}) => {
  const rows = monthKeys
    .map((monthKey) => {
      const monthStartDateKey =
        getMonthStartDateKeyForLineMonthCapacity(monthKey);
      const monthEndDateKey =
        getMonthEndDateKeyForLineMonthCapacity(monthKey);
      if (!monthStartDateKey || !monthEndDateKey) return null;
      const overlapStartDateKey =
        coverageStartDate > monthStartDateKey
          ? coverageStartDate
          : monthStartDateKey;
      const overlapEndDateKey =
        coverageEndDate < monthEndDateKey ? coverageEndDate : monthEndDateKey;
      if (overlapStartDateKey > overlapEndDateKey) return null;
      const workingDays = countWorkingDateKeysInRangeForLineMonthCapacity({
        startDateKey: overlapStartDateKey,
        endDateKey: overlapEndDateKey,
        holidaySet,
      });
      const calendarDays = countCalendarDateKeysInRangeForLineMonthCapacity({
        startDateKey: overlapStartDateKey,
        endDateKey: overlapEndDateKey,
      });
      return {
        monthKey,
        workingDays,
        calendarDays,
      };
    })
    .filter((item): item is { monthKey: string; workingDays: number; calendarDays: number } =>
      Boolean(item)
    );

  const totalWorkingDays = rows.reduce(
    (sum, row) => sum + Math.max(0, row.workingDays),
    0
  );
  const totalCalendarDays = rows.reduce(
    (sum, row) => sum + Math.max(0, row.calendarDays),
    0
  );
  const useCalendarFallback =
    totalWorkingDays <= 0 && totalCalendarDays > 0;

  return rows
    .map((row) => ({
      monthKey: row.monthKey,
      weight: useCalendarFallback
        ? Math.max(0, row.calendarDays)
        : Math.max(0, row.workingDays),
    }))
    .filter((row) => row.weight > 0);
};

const distributeIntegerTotalByWeightsForLineMonthCapacity = ({
  total,
  weightedRows,
}: {
  total: number;
  weightedRows: Array<{ monthKey: string; weight: number }>;
}) => {
  const normalizedTotal = Math.max(0, Math.round(Number(total) || 0));
  const normalizedRows = weightedRows.filter(
    (row) =>
      normalizeMonthKey(row?.monthKey) &&
      Number.isFinite(Number(row?.weight)) &&
      Number(row.weight) > 0
  );
  if (normalizedTotal <= 0 || normalizedRows.length === 0) return [];
  const weightSum = normalizedRows.reduce(
    (sum, row) => sum + Number(row.weight),
    0
  );
  if (!Number.isFinite(weightSum) || weightSum <= 0) return [];

  const rawRows = normalizedRows.map((row, index) => {
    const rawValue = (normalizedTotal * Number(row.weight)) / weightSum;
    const flooredValue = Math.floor(rawValue);
    return {
      monthKey: row.monthKey,
      floorValue: flooredValue,
      fraction: rawValue - flooredValue,
      order: index,
    };
  });
  let remainder =
    normalizedTotal -
    rawRows.reduce((sum, row) => sum + row.floorValue, 0);
  rawRows
    .slice()
    .sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction;
      }
      return left.order - right.order;
    })
    .forEach((row) => {
      if (remainder <= 0) return;
      row.floorValue += 1;
      remainder -= 1;
    });

  return rawRows
    .map((row) => ({
      monthKey: row.monthKey,
      allocatedTotal: row.floorValue,
    }))
    .filter((row) => row.allocatedTotal > 0);
};

const parseLineIdsForLineMonthCapacity = (input: any): number[] =>
  Array.from(
    new Set(
      (resolveOptionalString(input, "") || "")
        .split(",")
        .map((item) => toPositiveIntOrNull(item.trim()))
        .filter((value): value is number => value !== null)
    )
  );

const buildLineMonthCapacityRows = async ({
  organization,
  orgId,
  monthFrom,
  monthTo,
  lineIds = [],
  includeActualOutputDebug = false,
}: {
  organization: any;
  orgId: number;
  monthFrom: string;
  monthTo: string;
  lineIds?: number[];
  includeActualOutputDebug?: boolean;
}) => {
  const requestedMonthKeys = buildMonthKeyRangeForLineMonthCapacity(monthFrom, monthTo);
  if (requestedMonthKeys.length === 0) {
    return { monthKeys: [], rows: [] };
  }

  const requestedStartDateKey =
    getMonthStartDateKeyForLineMonthCapacity(requestedMonthKeys[0]!);
  const requestedEndDateKey =
    getMonthEndDateKeyForLineMonthCapacity(
      requestedMonthKeys[requestedMonthKeys.length - 1]!
    );
  if (!requestedStartDateKey || !requestedEndDateKey) {
    return { monthKeys: [], rows: [] };
  }

  const requestedLineIds = lineIds.length
    ? lineIds
    : (
        await prisma.line.findMany({
          where: { orgId },
          select: { id: true },
          orderBy: [{ id: "asc" }],
        })
      )
        .map((row) => toPositiveIntOrNull(row?.id))
        .filter((value): value is number => value !== null);

  if (requestedLineIds.length === 0) {
    return { monthKeys: requestedMonthKeys, rows: [] };
  }

  const holidayModel = (prisma as any).organizationHoliday;
  const holidayRows =
    holidayModel && typeof holidayModel.findMany === "function"
      ? await holidayModel
          .findMany({
            where: { orgId },
            select: { holidayDate: true },
          })
          .catch(() => [])
      : [];
  const holidaySet = new Set<string>(
    ensureArray(holidayRows)
      .map((row) => normalizeDateKey(row?.holidayDate))
      .filter((value): value is string => Boolean(value))
  );

  const requestedLineIdSet = new Set(requestedLineIds);
  const plans = await findAssignmentPlansWithSelectFallback({
    where: {
      orgId,
      lineId: { in: requestedLineIds },
    },
    orderBy: [{ lineId: "asc" }, { id: "asc" }],
    selectAttempts: [
      ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
      ASSIGNMENT_PLAN_SELECT_CORE,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
      ASSIGNMENT_PLAN_SELECT_LEGACY,
    ],
    context: "buildLineMonthCapacityRows",
  });
  const stateAssignmentsByExternalId = new Map<string, any>();
  const workRows = await loadAssignmentPlanProgressWorkRows({
    orgId,
    plans,
    stateAssignmentsByExternalId,
    context: "buildLineMonthCapacityRows",
  });
  // Actual output must use the canonical references already stored on WorkRecord.
  // Read-time backfill hides legacy/null data problems and makes production math untraceable.
  const canonicalWorkRows = workRows;
  const workRowsByPlanId = canonicalWorkRows.reduce((map, row) => {
    const planId = toPositiveIntOrNull(row?.assignmentPlanId);
    if (!planId) return map;
    const bucket = map.get(planId) || [];
    bucket.push(row);
    map.set(planId, bucket);
    return map;
  }, new Map<number, any[]>());
  const planById = plans.reduce((map, plan) => {
    const planId = toPositiveIntOrNull(plan?.id);
    if (planId !== null) map.set(planId, plan);
    return map;
  }, new Map<number, any>());
  const actualOutputStyleIds = Array.from(
    new Set(
      canonicalWorkRows
        .map((row) => toPositiveIntOrNull(row?.styleId))
        .filter((value): value is number => value !== null)
    )
  );
  const assignmentRequiredStyleProcessIds = collectPositiveIntSet(
    ...plans.flatMap((plan) =>
      collectStyleProcessIdsFromProcessKeyGroups(
        resolveAssignmentPlanRequiredProcessGroups(plan)
      )
    )
  );
  const actualOutputStyleProcessIds = Array.from(
    new Set([
      ...canonicalWorkRows
        .map((row) => toPositiveIntOrNull(row?.styleProcessId))
        .filter((value): value is number => value !== null),
      ...assignmentRequiredStyleProcessIds,
    ])
  );
  const actualOutputStyleProcessRows =
    actualOutputStyleProcessIds.length > 0
      ? await prisma.styleProcess.findMany({
          where: {
            id: { in: actualOutputStyleProcessIds },
          },
          select: {
            id: true,
            styleId: true,
            processCode: true,
            processName: true,
            ptSeconds: true,
            standards: {
              select: {
                bucketQuantity: true,
                bucketStSeconds: true,
              },
            },
          },
        })
      : [];
  const actualOutputStyleProcessById = new Map(
    actualOutputStyleProcessRows.map((row) => [Number(row.id), row])
  );
  const actualOutputRequestDiagnostics = includeActualOutputDebug
    ? {
        calculationRule:
          "actualOutputStSeconds = sum(monthAllocatedQuantity * StyleProcessStandard.bucketStSeconds)",
        styleMatchRule:
          "WorkRecord.styleId (Style.id FK) must be stored. styleCode/name lookup is not allowed.",
        processMatchRule:
          "WorkRecord.styleProcessId -> StyleProcess.id only. processCode/process name fallback is not allowed.",
        orgId,
        requestedLineIds,
        requestedMonthKeys,
        planCount: plans.length,
        workRowCount: canonicalWorkRows.length,
        workRowsWithAssignmentPlanId: canonicalWorkRows.filter((row) =>
          Boolean(toPositiveIntOrNull(row?.assignmentPlanId))
        ).length,
        workRowsWithoutAssignmentPlanId: canonicalWorkRows.filter(
          (row) => !toPositiveIntOrNull(row?.assignmentPlanId)
        ).length,
        workRowsWithStyleId: canonicalWorkRows.filter(
          (row) => toPositiveIntOrNull(row?.styleId) !== null
        ).length,
        workRowsWithoutStyleId: canonicalWorkRows.filter(
          (row) => toPositiveIntOrNull(row?.styleId) === null
        ).length,
        workRowsWithStyleProcessId: canonicalWorkRows.filter(
          (row) => toPositiveIntOrNull(row?.styleProcessId) !== null
        ).length,
        workRowsWithoutStyleProcessId: canonicalWorkRows.filter(
          (row) => toPositiveIntOrNull(row?.styleProcessId) === null
        ).length,
        workRowsWithProcessCode: canonicalWorkRows.filter((row) =>
          Boolean(normalizeProcessCodeKey(resolveWorkRecordProcessCode(row)))
        ).length,
        workRowsWithoutProcessCode: canonicalWorkRows.filter(
          (row) => !normalizeProcessCodeKey(resolveWorkRecordProcessCode(row))
        ).length,
        workRowsWithCoverageRange: canonicalWorkRows.filter((row) => {
          const startDate = resolveWorkRecordEffectiveCoverageStartDate(row);
          const endDate = resolveWorkRecordEffectiveCoverageEndDate(row);
          return Boolean(startDate && endDate && startDate <= endDate);
        }).length,
        workRowsWithoutCoverageRange: canonicalWorkRows.filter((row) => {
          const startDate = resolveWorkRecordEffectiveCoverageStartDate(row);
          const endDate = resolveWorkRecordEffectiveCoverageEndDate(row);
          return !(startDate && endDate && startDate <= endDate);
        }).length,
        styleIdCount: actualOutputStyleIds.length,
        styleIds: actualOutputStyleIds.slice(0, 100),
        styleProcessIdCount: actualOutputStyleProcessIds.length,
        styleProcessIds: actualOutputStyleProcessIds.slice(0, 100),
        styleProcessRowCount: actualOutputStyleProcessRows.length,
        styleProcessRows: actualOutputStyleProcessRows.slice(0, 100).map((row) => ({
          id: toPositiveIntOrNull(row?.id),
          styleId: toPositiveIntOrNull(row?.styleId),
          processCode: resolveOptionalString(row?.processCode, null),
          processName: resolveOptionalString(row?.processName, null),
          stBuckets: ensureArray(row?.standards)
            .map((item) => toPositiveIntOrNull((item as any)?.bucketQuantity))
            .filter((value): value is number => value !== null)
            .sort((left, right) => left - right),
        })),
        workRecordKeySamples: canonicalWorkRows.slice(0, 100).map((row) => ({
          workRecordId: toPositiveIntOrNull(row?.id),
          workLogId: toPositiveIntOrNull(row?.workLogId),
          assignmentPlanId: toPositiveIntOrNull(row?.assignmentPlanId),
          workerName: resolveOptionalString(row?.worker?.name, null),
          styleId: toPositiveIntOrNull(row?.styleId),
          styleIdSource:
            toPositiveIntOrNull(row?.styleId) !== null ? "WorkRecord.styleId" : null,
          styleProcessId: toPositiveIntOrNull(row?.styleProcessId),
          styleProcessIdSource:
            toPositiveIntOrNull(row?.styleProcessId) !== null
              ? "WorkRecord.styleProcessId"
              : null,
          styleCode: resolveWorkRecordStyleCode(row),
          processCode: resolveWorkRecordProcessCode(row),
          processCodeSource: resolveWorkRecordProcessCode(row)
            ? "WorkRecord.styleProcess/process relation"
            : null,
          quantity: Math.max(0, Math.round(Number(row?.quantity ?? 0))),
          coverageStartDate: resolveWorkRecordEffectiveCoverageStartDate(row),
          coverageEndDate: resolveWorkRecordEffectiveCoverageEndDate(row),
        })),
      }
    : null;
  const resolveWorkRecordStSecondsForLineMonthCapacity = ({
    record,
    bucketQuantity,
  }: {
    record: any;
    bucketQuantity: number;
  }) => {
    const recordStyleId = toPositiveIntOrNull(record?.styleId);
    const styleId = recordStyleId ?? null;
    const styleIdSource =
      recordStyleId !== null ? "WorkRecord.styleId" : null;
    const styleProcessId = toPositiveIntOrNull(record?.styleProcessId);
    const styleProcessIdSource =
      styleProcessId !== null ? "WorkRecord.styleProcessId" : null;
    const recordProcessCode = resolveWorkRecordProcessCode(record);
    const processCode = recordProcessCode;
    const processCodeSource = recordProcessCode
      ? "WorkRecord.styleProcess/process relation"
      : null;
    if (styleId === null) {
      return {
        stSeconds: null,
        reason: "STYLE_ID_MISSING",
        styleId: null,
        styleIdSource,
        styleProcessId,
        styleProcessIdSource,
        recordStyleId,
        processCode,
        processCodeSource,
      };
    }
    if (styleProcessId === null) {
      return {
        stSeconds: null,
        reason: "STYLE_PROCESS_ID_MISSING",
        styleId,
        styleIdSource,
        styleProcessId: null,
        styleProcessIdSource,
        recordStyleId,
        processCode,
        processCodeSource,
      };
    }
    const matchedRow = actualOutputStyleProcessById.get(styleProcessId) ?? null;
    if (!matchedRow) {
      return {
        stSeconds: null,
        reason: "STYLE_PROCESS_NOT_FOUND",
        styleId,
        styleIdSource,
        styleProcessId,
        styleProcessIdSource,
        recordStyleId,
        processCode,
        processCodeSource,
      };
    }
    const matchedStyleId = toPositiveIntOrNull(matchedRow?.styleId);
    if (matchedStyleId !== null && matchedStyleId !== styleId) {
      return {
        stSeconds: null,
        reason: "STYLE_PROCESS_STYLE_MISMATCH",
        styleId,
        styleIdSource,
        styleProcessId,
        styleProcessIdSource,
        recordStyleId,
        matchedStyleId,
        processCode,
        processCodeSource,
      };
    }
    const stSeconds = resolveStyleProcessBucketStSeconds(matchedRow, bucketQuantity);
    const matchedProcessId = toPositiveIntOrNull(matchedRow?.id);
    const matchedProcessCode = resolveOptionalString(matchedRow?.processCode, null);
    const matchedProcessName = resolveOptionalString(matchedRow?.processName, null);
    const matchedBuckets = ensureArray(matchedRow?.standards)
      .map((item) => toPositiveIntOrNull((item as any)?.bucketQuantity))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);
    if (stSeconds === null) {
      return {
        stSeconds: null,
        reason: "ST_BUCKET_NOT_FOUND",
        styleId,
        styleIdSource,
        styleProcessId,
        styleProcessIdSource,
        recordStyleId,
        processCode,
        processCodeSource,
        matchedProcessId,
        matchedProcessCode,
        matchedProcessName,
        matchedBuckets,
      };
    }
    return {
      stSeconds,
      reason: "OK",
      styleId,
      styleIdSource,
      styleProcessId,
      styleProcessIdSource,
      recordStyleId,
      processCode,
      processCodeSource,
      matchedProcessId,
      matchedProcessCode,
      matchedProcessName,
      matchedBuckets,
    };
  };
  const lineLatestActualCoverageEndDateKeyByLineId = new Map<number, string>();
  const lineRemainingBacklogStSecondsByLineId = new Map<number, number>();
  const lineStUnknownAssignmentCountByLineId = new Map<number, number>();
  const lineProgressUnknownAssignmentCountByLineId = new Map<number, number>();
  const planProgressMetaById = new Map<
    number,
    {
      plannedQuantity: number;
      plannedStTotalSeconds: number;
      requiredProcessGroups: ReturnType<typeof resolveAssignmentPlanRequiredProcessGroups>;
      processCount: number | null;
      totalExpected: number | null;
    }
  >();

  plans.forEach((plan) => {
    const planId = toPositiveIntOrNull(plan?.id);
    const lineId = toPositiveIntOrNull(plan?.lineId);
    if (!planId || !lineId || !requestedLineIdSet.has(lineId)) return;
    const plannedQuantity = resolveAssignmentQuantity(plan);
    const plannedStTotalSeconds = resolvePersistedAssignmentPlanStTotalSeconds(plan);
    ensureArray(workRowsByPlanId.get(planId)).forEach((record) => {
      const coverageStartDate =
        resolveWorkRecordEffectiveCoverageStartDate(record);
      const coverageEndDate =
        resolveWorkRecordEffectiveCoverageEndDate(record);
      if (!coverageStartDate || !coverageEndDate || coverageStartDate > coverageEndDate) {
        return;
      }
      const latestCoverageEndDateKey =
        lineLatestActualCoverageEndDateKeyByLineId.get(lineId) || null;
      if (!latestCoverageEndDateKey || coverageEndDate > latestCoverageEndDateKey) {
        lineLatestActualCoverageEndDateKeyByLineId.set(lineId, coverageEndDate);
      }
    });
    if (
      plannedQuantity == null ||
      plannedQuantity <= 0 ||
      plannedStTotalSeconds == null ||
      plannedStTotalSeconds <= 0
    ) {
      if (plan?.isCompleted !== true) {
        lineStUnknownAssignmentCountByLineId.set(
          lineId,
          (lineStUnknownAssignmentCountByLineId.get(lineId) || 0) + 1
        );
      }
      return;
    }

    const requiredProcessGroups = resolveAssignmentPlanRequiredProcessGroups(plan);
    const snapshot = resolveNormalizedAssignmentCtSnapshot(plan);
    const processCountFromSnapshot =
      Array.isArray(snapshot?.processes) && snapshot.processes.length > 0
        ? snapshot.processes.length
        : null;
    const processKeySet = new Set<string>();
    const cumulativeProcessTotalsByKey = new Map<string, number>();
    let cumulativeTotalDone = 0;
    let skippedWorkRecordWithoutStyleProcessId = 0;

    ensureArray(workRowsByPlanId.get(planId)).forEach((record) => {
      const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
      if (quantity <= 0) return;
      const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
      if (!processKey) {
        skippedWorkRecordWithoutStyleProcessId += 1;
        return;
      }
      cumulativeTotalDone += quantity;
      processKeySet.add(processKey);
      cumulativeProcessTotalsByKey.set(
        processKey,
        (cumulativeProcessTotalsByKey.get(processKey) || 0) + quantity
      );
    });
    if (skippedWorkRecordWithoutStyleProcessId > 0) {
      console.warn(
        `[line-month-capacity] orgId=${orgId} assignmentPlanId=${planId} skipped ${skippedWorkRecordWithoutStyleProcessId} work records without WorkRecord.styleProcessId`
      );
    }

    const processCountFromRecords =
      processKeySet.size > 0 ? processKeySet.size : null;
    const processCount =
      processCountFromSnapshot ?? processCountFromRecords;
    const totalExpected =
      plannedQuantity != null && processCount != null && processCount > 0
        ? plannedQuantity * processCount
        : null;
    // requiredProcessGroups comes from assignmentCtSnapshot.processes[].styleProcessId.
    // Some persisted snapshots have processCode/name but a null styleProcessId per
    // process (a known data gap - see AGENTS.md), which makes requiredProcessGroups
    // resolve to []. resolveProducedQtyFromProcessKeyTotals then always returns 0 for
    // an empty group list, which used to flow straight into producedRatio=0 and, via
    // Math.min(producedRatio, operationalProgressRatio), forced progressRatio to 0
    // regardless of how much work was actually recorded - i.e. a plan at 88% real
    // progress was treated as 0% and its full planned ST re-entered the forecast
    // backlog every time. Treat "no usable process groups" as producedRatio being
    // unavailable (null) instead of 0, so the min() falls through to
    // operationalProgressRatio (which does not depend on styleProcessId) rather than
    // pinning progress to zero.
    const producedQuantity = requiredProcessGroups.length > 0
      ? resolveProducedQtyFromProcessKeyTotals({
          processTotalsByKey: cumulativeProcessTotalsByKey,
          processKeyGroups: requiredProcessGroups,
        })
      : null;
    const producedRatio =
      producedQuantity != null && plannedQuantity > 0
        ? Math.max(0, Math.min(1, producedQuantity / plannedQuantity))
        : null;
    const operationalProgressRatio =
      totalExpected != null && totalExpected > 0
        ? Math.max(0, Math.min(1, cumulativeTotalDone / totalExpected))
        : null;
    const progressRatio =
      producedRatio != null && operationalProgressRatio != null
        ? Math.min(producedRatio, operationalProgressRatio)
        : producedRatio ?? operationalProgressRatio ?? null;
    const exactRemainingStTotalSeconds = calculateRemainingStTotalSecondsFromProcessProgress({
      processTotalsByKey: cumulativeProcessTotalsByKey,
      processKeyGroups: requiredProcessGroups,
      plannedQuantity,
      bucketQuantity: resolveStBucketQuantity(plannedQuantity),
      styleProcessRowsById: actualOutputStyleProcessById,
    });
    // Neither ratio could be computed even though work has actually been recorded
    // (cumulativeTotalDone > 0) - do not silently fall back to the full planned ST
    // (that is indistinguishable from "0% done" and re-inflates the forecast). Exclude
    // it from the backlog sum and surface it as a diagnostic instead.
    const isProgressUnknown =
      plan?.isCompleted !== true &&
      progressRatio == null &&
      exactRemainingStTotalSeconds == null &&
      cumulativeTotalDone > 0;
    const remainingStTotalSeconds =
      plan?.isCompleted === true
        ? 0
        : isProgressUnknown
          ? null
          : exactRemainingStTotalSeconds != null
            ? exactRemainingStTotalSeconds
            : progressRatio == null
            ? plannedStTotalSeconds
            : Math.max(
                0,
                plannedStTotalSeconds -
                  Math.max(0, Math.round(plannedStTotalSeconds * progressRatio))
              );
    if (remainingStTotalSeconds != null && remainingStTotalSeconds > 0) {
      lineRemainingBacklogStSecondsByLineId.set(
        lineId,
        (lineRemainingBacklogStSecondsByLineId.get(lineId) || 0) +
          remainingStTotalSeconds
      );
    }
    if (isProgressUnknown) {
      lineProgressUnknownAssignmentCountByLineId.set(
        lineId,
        (lineProgressUnknownAssignmentCountByLineId.get(lineId) || 0) + 1
      );
    }
    planProgressMetaById.set(planId, {
      plannedQuantity,
      plannedStTotalSeconds,
      requiredProcessGroups,
      processCount,
      totalExpected,
    });
  });

  const currentDateKey = todayDateKey();
  const defaultForecastAnchorDateKey =
    resolveSameOrNextWorkingDateKeyForLineMonthCapacity({
      fromDateKey: currentDateKey,
      holidaySet,
    }) || currentDateKey;

  let internalMonthFrom = requestedMonthKeys[0] || monthFrom;
  const lineForecastMetaByLineId = new Map<
    number,
    {
      latestActualCoverageEndDateKey: string | null;
      forecastAnchorDateKey: string;
      remainingBacklogStSeconds: number;
      stUnknownAssignmentCount: number;
      progressUnknownAssignmentCount: number;
    }
  >();
  requestedLineIds.forEach((lineId) => {
    const latestActualCoverageEndDateKey =
      lineLatestActualCoverageEndDateKeyByLineId.get(lineId) || null;
    const forecastAnchorDateKey = latestActualCoverageEndDateKey
      ? resolveNextWorkingDateKeyForAssignmentSchedule({
          fromDateKey: latestActualCoverageEndDateKey,
          holidaySet,
        })
      : defaultForecastAnchorDateKey;
    const anchorMonthKey = normalizeMonthKey(forecastAnchorDateKey.slice(0, 7));
    if (anchorMonthKey && anchorMonthKey < internalMonthFrom) {
      internalMonthFrom = anchorMonthKey;
    }
    lineForecastMetaByLineId.set(lineId, {
      latestActualCoverageEndDateKey,
      forecastAnchorDateKey,
      remainingBacklogStSeconds: Math.max(
        0,
        Math.round(Number(lineRemainingBacklogStSecondsByLineId.get(lineId) || 0))
      ),
      stUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(lineStUnknownAssignmentCountByLineId.get(lineId) || 0))
      ),
      progressUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(lineProgressUnknownAssignmentCountByLineId.get(lineId) || 0))
      ),
    });
  });

  const internalMonthKeys = buildMonthKeyRangeForLineMonthCapacity(
    internalMonthFrom,
    monthTo
  );
  if (internalMonthKeys.length === 0) {
    return { monthKeys: requestedMonthKeys, rows: [] };
  }
  const internalStartDateKey =
    getMonthStartDateKeyForLineMonthCapacity(internalMonthKeys[0]!) ||
    requestedStartDateKey;
  const internalEndDateKey =
    getMonthEndDateKeyForLineMonthCapacity(
      internalMonthKeys[internalMonthKeys.length - 1]!
    ) || requestedEndDateKey;

  const lineMonthBaseByKey = new Map<
    string,
    {
      lineId: string;
      monthKey: string;
      workingDayCount: number;
      headcountDayUnits: number;
      lineMonthlyCapacitySeconds: number;
      lineMonthlyAttendanceSeconds: number;
      lineMonthlyDefaultCapacitySeconds: number;
      attendanceWorkerDayCount: number;
      defaultCapacityWorkerDayCount: number;
      lineMonthlyActualOutputStSeconds: number;
      actualOutputRecordedThroughDateKey: string | null;
      orphanWorkRecordCount: number;
      latestActualCoverageEndDateKey: string | null;
      forecastAnchorDateKey: string | null;
      forecastAvailableCapacitySeconds: number;
      forecastWorkingDayCount: number;
      forecastLoadStSeconds: number;
      forecastLoadPercent: number | null;
      carryInStSeconds: number;
      carryOutStSeconds: number;
      totalEstimatedLoadStSeconds: number;
      totalEstimatedLoadPercent: number | null;
        monthType: "historical" | "anchor" | "forecast";
        stUnknownAssignmentCount: number;
      }
  >();
  requestedLineIds.forEach((lineId) => {
    const forecastMeta = lineForecastMetaByLineId.get(lineId) || null;
    internalMonthKeys.forEach((monthKey) => {
      const monthStartDateKey =
        getMonthStartDateKeyForLineMonthCapacity(monthKey) ||
        internalStartDateKey;
      const monthEndDateKey =
        getMonthEndDateKeyForLineMonthCapacity(monthKey) || internalEndDateKey;
      const workingDayCount = countWorkingDateKeysInRangeForLineMonthCapacity({
        startDateKey: monthStartDateKey,
        endDateKey: monthEndDateKey,
        holidaySet,
      });
      lineMonthBaseByKey.set(`${lineId}:${monthKey}`, {
        lineId: String(lineId),
        monthKey,
        workingDayCount,
        headcountDayUnits: 0,
        lineMonthlyCapacitySeconds: 0,
        lineMonthlyAttendanceSeconds: 0,
        lineMonthlyDefaultCapacitySeconds: 0,
        attendanceWorkerDayCount: 0,
        defaultCapacityWorkerDayCount: 0,
        lineMonthlyActualOutputStSeconds: 0,
        actualOutputRecordedThroughDateKey: null,
        orphanWorkRecordCount: 0,
        latestActualCoverageEndDateKey:
          forecastMeta?.latestActualCoverageEndDateKey || null,
        forecastAnchorDateKey: forecastMeta?.forecastAnchorDateKey || null,
        forecastAvailableCapacitySeconds: 0,
        forecastWorkingDayCount: 0,
        forecastLoadStSeconds: 0,
        forecastLoadPercent: null,
        carryInStSeconds: 0,
        carryOutStSeconds: 0,
        totalEstimatedLoadStSeconds: 0,
        totalEstimatedLoadPercent: null,
        monthType: "historical",
        stUnknownAssignmentCount: forecastMeta?.stUnknownAssignmentCount || 0,
      });
    });
  });

  const lineAssignmentRows = await prisma.lineAssignment.findMany({
    where: {
      lineId: { in: requestedLineIds },
      startAt: {
        lte:
          toDateValueFromDateKeyForAssignmentSchedule(internalEndDateKey) ||
          new Date(),
      },
      OR: [
        { endAt: null },
        {
          endAt: {
            gte:
              toDateValueFromDateKeyForAssignmentSchedule(internalStartDateKey) ||
              new Date(),
          },
        },
      ],
    },
    select: {
      lineId: true,
      employeeId: true,
      startAt: true,
      endAt: true,
      employee: {
        select: {
          joinedAt: true,
          leftAt: true,
        },
      },
    },
  });

  const employeeIdsByLineDateKey = new Map<string, Set<number>>();
  // Diagnostics only (does not affect the capacity sums below): tracks which lines
  // each employee is counted as active on for the same date, so an employee with
  // overlapping LineAssignment rows across two different lines on the same day can be
  // surfaced instead of silently double-counted into both lines' capacity. The normal
  // write path (closeActiveLineAssignments, called from /line-assignments/assign)
  // already closes an employee's prior active assignment before creating a new one, so
  // this should only ever fire for legacy data or a rare create-time race - see
  // AGENTS.md.
  const lineIdsByEmployeeDateKey = new Map<string, Set<number>>();
  lineAssignmentRows.forEach((row) => {
    const lineId = toPositiveIntOrNull(row?.lineId);
    const employeeId = toPositiveIntOrNull(row?.employeeId);
    if (!lineId || !employeeId || !requestedLineIdSet.has(lineId)) return;
    const assignmentStartDateKey = toDateKeyInTimeZone(
      row?.startAt,
      BUSINESS_TIME_ZONE
    );
    const assignmentEndDateKey =
      toDateKeyInTimeZone(row?.endAt, BUSINESS_TIME_ZONE) || internalEndDateKey;
    const joinedDateKey = toDateKeyInTimeZone(
      row?.employee?.joinedAt,
      BUSINESS_TIME_ZONE
    );
    const leftDateKey =
      toDateKeyInTimeZone(row?.employee?.leftAt, BUSINESS_TIME_ZONE) ||
      internalEndDateKey;

    const activeStartDateKey = [
      internalStartDateKey,
      assignmentStartDateKey,
      joinedDateKey || null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))
      .pop();
    const activeEndDateKey = [
      internalEndDateKey,
      assignmentEndDateKey,
      leftDateKey || null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))[0];

    if (!activeStartDateKey || !activeEndDateKey || activeStartDateKey > activeEndDateKey) {
      return;
    }

    listDateKeysInclusiveForLineMonthCapacity(
      activeStartDateKey,
      activeEndDateKey
    ).forEach((dateKey) => {
      if (
        !isWorkingDateKeyForLineMonthCapacity({
          dateKey,
          holidaySet,
        })
      ) {
        return;
      }
      const monthKey = normalizeMonthKey(dateKey.slice(0, 7));
      if (!monthKey) return;
      const compositeKey = `${lineId}:${dateKey}`;
      const current = employeeIdsByLineDateKey.get(compositeKey) || new Set<number>();
      current.add(employeeId);
      employeeIdsByLineDateKey.set(compositeKey, current);

      const employeeDateKey = `${employeeId}:${dateKey}`;
      const lineIdsForEmployeeDate =
        lineIdsByEmployeeDateKey.get(employeeDateKey) || new Set<number>();
      lineIdsForEmployeeDate.add(lineId);
      lineIdsByEmployeeDateKey.set(employeeDateKey, lineIdsForEmployeeDate);
    });
  });

  const capacityOverlapSamples: Array<{
    employeeId: number;
    dateKey: string;
    lineIds: number[];
  }> = [];
  let capacityOverlapCount = 0;
  lineIdsByEmployeeDateKey.forEach((lineIdSet, employeeDateKey) => {
    if (lineIdSet.size <= 1) return;
    capacityOverlapCount += 1;
    if (capacityOverlapSamples.length < 50) {
      const [employeeIdText, dateKey] = employeeDateKey.split(":");
      capacityOverlapSamples.push({
        employeeId: toPositiveIntOrNull(employeeIdText) ?? 0,
        dateKey: dateKey ?? "",
        lineIds: Array.from(lineIdSet.values()).sort((left, right) => left - right),
      });
    }
  });
  if (capacityOverlapCount > 0) {
    console.warn(
      `[line-month-capacity] orgId=${orgId} found ${capacityOverlapCount} employee-date pairs active on more than one line (overlapping LineAssignment rows)`
    );
  }

  const activeEmployeeIdsForCapacity = Array.from(
    new Set(
      Array.from(employeeIdsByLineDateKey.values()).flatMap((employeeIds) =>
        Array.from(employeeIds.values())
      )
    )
  );
  const attendanceRowsForCapacity =
    activeEmployeeIdsForCapacity.length > 0
      ? await prisma.attendanceEntry.findMany({
          where: {
            orgId,
            workerId: { in: activeEmployeeIdsForCapacity },
            workDate: {
              gte: internalStartDateKey,
              lte: internalEndDateKey,
            },
          },
          select: {
            workerId: true,
            workDate: true,
            workedSeconds: true,
          },
        })
      : [];
  const attendanceSecondsByWorkerDateKey = new Map<string, number>();
  attendanceRowsForCapacity.forEach((row) => {
    const workerId = toPositiveIntOrNull(row?.workerId);
    const workDate = normalizeDateKey(row?.workDate);
    const workedSeconds = toOptionalNonNegativeInt(row?.workedSeconds, null);
    if (!workerId || !workDate || workedSeconds === null) return;
    const key = `${workerId}:${workDate}`;
    attendanceSecondsByWorkerDateKey.set(
      key,
      (attendanceSecondsByWorkerDateKey.get(key) || 0) + workedSeconds
    );
  });
  const resolveLineWorkerAttendanceSecondsForDate = ({
    employeeId,
    dateKey,
  }: {
    employeeId: number;
    dateKey: string;
  }) => {
    const key = `${employeeId}:${dateKey}`;
    if (attendanceSecondsByWorkerDateKey.has(key)) {
      return Math.max(0, Math.round(Number(attendanceSecondsByWorkerDateKey.get(key)) || 0));
    }
    return null;
  };

  employeeIdsByLineDateKey.forEach((employeeIds, compositeKey) => {
    const [lineIdText, dateKey] = compositeKey.split(":");
    const lineId = toPositiveIntOrNull(lineIdText);
    const monthKey = normalizeMonthKey(dateKey?.slice(0, 7));
    if (!lineId || !dateKey || !monthKey) return;
    const target = lineMonthBaseByKey.get(`${lineId}:${monthKey}`);
    if (!target) return;
    const dayHeadcount = employeeIds.size;
    target.headcountDayUnits += dayHeadcount;
    Array.from(employeeIds.values()).forEach((employeeId) => {
      // Monthly actual production rate uses baseline capacity:
      // active line workers * working days * 8h, regardless of attendance logs.
      target.lineMonthlyCapacitySeconds += DEFAULT_LINE_DAILY_WORK_SECONDS;
      target.lineMonthlyDefaultCapacitySeconds += DEFAULT_LINE_DAILY_WORK_SECONDS;
      target.defaultCapacityWorkerDayCount += 1;
      const attendanceSeconds = resolveLineWorkerAttendanceSecondsForDate({
        employeeId,
        dateKey,
      });
      if (attendanceSeconds !== null) {
        target.lineMonthlyAttendanceSeconds += attendanceSeconds;
        target.attendanceWorkerDayCount += 1;
      }
    });
  });

  const actualOutputDebugByLineMonthKey = new Map<string, any>();
  const ensureActualOutputDebug = (lineId: number, monthKey: string) => {
    const key = `${lineId}:${monthKey}`;
    if (!actualOutputDebugByLineMonthKey.has(key)) {
      actualOutputDebugByLineMonthKey.set(key, {
        lineId: String(lineId),
        monthKey,
        directCandidateRecordCount: 0,
        directMatchedRecordCount: 0,
        directFailedRecordCount: 0,
        invalidCoverageRecordCount: 0,
        emptyMonthAllocationRecordCount: 0,
        directCandidateQuantity: 0,
        directCandidateStSeconds: 0,
        directUsedPlanCount: 0,
        directUsedStSeconds: 0,
        skippedPlanCount: 0,
        skipReasonCounts: {},
        sampleFailures: [],
        sampleMatches: [],
      });
    }
    return actualOutputDebugByLineMonthKey.get(key);
  };
  const incrementActualOutputDebugReason = (
    debug: any,
    reason: string | null | undefined
  ) => {
    const key = reason || "UNKNOWN";
    debug.skipReasonCounts[key] =
      Math.max(0, Math.round(Number(debug.skipReasonCounts[key] || 0))) + 1;
  };
  const pushActualOutputDebugFailure = (debug: any, sample: any) => {
    if (!Array.isArray(debug.sampleFailures) || debug.sampleFailures.length >= 30) {
      return;
    }
    debug.sampleFailures.push(sample);
  };
  const pushActualOutputDebugMatch = (debug: any, sample: any) => {
    if (!Array.isArray(debug.sampleMatches) || debug.sampleMatches.length >= 12) {
      return;
    }
    debug.sampleMatches.push(sample);
  };

  plans.forEach((plan) => {
    const planId = toPositiveIntOrNull(plan?.id);
    const lineId = toPositiveIntOrNull(plan?.lineId);
    const progressMeta = planId ? planProgressMetaById.get(planId) : null;
    if (!planId || !lineId || !progressMeta || !requestedLineIdSet.has(lineId)) return;
    const {
      plannedQuantity,
    } = progressMeta;
    const bucketQuantity = resolveStBucketQuantity(plannedQuantity);
    const monthlyDirectActualOutputStSecondsByMonthKey = new Map<string, number>();
    let hasDirectActualOutputStSeconds = false;
    const planActualOutputFailureReasons = new Map<string, number>();
    const addPlanActualOutputFailureReason = (reason: string | null | undefined) => {
      const key = reason || "UNKNOWN";
      planActualOutputFailureReasons.set(
        key,
        (planActualOutputFailureReasons.get(key) || 0) + 1
      );
    };
    const planTouchedMonthKeys = new Set<string>();

    ensureArray(workRowsByPlanId.get(planId)).forEach((record) => {
      const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
      if (quantity <= 0) return;
      const coverageStartDate =
        resolveWorkRecordEffectiveCoverageStartDate(record);
      const coverageEndDate =
        resolveWorkRecordEffectiveCoverageEndDate(record);
      if (!coverageStartDate || !coverageEndDate || coverageStartDate > coverageEndDate) {
        if (includeActualOutputDebug) {
          const fallbackMonthKey = normalizeMonthKey(
            (
              coverageEndDate ||
              coverageStartDate ||
              resolveStrictWorkLogCoverageEndDate(record?.workLog) ||
              resolveStrictWorkLogCoverageStartDate(record?.workLog) ||
              normalizeDateKey(record?.workLog?.displayDate) ||
              requestedMonthKeys[0] ||
              ""
            ).slice(0, 7)
          );
          const debugMonthKeys =
            fallbackMonthKey && internalMonthKeys.includes(fallbackMonthKey)
              ? [fallbackMonthKey]
              : requestedMonthKeys.length > 0
                ? requestedMonthKeys
                : internalMonthKeys;
          debugMonthKeys.forEach((monthKey) => {
            const debug = ensureActualOutputDebug(lineId, monthKey);
            debug.invalidCoverageRecordCount += 1;
            incrementActualOutputDebugReason(debug, "COVERAGE_DATE_MISSING_OR_INVALID");
            pushActualOutputDebugFailure(debug, {
              workRecordId: toPositiveIntOrNull(record?.id),
              workLogId: toPositiveIntOrNull(record?.workLogId),
              planId,
              assignmentExternalId: resolveOptionalString(plan?.externalId, null),
              assignmentCardId: resolveOptionalString(plan?.cardId, null),
              assignmentOriginOrderId: resolveOptionalString(plan?.originOrderId, null),
              assignmentQuantity: plannedQuantity,
              workerId: toPositiveIntOrNull(record?.workerId),
              workerName: resolveOptionalString(record?.worker?.name, null),
              quantity,
              coverageStartDate,
              coverageEndDate,
              workLogCoverageStartDate: resolveStrictWorkLogCoverageStartDate(record?.workLog),
              workLogCoverageEndDate: resolveStrictWorkLogCoverageEndDate(record?.workLog),
              workLogDisplayDate: normalizeDateKey(record?.workLog?.displayDate),
              reason: "COVERAGE_DATE_MISSING_OR_INVALID",
            });
          });
        }
        return;
      }
      const monthWeightRows = buildLineMonthCapacityWeightRows({
        coverageStartDate,
        coverageEndDate,
        monthKeys: internalMonthKeys,
        holidaySet,
      });
      monthWeightRows.forEach(({ monthKey }) => {
        const target = lineMonthBaseByKey.get(`${lineId}:${monthKey}`);
        const monthEndDateKey =
          getMonthEndDateKeyForLineMonthCapacity(monthKey) || coverageEndDate;
        const recordedThroughDateKey =
          coverageEndDate < monthEndDateKey ? coverageEndDate : monthEndDateKey;
        if (
          target &&
          (!target.actualOutputRecordedThroughDateKey ||
            recordedThroughDateKey > target.actualOutputRecordedThroughDateKey)
        ) {
          target.actualOutputRecordedThroughDateKey = recordedThroughDateKey;
        }
      });
      const monthAllocations =
        distributeIntegerTotalByWeightsForLineMonthCapacity({
          total: quantity,
          weightedRows: monthWeightRows,
        });
      if (monthAllocations.length === 0) {
        if (includeActualOutputDebug) {
          monthWeightRows.forEach(({ monthKey }) => {
            const debug = ensureActualOutputDebug(lineId, monthKey);
            debug.emptyMonthAllocationRecordCount += 1;
            incrementActualOutputDebugReason(debug, "MONTH_ALLOCATION_EMPTY");
            pushActualOutputDebugFailure(debug, {
              workRecordId: toPositiveIntOrNull(record?.id),
              workLogId: toPositiveIntOrNull(record?.workLogId),
              planId,
              assignmentExternalId: resolveOptionalString(plan?.externalId, null),
              assignmentCardId: resolveOptionalString(plan?.cardId, null),
              assignmentOriginOrderId: resolveOptionalString(plan?.originOrderId, null),
              assignmentQuantity: plannedQuantity,
              workerId: toPositiveIntOrNull(record?.workerId),
              workerName: resolveOptionalString(record?.worker?.name, null),
              quantity,
              coverageStartDate,
              coverageEndDate,
              reason: "MONTH_ALLOCATION_EMPTY",
            });
          });
        }
        return;
      }
      monthAllocations.forEach(({ monthKey }) => {
        planTouchedMonthKeys.add(monthKey);
      });
      const processSt = resolveWorkRecordStSecondsForLineMonthCapacity({
        record,
        bucketQuantity,
      });
      if (processSt.stSeconds === null) {
        addPlanActualOutputFailureReason(processSt.reason);
        if (includeActualOutputDebug) {
          monthAllocations.forEach(({ monthKey, allocatedTotal }) => {
            const debug = ensureActualOutputDebug(lineId, monthKey);
            debug.directCandidateRecordCount += 1;
            debug.directFailedRecordCount += 1;
            debug.directCandidateQuantity += Math.max(
              0,
              Math.round(Number(allocatedTotal) || 0)
            );
            incrementActualOutputDebugReason(debug, processSt.reason);
            pushActualOutputDebugFailure(debug, {
              workRecordId: toPositiveIntOrNull(record?.id),
              workLogId: toPositiveIntOrNull(record?.workLogId),
              planId,
              assignmentExternalId: resolveOptionalString(plan?.externalId, null),
              assignmentCardId: resolveOptionalString(plan?.cardId, null),
              assignmentOriginOrderId: resolveOptionalString(plan?.originOrderId, null),
              assignmentOrderNo: resolveOptionalString(plan?.workOrder?.orderNumber, null),
              assignmentLabel: resolveOptionalString(plan?.style?.name, null),
              assignmentQuantity: plannedQuantity,
              workerId: toPositiveIntOrNull(record?.workerId),
              workerName: resolveOptionalString(record?.worker?.name, null),
              recordStyleId: processSt.recordStyleId,
              resolvedStyleId: processSt.styleId,
              styleIdSource: processSt.styleIdSource,
              styleProcessId: processSt.styleProcessId,
              styleProcessIdSource: processSt.styleProcessIdSource,
              styleName: resolveWorkRecordStyleName(record),
              processCode: processSt.processCode,
              processCodeSource: processSt.processCodeSource,
              quantity,
              allocatedQuantity: Math.max(0, Math.round(Number(allocatedTotal) || 0)),
              ctSeconds: Math.max(0, Math.round(Number(record?.ctSeconds) || 0)),
              coverageStartDate,
              coverageEndDate,
              workLogCoverageStartDate: resolveStrictWorkLogCoverageStartDate(record?.workLog),
              workLogCoverageEndDate: resolveStrictWorkLogCoverageEndDate(record?.workLog),
              workLogDisplayDate: normalizeDateKey(record?.workLog?.displayDate),
              bucketQuantity,
              reason: processSt.reason,
              matchedStyleId: (processSt as any).matchedStyleId ?? null,
              matchedProcessId: processSt.matchedProcessId ?? null,
              matchedProcessCode: processSt.matchedProcessCode ?? null,
              matchedProcessName: processSt.matchedProcessName ?? null,
              matchedBuckets: processSt.matchedBuckets ?? [],
            });
          });
        }
      } else {
        hasDirectActualOutputStSeconds = true;
        monthAllocations.forEach(({ monthKey, allocatedTotal }) => {
          if (allocatedTotal <= 0) return;
          const directSeconds = Math.max(
            0,
            Math.round(processSt.stSeconds * allocatedTotal)
          );
          monthlyDirectActualOutputStSecondsByMonthKey.set(
            monthKey,
            (monthlyDirectActualOutputStSecondsByMonthKey.get(monthKey) || 0) +
              directSeconds
          );
          if (includeActualOutputDebug) {
            const debug = ensureActualOutputDebug(lineId, monthKey);
            debug.directCandidateRecordCount += 1;
            debug.directMatchedRecordCount += 1;
            debug.directCandidateQuantity += Math.max(
              0,
              Math.round(Number(allocatedTotal) || 0)
            );
            debug.directCandidateStSeconds += directSeconds;
            pushActualOutputDebugMatch(debug, {
              workRecordId: toPositiveIntOrNull(record?.id),
              workLogId: toPositiveIntOrNull(record?.workLogId),
              planId,
              assignmentExternalId: resolveOptionalString(plan?.externalId, null),
              assignmentCardId: resolveOptionalString(plan?.cardId, null),
              assignmentOriginOrderId: resolveOptionalString(plan?.originOrderId, null),
              assignmentQuantity: plannedQuantity,
              workerName: resolveOptionalString(record?.worker?.name, null),
              recordStyleId: processSt.recordStyleId,
              resolvedStyleId: processSt.styleId,
              styleIdSource: processSt.styleIdSource,
              styleProcessId: processSt.styleProcessId,
              styleProcessIdSource: processSt.styleProcessIdSource,
              processCode: processSt.processCode,
              processCodeSource: processSt.processCodeSource,
              matchedProcessId: processSt.matchedProcessId ?? null,
              matchedProcessCode: processSt.matchedProcessCode ?? null,
              matchedProcessName: processSt.matchedProcessName ?? null,
              matchedBuckets: processSt.matchedBuckets ?? [],
              bucketQuantity,
              allocatedQuantity: Math.max(0, Math.round(Number(allocatedTotal) || 0)),
              stSeconds: processSt.stSeconds,
              directSeconds,
              coverageStartDate,
              coverageEndDate,
            });
          }
        });
      }
    });

    if (hasDirectActualOutputStSeconds) {
      monthlyDirectActualOutputStSecondsByMonthKey.forEach((seconds, monthKey) => {
        const target = lineMonthBaseByKey.get(`${lineId}:${monthKey}`);
        if (!target) return;
        if (includeActualOutputDebug) {
          const debug = ensureActualOutputDebug(lineId, monthKey);
          debug.directUsedPlanCount += 1;
          debug.directUsedStSeconds += Math.max(0, Math.round(Number(seconds) || 0));
        }
        target.lineMonthlyActualOutputStSeconds += Math.max(
          0,
          Math.round(Number(seconds) || 0)
        );
      });
      return;
    }

    if (includeActualOutputDebug && planTouchedMonthKeys.size > 0) {
      planTouchedMonthKeys.forEach((monthKey) => {
        const debug = ensureActualOutputDebug(lineId, monthKey);
        debug.skippedPlanCount += 1;
        if (planActualOutputFailureReasons.size === 0) {
          incrementActualOutputDebugReason(debug, "DIRECT_ST_NOT_AVAILABLE");
        } else {
          planActualOutputFailureReasons.forEach((count, reason) => {
            for (let index = 0; index < count; index += 1) {
              incrementActualOutputDebugReason(debug, reason);
            }
          });
        }
      });
    }
  });

  let orphanRows: any[] = [];
  try {
    orphanRows = await prisma.workRecord.findMany({
      where: {
        orgId,
        assignmentPlanId: null,
        lineId: { in: requestedLineIds },
      },
      select: {
        lineId: true,
        effectiveCoverageStartDate: true,
        effectiveCoverageEndDate: true,
        workLog: {
          select: {
            coverageStartDate: true,
            coverageEndDate: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    orphanRows = [];
  }

  orphanRows.forEach((record) => {
    const lineId = toPositiveIntOrNull(record?.lineId);
    if (!lineId || !requestedLineIdSet.has(lineId)) return;
    const coverageStartDate =
      resolveWorkRecordEffectiveCoverageStartDate(record);
    const coverageEndDate =
      resolveWorkRecordEffectiveCoverageEndDate(record);
    if (!coverageStartDate || !coverageEndDate || coverageStartDate > coverageEndDate) {
      return;
    }
    buildLineMonthCapacityWeightRows({
      coverageStartDate,
      coverageEndDate,
      monthKeys: internalMonthKeys,
      holidaySet,
    }).forEach(({ monthKey }) => {
      const target = lineMonthBaseByKey.get(`${lineId}:${monthKey}`);
      if (!target) return;
      target.orphanWorkRecordCount += 1;
    });
  });

  const resolveLineCapacitySecondsForDateRange = ({
    lineId,
    startDateKey,
    endDateKey,
  }: {
    lineId: number;
    startDateKey: string;
    endDateKey: string;
  }) =>
    listDateKeysInclusiveForLineMonthCapacity(startDateKey, endDateKey).reduce(
      (sum, dateKey) => {
        const employeeIds = employeeIdsByLineDateKey.get(`${lineId}:${dateKey}`);
        if (!employeeIds || employeeIds.size === 0) return sum;
        return sum + employeeIds.size * DEFAULT_LINE_DAILY_WORK_SECONDS;
      },
      0
    );

  requestedLineIds.forEach((lineId) => {
    const forecastMeta = lineForecastMetaByLineId.get(lineId);
    if (!forecastMeta) return;
    const anchorDateKey = normalizeDateKey(forecastMeta.forecastAnchorDateKey);
    const anchorMonthKey = normalizeMonthKey(anchorDateKey?.slice(0, 7));
    let remainingBacklog = Math.max(
      0,
      Math.round(Number(forecastMeta.remainingBacklogStSeconds) || 0)
    );
    let previousCarryOutStSeconds = 0;

    internalMonthKeys.forEach((monthKey) => {
      const target = lineMonthBaseByKey.get(`${lineId}:${monthKey}`);
      if (!target) return;
      if (!anchorMonthKey || monthKey < anchorMonthKey) {
        target.monthType = "historical";
        target.totalEstimatedLoadStSeconds = target.lineMonthlyActualOutputStSeconds;
        target.totalEstimatedLoadPercent =
          target.lineMonthlyCapacitySeconds > 0
            ? Math.round(
                (target.totalEstimatedLoadStSeconds /
                  target.lineMonthlyCapacitySeconds) *
                  1000
              ) / 10
            : null;
        return;
      }

      target.monthType = monthKey === anchorMonthKey ? "anchor" : "forecast";
      const monthStartDateKey =
        getMonthStartDateKeyForLineMonthCapacity(monthKey) || internalStartDateKey;
      const monthEndDateKey =
        getMonthEndDateKeyForLineMonthCapacity(monthKey) || internalEndDateKey;
      const forecastStartDateKey =
        monthKey === anchorMonthKey
          ? anchorDateKey
          : resolveSameOrNextWorkingDateKeyForLineMonthCapacity({
              fromDateKey: monthStartDateKey,
              holidaySet,
            });
      const forecastAvailableCapacitySeconds =
        forecastStartDateKey && forecastStartDateKey <= monthEndDateKey
          ? resolveLineCapacitySecondsForDateRange({
              lineId,
              startDateKey: forecastStartDateKey,
              endDateKey: monthEndDateKey,
            })
          : 0;
      const forecastWorkingDayCount =
        forecastStartDateKey && forecastStartDateKey <= monthEndDateKey
          ? countWorkingDateKeysInRangeForLineMonthCapacity({
              startDateKey: forecastStartDateKey,
              endDateKey: monthEndDateKey,
              holidaySet,
            })
          : 0;
      const carryInStSeconds = monthKey === anchorMonthKey ? 0 : previousCarryOutStSeconds;
      const backlogEntering = monthKey === anchorMonthKey ? remainingBacklog : carryInStSeconds;
      const forecastLoadStSeconds = Math.max(
        0,
        Math.min(backlogEntering, forecastAvailableCapacitySeconds)
      );
      const carryOutStSeconds = Math.max(
        0,
        backlogEntering - forecastAvailableCapacitySeconds
      );
      previousCarryOutStSeconds = carryOutStSeconds;
      target.forecastAvailableCapacitySeconds = forecastAvailableCapacitySeconds;
      target.forecastWorkingDayCount = forecastWorkingDayCount;
      target.forecastLoadStSeconds = forecastLoadStSeconds;
      target.forecastLoadPercent =
        forecastAvailableCapacitySeconds > 0
          ? Math.round(
              (forecastLoadStSeconds / forecastAvailableCapacitySeconds) * 1000
            ) / 10
          : null;
      target.carryInStSeconds = carryInStSeconds;
      target.carryOutStSeconds = carryOutStSeconds;
      target.totalEstimatedLoadStSeconds =
        target.lineMonthlyActualOutputStSeconds + forecastLoadStSeconds;
      target.totalEstimatedLoadPercent =
        target.lineMonthlyCapacitySeconds > 0
          ? Math.round(
              (target.totalEstimatedLoadStSeconds /
                target.lineMonthlyCapacitySeconds) *
                1000
            ) / 10
          : null;
    });
  });

  const rows = Array.from(lineMonthBaseByKey.values())
    .sort((left, right) => {
      const lineCompare = Number(left.lineId) - Number(right.lineId);
      if (lineCompare !== 0) return lineCompare;
      return left.monthKey.localeCompare(right.monthKey);
    })
    .map((row) => {
      const averageHeadcount =
        row.workingDayCount > 0
          ? Math.round((row.headcountDayUnits / row.workingDayCount) * 10) / 10
          : 0;
      const actualOutputPercent =
        row.lineMonthlyCapacitySeconds > 0
          ? Math.round(
              (row.lineMonthlyActualOutputStSeconds /
                row.lineMonthlyCapacitySeconds) *
                1000
            ) / 10
          : null;
      const actualOutputDebug = includeActualOutputDebug
        ? {
            ...(actualOutputDebugByLineMonthKey.get(`${row.lineId}:${row.monthKey}`) ||
              {
                lineId: row.lineId,
                monthKey: row.monthKey,
                directCandidateRecordCount: 0,
                directMatchedRecordCount: 0,
                directFailedRecordCount: 0,
                invalidCoverageRecordCount: 0,
                emptyMonthAllocationRecordCount: 0,
                directCandidateQuantity: 0,
                directCandidateStSeconds: 0,
                directUsedPlanCount: 0,
                directUsedStSeconds: 0,
                skippedPlanCount: 0,
                skipReasonCounts: {},
                sampleFailures: [],
                sampleMatches: [],
              }),
            actualOutputNumeratorStSeconds: row.lineMonthlyActualOutputStSeconds,
            actualOutputDenominatorCapacitySeconds: row.lineMonthlyCapacitySeconds,
            actualOutputFormula:
              "actualOutputPercent = lineMonthlyActualOutputStSeconds / lineMonthlyCapacitySeconds * 100",
            actualOutputDenominatorSource:
              "active line assignments x working days x 8h",
            actualOutputDenominatorZeroReason:
              row.lineMonthlyCapacitySeconds > 0
                ? null
                : row.workingDayCount <= 0
                  ? "WORKING_DAY_COUNT_ZERO"
                  : row.defaultCapacityWorkerDayCount <= 0
                    ? "NO_ACTIVE_LINE_ASSIGNMENTS"
                    : "CAPACITY_SECONDS_ZERO",
            actualOutputNumeratorZeroReason:
              row.lineMonthlyActualOutputStSeconds > 0
                ? null
                : row.orphanWorkRecordCount > 0
                  ? "MATCHED_PLAN_RECORD_ST_SECONDS_ZERO_OR_ORPHAN_RECORDS_PRESENT"
                  : "MATCHED_PLAN_RECORD_ST_SECONDS_ZERO",
            workingDayCount: row.workingDayCount,
            headcountDayUnits: row.headcountDayUnits,
            averageHeadcount,
            lineMonthlyCapacitySeconds: row.lineMonthlyCapacitySeconds,
            lineMonthlyAttendanceSeconds: row.lineMonthlyAttendanceSeconds,
            lineMonthlyDefaultCapacitySeconds: row.lineMonthlyDefaultCapacitySeconds,
            attendanceWorkerDayCount: row.attendanceWorkerDayCount,
            defaultCapacityWorkerDayCount: row.defaultCapacityWorkerDayCount,
            lineMonthlyActualOutputStSeconds: row.lineMonthlyActualOutputStSeconds,
            actualOutputPercent,
            actualOutputRecordedThroughDateKey: row.actualOutputRecordedThroughDateKey,
            orphanWorkRecordCount: row.orphanWorkRecordCount,
          }
        : null;
      return {
        lineId: row.lineId,
        monthKey: row.monthKey,
        workingDayCount: row.workingDayCount,
        averageHeadcount,
        lineMonthlyCapacitySeconds: row.lineMonthlyCapacitySeconds,
        lineMonthlyAttendanceSeconds: row.lineMonthlyAttendanceSeconds,
        lineMonthlyDefaultCapacitySeconds: row.lineMonthlyDefaultCapacitySeconds,
        attendanceWorkerDayCount: row.attendanceWorkerDayCount,
        defaultCapacityWorkerDayCount: row.defaultCapacityWorkerDayCount,
        lineMonthlyActualOutputStSeconds: row.lineMonthlyActualOutputStSeconds,
        actualOutputPercent,
        ...(includeActualOutputDebug ? { actualOutputDebug } : {}),
        actualOutputRecordedThroughDateKey:
          row.actualOutputRecordedThroughDateKey,
        orphanWorkRecordCount: row.orphanWorkRecordCount,
        latestActualCoverageEndDateKey: row.latestActualCoverageEndDateKey,
        forecastAnchorDateKey: row.forecastAnchorDateKey,
        forecastAvailableCapacitySeconds: row.forecastAvailableCapacitySeconds,
        forecastWorkingDayCount: row.forecastWorkingDayCount,
        forecastLoadStSeconds: row.forecastLoadStSeconds,
        forecastLoadPercent: row.forecastLoadPercent,
        carryInStSeconds: row.carryInStSeconds,
        carryOutStSeconds: row.carryOutStSeconds,
        totalEstimatedLoadStSeconds: row.totalEstimatedLoadStSeconds,
        totalEstimatedLoadPercent: row.totalEstimatedLoadPercent,
        monthType: row.monthType,
        lineRemainingBacklogStSeconds:
          lineForecastMetaByLineId.get(Number(row.lineId))?.remainingBacklogStSeconds ?? 0,
        stUnknownAssignmentCount:
          lineForecastMetaByLineId.get(Number(row.lineId))?.stUnknownAssignmentCount ?? 0,
        // Assignments with actual recorded work whose progress ratio could not be
        // computed (e.g. assignmentCtSnapshot processes missing styleProcessId - see
        // the comment above isProgressUnknown). Excluded from
        // lineRemainingBacklogStSeconds rather than guessed at, so the forecast can
        // under-count but never silently re-inflate to the full planned ST.
        progressUnknownAssignmentCount:
          lineForecastMetaByLineId.get(Number(row.lineId))?.progressUnknownAssignmentCount ?? 0,
      };
    });

  return {
    monthKeys: requestedMonthKeys,
    rows,
    // Employee active on more than one line the same day (see the comment above
    // lineIdsByEmployeeDateKey). Read-only diagnostics - does not change any capacity
    // sum above, which still counts the employee once per line they overlap on.
    capacityOverlapCount,
    capacityOverlapSamples,
    ...(includeActualOutputDebug && actualOutputRequestDiagnostics
      ? { actualOutputDiagnostics: actualOutputRequestDiagnostics }
      : {}),
  };
};

const buildAssignmentPlanProgressRows = async (
  orgId: number,
  externalIds: string[] = []
) => {
  const normalizedExternalIds = Array.from(
    new Set(
      ensureArray(externalIds)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  const plans = await findAssignmentPlansWithSelectFallback({
    where: {
      orgId,
      ...(normalizedExternalIds.length > 0
        ? { externalId: { in: normalizedExternalIds } }
        : {}),
    },
    orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    selectAttempts: [
      ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
      ASSIGNMENT_PLAN_SELECT_CORE,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
      ASSIGNMENT_PLAN_SELECT_LEGACY,
    ],
    context: "buildAssignmentPlanProgressRows",
  });
  if (plans.length === 0) return [];

  const stateAssignmentsByExternalId = new Map<string, any>();
  const requiredStyleProcessIdsForProgress = collectPositiveIntSet(
    ...plans.flatMap((plan) =>
      collectStyleProcessIdsFromProcessKeyGroups(
        resolveAssignmentPlanRequiredProcessGroups(plan)
      )
    )
  );
  const styleProcessRowsForProgress =
    requiredStyleProcessIdsForProgress.length > 0
      ? await prisma.styleProcess.findMany({
          where: {
            orgId,
            id: { in: requiredStyleProcessIdsForProgress },
          },
          select: {
            id: true,
            standards: {
              select: {
                bucketQuantity: true,
                bucketStSeconds: true,
              },
            },
          },
        })
      : [];
  const styleProcessRowsForProgressById = new Map(
    styleProcessRowsForProgress.map((row) => [Number(row.id), row])
  );

  const lineIds = Array.from(
    new Set(
      plans
        .map((plan) => Number(plan?.lineId))
        .filter((lineId) => Number.isSafeInteger(lineId) && lineId > 0)
    )
  );
  const lineRows =
    lineIds.length > 0
      ? await prisma.line.findMany({
          where: { id: { in: lineIds } },
          select: { id: true, name: true },
        })
      : [];
  const lineNameById = new Map(
    lineRows.map((line) => [Number(line.id), resolveOptionalString(line.name, "") || ""])
  );

  const holidayModel = (prisma as any).organizationHoliday;
  const holidayRows =
    holidayModel && typeof holidayModel.findMany === "function"
      ? await holidayModel
          .findMany({
            where: { orgId },
            select: { holidayDate: true },
          })
          .catch(() => [])
      : [];
  const holidaySet = new Set<string>(
    ensureArray(holidayRows)
      .map((row) => normalizeDateKey(row?.holidayDate))
      .filter((value): value is string => Boolean(value))
  );

  const workRows = await loadAssignmentPlanProgressWorkRows({
    orgId,
    plans,
    stateAssignmentsByExternalId,
    context: "buildAssignmentPlanProgressRows",
  });
  const orphanWorkRecordCountByLine = new Map<number, number>();
  if (lineIds.length > 0) {
    const orphanRows = await prisma.workRecord.findMany({
      where: {
        orgId,
        assignmentPlanId: null,
        OR: [{ lineId: { in: lineIds } }, { lineId: null }],
      },
      select: {
        lineId: true,
        workLog: {
          select: {
            records: true,
          },
        },
      },
    });
    orphanRows.forEach((record) => {
      const lineId = resolveOrphanWorkRecordLineId(record);
      if (!lineId || !lineIds.includes(lineId)) return;
      orphanWorkRecordCountByLine.set(
        lineId,
        (orphanWorkRecordCountByLine.get(lineId) || 0) + 1
      );
    });
  }
  const payrollLockMonthByPlanId = new Map<number, string>();
  plans.forEach((plan) => {
    const monthKey = resolveAssignmentPlanPayrollLockMonth(plan);
    if (monthKey) payrollLockMonthByPlanId.set(Number(plan.id), monthKey);
  });
  const payrollLockedMonthSet = await loadLockedPayrollMonthSet(
    orgId,
    Array.from(payrollLockMonthByPlanId.values())
  );

  const statsByPlanId = new Map<number, AssignmentPlanWorkStats>();
  const sumByPlanId = new Map<number, number>();
  // Tracks the distinct set of WorkRecord months per plan so a zero-quantity
  // overflow assignment (AGENTS.md 40번) can be judged "fully settled" once
  // every one of its linked work-record months has a payroll snapshot -
  // separate from payrollLockMonthByPlanId above, which only tracks a single
  // nominal completion month and would stay empty for these plans.
  const workRecordMonthsByPlanId = new Map<number, Set<string>>();
  const getStats = (planId: number): AssignmentPlanWorkStats => {
    const existing = statsByPlanId.get(planId);
    if (existing) return existing;
    const next: AssignmentPlanWorkStats = {
      processTotalsByKey: new Map<string, number>(),
      dailyProcessTotalsByDate: new Map<string, Map<string, number>>(),
      firstWorkDate: null,
      lastWorkDate: null,
      hasRangeCoverage: false,
    };
    statsByPlanId.set(planId, next);
    return next;
  };

  workRows.forEach((record) => {
    const planId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (!planId) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;

    const stats = getStats(planId);
    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    if (!processKey) {
      console.warn(
        `[assignment-plan-progress] orgId=${orgId} assignmentPlanId=${planId} skipped workRecordId=${record?.id ?? "-"} without WorkRecord.styleProcessId`
      );
      return;
    }
    sumByPlanId.set(planId, (sumByPlanId.get(planId) || 0) + quantity);
    stats.processTotalsByKey.set(
      processKey,
      (stats.processTotalsByKey.get(processKey) || 0) + quantity
    );

    const coverageStartDate =
      resolveWorkRecordEffectiveCoverageStartDate(record);
    const coverageEndDate =
      resolveWorkRecordEffectiveCoverageEndDate(record);
    if (coverageStartDate && (!stats.firstWorkDate || coverageStartDate < stats.firstWorkDate)) {
      stats.firstWorkDate = coverageStartDate;
    }
    if (coverageEndDate && (!stats.lastWorkDate || coverageEndDate > stats.lastWorkDate)) {
      stats.lastWorkDate = coverageEndDate;
    }
    const workRecordMonthKey = coverageEndDate ? coverageEndDate.slice(0, 7) : null;
    if (workRecordMonthKey) {
      const monthSet = workRecordMonthsByPlanId.get(planId) ?? new Set<string>();
      monthSet.add(workRecordMonthKey);
      workRecordMonthsByPlanId.set(planId, monthSet);
    }
    if (
      coverageStartDate &&
      coverageEndDate &&
      coverageStartDate !== coverageEndDate
    ) {
      stats.hasRangeCoverage = true;
    }
    const entryMode =
      resolveOptionalString(record?.workLog?.entryMode, "")?.toLowerCase?.() || "";
    if (entryMode === "period_summary") {
      stats.hasRangeCoverage = true;
    }

    const workDateKey = coverageEndDate;
    if (!workDateKey) return;
    const byDate =
      stats.dailyProcessTotalsByDate.get(workDateKey) || new Map<string, number>();
    byDate.set(processKey, (byDate.get(processKey) || 0) + quantity);
    stats.dailyProcessTotalsByDate.set(workDateKey, byDate);
  });

  const allWorkRecordMonths = Array.from(
    new Set(
      Array.from(workRecordMonthsByPlanId.values()).flatMap((monthSet) =>
        Array.from(monthSet)
      )
    )
  );
  const workRecordPayrollLockedMonthSet = await loadLockedPayrollMonthSet(
    orgId,
    allWorkRecordMonths
  );

  const rows = plans.map((plan) => {
    const planId = Number(plan.id);
    const stats = statsByPlanId.get(planId) || {
      processTotalsByKey: new Map<string, number>(),
      dailyProcessTotalsByDate: new Map<string, Map<string, number>>(),
      firstWorkDate: null,
      lastWorkDate: null,
      hasRangeCoverage: false,
    };
    const requiredProcessGroups = resolveAssignmentPlanRequiredProcessGroups(plan);
    const plannedQuantity = resolveAssignmentQuantity(plan);
    const baselineQuantityRaw =
      plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
    const ctSnapshotRaw = resolveAssignmentCtSnapshotInput(plan);
    const ctSnapshot = (() => {
      if (!ctSnapshotRaw) return null;
      if (typeof ctSnapshotRaw === "string") {
        try {
          const parsed = JSON.parse(ctSnapshotRaw);
          return normalizeAssignmentCtSnapshot(parsed);
        } catch {
          return null;
        }
      }
      return normalizeAssignmentCtSnapshot(ctSnapshotRaw);
    })();
    const processCountFromSnapshot =
      Array.isArray(ctSnapshot?.processes) && ctSnapshot.processes.length > 0
        ? ctSnapshot.processes.length
        : null;
    const processCountFromRecords =
      stats.processTotalsByKey.size > 0 ? stats.processTotalsByKey.size : null;
    const processCount = processCountFromSnapshot ?? processCountFromRecords;
    const processGroupTotals = resolveAssignmentProcessGroupTotals({
      processTotalsByKey: stats.processTotalsByKey,
      processKeyGroups: requiredProcessGroups,
    });
    const totalExpected =
      baselineQuantityRaw != null && processCount != null && processCount > 0
        ? baselineQuantityRaw * processCount
        : null;
    const totalDone = sumByPlanId.get(planId) || 0;
    const isMarkedCompleted = plan?.isCompleted === true;
    const producedQuantity = resolveProducedQtyFromProcessKeyTotals({
      processTotalsByKey: stats.processTotalsByKey,
      processKeyGroups: requiredProcessGroups,
    });
    const remainingQty =
      baselineQuantityRaw == null
        ? null
        : Math.max(0, baselineQuantityRaw - producedQuantity);
    const overflowQuantity =
      baselineQuantityRaw == null ? 0 : Math.max(0, producedQuantity - baselineQuantityRaw);
    // requiredProcessGroups comes from assignmentCtSnapshot.processes[].styleProcessId.
    // Some persisted snapshots have processCode/name but a null styleProcessId per
    // process (a known data gap - see AGENTS.md), which makes requiredProcessGroups
    // resolve to [] and producedQuantity always compute as 0 regardless of how much
    // work was actually recorded. producedQuantity/remainingQty/overflowQuantity below
    // are left as-is (other UI depends on them), but the RATIO must not treat that 0
    // as "0% done" - otherwise Math.min(producedRatio, operationalProgressRatio) pins
    // progress to zero and the plan's full planned ST re-enters the forecast backlog
    // even at 88%+ real completion.
    const isProcessGroupUnavailable = requiredProcessGroups.length === 0 && totalDone > 0;
    const producedRatio =
      isMarkedCompleted
        ? 1
        : isProcessGroupUnavailable
          ? null
          : baselineQuantityRaw != null && baselineQuantityRaw > 0
            ? Math.min(1, Math.max(0, producedQuantity / baselineQuantityRaw))
            : null;
    const operationalProgressRatio = isMarkedCompleted
      ? 1
      : totalExpected != null && totalExpected > 0
        ? Math.min(1, Math.max(0, totalDone / totalExpected))
        : null;
    const ratioProgressForRemainingRatio = isMarkedCompleted
      ? 1
      : producedRatio != null && operationalProgressRatio != null
        ? Math.min(producedRatio, operationalProgressRatio)
        : producedRatio ?? operationalProgressRatio ?? null;
    // Neither ratio could be computed even though totalDone > 0 - do not silently
    // treat this as "0% done" (full planned ST) or exclude it either; surface it so
    // the frontend can show a "확인 필요" state instead of guessing.
    const ratioProgressUnknownCandidate =
      !isMarkedCompleted && ratioProgressForRemainingRatio == null && totalDone > 0;
    const progressImbalanceGapRatio =
      producedRatio != null && operationalProgressRatio != null
        ? Math.max(0, operationalProgressRatio - producedRatio)
        : 0;
    const hasProgressImbalanceWarning =
      progressImbalanceGapRatio >=
      SCHEDULER_PROGRESS_IMBALANCE_WARNING_THRESHOLD;
    const hasWorkProgressReachedCompletion =
      totalExpected != null && totalExpected > 0 && totalDone >= totalExpected;
    const hasExactProcessCompletion = Boolean(
      baselineQuantityRaw != null &&
        baselineQuantityRaw > 0 &&
        processCount != null &&
        processCount > 0 &&
        processGroupTotals.length === processCount &&
        producedQuantity >= baselineQuantityRaw &&
        processGroupTotals.every((value) => value === producedQuantity)
    );
    const progressPercent =
      operationalProgressRatio == null ? null : Math.min(100, Math.round(operationalProgressRatio * 100));
    const plannedStTotalSeconds = resolvePersistedAssignmentPlanStTotalSeconds(plan);
    const isStUnknown =
      plannedStTotalSeconds == null || plannedStTotalSeconds <= 0;
    const bucketQuantity =
      baselineQuantityRaw != null ? resolveStBucketQuantity(baselineQuantityRaw) : null;
    const exactRemainingStTotalSeconds =
      bucketQuantity != null
        ? calculateRemainingStTotalSecondsFromProcessProgress({
            processTotalsByKey: stats.processTotalsByKey,
            processKeyGroups: requiredProcessGroups,
            plannedQuantity: baselineQuantityRaw ?? 0,
            bucketQuantity,
            styleProcessRowsById: styleProcessRowsForProgressById,
          })
        : null;
    const progressForRemainingRatio =
      isMarkedCompleted
        ? 1
        : exactRemainingStTotalSeconds != null &&
            plannedStTotalSeconds != null &&
            plannedStTotalSeconds > 0
          ? Math.max(
              0,
              Math.min(1, 1 - exactRemainingStTotalSeconds / plannedStTotalSeconds)
            )
          : ratioProgressForRemainingRatio;
    const isProgressUnknown =
      ratioProgressUnknownCandidate && exactRemainingStTotalSeconds == null;
    const schedulerProgressPercent =
      progressForRemainingRatio == null
        ? null
        : Math.min(100, Math.round(progressForRemainingRatio * 100));
    const remainingStTotalSeconds =
      plannedStTotalSeconds == null
        ? null
        : isProgressUnknown
          ? null
          : exactRemainingStTotalSeconds != null
            ? exactRemainingStTotalSeconds
            : progressForRemainingRatio == null
            ? plannedStTotalSeconds
            : Math.max(
                0,
                Math.round(
                  plannedStTotalSeconds *
                    (progressForRemainingRatio >= 1
                      ? 0
                      : 1 - progressForRemainingRatio)
                )
              );
    const completedStTotalSeconds =
      plannedStTotalSeconds == null || remainingStTotalSeconds == null
        ? null
        : Math.max(0, plannedStTotalSeconds - remainingStTotalSeconds);

    const firstWorkDate = stats.firstWorkDate;
    const lastWorkDate = stats.lastWorkDate;
    const elapsedDays =
      firstWorkDate && lastWorkDate
        ? countDateRangeDaysInclusiveForAssignmentSchedule(firstWorkDate, lastWorkDate)
        : null;

    const canForecast =
      producedQuantity > 0 &&
      remainingQty != null &&
      firstWorkDate != null &&
      lastWorkDate != null &&
      elapsedDays != null &&
      elapsedDays > 0;
    const forecastDays =
      canForecast && remainingQty != null
        ? Math.max(
            0,
            Math.ceil((elapsedDays! * Math.max(0, remainingQty)) / Math.max(1, producedQuantity))
          )
        : null;
    const forecastCompletedDateKey =
      canForecast && forecastDays != null
        ? shiftDateKeyByDaysForAssignmentSchedule(lastWorkDate, forecastDays)
        : null;
    const forecastBasis = canForecast
      ? ASSIGNMENT_FORECAST_BASIS_WORKLOG_RATIO
      : ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE;

    let actualProducedCompletedDateKey: string | null = null;
    let actualProducedCompletedIsProxy = false;
    if (
      baselineQuantityRaw != null &&
      baselineQuantityRaw > 0 &&
      producedQuantity >= baselineQuantityRaw
    ) {
      if (stats.hasRangeCoverage) {
        actualProducedCompletedDateKey = lastWorkDate;
        actualProducedCompletedIsProxy = Boolean(actualProducedCompletedDateKey);
      } else {
        const cumulativeProcessTotalsByKey = new Map<string, number>();
        const sortedDateKeys = Array.from(stats.dailyProcessTotalsByDate.keys()).sort((a, b) =>
          a.localeCompare(b)
        );
        for (const dateKey of sortedDateKeys) {
          const dailyTotals = stats.dailyProcessTotalsByDate.get(dateKey);
          if (!dailyTotals) continue;
          dailyTotals.forEach((value, processKey) => {
            cumulativeProcessTotalsByKey.set(
              processKey,
              (cumulativeProcessTotalsByKey.get(processKey) || 0) +
                Math.max(0, Math.round(Number(value) || 0))
            );
          });
          const producedAtDate = resolveProducedQtyFromProcessKeyTotals({
            processTotalsByKey: cumulativeProcessTotalsByKey,
            processKeyGroups: requiredProcessGroups,
          });
          if (producedAtDate >= baselineQuantityRaw) {
            actualProducedCompletedDateKey = dateKey;
            break;
          }
        }
        if (!actualProducedCompletedDateKey) {
          actualProducedCompletedDateKey = lastWorkDate;
          actualProducedCompletedIsProxy = Boolean(actualProducedCompletedDateKey);
        }
      }
    }

    const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
    const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
    const finalQuantity = toOptionalNonNegativeInt(plan.finalQuantity, null);
    const closedQty = resolveAssignmentPlanClosedQty(plan);
    const closeMode =
      resolveOptionalString(plan?.closeMode, null) ??
      resolveAssignmentPlanCloseMode({
        closedQty,
        targetQty: plannedQuantity,
      });
    const closeBasis = resolveAssignmentPlanCloseBasis(plan);
    const completionTargetQuantity =
      closedQty ?? finalQuantity ?? baselineQuantityRaw;

    const persistedProductionCompletedAt =
      toOptionalDateValue(plan?.productionCompletedAt, null) ??
      resolveAssignmentPlanClosedAtValue(plan);
    const productionCompletedAtIso =
      toIsoDateStringOrNull(persistedProductionCompletedAt?.toISOString?.() || null) ||
      null;
    const productionCompletedDateKey = persistedProductionCompletedAt
      ? toDateKeyInTimeZone(persistedProductionCompletedAt, BUSINESS_TIME_ZONE)
      : null;
    const isCompletionInconsistent = Boolean(
      productionCompletedDateKey &&
        completionTargetQuantity != null &&
        completionTargetQuantity > 0 &&
        producedQuantity < completionTargetQuantity
    );
    const completionGapQuantity = isCompletionInconsistent
      ? Math.max(0, completionTargetQuantity! - producedQuantity)
      : 0;
    const payrollLockMonth = payrollLockMonthByPlanId.get(planId) || null;
    const isPayrollLocked = payrollLockMonth
      ? payrollLockedMonthSet.has(payrollLockMonth)
      : false;
    const lineOrphanWorkRecordCount =
      orphanWorkRecordCountByLine.get(Number(plan.lineId)) || 0;

    const isAutoReadyConfirmed =
      !isMarkedCompleted &&
      Boolean(productionCompletedDateKey) &&
      resolveOptionalString(plan?.closedBy, null) === AUTO_WORKLOG_COMPLETED_BY;
    const isManualReadyConfirmed =
      !isMarkedCompleted && Boolean(productionCompletedDateKey) && !isAutoReadyConfirmed;
    const scheduleStatus:
      | "IN_PROGRESS"
      | "REVIEW_REQUIRED"
      | "READY_TO_COMPLETE"
      | "PRODUCTION_COMPLETED" = isMarkedCompleted
      ? ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
      : isManualReadyConfirmed || hasExactProcessCompletion
        ? ASSIGNMENT_STATUS_READY_TO_COMPLETE
        : hasWorkProgressReachedCompletion
          ? ASSIGNMENT_STATUS_REVIEW_REQUIRED
          : ASSIGNMENT_STATUS_IN_PROGRESS;

    const stateAssignment = stateAssignmentsByExternalId.get(plan.externalId) || null;
    const snapshotSchedule = resolveNormalizedAssignmentCtSnapshot(plan)?.schedule || null;
    const factualStartDateKey =
      normalizeDateKey(stateAssignment?.startDateKey) ||
      normalizeDateKey(snapshotSchedule?.startDateKey) ||
      null;
    const durationDays = Math.max(
      1,
      Math.max(
        0,
        toSignedInt(plan?.endIndex, toSignedInt(plan?.startIndex, 0)) -
          toSignedInt(plan?.startIndex, 0)
      ) + 1
    );
    const originalEndDateKey =
      normalizeDateKey(stateAssignment?.endDateKey) ||
      normalizeDateKey(snapshotSchedule?.endDateKey) ||
      null;

    const candidateEndDateKey =
      productionCompletedDateKey ||
      actualProducedCompletedDateKey ||
      forecastCompletedDateKey ||
      originalEndDateKey;
    const renderEndDateKey =
      scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
        ? candidateEndDateKey
        : originalEndDateKey;

    const confidence = resolveWorklogRatioConfidence({
      producedQty: producedQuantity,
      planQty: baselineQuantityRaw,
      elapsedDays,
      isProxy: actualProducedCompletedIsProxy,
    });

    return {
      id: plan.externalId,
      dbId: planId,
      lineId: String(plan.lineId),
      lineName: lineNameById.get(Number(plan.lineId)) || "",
      // Phase E (AssignmentCard/AssignmentPlan FK+join redesign): orderNo/
      // customer/label columns are gone - these joins are the only source now.
      orderNo: resolveOptionalString(plan?.workOrder?.orderNumber, null) ?? "",
      customer: resolveOptionalString(plan?.buyerOrg?.name, null) ?? "",
      customerNameKo: resolveOptionalString(plan?.buyerOrg?.nameKo, null) ?? "",
      customerNameVi: resolveOptionalString(plan?.buyerOrg?.nameVi, null) ?? "",
      label: resolveOptionalString(plan?.style?.name, null) ?? "",
      // colorId/colorName dropped in Phase D - see the comment in
      // toAssignmentPlanResponse.
      colorId: null,
      colorName: "",
      plannedQuantity,
      finalQuantity,
      completionTargetQuantity,
      qcPassedTotal,
      latestQcDate,
      baselineQuantity: baselineQuantityRaw,
      producedQuantity,
      producedQty: producedQuantity,
      remainingQty,
      overflowQuantity,
      isOverflow: overflowQuantity > 0,
      // A style removed from its order while already worked (AGENTS.md 40번)
      // is kept at plannedQuantity 0 instead of being deleted, so every unit
      // already produced counts as overflow against a zero baseline.
      isZeroQuantityOverflow:
        (baselineQuantityRaw == null || baselineQuantityRaw <= 0) && producedQuantity > 0,
      // True once every distinct WorkRecord month linked to this plan has a
      // payroll snapshot - i.e. this overflow has been fully paid out and no
      // longer needs to sit in a review/warning list. Distinct from
      // isPayrollLocked below, which only tracks one nominal completion
      // month and would never be true for a plan that has no completion.
      isFullyPayrollSettled: (() => {
        const months = workRecordMonthsByPlanId.get(planId);
        if (!months || months.size === 0) return false;
        return Array.from(months).every((month) =>
          workRecordPayrollLockedMonthSet.has(month)
        );
      })(),
      isPayrollLocked,
      payrollLockMonth,
      isCompletionInconsistent,
      completionWarningCode: isCompletionInconsistent
        ? "COMPLETED_BELOW_BASELINE"
        : null,
      completionGapQuantity,
      plannedStTotalSeconds,
      remainingStTotalSeconds,
      completedStTotalSeconds,
      operationalProgressRatio,
      producedRatio,
      progressForRemainingRatio,
      progressImbalanceGapRatio,
      hasProgressImbalanceWarning,
      progressPercent,
      operationalProgressPercent: progressPercent,
      schedulerProgressPercent,
      isStUnknown,
      isProgressUnknown,
      hasRangeCoverage: stats.hasRangeCoverage,
      lineOrphanWorkRecordCount,
      hasOrphanWorkRecords: lineOrphanWorkRecordCount > 0,
      officialProgressPercent:
        scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 100 : null,
      isCompleted: scheduleStatus === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED,
      completedAt: productionCompletedAtIso,
      productionCompletedAt: productionCompletedAtIso,
      actualProducedCompletedAt: actualProducedCompletedDateKey,
      qcCompletedAt: null,
      closedQty,
      productionConfirmedQty: closedQty,
      closedAt: productionCompletedAtIso,
      closedBy: resolveOptionalString(plan?.closedBy, null),
      closeMode,
      closeBasis,
      firstWorkDate,
      lastWorkDate,
      elapsedDays,
      forecastCompletedAt: forecastCompletedDateKey,
      forecastBasis,
      confidence,
      renderStartDate: factualStartDateKey,
      candidateEndDate: candidateEndDateKey,
      renderEndDate: renderEndDateKey,
      scheduleStatus,
      isQcDone: Boolean(latestQcDate),
      _factualStartDateKey: factualStartDateKey,
      _durationDays: durationDays,
      _sortStartIndex: toSignedInt(plan?.startIndex, 0),
      _sortEndIndex: Math.max(
        toSignedInt(plan?.startIndex, 0),
        toSignedInt(plan?.endIndex, toSignedInt(plan?.startIndex, 0))
      ),
      _originalEndDateKey: originalEndDateKey,
    };
  });

  const rowsByLine = rows.reduce((map, row) => {
    const lineId = String(row.lineId || "");
    if (!lineId) return map;
    const bucket = map.get(lineId) || [];
    bucket.push(row);
    map.set(lineId, bucket);
    return map;
  }, new Map<string, any[]>());

  rowsByLine.forEach((lineRows) => {
    lineRows.sort((left, right) => {
      const leftCompleted =
        String(left?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 0 : 1;
      const rightCompleted =
        String(right?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED ? 0 : 1;
      if (leftCompleted !== rightCompleted) {
        return leftCompleted - rightCompleted;
      }
      if (left._sortStartIndex !== right._sortStartIndex) {
        return left._sortStartIndex - right._sortStartIndex;
      }
      if (left._sortEndIndex !== right._sortEndIndex) {
        return left._sortEndIndex - right._sortEndIndex;
      }
      return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
    });

    let cursorEndDateKey: string | null = null;
    lineRows.forEach((row) => {
      const isCompleted =
        String(row?.scheduleStatus || "") === ASSIGNMENT_STATUS_PRODUCTION_COMPLETED;
      // Only compute render coords for completed cards.
      // Incomplete cards already have renderStartDate/renderEndDate set from planned positions
      // in the main loop above; overwriting them here causes plan drift on every fetch.
      if (!isCompleted) return;
      const plannedDurationDays = Math.max(1, toSignedInt(row?._durationDays, 1));
      const baselineQuantity = toOptionalNonNegativeInt(row?.baselineQuantity, null);
      const producedQuantity = Math.max(0, Math.round(Number(row?.producedQuantity ?? 0) || 0));
      const elapsedDays = Math.max(0, toSignedInt(row?.elapsedDays, 0));
      let durationDays = plannedDurationDays;
      if (!isCompleted) {
        // For in-progress cards, derive a deterministic forecast duration from
        // current work-log velocity. This re-computes from full history each time,
        // so add/delete edits do not leave cumulative schedule drift behind.
        if (
          baselineQuantity != null &&
          baselineQuantity > 0 &&
          producedQuantity > 0 &&
          elapsedDays > 0
        ) {
          const forecastTotalDays = Math.max(
            1,
            Math.ceil((elapsedDays * baselineQuantity) / Math.max(1, producedQuantity))
          );
          durationDays = Math.max(plannedDurationDays, forecastTotalDays);
        }
      }
      const candidate =
        normalizeDateKey(row?.candidateEndDate) ||
        normalizeDateKey(row?._originalEndDateKey) ||
        normalizeDateKey(row?.lastWorkDate) ||
        normalizeDateKey(row?.firstWorkDate) ||
        null;

      let renderStartDateKey: string | null = null;
      if (isCompleted) {
        renderStartDateKey = normalizeDateKey(row?._factualStartDateKey);
        if (!renderStartDateKey && candidate) {
          renderStartDateKey =
            shiftDateKeyByDaysForAssignmentSchedule(candidate, -(durationDays - 1)) || candidate;
        }
      } else if (cursorEndDateKey) {
        renderStartDateKey = resolveNextWorkingDateKeyForAssignmentSchedule({
          fromDateKey: cursorEndDateKey,
          holidaySet,
        });
      } else {
        renderStartDateKey =
          normalizeDateKey(row?._factualStartDateKey) || normalizeDateKey(row?.candidateEndDate);
      }

      if (!renderStartDateKey) return;

      let renderEndDateKey = isCompleted
        ? normalizeDateKey(row?.candidateEndDate) || renderStartDateKey
        : shiftDateKeyByDaysForAssignmentSchedule(renderStartDateKey, durationDays - 1) ||
          renderStartDateKey;
      if (!isCompleted && candidate && candidate > renderEndDateKey) {
        renderEndDateKey = candidate;
      }

      row.renderStartDate = renderStartDateKey;
      row.renderEndDate = renderEndDateKey;
      cursorEndDateKey = renderEndDateKey;
    });
  });

  return rows.map((row) => {
    const {
      _factualStartDateKey: _factualStartDateKey,
      _durationDays: _durationDays,
      _sortStartIndex: _sortStartIndex,
      _sortEndIndex: _sortEndIndex,
      _originalEndDateKey: _originalEndDateKey,
      ...rest
    } = row;
    return rest;
  });
};

const isAutoWorklogCompletedPlan = (plan: any) =>
  plan?.isCompleted === true &&
  resolveOptionalString(plan?.closedBy, null) === AUTO_WORKLOG_COMPLETED_BY;

const resolveAutoWorklogCompletionDate = (row: any) => {
  const preferredDateKey =
    normalizeDateKey(row?.actualProducedCompletedAt) ||
    normalizeDateKey(row?.lastWorkDate) ||
    normalizeDateKey(row?.candidateEndDate) ||
    normalizeDateKey(row?.renderEndDate) ||
    normalizeDateKey(row?.forecastCompletedAt) ||
    null;
  return (
    toDateValueFromDateKeyForAssignmentSchedule(preferredDateKey) ||
    toOptionalDateValue(row?.productionCompletedAt, null) ||
    null
  );
};

const persistAssignmentPlanProgressSnapshot = async ({
  orgId,
  assignmentPlanIds = [],
  externalIds = [],
}: {
  orgId: number;
  assignmentPlanIds?: any;
  externalIds?: any;
}): Promise<{ updatedPlanCount: number }> => {
  const normalizedPlanIds = normalizePlanIdList(assignmentPlanIds);
  const normalizedExternalIds = Array.from(
    new Set(
      ensureArray(externalIds)
        .map((value) => resolveOptionalString(value, null))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (normalizedPlanIds.length === 0 && normalizedExternalIds.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const targetPlans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      isCompleted: false,
      OR: [
        ...(normalizedPlanIds.length > 0 ? [{ id: { in: normalizedPlanIds } }] : []),
        ...(normalizedExternalIds.length > 0
          ? [{ externalId: { in: normalizedExternalIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      externalId: true,
      assignmentQuantity: true,
      isCompleted: true,
      finalQuantity: true,
      closedQty: true,
      closedAt: true,
      closedBy: true,
      closeMode: true,
      closeBasis: true,
      scheduleStatus: true,
      completedAt: true,
      productionCompletedAt: true,
      candidateEndDate: true,
      renderEndDate: true,
    },
  });
  if (targetPlans.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const targetExternalIds = Array.from(
    new Set(
      targetPlans
        .map((plan) => resolveOptionalString(plan?.externalId, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (targetExternalIds.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const progressRows = await buildAssignmentPlanProgressRows(orgId, targetExternalIds);
  const rowByExternalId = progressRows.reduce((map, row) => {
    const externalId = resolveOptionalString(row?.id, null);
    if (!externalId || map.has(externalId)) return map;
    map.set(externalId, row);
    return map;
  }, new Map<string, any>());
  const payrollLockMonthByPlanId = new Map<number, string>();
  targetPlans.forEach((plan) => {
    const monthKey = resolveAssignmentPlanPayrollLockMonth(plan);
    if (monthKey) payrollLockMonthByPlanId.set(Number(plan.id), monthKey);
  });
  const prospectivePayrollLockMonthByPlanId = new Map<number, string>();
  targetPlans.forEach((plan) => {
    const row = rowByExternalId.get(plan.externalId);
    if (!row) return;
    const nextStatus = resolveOptionalString(row?.scheduleStatus, null);
    const autoReadyDate =
      nextStatus === ASSIGNMENT_STATUS_READY_TO_COMPLETE
        ? resolveAutoWorklogCompletionDate(row)
        : null;
    const prospectiveMonthKey = autoReadyDate
      ? toDateKeyInTimeZone(autoReadyDate, BUSINESS_TIME_ZONE)?.slice(0, 7) || null
      : null;
    if (prospectiveMonthKey) {
      prospectivePayrollLockMonthByPlanId.set(Number(plan.id), prospectiveMonthKey);
    }
  });
  const payrollLockedMonthSet = await loadLockedPayrollMonthSet(
    orgId,
    [
      ...Array.from(payrollLockMonthByPlanId.values()),
      ...Array.from(prospectivePayrollLockMonthByPlanId.values()),
    ]
  );

  const updates = targetPlans
    .map((plan) => {
      const row = rowByExternalId.get(plan.externalId);
      if (!row) return null;
      const resolvedProducedQuantity = Math.max(
        0,
        Math.round(Number(row?.producedQuantity ?? 0) || 0)
      );
      const nextStatus =
        resolveOptionalString(row?.scheduleStatus, null) ?? ASSIGNMENT_STATUS_IN_PROGRESS;
      const currentReadyDate = toOptionalDateValue(
        plan?.productionCompletedAt,
        resolveAssignmentPlanClosedAtValue(plan)
      );
      const currentReadyBy = resolveOptionalString(plan?.closedBy, null);
      const isAutoReadyConfirmed =
        !Boolean(plan?.isCompleted) &&
        currentReadyDate != null &&
        currentReadyBy === AUTO_WORKLOG_COMPLETED_BY;
      const isManualReadyConfirmed =
        !Boolean(plan?.isCompleted) &&
        currentReadyDate != null &&
        !isAutoReadyConfirmed;
      const autoReadyDate =
        nextStatus === ASSIGNMENT_STATUS_READY_TO_COMPLETE
          ? resolveAutoWorklogCompletionDate(row)
          : null;
      const prospectivePayrollLockMonth =
        prospectivePayrollLockMonthByPlanId.get(Number(plan.id)) || null;
      const isProspectivePayrollLocked = prospectivePayrollLockMonth
        ? payrollLockedMonthSet.has(prospectivePayrollLockMonth)
        : false;
      const payrollLockMonth = payrollLockMonthByPlanId.get(Number(plan.id)) || null;
      const isPayrollLocked = payrollLockMonth
        ? payrollLockedMonthSet.has(payrollLockMonth)
        : false;
      const shouldAutoReady =
        nextStatus === ASSIGNMENT_STATUS_READY_TO_COMPLETE &&
        !Boolean(plan?.isCompleted) &&
        !isManualReadyConfirmed &&
        autoReadyDate != null &&
        !isProspectivePayrollLocked;
      const canAutoRollback = isAutoReadyConfirmed && !isPayrollLocked;
      const actualProducedCompletedAt = toDateValueFromDateKeyForAssignmentSchedule(
        row?.actualProducedCompletedAt
      );
      const originalEndDate = toDateValueFromDateKeyForAssignmentSchedule(
        row?._originalEndDateKey
      );
      const forecastCompletedAt = toDateValueFromDateKeyForAssignmentSchedule(
        row?.forecastCompletedAt
      );
      const candidateEndDate =
        nextStatus !== ASSIGNMENT_STATUS_READY_TO_COMPLETE && canAutoRollback
          ? forecastCompletedAt || originalEndDate
          : toDateValueFromDateKeyForAssignmentSchedule(row?.candidateEndDate);
      const renderEndDate =
        nextStatus !== ASSIGNMENT_STATUS_READY_TO_COMPLETE && canAutoRollback
          ? originalEndDate
          : toDateValueFromDateKeyForAssignmentSchedule(row?.renderEndDate);
      const resolvedPlannedQuantity =
        toOptionalNonNegativeInt(plan?.assignmentQuantity, null) ??
        toOptionalNonNegativeInt(row?.plannedQuantity, null);
      const nextCloseMode = shouldAutoReady
        ? resolveAssignmentPlanCloseMode({
            closedQty: resolvedProducedQuantity,
            targetQty: resolvedPlannedQuantity,
          }) ?? null
        : null;

      const data: Prisma.AssignmentPlanUncheckedUpdateInput = {
        actualProducedCompletedAt,
        candidateEndDate,
        renderEndDate,
        forecastCompletedAt,
        forecastBasis: resolveOptionalString(row?.forecastBasis, null),
        confidence: resolveOptionalString(row?.confidence, null),
        scheduleStatus: nextStatus,
        updatedAt: new Date(),
      };

      if (nextStatus === ASSIGNMENT_STATUS_READY_TO_COMPLETE) {
        data.isCompleted = false;
        if (isManualReadyConfirmed) {
          data.productionCompletedAt = currentReadyDate;
          data.completedAt = currentReadyDate;
        } else if (shouldAutoReady) {
          data.productionCompletedAt = autoReadyDate;
          data.completedAt = autoReadyDate;
        }
      } else if (canAutoRollback) {
        data.isCompleted = false;
        data.productionCompletedAt = null;
        data.completedAt = null;
        data.finalQuantity = null;
        data.closedQty = null;
        data.closedAt = null;
        data.closedBy = null;
        data.closeMode = null;
        data.closeBasis = null;
      } else {
        data.isCompleted = false;
      }

      if (shouldAutoReady) {
        data.finalQuantity = resolvedProducedQuantity;
        data.closedQty = resolvedProducedQuantity;
        data.closedAt = autoReadyDate;
        data.closedBy = AUTO_WORKLOG_COMPLETED_BY;
        data.closeMode = nextCloseMode;
        if (plan?.closeBasis == null) {
          data.closeBasis = null;
        }
      }

      return {
        id: plan.id,
        data,
      };
    })
    .filter((row): row is { id: number; data: Prisma.AssignmentPlanUncheckedUpdateInput } =>
      Boolean(row)
    );

  if (updates.length === 0) {
    return { updatedPlanCount: 0 };
  }

  const updateResults = await prisma.$transaction(
    updates.map((update) =>
      prisma.assignmentPlan.updateMany({
        where: { id: update.id, isCompleted: false },
        data: update.data,
      })
    )
  );
  const updatedPlanCount = updateResults.reduce(
    (sum, result) => sum + Math.max(0, Math.round(Number(result?.count ?? 0))),
    0
  );

  return { updatedPlanCount };
};

const resolveAssignmentPlanProducedQuantity = async ({
  orgId,
  planId,
  baselineQuantity = null,
}: {
  orgId: number;
  planId: number;
  baselineQuantity?: number | null;
}): Promise<number> => {
  const normalizedPlanId = toPositiveIntOrNull(planId);
  if (normalizedPlanId === null) return 0;

  const plans = await findAssignmentPlansWithSelectFallback({
    where: { orgId, id: normalizedPlanId },
    orderBy: [{ id: "asc" }],
    selectAttempts: [
      ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
      ASSIGNMENT_PLAN_SELECT_CORE,
      ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
      ASSIGNMENT_PLAN_SELECT_LEGACY,
    ],
    context: "resolveAssignmentPlanProducedQuantity",
  });
  const plan = ensureArray(plans)[0];
  if (!plan) return 0;

  const stateAssignmentsByExternalId = new Map<string, any>();

  const workRows = await loadAssignmentPlanProgressWorkRows({
    orgId,
    plans: [plan],
    stateAssignmentsByExternalId,
    context: "resolveAssignmentPlanProducedQuantity",
  });
  const processTotalsByKey = new Map<string, number>();
  let skippedWorkRecordWithoutStyleProcessId = 0;
  workRows.forEach((record) => {
    const matchedPlanId = toPositiveIntOrNull(record?.assignmentPlanId);
    if (matchedPlanId !== normalizedPlanId) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity ?? 0)));
    if (quantity <= 0) return;
    const processKey = resolveWorkRecordProcessBucketKeyForAssignmentSchedule(record);
    if (!processKey) {
      skippedWorkRecordWithoutStyleProcessId += 1;
      return;
    }
    processTotalsByKey.set(
      processKey,
      (processTotalsByKey.get(processKey) || 0) + quantity
    );
  });
  if (skippedWorkRecordWithoutStyleProcessId > 0) {
    console.warn(
      `[assignment-produced-quantity] orgId=${orgId} assignmentPlanId=${normalizedPlanId} skipped ${skippedWorkRecordWithoutStyleProcessId} work records without WorkRecord.styleProcessId`
    );
  }

  const processKeyGroups = resolveAssignmentPlanRequiredProcessGroups(plan);
  return resolveProducedQtyFromProcessKeyTotals({
    processTotalsByKey,
    processKeyGroups,
  });
};

const buildAssignmentPlanCloseResponse = (plan: any) => {
  const quantity = resolveAssignmentQuantity(plan);
  const finalQuantity = toOptionalNonNegativeInt(plan?.finalQuantity, null);
  const qcPassedTotal = resolveAssignmentPlanQcPassedTotal(plan);
  const latestQcDate = resolveAssignmentPlanLatestQcDate(plan);
  const closedQty = resolveAssignmentPlanClosedQty(plan);
  const completedAt = resolveAssignmentPlanClosedAt(plan);
  const productionCompletedAtDate = toOptionalDateValue(
    plan?.productionCompletedAt,
    null
  );
  const productionCompletedAt =
    toIsoDateStringOrNull(productionCompletedAtDate?.toISOString?.() || null) ||
    completedAt;
  const isCompleted = plan?.isCompleted === true;
  const closeMode =
    resolveOptionalString(plan?.closeMode, null) ??
    resolveAssignmentPlanCloseMode({
      closedQty,
      targetQty: quantity,
    });
  const closeBasis = resolveAssignmentPlanCloseBasis(plan);
  const persistedScheduleStatus =
    resolveOptionalString(plan?.scheduleStatus, null) ??
    (isCompleted
      ? ASSIGNMENT_STATUS_PRODUCTION_COMPLETED
      : productionCompletedAt
        ? ASSIGNMENT_STATUS_READY_TO_COMPLETE
        : ASSIGNMENT_STATUS_IN_PROGRESS);

  return {
    id: plan?.externalId,
    dbId: plan?.id ?? null,
    lineId: String(plan?.lineId ?? ""),
    orderNo: resolveOptionalString(plan?.workOrder?.orderNumber, null) ?? "",
    label: resolveOptionalString(plan?.style?.name, null) ?? "",
    // colorName dropped in Phase D - see the comment in toAssignmentPlanResponse.
    colorName: "",
    quantity,
    isCompleted,
    finalQuantity,
    qcPassedTotal,
    latestQcDate,
    completedAt,
    productionCompletedAt,
    scheduleStatus: persistedScheduleStatus,
    closedQty,
    productionConfirmedQty: closedQty,
    closedAt: completedAt,
    closedBy: resolveOptionalString(plan?.closedBy, null),
    closeMode,
    closeBasis,
  };
};

const resolveLegacyCompletionQtyInput = ({
  body,
  keys,
}: {
  body: any;
  keys: string[];
}): { provided: boolean; value: number | null } => {
  const payload = body && typeof body === "object" ? body : {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    return {
      provided: true,
      value: toOptionalNonNegativeInt(payload[key], null),
    };
  }
  return { provided: false, value: null };
};

const completeAssignmentPlanProduction = async ({
  orgId,
  externalId,
  confirmedQty,
  completedAt,
  closeBasis = "MANUAL",
}: {
  orgId: number;
  externalId: string;
  confirmedQty: number | null;
  completedAt: Date;
  closeBasis?: "QC_BASED" | "MANUAL";
}) => {
  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId, externalId },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      assignmentQuantity: true,
      finalQuantity: true,
      isCompleted: true,
      completedAt: true,
      closedAt: true,
      closedQty: true,
      closeMode: true,
      closeBasis: true,
      closedBy: true,
      productionCompletedAt: true,
      updatedAt: true,
      // orderNo/label dropped in Phase E - see ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE.
      ...ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
    },
  });
  if (!plan) {
    return { ok: false as const, status: 404, error: "assignment plan not found" };
  }
  const payrollLockValidation = await validateAssignmentPlanPayrollLock({
    orgId,
    assignmentPlanIds: [plan.id],
  });
  if (payrollLockValidation.error) {
    return {
      ok: false as const,
      status: payrollLockValidation.status,
      error: payrollLockValidation.error,
    };
  }
  if (plan.isCompleted === true) {
    return {
      ok: false as const,
      status: 409,
      error: "assignment plan already completed",
    };
  }
  const currentProgressRows = await buildAssignmentPlanProgressRows(orgId, [externalId]);
  const currentScheduleStatus =
    resolveOptionalString(currentProgressRows[0]?.scheduleStatus, null) ??
    ASSIGNMENT_STATUS_IN_PROGRESS;
  if (currentScheduleStatus !== ASSIGNMENT_STATUS_REVIEW_REQUIRED) {
    return {
      ok: false as const,
      status: 409,
      error: "assignment plan must be review-required before manual work-done confirmation",
    };
  }

  const plannedQuantity = resolveAssignmentQuantity(plan);
  const baselineQuantity =
    plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
  const producedQuantity = await resolveAssignmentPlanProducedQuantity({
    orgId,
    planId: plan.id,
    baselineQuantity,
  });
  const resolvedClosedQtyRaw =
    confirmedQty ??
    toOptionalNonNegativeInt(plan.closedQty, null) ??
    toOptionalNonNegativeInt(plan.finalQuantity, null) ??
    producedQuantity;
  const resolvedClosedQty = Math.max(0, Math.round(Number(resolvedClosedQtyRaw) || 0));
  const closeMode =
    resolveAssignmentPlanCloseMode({
      closedQty: resolvedClosedQty,
      targetQty: plannedQuantity,
    }) ?? "FULL";
  const completionDateKey = toDateKeyInTimeZone(completedAt, BUSINESS_TIME_ZONE);
  const prospectivePayrollLockMonth =
    completionDateKey && /^\d{4}-\d{2}-\d{2}$/.test(completionDateKey)
      ? completionDateKey.slice(0, 7)
      : null;
  if (prospectivePayrollLockMonth) {
    const lockedMonthSet = await loadLockedPayrollMonthSet(orgId, [
      prospectivePayrollLockMonth,
    ]);
    if (lockedMonthSet.has(prospectivePayrollLockMonth)) {
      return {
        ok: false as const,
        status: 409,
        error: `assignment plan payroll locked (${formatAssignmentPlanLabel(plan)} [${prospectivePayrollLockMonth}])`,
      };
    }
  }
  const completionDate =
    toDateValueFromDateKeyForAssignmentSchedule(completionDateKey) || completedAt;
  const actor = getCurrentRequestActor();

  const updatedPlan = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.assignmentPlan.updateMany({
      where: {
        id: plan.id,
        orgId,
        isCompleted: false,
        productionCompletedAt: null,
        completedAt: null,
        closedAt: null,
        updatedAt: plan.updatedAt,
      },
      data: {
        productionCompletedAt: completedAt,
        isCompleted: false,
        completedAt,
        finalQuantity: resolvedClosedQty,
        closedQty: resolvedClosedQty,
        closedAt: completedAt,
        closedBy: actor,
        closeMode,
        closeBasis,
        candidateEndDate: completionDate,
        renderEndDate: completionDate,
        scheduleStatus: ASSIGNMENT_STATUS_READY_TO_COMPLETE,
        forecastCompletedAt: null,
        forecastBasis: ASSIGNMENT_FORECAST_BASIS_UNAVAILABLE,
        updatedAt: new Date(),
      },
    });
    if (updateResult.count !== 1) return null;
    return tx.assignmentPlan.findUnique({
      where: { id: plan.id },
      // orderNo/customer/label/previewUrl are no longer stored columns
      // (Phase E) - buildAssignmentPlanCloseResponse needs these joins to
      // resolve them at all.
      include: ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
    });
  });
  if (!updatedPlan) {
    return {
      ok: false as const,
      status: 409,
      error: "assignment plan already completed or modified; reload and retry",
    };
  }

  const shouldMutateScheduleFromProductionComplete =
    resolveOptionalString(process.env.ENABLE_PRODUCTION_COMPLETE_SCHEDULE_SYNC, "")?.toLowerCase?.() ===
    "true";
  if (shouldMutateScheduleFromProductionComplete) {
    await syncAssignmentSchedulesFromWorkRecordPlans({
      orgId,
      assignmentPlanIds: [updatedPlan.id],
    });
  }
  await persistAssignmentPlanProgressSnapshot({
    orgId,
    assignmentPlanIds: [updatedPlan.id],
  });
  await syncOrderProgressStatusesForOrg({ orgId });

  return {
    ok: true as const,
    status: 200,
    updatedPlan,
    producedQuantity,
    resolvedClosedQty,
  };
};

app.get("/assignment-plan-progress", async (req, res) => {
  try {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const idsQuery = resolveOptionalString(req.query.ids, "") || "";
    const externalIds = idsQuery
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const rows = await buildAssignmentPlanProgressRows(organization.id, externalIds);
    res.json(rows);
  } catch (error) {
    console.error("[assignment-plan-progress] request failed", {
      orgId: req.query?.orgId ?? null,
      ids: resolveOptionalString(req.query?.ids, "") || "",
      message: getErrorMessage(error, "unknown assignment-plan-progress error"),
      code: getErrorCode(error),
    });
    throw error;
  }
});

app.get("/line-month-capacity", async (req, res) => {
  try {
    const organization = await getOrganizationByQuery(req);
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const todayMonthKey = todayDateKey().slice(0, 7);
    const monthFrom =
      normalizeMonthKey(req.query.monthFrom) ||
      normalizeMonthKey(req.query.monthKey) ||
      todayMonthKey;
    const monthTo =
      normalizeMonthKey(req.query.monthTo) || monthFrom;
    if (!monthFrom || !monthTo || monthFrom > monthTo) {
      return res.status(400).json({
        ok: false,
        error: "invalid month range",
      });
    }

    const monthKeys = buildMonthKeyRangeForLineMonthCapacity(monthFrom, monthTo);
    if (monthKeys.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "month range exceeds supported span",
      });
    }

    const lineIds = parseLineIdsForLineMonthCapacity(req.query.lineIds);
    const debugMode = resolveOptionalString(req.query.debug, null);
    const includeActualOutputDebug =
      debugMode === "actual-output" || debugMode === "1" || debugMode === "true";
    const payload = await buildLineMonthCapacityRows({
      organization,
      orgId: organization.id,
      monthFrom,
      monthTo,
      lineIds,
      includeActualOutputDebug,
    });
    res.json(payload);
  } catch (error) {
    console.error("[line-month-capacity] request failed", {
      orgId: req.query?.orgId ?? null,
      monthFrom: resolveOptionalString(req.query?.monthFrom ?? req.query?.monthKey, null),
      monthTo: resolveOptionalString(req.query?.monthTo, null),
      lineIds: resolveOptionalString(req.query?.lineIds, null),
      message: getErrorMessage(error, "unknown line-month-capacity error"),
      code: getErrorCode(error),
    });
    throw error;
  }
});

app.get("/assignment-plans/:externalId/qc-history", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId: organization.id, externalId },
    select: {
      id: true,
      externalId: true,
    },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const history = await prisma.qcPassEvent.findMany({
    where: {
      orgId: organization.id,
      assignmentPlanId: plan.id,
    },
    include: {
      attrColor: {
        select: { id: true, code: true, name: true, nameKo: true },
      },
    },
    orderBy: [{ inspectedOn: "desc" }, { id: "desc" }],
  });

  return res.json({
    ok: true,
    plan: {
      id: plan.externalId,
      qcPassedTotal: Math.max(
        0,
        history.reduce(
          (sum, event) => sum + Math.max(0, Math.round(Number(event?.passedQuantity ?? 0) || 0)),
          0
        )
      ),
      latestQcDate:
        normalizeDateKey(history[0]?.inspectedOn) ||
        null,
    },
    history: history.map((event) => buildQcPassEventResponse(event)),
  });
});

app.post("/qc-pass-events", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const plan =
    (await findAssignmentPlanForQcEvent({
      orgId: organization.id,
      assignmentPlanRef:
        req.body?.assignmentPlanExternalId ?? req.body?.assignmentPlanId ?? null,
    })) ?? null;
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  const inspectedOn = normalizeDateKey(req.body?.inspectedOn);
  if (!inspectedOn) {
    return res.status(400).json({ ok: false, error: "inspectedOn is required" });
  }

  const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const normalizedEntries = (rawEntries.length > 0
    ? rawEntries
    : [
        {
          passedQuantity: req.body?.passedQuantity,
          colorId: req.body?.colorId,
          sizeKey: req.body?.sizeKey,
          note: req.body?.note,
        },
      ]
  )
    .map((entry: any) => ({
      passedQuantity: toOptionalNonNegativeInt(entry?.passedQuantity, null),
      colorId: toPositiveIntOrNull(entry?.colorId),
      sizeKey: normalizeQcPassEventSizeKey(entry?.sizeKey),
      note: resolveOptionalString(entry?.note, null),
    }))
    .filter(
      (
        entry: {
          passedQuantity: number | null;
          colorId: number | null;
          sizeKey: string | null;
          note: string | null;
        }
      ): entry is {
        passedQuantity: number;
        colorId: number | null;
        sizeKey: string | null;
        note: string | null;
      } => entry.passedQuantity != null && entry.passedQuantity > 0
    );

  if (normalizedEntries.length === 0) {
    return res.status(400).json({ ok: false, error: "passedQuantity is required" });
  }

  const actor = getCurrentRequestActor();
  const result = await prisma.$transaction(async (tx) => {
    const createdEvents = [];
    for (const entry of normalizedEntries) {
      const createdEvent = await tx.qcPassEvent.create({
        data: {
          orgId: organization.id,
          assignmentPlanId: plan.id,
          inspectedOn,
          passedQuantity: entry.passedQuantity!,
          colorId: entry.colorId,
          sizeKey: entry.sizeKey,
          note: entry.note,
          sourceType: "MANUAL",
          createdBy: actor,
        },
        include: {
          attrColor: {
            select: { id: true, code: true, name: true, nameKo: true },
          },
        },
      });
      createdEvents.push(createdEvent);
    }

    const aggregate = await syncAssignmentPlanQcAggregate({
      orgId: organization.id,
      planId: plan.id,
      db: tx,
    });

    return { createdEvents, aggregate };
  });

  return res.json({
    ok: true,
    plan: {
      id: plan.externalId,
      qcPassedTotal: result.aggregate.qcPassedTotal,
      latestQcDate: result.aggregate.latestQcDate,
    },
    events: result.createdEvents.map((event) => buildQcPassEventResponse(event)),
  });
});

app.patch("/qc-pass-events/:id/cancel", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const eventId = toPositiveIntOrNull(req.params.id);
  if (eventId == null) {
    return res.status(400).json({ ok: false, error: "invalid event id" });
  }

  const existingEvent = await prisma.qcPassEvent.findFirst({
    where: { id: eventId, orgId: organization.id },
    include: {
      attrColor: {
        select: { id: true, code: true, name: true, nameKo: true },
      },
    },
  });
  if (!existingEvent) {
    return res.status(404).json({ ok: false, error: "qc pass event not found" });
  }
  if (toOptionalDateValue(existingEvent.cancelledAt, null)) {
    return res.status(409).json({ ok: false, error: "qc pass event already cancelled" });
  }

  const actor = getCurrentRequestActor();
  const result = await prisma.$transaction(async (tx) => {
    const cancelledEvent = await tx.qcPassEvent.update({
      where: { id: existingEvent.id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: actor,
      },
      include: {
        attrColor: {
          select: { id: true, code: true, name: true, nameKo: true },
        },
      },
    });
    const aggregate = await syncAssignmentPlanQcAggregate({
      orgId: organization.id,
      planId: existingEvent.assignmentPlanId,
      db: tx,
    });
    return { cancelledEvent, aggregate };
  });

  return res.json({
    ok: true,
    event: buildQcPassEventResponse(result.cancelledEvent),
    plan: {
      assignmentPlanId: existingEvent.assignmentPlanId,
      qcPassedTotal: result.aggregate.qcPassedTotal,
      latestQcDate: result.aggregate.latestQcDate,
    },
  });
});

app.patch("/assignment-plans/:externalId/final-quantity", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const plan = await prisma.assignmentPlan.findFirst({
    where: { orgId: organization.id, externalId },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      isCompleted: true,
      completedAt: true,
      closedAt: true,
      productionCompletedAt: true,
      assignmentQuantity: true,
      finalQuantity: true,
      updatedAt: true,
      // orderNo/label dropped in Phase E - unused on this initial lookup
      // (buildAssignmentPlanCloseResponse only reads them from the
      // ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE-backed updatedPlan below).
    },
  });
  if (!plan) {
    return res.status(404).json({ ok: false, error: "assignment plan not found" });
  }

  if (
    plan.isCompleted === true ||
    toOptionalDateValue(plan.productionCompletedAt, null) !== null ||
    resolveAssignmentPlanClosedAtValue(plan) !== null
  ) {
    return res.status(409).json({
      ok: false,
      error: "assignment plan already completed",
    });
  }

  const finalQuantity = toOptionalNonNegativeInt(req.body?.finalQuantity, null);
  if (finalQuantity === null) {
    return res.status(400).json({ ok: false, error: "finalQuantity is required" });
  }

  const updatedPlan = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.assignmentPlan.updateMany({
      where: {
        id: plan.id,
        orgId: organization.id,
        isCompleted: false,
        productionCompletedAt: null,
        completedAt: null,
        closedAt: null,
        updatedAt: plan.updatedAt,
      },
      data: {
        finalQuantity,
        updatedAt: new Date(),
      },
    });
    if (updateResult.count !== 1) return null;
    return tx.assignmentPlan.findUnique({
      where: { id: plan.id },
      // orderNo/customer/label/previewUrl are no longer stored columns
      // (Phase E) - buildAssignmentPlanCloseResponse needs these joins to
      // resolve them at all.
      include: ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE,
    });
  });
  if (!updatedPlan) {
    return res.status(409).json({
      ok: false,
      error: "assignment plan already completed or modified; reload and retry",
    });
  }

  const plannedQuantity = resolveAssignmentQuantity(updatedPlan);
  const baselineQuantity =
    plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;
  const producedQuantity = await resolveAssignmentPlanProducedQuantity({
    orgId: organization.id,
    planId: updatedPlan.id,
    baselineQuantity,
  });

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(updatedPlan),
      producedQuantity,
    },
  });
});

app.post("/assignment-plans/:externalId/close", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const qtyInput = resolveLegacyCompletionQtyInput({
    body: req.body,
    keys: ["closedQty", "finalQuantity", "confirmedQty"],
  });
  if (!qtyInput.provided || qtyInput.value === null) {
    return res.status(400).json({ ok: false, error: "closedQty is required" });
  }

  const requestedBasis = resolveOptionalString(req.body?.closeBasis, null);
  const closeBasis =
    requestedBasis === "QC_BASED" || requestedBasis === "MANUAL"
      ? requestedBasis
      : "MANUAL";
  const closedAt = toOptionalDateValue(req.body?.closedAt, null) ?? new Date();
  const completion = await completeAssignmentPlanProduction({
    orgId: organization.id,
    externalId,
    confirmedQty: qtyInput.value,
    completedAt: closedAt,
    closeBasis,
  });
  if (!completion.ok) {
    return res.status(completion.status).json({ ok: false, error: completion.error });
  }

  console.warn(
    `[deprecated-endpoint] POST /assignment-plans/:externalId/close used (orgId=${organization.id}, externalId=${externalId})`
  );
  res.set("Deprecation", "true");
  res.set("Link", '</assignment-plans/{externalId}/production-complete>; rel="successor-version"');

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(completion.updatedPlan),
      producedQuantity: completion.producedQuantity,
      productionConfirmedQty: completion.resolvedClosedQty,
    },
    reorderedAssignments: 0,
    deprecated: true,
  });
});

app.patch("/assignment-plans/:externalId/production-complete", async (req, res) => {
  const MAX_CONFIRMED_QTY = 100_000;
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const externalId = resolveOptionalString(req.params.externalId, null);
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "invalid externalId" });
  }

  const qtyInput = resolveLegacyCompletionQtyInput({
    body: req.body,
    keys: ["confirmedQty", "closedQty", "finalQuantity"],
  });
  if (qtyInput.provided && qtyInput.value === null) {
    return res.status(400).json({
      ok: false,
      error: "confirmedQty must be a non-negative integer",
    });
  }
  if (qtyInput.provided && qtyInput.value !== null && qtyInput.value > MAX_CONFIRMED_QTY) {
    return res.status(400).json({
      ok: false,
      error: `confirmedQty exceeds maximum allowed value (${MAX_CONFIRMED_QTY})`,
    });
  }
  const completedAt = toOptionalDateValue(req.body?.completedAt, null) ?? new Date();
  const completion = await completeAssignmentPlanProduction({
    orgId: organization.id,
    externalId,
    confirmedQty: qtyInput.value,
    completedAt,
    closeBasis: "MANUAL",
  });
  if (!completion.ok) {
    return res.status(completion.status).json({ ok: false, error: completion.error });
  }

  return res.json({
    ok: true,
    plan: {
      ...buildAssignmentPlanCloseResponse(completion.updatedPlan),
      producedQuantity: completion.producedQuantity,
      productionConfirmedQty: completion.resolvedClosedQty,
      productionCompletedAt: toIsoDateStringOrNull(
        completion.updatedPlan.productionCompletedAt
      ),
      scheduleStatus: ASSIGNMENT_STATUS_READY_TO_COMPLETE,
    },
    reorderedAssignments: 0,
  });
});

app.get("/holidays", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_ACCESS_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  try {
    await ensureOrganizationHolidayStorageReady();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error, "failed to initialize holiday storage"),
    });
  }

  const holidayModel = (prisma as any).organizationHoliday;

  let rows: Array<{ holidayDate: string }> = [];
  try {
    rows = await holidayModel.findMany({
      where: { orgId: organization.id },
      select: { holidayDate: true },
      orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    if (getErrorCode(error) === "P2021") {
      organizationHolidayStorageReadyPromise = null;
      await ensureOrganizationHolidayStorageReady();
      rows = await holidayModel.findMany({
        where: { orgId: organization.id },
        select: { holidayDate: true },
        orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
      });
    } else {
      throw error;
    }
  }

  return res.json(toHolidayDateKeyResponse(rows));
});

app.put("/holidays", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  try {
    await ensureOrganizationHolidayStorageReady();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error, "failed to initialize holiday storage"),
    });
  }

  const holidayModel = (prisma as any).organizationHoliday;

  const holidayDateKeys = normalizeHolidayDateKeyList(req.body?.holidays);
  let savedRows: Array<{ holidayDate: string }> = [];
  try {
    savedRows = await prisma.$transaction(async (tx) => {
      const holidayTx = (tx as any).organizationHoliday;
      await holidayTx.deleteMany({
        where: { orgId: organization.id },
      });

      if (holidayDateKeys.length > 0) {
        await holidayTx.createMany({
          data: holidayDateKeys.map((holidayDate) => ({
            orgId: organization.id,
            holidayDate,
          })),
          skipDuplicates: true,
        });
      }

      return holidayTx.findMany({
        where: { orgId: organization.id },
        select: { holidayDate: true },
        orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
      });
    });
  } catch (error) {
    if (getErrorCode(error) === "P2021") {
      organizationHolidayStorageReadyPromise = null;
      await ensureOrganizationHolidayStorageReady();
      savedRows = await prisma.$transaction(async (tx) => {
        const holidayTx = (tx as any).organizationHoliday;
        await holidayTx.deleteMany({
          where: { orgId: organization.id },
        });

        if (holidayDateKeys.length > 0) {
          await holidayTx.createMany({
            data: holidayDateKeys.map((holidayDate) => ({
              orgId: organization.id,
              holidayDate,
            })),
            skipDuplicates: true,
          });
        }

        return holidayTx.findMany({
          where: { orgId: organization.id },
          select: { holidayDate: true },
          orderBy: [{ holidayDate: "asc" }, { id: "asc" }],
        });
      });
    } else {
      throw error;
    }
  }

  return res.json(toHolidayDateKeyResponse(savedRows));
});

app.get("/attendance-entries", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  const factoryId = Number(req.query.factoryId);
  if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }
  const workDate = normalizeDateKey(req.query.workDate);
  const month = normalizeMonthKey(req.query.month);
  if (!workDate && !month) {
    return res.status(400).json({
      ok: false,
      error: "workDate or month is required",
    });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
    select: { id: true },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const rows = await prisma.attendanceEntry.findMany({
    where: {
      orgId: organization.id,
      factoryId,
      ...(workDate ? { workDate } : { workDate: { startsWith: month } }),
    },
    orderBy: [{ workDate: "asc" }, { workerId: "asc" }, { id: "asc" }],
  });

  res.json(rows.map(toAttendanceEntryResponse));
});

app.put("/attendance-entries", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  const factoryId = Number(req.body?.factoryId);
  if (!Number.isSafeInteger(factoryId) || factoryId <= 0) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }
  const workDate = normalizeDateKey(req.body?.workDate);
  if (!workDate) {
    return res.status(400).json({ ok: false, error: "workDate is required (YYYY-MM-DD)" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
    select: { id: true },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const normalized = normalizeAttendanceEntryPayloadList(req.body?.entries);
  if (normalized.invalidWorkerEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidWorkerEntryIndex}].workerId is required`,
    });
  }
  if (normalized.invalidClockInEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidClockInEntryIndex}].clockIn must be HH:mm`,
    });
  }
  if (normalized.invalidClockOutEntryIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: `entries[${normalized.invalidClockOutEntryIndex}].clockOut must be HH:mm`,
    });
  }
  if (normalized.duplicateWorkerId !== null) {
    return res.status(409).json({
      ok: false,
      error: `duplicate worker entry (${normalized.duplicateWorkerId})`,
    });
  }

  const workerIds = Array.from(new Set(normalized.rows.map((row) => row.workerId)));
  let writableRows = normalized.rows;
  if (workerIds.length > 0) {
    const workers = await prisma.employee.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        id: { in: workerIds },
      },
      select: {
        id: true,
        leftAt: true,
        orgRole: true,
        status: true,
      },
    });
    const workersById = new Map<
      number,
      {
        membershipRole: string;
        membershipStatus: string;
        leftDateKey: string;
      }
    >();
    workers.forEach((worker) => {
      const workerId = toPositiveIntOrNull(worker.id);
      if (workerId === null) return;
      workersById.set(workerId, {
        membershipRole: String(worker.orgRole ?? "")
          .trim()
          .toUpperCase(),
        membershipStatus: String(worker.status ?? "")
          .trim()
          .toUpperCase(),
        leftDateKey: toDateKeyInTimeZone(worker.leftAt, BUSINESS_TIME_ZONE),
      });
    });

    const validIds = new Set(workersById.keys());
    const invalidWorkerId = workerIds.find((workerId) => !validIds.has(workerId));
    if (invalidWorkerId !== undefined) {
      return res.status(400).json({
        ok: false,
        error: `entries has invalid workerId (${invalidWorkerId})`,
      });
    }

    const blockedWorkerIds = new Set<number>();
    workersById.forEach((worker, workerId) => {
      if (worker.membershipStatus !== "TERMINATED") return;
      if (!worker.leftDateKey) return;
      if (workDate > worker.leftDateKey) {
        blockedWorkerIds.add(workerId);
      }
    });
    if (blockedWorkerIds.size > 0) {
      writableRows = normalized.rows.filter(
        (row) => !blockedWorkerIds.has(row.workerId)
      );
    }

    const adminWorkerIds = new Set<number>();
    workersById.forEach((worker, workerId) => {
      if (worker.membershipRole === "ADMIN") {
        adminWorkerIds.add(workerId);
      }
    });
    if (adminWorkerIds.size > 0) {
      writableRows = writableRows.filter((row) => !adminWorkerIds.has(row.workerId));
    }
  }

  const savedRows = await prisma.$transaction(async (tx) => {
    if (normalized.rows.length === 0) {
      await tx.attendanceEntry.deleteMany({
        where: {
          orgId: organization.id,
          factoryId,
          workDate,
        },
      });
      return [];
    }

    if (writableRows.length > 0) {
      await Promise.all(
        writableRows.map((row) =>
          tx.attendanceEntry.upsert({
            where: {
              orgId_factoryId_workerId_workDate: {
                orgId: organization.id,
                factoryId,
                workerId: row.workerId,
                workDate,
              },
            },
            create: {
              orgId: organization.id,
              factoryId,
              workerId: row.workerId,
              workDate,
              clockIn: row.clockIn,
              clockOut: row.clockOut,
              workedSeconds: row.workedSeconds,
              note: row.note,
            },
            update: {
              clockIn: row.clockIn,
              clockOut: row.clockOut,
              workedSeconds: row.workedSeconds,
              note: row.note,
            },
          })
        )
      );
    }

    return tx.attendanceEntry.findMany({
      where: {
        orgId: organization.id,
        factoryId,
        workDate,
      },
      orderBy: [{ workerId: "asc" }, { id: "asc" }],
    });
  });

  res.json(savedRows.map(toAttendanceEntryResponse));
});

app.get("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeRecords = !(
    req.query.includeRecords === "0" || req.query.includeRecords === "false"
  );

  const factoryId = Number(req.query.factoryId);
  const hasFactoryFilter = Number.isFinite(factoryId);
  const workDateInput = req.query.workDate;
  const hasWorkDateFilter =
    workDateInput !== undefined &&
    workDateInput !== null &&
    String(workDateInput).trim() !== "";
  const workDate = normalizeDateKey(workDateInput);
  if (hasWorkDateFilter && !workDate) {
    return res.status(400).json({ ok: false, error: "invalid workDate" });
  }
  const dateFrom = normalizeDateKey(req.query.dateFrom);
  const dateTo = normalizeDateKey(req.query.dateTo);
  if (hasFactoryFilter) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryId, orgId: organization.id },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  const workDateFilter = workDate
    ? { displayDate: workDate }
    : dateFrom || dateTo
      ? { displayDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {};

  let workLogs: any[] = [];
  try {
    workLogs = await prisma.workLog.findMany({
      where: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
        ...workDateFilter,
      },
      select: buildWorkLogSelectWithOptionalCoverage({
        includeCoverage: true,
        includeRecords,
      }),
      orderBy: [{ displayDate: "desc" }, { id: "desc" }],
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    workLogs = await prisma.workLog.findMany({
      where: {
        orgId: organization.id,
        ...(hasFactoryFilter ? { factoryId } : {}),
        ...workDateFilter,
      },
      select: buildWorkLogSelectWithOptionalCoverage({
        includeCoverage: false,
        includeRecords,
      }),
      orderBy: [{ displayDate: "desc" }, { id: "desc" }],
    });
    console.warn(
      `[work-logs] orgId=${organization.id} missing work-log coverage columns; fallback list query activated`
    );
  }

  res.json(
    await buildWorkLogResponseList({
      orgId: organization.id,
      workLogs,
    })
  );
});

app.get("/work-log-context", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const lineId = toPositiveIntOrNull(req.query.lineId);
  const factoryId = toPositiveIntOrNull(req.query.factoryId);
  const workDate = normalizeDateKey(req.query.workDate);
  const coverageStartDate = normalizeDateKey(req.query.coverageStartDate);
  const debug =
    String(req.query.debug || "").trim() === "1" ||
    String(req.query.debug || "").trim().toLowerCase() === "true";
  if (!lineId) {
    return res.status(400).json({ ok: false, error: "lineId is required" });
  }
  if (!workDate) {
    return res.status(400).json({ ok: false, error: "invalid workDate" });
  }

  const context = await buildWorkLogContextResponse({
    orgId: organization.id,
    factoryId,
    lineId,
    workDate,
    coverageStartDate: coverageStartDate || null,
    debug,
  });

  res.json(context);
});

app.get("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const includeContext =
    req.query.includeContext === "1" || req.query.includeContext === "true";

  let baseWorkLog: any = null;
  try {
    baseWorkLog = await prisma.workLog.findFirst({
      where: { id, orgId: organization.id },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: true,
          includeRecords: false,
        }),
        workRecords: WORK_LOG_DETAIL_RECORD_SELECT,
      },
    });
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    baseWorkLog = await prisma.workLog.findFirst({
      where: { id, orgId: organization.id },
      select: {
        ...buildWorkLogSelectWithOptionalCoverage({
          includeCoverage: false,
          includeRecords: false,
        }),
        workRecords: WORK_LOG_DETAIL_RECORD_SELECT,
      },
    });
    console.warn(
      `[work-logs/:id] orgId=${organization.id} workLogId=${id} missing work-log coverage columns; fallback detail query activated`
    );
  }
  if (!baseWorkLog) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }

  const lineMeta = resolveWorkLogLineMeta(baseWorkLog?.records);
  const context = includeContext
    ? await buildWorkLogContextResponse({
        orgId: organization.id,
        factoryId: toPositiveIntOrNull(baseWorkLog.factoryId),
        lineId: toPositiveIntOrNull(lineMeta.lineId),
        lineName: resolveOptionalString(lineMeta.lineName, null),
        workDate: baseWorkLog.displayDate,
        coverageStartDate: resolveWorkLogCoverageStartDate(
          baseWorkLog,
          resolveWorkLogCoverageEndDate(baseWorkLog, baseWorkLog.displayDate)
        ),
      })
    : null;

  const [response] = await buildWorkLogResponseList({
    orgId: organization.id,
    workLogs: [{ ...baseWorkLog }],
  });
  if (!includeContext) {
    return res.json(response);
  }

  res.json({
    ...response,
    context,
  });
});

app.post("/work-logs/import", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const importedRows = normalizeImportedWorkLogRows(req.body?.rows);
  if (importedRows.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Work-log import failed: no rows were provided.",
      issues: [],
    });
  }

  const issues: WorkLogImportIssue[] = [];
  const respondWithIssues = () =>
    res.status(400).json({
      ok: false,
      error: summarizeWorkLogImportIssues(issues),
      issues,
    });

  importedRows.forEach((row) => {
    if (!row.coverageEndDate) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_END_DATE",
          message: "DATE(END) is required.",
        })
      );
    }
    if (!row.coverageStartDate) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_START_DATE",
          message: "DATE(START) is invalid.",
        })
      );
    }
    if (
      row.coverageStartDate &&
      row.coverageEndDate &&
      row.coverageStartDate > row.coverageEndDate
    ) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "INVALID_DATE_RANGE",
          message: "DATE(START) cannot be later than DATE(END).",
        })
      );
    }
    if (!row.employeeNo) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_EMPLOYEE_NO",
          message: "Employee code is required.",
        })
      );
    }
    if (!row.orderNo) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_ORDER_NO",
          message: "ORDER# is required.",
        })
      );
    }
    if (!row.styleId) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_STYLE_ID",
          message: "STYLE is required.",
        })
      );
    }
    if (!row.processCode) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "MISSING_PROCESS_CODE",
          message: "JOB(process) is required.",
        })
      );
    }
    if (row.quantity <= 0) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "INVALID_QUANTITY",
          message: "JOB(quantity) must be greater than 0.",
        })
      );
    }
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const employeeNos = Array.from(
    new Set(
      importedRows
        .map((row) => resolveOptionalString(row.employeeNo, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const employees =
    employeeNos.length > 0
      ? await prisma.employee.findMany({
          where: {
            orgId: organization.id,
            employeeNo: { in: employeeNos },
          },
          select: {
            id: true,
            employeeNo: true,
            name: true,
            factoryId: true,
            lineId: true,
            line: {
              select: {
                id: true,
                factoryId: true,
                name: true,
              },
            },
            joinedAt: true,
            leftAt: true,
          },
        })
      : [];
  const employeeByNo = new Map<string, any>();
  employees.forEach((employee) => {
    const employeeNo = normalizeEmployeeNo(employee?.employeeNo);
    if (!employeeNo || employeeByNo.has(employeeNo)) return;
    employeeByNo.set(employeeNo, employee);
  });

  importedRows.forEach((row) => {
    const employee = row.employeeNo ? employeeByNo.get(row.employeeNo) ?? null : null;
    if (!employee) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "EMPLOYEE_NOT_FOUND",
          message: `Employee code ${row.employeeNo || "(blank)"} was not found.`,
        })
      );
      return;
    }
    const importNameKey = normalizeComparableText(row.employeeName);
    const employeeNameKey = normalizeComparableText(employee?.name);
    if (importNameKey && employeeNameKey && importNameKey !== employeeNameKey) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "EMPLOYEE_NAME_MISMATCH",
          message: `Employee code ${row.employeeNo} belongs to ${resolveOptionalString(
            employee?.name,
            "another employee"
          )}, not ${row.employeeName}.`,
        })
      );
    }
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const employeeIds = employees
    .map((employee) => toPositiveIntOrNull(employee?.id))
    .filter((value): value is number => value !== null);
  const [lineAssignments, lines] = await Promise.all([
    employeeIds.length > 0
      ? prisma.lineAssignment.findMany({
          where: {
            employeeId: { in: employeeIds },
            line: { orgId: organization.id },
          },
          select: {
            employeeId: true,
            startAt: true,
            endAt: true,
            lineId: true,
            line: {
              select: {
                id: true,
                factoryId: true,
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.line.findMany({
      where: { orgId: organization.id },
      select: { id: true, factoryId: true, name: true },
    }),
  ]);

  const lineAssignmentsByEmployeeId = ensureArray(lineAssignments).reduce((map, assignment) => {
    const employeeId = toPositiveIntOrNull(assignment?.employeeId);
    if (!employeeId) return map;
    const bucket = map.get(employeeId) || [];
    bucket.push(assignment);
    map.set(employeeId, bucket);
    return map;
  }, new Map<number, any[]>());
  const lineById = ensureArray(lines).reduce((map, line) => {
    const lineId = toPositiveIntOrNull(line?.id);
    if (!lineId || map.has(lineId)) return map;
    map.set(lineId, line);
    return map;
  }, new Map<number, any>());

  const preparedRows: Array<{
    row: (typeof importedRows)[number];
    employee: any;
    line: { id: number; factoryId: number; name: string; source: string };
  }> = [];

  importedRows.forEach((row) => {
    const employee = row.employeeNo ? employeeByNo.get(row.employeeNo) ?? null : null;
    if (!employee || !row.coverageEndDate) return;
    const resolvedLine = resolveWorkLogImportLineForEmployee({
      employee,
      coverageEndDate: row.coverageEndDate,
      lineAssignmentsByEmployeeId,
    });
    if (resolvedLine.error || !resolvedLine.line?.id || !resolvedLine.line?.factoryId) {
      issues.push(
        buildWorkLogImportIssue({
          row,
          code: "LINE_RESOLUTION_FAILED",
          message:
            resolvedLine.error ||
            "line could not be resolved for the employee on the work date",
        })
      );
      return;
    }
    preparedRows.push({
      row,
      employee,
      line: resolvedLine.line,
    });
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const planFactoryIds = Array.from(
    new Set(preparedRows.map((item) => item.line.factoryId))
  );
  const assignmentPlanLineIds = ensureArray(lines)
    .filter((line) => planFactoryIds.includes(line.factoryId))
    .map((line) => toPositiveIntOrNull(line?.id))
    .filter((value): value is number => value !== null);
  const planOrderNos = Array.from(
    new Set(
      preparedRows
        .map((item) => resolveOptionalString(item.row.orderNo, null))
        .filter((value): value is string => Boolean(value))
    )
  );
  const [rawAssignmentPlans, assignmentCards] = await Promise.all([
    assignmentPlanLineIds.length > 0 && planOrderNos.length > 0
      ? findAssignmentPlansWithSelectFallback({
          where: {
            orgId: organization.id,
            lineId: { in: assignmentPlanLineIds },
            // orderNo column dropped in Phase E - match through the
            // workOrder relation instead (workOrderId is populated for every
            // active plan by syncAssignmentPlanWorkOrderRefs).
            workOrder: { orderNumber: { in: planOrderNos } },
          },
          orderBy: [{ lineId: "asc" }, { id: "asc" }],
          selectAttempts: [
            ASSIGNMENT_PLAN_SELECT_WITH_CLOSE,
            ASSIGNMENT_PLAN_SELECT_CORE,
            ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY,
            ASSIGNMENT_PLAN_SELECT_LEGACY,
          ],
          context: "work-logs:import",
        })
      : Promise.resolve([]),
    planOrderNos.length > 0
      ? prisma.assignmentCard.findMany({
          where: {
            orgId: organization.id,
            workOrder: { orderNumber: { in: planOrderNos } },
          },
          select: {
            id: true,
            styleId: true,
            workOrder: { select: { orderNumber: true } },
            style: { select: { id: true, code: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  let assignmentPlans = rawAssignmentPlans;
  assignmentPlans = await attachLiveStyleProcessMirrorsToAssignmentPlans({
    orgId: organization.id,
    plans: assignmentPlans,
  });
  const assignmentCardsByOrderKey = ensureArray(assignmentCards).reduce(
    (map, card) => {
      const orderKey = normalizeComparableText(card?.workOrder?.orderNumber);
      if (!orderKey) return map;
      const bucket = map.get(orderKey) || [];
      bucket.push(card);
      map.set(orderKey, bucket);
      return map;
    },
    new Map<string, any[]>()
  );
  const assignmentCardsByOrderStyleKey = ensureArray(assignmentCards).reduce(
    (map, card) => {
      const orderKey = normalizeComparableText(card?.workOrder?.orderNumber);
      if (!orderKey) return map;
      resolveAssignmentPlanStyleQueryValues(card).forEach((value) => {
        const styleKey = normalizeComparableText(value);
        if (!styleKey) return;
        const key = buildWorkLogImportOrderStyleKey(orderKey, styleKey);
        const bucket = map.get(key) || [];
        bucket.push(card);
        map.set(key, bucket);
      });
      return map;
    },
    new Map<string, any[]>()
  );

  const matchedRows: Array<{
    row: (typeof importedRows)[number];
    employee: any;
    line: { id: number; factoryId: number; name: string; source: string };
    plan: any;
    process: any;
    matchedOnOtherLine: boolean;
  }> = [];

  preparedRows.forEach((item) => {
    const assignmentMatch = resolveWorkLogImportAssignmentCandidate({
      row: item.row,
      lineId: item.line.id,
      factoryLineIds: ensureArray(lines)
        .filter((line) => line.factoryId === item.line.factoryId)
        .map((line) => line.id),
      plans: assignmentPlans,
      assignmentCardsByOrderKey,
      assignmentCardsByOrderStyleKey,
    });
    if (assignmentMatch.error || !assignmentMatch.plan || !assignmentMatch.process) {
      issues.push(
        buildWorkLogImportIssue({
          row: item.row,
          code: "ASSIGNMENT_MATCH_FAILED",
          message:
            assignmentMatch.error ||
            "assignment plan could not be matched from order/style/process.",
        })
      );
      return;
    }
    matchedRows.push({
      ...item,
      plan: assignmentMatch.plan,
      process: assignmentMatch.process,
      matchedOnOtherLine: Boolean((assignmentMatch as any).matchedOnOtherLine),
    });
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const factoryIds = Array.from(new Set(matchedRows.map((item) => item.line.factoryId)));
  const factories =
    factoryIds.length > 0
      ? await prisma.factory.findMany({
          where: { orgId: organization.id, id: { in: factoryIds } },
          select: {
            id: true,
            name: true,
            wagePerSecond: true,
            managementStartDate: true,
          },
        })
      : [];
  const factoryById = ensureArray(factories).reduce((map, factory) => {
    const factoryId = toPositiveIntOrNull(factory?.id);
    if (!factoryId || map.has(factoryId)) return map;
    map.set(factoryId, factory);
    return map;
  }, new Map<number, any>());

  const groups = new Map<
    string,
    {
      line: any;
      factory: any;
      rows: Array<(typeof importedRows)[number]>;
      records: any[];
      normalized?: any;
    }
  >();

  matchedRows.forEach((item) => {
    const line = lineById.get(item.line.id) ?? item.line;
    const factory = factoryById.get(item.line.factoryId) ?? null;
    if (!factory) {
      issues.push(
        buildWorkLogImportIssue({
          row: item.row,
          code: "FACTORY_NOT_FOUND",
          message: "Factory for the resolved line was not found.",
        })
      );
      return;
    }
    const groupKey = [
      item.line.factoryId,
      item.line.id,
      item.row.coverageStartDate,
      item.row.coverageEndDate,
    ].join("::");
    const currentGroup = groups.get(groupKey) || {
      line,
      factory,
      rows: [],
      records: [],
    };
    currentGroup.rows.push(item.row);
    currentGroup.records.push({
      workerId: item.employee.id,
      lineId: item.line.id,
      styleCode: resolveOptionalString(item.row.styleId, null),
      styleProcessId: toPositiveIntOrNull(item.process?.styleProcessId),
      processCode: resolveOptionalString(
        item.process?.processCode ?? item.row.processCode,
        null
      ),
      processName: resolveOptionalString(item.process?.processName, null),
      ctSeconds: Math.max(
        0,
        Math.round(Number(item.process?.ctSeconds ?? 0) || 0)
      ),
      quantity: Math.max(0, Math.round(Number(item.row.quantity ?? 0) || 0)),
      assignmentPlanId: toPositiveIntOrNull(item.plan?.id),
    });
    groups.set(groupKey, currentGroup);
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const validatedGroups: Array<{
    line: any;
    sourceRows: Array<(typeof importedRows)[number]>;
    normalized: any;
    crossLineWarnings: WorkLogCrossLineAssignmentWarning[];
  }> = [];

  for (const group of groups.values()) {
    const payload = {
      workDate: group.rows[0]?.coverageEndDate ?? null,
      coverageStartDate: group.rows[0]?.coverageStartDate ?? null,
      coverageEndDate: group.rows[0]?.coverageEndDate ?? null,
      factoryId: group.factory?.id ?? null,
      factoryName: resolveOptionalString(group.factory?.name, null),
      lineId: group.line?.id ?? null,
      lineName: resolveOptionalString(group.line?.name, null),
      factoryWagePerSecond: toOptionalFiniteNumber(group.factory?.wagePerSecond, null),
      ctBasis: "CT",
      workerCount: new Set(
        group.records
          .map((record) => toPositiveIntOrNull(record?.workerId))
          .filter((value): value is number => value !== null)
      ).size,
      itemCount: group.records.length,
      totalCtSeconds: group.records.reduce(
        (sum, record) =>
          sum +
          Math.max(0, Math.round(Number(record?.ctSeconds ?? 0) || 0)) *
            Math.max(0, Math.round(Number(record?.quantity ?? 0) || 0)),
        0
      ),
      note: null,
      records: group.records,
    };
    const normalized = normalizeWorkLogPayload(payload);
    const groupAnchorRow = group.rows[0] ?? {
      rowNumber: 0,
      sheetName: null,
    };
    const operationStartError = validateWorkLogOperationStartDateRange({
      coverageStartDate: normalized.coverageStartDate,
      coverageEndDate: normalized.coverageEndDate,
      operationStartDateKey: resolveFactoryManagementStartDateKey(group.factory),
    });
    if (operationStartError) {
      issues.push(
        buildWorkLogImportIssue({
          row: groupAnchorRow,
          code: "DATE_BEFORE_OPERATION_START",
          message: operationStartError,
        })
      );
      continue;
    }

    if (normalized.invalidWorkerRecordIndex >= 0) {
      const sourceRow =
        group.rows[normalized.invalidWorkerRecordIndex] ?? groupAnchorRow;
      issues.push(
        buildWorkLogImportIssue({
          row: sourceRow,
          code: "INVALID_WORKER",
          message: "Worker could not be resolved for this row.",
        })
      );
      continue;
    }

    const workerIds = collectWorkRecordWorkerIds(normalized.records);
    const workerFilterDateKey =
      normalizeDateKey(normalized.coverageStartDate) || normalized.displayDate;
    const employmentValidation = await validateWorkLogWorkerEmploymentWindow({
      orgId: organization.id,
      coverageStartDate: normalized.coverageStartDate,
      coverageEndDate: normalized.coverageEndDate,
      workerIds,
    });
    if (employmentValidation.error) {
      issues.push(
        buildWorkLogImportIssue({
          row: groupAnchorRow,
          code: "EMPLOYMENT_VALIDATION_FAILED",
          message: employmentValidation.error,
        })
      );
      continue;
    }
    if (employmentValidation.invalidWorkerIds.length > 0) {
      const invalidWorkerIdSet = new Set(employmentValidation.invalidWorkerIds);
      group.records.forEach((record, index) => {
        const workerId = toPositiveIntOrNull(record?.workerId);
        if (!workerId || !invalidWorkerIdSet.has(workerId)) return;
        issues.push(
          buildWorkLogImportIssue({
            row: group.rows[index] ?? groupAnchorRow,
            code: "EMPLOYMENT_MISMATCH",
            message: "Worker employment dates do not cover the imported period.",
          })
        );
      });
      continue;
    }

    normalized.records = normalized.records.map((record: any) => {
      const workerId = toPositiveIntOrNull(record?.workerId);
      const effectiveCoverage = workerId
        ? employmentValidation.coverageByWorkerId.get(workerId)
        : null;
      return {
        ...record,
        effectiveCoverageStartDate:
          effectiveCoverage?.effectiveStartDate ?? normalized.coverageStartDate,
        effectiveCoverageEndDate:
          effectiveCoverage?.effectiveEndDate ?? normalized.coverageEndDate,
      };
    });
    const lineValidation = await validateWorkLogLineWorkers({
      orgId: organization.id,
      lineId: normalized.lineId,
      factoryId: normalized.factoryId,
      workDate: workerFilterDateKey,
      coverageEndDate: normalized.coverageEndDate,
      workerIds,
    });
    if (lineValidation.error) {
      issues.push(
        buildWorkLogImportIssue({
          row: groupAnchorRow,
          code: "LINE_VALIDATION_FAILED",
          message: lineValidation.error,
        })
      );
      continue;
    }
    if (lineValidation.missingWorkerIds.length > 0) {
      const missingWorkerIdSet = new Set(lineValidation.missingWorkerIds);
      group.records.forEach((record, index) => {
        const workerId = toPositiveIntOrNull(record?.workerId);
        if (!workerId || !missingWorkerIdSet.has(workerId)) return;
        issues.push(
          buildWorkLogImportIssue({
            row: group.rows[index] ?? groupAnchorRow,
            code: "LINE_WORKER_MISMATCH",
            message: "Worker is not assigned to the resolved line for the imported period.",
          })
        );
      });
      continue;
    }

    // attachCanonicalFieldsToWorkRecords must run before syncWorkRecordRefs: it is what
    // resolves styleId/styleProcessId (e.g. from the matched AssignmentPlan CT snapshot
    // process for a freshly-imported row) in the first place. syncWorkRecordRefs only
    // trusts an already-resolved styleProcessId to re-derive processCode/processName from
    // StyleProcess and does not fall back to the caller-supplied processCode, so running it
    // first (the previous order) always wiped processCode back to null for import rows.
    normalized.records = await attachCanonicalFieldsToWorkRecords({
      orgId: organization.id,
      lineId: lineValidation.line?.id ?? normalized.lineId,
      records: normalized.records,
    });

    const missingAssignmentPlanLinkIndices =
      collectMissingWorkRecordAssignmentPlanLinkIndices(normalized.records);
    if (missingAssignmentPlanLinkIndices.length > 0) {
      missingAssignmentPlanLinkIndices.forEach((index) => {
        issues.push(
          buildWorkLogImportIssue({
            row: group.rows[index] ?? groupAnchorRow,
            code: "MISSING_ASSIGNMENT_PLAN",
            message: "Assignment plan link is required for every imported row.",
          })
        );
      });
      continue;
    }

    const duplicateValidation = await validateWorkLogWorkerStyleProcessDuplicates({
      orgId: organization.id,
      workDate: normalized.displayDate,
      records: normalized.records,
    });
    if (duplicateValidation.error) {
      const duplicateError = duplicateValidation.error;
      const duplicateIssueRecords = [
        ...ensureArray(duplicateValidation.incomingDuplicateRows),
        ...ensureArray(duplicateValidation.conflictRows),
      ];
      if (duplicateIssueRecords.length > 0) {
        const emittedDuplicateIssueRowKeys = new Set<string>();
        duplicateIssueRecords.forEach((record: any) => {
          const recordIndex = normalized.records.indexOf(record);
          const sourceRow = group.rows[recordIndex] ?? groupAnchorRow;
          const rowKey = `${sourceRow?.sheetName ?? ""}:${sourceRow?.rowNumber ?? ""}`;
          if (emittedDuplicateIssueRowKeys.has(rowKey)) return;
          emittedDuplicateIssueRowKeys.add(rowKey);
          issues.push(
            buildWorkLogImportIssue({
              row: sourceRow,
              code: "DUPLICATE_WORK_RECORD",
              message: duplicateError,
            })
          );
        });
      } else {
        issues.push(
          buildWorkLogImportIssue({
            row: groupAnchorRow,
            code: "DUPLICATE_WORK_RECORD",
            message: duplicateError,
          })
        );
      }
      continue;
    }

    const allowCompletedAssignmentPlanIds =
      normalized.coverageEndDate < todayDateKey()
        ? collectWorkRecordAssignmentPlanIds(normalized.records)
        : [];
    const ctSnapshotValidation = await validateWorkLogAssignmentPlanCtSnapshot({
      orgId: organization.id,
      lineId: lineValidation.line?.id ?? normalized.lineId,
      records: normalized.records,
      allowCompletedAssignmentPlanIds,
    });
    if (ctSnapshotValidation.error) {
      issues.push(
        buildWorkLogImportIssue({
          row: groupAnchorRow,
          code: "CT_SNAPSHOT_VALIDATION_FAILED",
          message: ctSnapshotValidation.error,
        })
      );
      continue;
    }

    const payrollLockValidation = await validateAssignmentPlanPayrollLock({
      orgId: organization.id,
      assignmentPlanIds: collectWorkRecordAssignmentPlanIds(normalized.records),
    });
    if (payrollLockValidation.error) {
      issues.push(
        buildWorkLogImportIssue({
          row: groupAnchorRow,
          code: "PAYROLL_LOCKED",
          message: payrollLockValidation.error,
        })
      );
      continue;
    }

    const crossLineWarnings = await collectWorkLogCrossLineAssignmentWarnings({
      orgId: organization.id,
      workLogLineId: lineValidation.line?.id ?? normalized.lineId,
      workLogLineName:
        resolveOptionalString(lineValidation.line?.name, null) ??
        resolveOptionalString(group.line?.name, null),
      records: normalized.records,
    });
    normalized.note = buildWorkLogNoteWithCrossLineAssignments({
      note: normalized.note,
      workLogLineId: lineValidation.line?.id ?? normalized.lineId,
      workLogLineName:
        resolveOptionalString(lineValidation.line?.name, null) ??
        resolveOptionalString(group.line?.name, null),
      warnings: crossLineWarnings,
    });
    normalized.note = buildWorkLogNoteWithEmploymentAdjustments({
      note: normalized.note,
      adjustments: employmentValidation.adjustments,
    });
    normalized.records = await syncWorkRecordRefs({
      orgId: organization.id,
      records: normalized.records,
    });
    const missingCanonicalRefIssues = collectMissingWorkRecordCanonicalRefIssues(
      normalized.records
    );
    if (missingCanonicalRefIssues.length > 0) {
      missingCanonicalRefIssues.forEach((issue) => {
        issues.push(
          buildWorkLogImportIssue({
            row: group.rows[issue.index] ?? groupAnchorRow,
            code: "MISSING_CANONICAL_WORK_RECORD_REF",
            message: `records[${issue.index}].${issue.field} is required`,
          })
        );
      });
      continue;
    }

    validatedGroups.push({
      line: lineValidation.line ?? group.line,
      sourceRows: group.rows,
      normalized,
      crossLineWarnings,
    });
  }

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const seenImportSignatureByDisplayDate = new Map<
    string,
    { row: { rowNumber?: number | null; sheetName?: string | null } }
  >();
  validatedGroups.forEach((group) => {
    group.normalized.records.forEach((record: any, index: number) => {
      const signature = buildWorkRecordWorkerStyleProcessSignature(record);
      if (!signature) return;
      const displayDate = normalizeDateKey(group.normalized.displayDate) || "";
      const compositeKey = `${displayDate}::${signature}`;
      const sourceRow =
        group.sourceRows[index] ?? group.sourceRows[0] ?? { rowNumber: 0, sheetName: null };
      const previous = seenImportSignatureByDisplayDate.get(compositeKey);
      if (!previous) {
        seenImportSignatureByDisplayDate.set(compositeKey, { row: sourceRow });
        return;
      }
      issues.push(
        buildWorkLogImportIssue({
          row: sourceRow,
          code: "DUPLICATE_IMPORT_RECORD",
          message: `duplicate worker/assignment/process on ${displayDate} also appears in ${formatWorkLogImportIssueLocation(
            previous.row
          )}.`,
        })
      );
    });
  });

  if (issues.length > 0) {
    return respondWithIssues();
  }

  const updatedBy = await resolveWorkLogUpdatedBy(organization.id, req);
  const createImportTransaction = async (includeCoverage: boolean) =>
    prisma.$transaction(
      async (tx) => {
        const createdWorkLogIds: number[] = [];
        for (const group of validatedGroups) {
          const {
            records,
            invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
            lineId: _lineId,
            lineName: _lineName,
            ...workLogData
          } = group.normalized;
          const createData = {
            orgId: organization.id,
            ...buildWorkLogWriteDataWithOptionalCoverage(workLogData, {
              includeCoverage,
            }),
            updatedBy,
            records: {
              lineId: group.line?.id ?? null,
              lineName: group.line?.name ?? null,
            },
          } as unknown as Prisma.WorkLogUncheckedCreateInput;
          const next = await tx.workLog.create({
            data: createData,
            select: { id: true },
          });
          if (records.length > 0) {
            await tx.workRecord.createMany({
              data: records.map((record: any) =>
                buildCanonicalWorkRecordWriteData({
                  orgId: organization.id,
                  workLogId: next.id,
                  record,
                  defaultLineId: group.line?.id ?? null,
                  defaultCoverageStartDate: group.normalized.coverageStartDate,
                  defaultCoverageEndDate: group.normalized.coverageEndDate,
                })
              ),
            });
          }
          createdWorkLogIds.push(next.id);
        }
        return createdWorkLogIds;
      },
      { timeout: 30000 }
    );

  let createdWorkLogIds: number[] = [];
  try {
    createdWorkLogIds = await createImportTransaction(true);
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    console.warn(
      `[work-logs:import] orgId=${organization.id} missing work-log coverage columns; retrying import without coverage fields`
    );
    createdWorkLogIds = await createImportTransaction(false);
  }

  const importedRecords = validatedGroups.flatMap((group) => ensureArray(group.normalized.records));
  const importCrossLineWarnings = validatedGroups.flatMap((group) =>
    ensureArray(group.crossLineWarnings)
  );
  await trySyncConfirmedOrdersToInProgressFromWorkRecords({
    orgId: organization.id,
    records: importedRecords,
    mode: "create",
  });
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(importedRecords),
    mode: "create",
  });

  res.status(201).json({
    ok: true,
    createdCount: createdWorkLogIds.length,
    recordCount: importedRecords.length,
    workLogIds: createdWorkLogIds,
    warnings: buildWorkLogWarningResponse({
      crossLineWarnings: importCrossLineWarnings,
    }),
  });
});

app.post("/work-logs", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const trace = createWorkLogMutationTrace({
    req,
    mode: "create",
    payload: req.body ?? {},
  });
  const normalized = normalizeWorkLogPayload(req.body ?? {});
  updateWorkLogMutationTrace(trace, "normalized", summarizeWorkLogPayloadForDebug(normalized));
  if (normalized.invalidWorkerRecordIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${normalized.invalidWorkerRecordIndex}].workerId is required`
      ),
    });
  }
  let validatedFactory: any = null;
  if (normalized.factoryId !== null) {
    validatedFactory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!validatedFactory) {
      return res
        .status(404)
        .json({ ok: false, error: translateWorkLogErrorMessage("factory not found") });
    }
  }
  const operationStartError = validateWorkLogOperationStartDateRange({
    coverageStartDate: normalized.coverageStartDate,
    coverageEndDate: normalized.coverageEndDate,
    operationStartDateKey: resolveFactoryManagementStartDateKey(validatedFactory),
  });
  if (operationStartError) {
    return res.status(400).json({
      ok: false,
      error: operationStartError,
    });
  }
  updateWorkLogMutationTrace(trace, "factory-validated", {
    factoryId: normalized.factoryId,
  });
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const workerFilterDateKey = normalizeDateKey(normalized.coverageStartDate) || normalized.displayDate;
  const employmentValidation = await validateWorkLogWorkerEmploymentWindow({
    orgId: organization.id,
    coverageStartDate: normalized.coverageStartDate,
    coverageEndDate: normalized.coverageEndDate,
    workerIds,
  });
  if (employmentValidation.error) {
    return res
      .status(employmentValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(employmentValidation.error) });
  }
  if (employmentValidation.invalidWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `worker employment mismatch for workDate (${employmentValidation.invalidWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "employment-validated", {
    workerIds,
    workerFilterDateKey,
    adjustmentCount: employmentValidation.adjustments.length,
  });
  normalized.records = normalized.records.map((record: any) => {
    const workerId = toPositiveIntOrNull(record?.workerId);
    const effectiveCoverage = workerId
      ? employmentValidation.coverageByWorkerId.get(workerId)
      : null;
    return {
      ...record,
      effectiveCoverageStartDate:
        effectiveCoverage?.effectiveStartDate ?? normalized.coverageStartDate,
      effectiveCoverageEndDate:
        effectiveCoverage?.effectiveEndDate ?? normalized.coverageEndDate,
    };
  });
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
    coverageEndDate: normalized.coverageEndDate,
    workerIds,
  });
  if (lineValidation.error) {
    return res
      .status(lineValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(lineValidation.error) });
  }
  if (lineValidation.missingWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `line worker mismatch for workDate (${lineValidation.missingWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "line-validated", {
    lineId: lineValidation.line?.id ?? normalized.lineId ?? null,
    lineName: lineValidation.line?.name ?? null,
  });
  // attachCanonicalFieldsToWorkRecords must run before syncWorkRecordRefs: it is what
  // resolves styleId/styleProcessId in the first place, and syncWorkRecordRefs only
  // trusts an already-resolved styleProcessId (no fallback to caller-supplied processCode).
  normalized.records = await attachCanonicalFieldsToWorkRecords({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  const missingAssignmentPlanLinkIndices = collectMissingWorkRecordAssignmentPlanLinkIndices(
    normalized.records
  );
  if (missingAssignmentPlanLinkIndices.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${missingAssignmentPlanLinkIndices[0]}].assignmentPlanId is required`
      ),
    });
  }
  const duplicateValidation = await validateWorkLogWorkerStyleProcessDuplicates({
    orgId: organization.id,
    workDate: normalized.displayDate,
    records: normalized.records,
  });
  if (duplicateValidation.error) {
    return res
      .status(duplicateValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(duplicateValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "duplicates-validated");
  const ctSnapshotValidation = await validateWorkLogAssignmentPlanCtSnapshot({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
    allowCompletedAssignmentPlanIds: [],
  });
  if (ctSnapshotValidation.error) {
    return res
      .status(ctSnapshotValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctSnapshotValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "ct-snapshot-validated");
  const payrollLockValidation = await validateAssignmentPlanPayrollLock({
    orgId: organization.id,
    assignmentPlanIds: collectWorkRecordAssignmentPlanIds(normalized.records),
  });
  if (payrollLockValidation.error) {
    return res.status(payrollLockValidation.status).json({
      ok: false,
      error: translateWorkLogErrorMessage(payrollLockValidation.error),
    });
  }
  updateWorkLogMutationTrace(trace, "payroll-lock-validated");
  const crossLineWarnings = await collectWorkLogCrossLineAssignmentWarnings({
    orgId: organization.id,
    workLogLineId: lineValidation.line?.id ?? normalized.lineId,
    workLogLineName:
      resolveOptionalString(lineValidation.line?.name, null) ??
      resolveOptionalString(normalized.lineName, null),
    records: normalized.records,
  });
  normalized.note = buildWorkLogNoteWithCrossLineAssignments({
    note: normalized.note,
    workLogLineId: lineValidation.line?.id ?? normalized.lineId,
    workLogLineName:
      resolveOptionalString(lineValidation.line?.name, null) ??
      resolveOptionalString(normalized.lineName, null),
    warnings: crossLineWarnings,
  });
  normalized.note = buildWorkLogNoteWithEmploymentAdjustments({
    note: normalized.note,
    adjustments: employmentValidation.adjustments,
  });
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "refs-synced", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  const missingCanonicalRefIssues = collectMissingWorkRecordCanonicalRefIssues(
    normalized.records
  );
  if (missingCanonicalRefIssues.length > 0) {
    const issue = missingCanonicalRefIssues[0]!;
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${issue.index}].${issue.field} is required`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "canonical-fields-attached", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  logWorkLogRecordTrace(
    `[work-logs:create] req=${trace.requestId} step=canonical-fields-attached`,
    normalized.records
  );
  const updatedBy = await resolveWorkLogUpdatedBy(organization.id, req);
  updateWorkLogMutationTrace(trace, "updated-by-resolved", {
    updatedBy,
  });

  const {
    records,
    invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
    lineId: _lineId,
    lineName: _lineName,
    ...workLogData
  } = normalized;
  const createWorkLogTransaction = async (includeCoverage: boolean) =>
    prisma.$transaction(async (tx) => {
      const next = await tx.workLog.create({
        data: {
          orgId: organization.id,
          ...buildWorkLogWriteDataWithOptionalCoverage(workLogData, { includeCoverage }),
          updatedBy,
          records: {
            lineId: lineValidation.line?.id ?? null,
            lineName: lineValidation.line?.name ?? null,
          },
        },
        select: { id: true },
      });

      if (records.length > 0) {
        await tx.workRecord.createMany({
          data: records.map((record: any) =>
            buildCanonicalWorkRecordWriteData({
              orgId: organization.id,
              workLogId: next.id,
              record,
              defaultLineId: lineValidation.line?.id ?? normalized.lineId ?? null,
              defaultCoverageStartDate: normalized.coverageStartDate,
              defaultCoverageEndDate: normalized.coverageEndDate,
            })
          ),
        });
      }

      return next;
    }, { timeout: 30000 });
  let created: any;
  try {
    created = await createWorkLogTransaction(true);
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    console.warn(
      `[work-logs:create] orgId=${organization.id} missing work-log coverage columns; retrying create without coverage fields`
    );
    created = await createWorkLogTransaction(false);
  }
  trace.workLogId = created.id;
  updateWorkLogMutationTrace(trace, "transaction-committed", {
    workLogId: created.id,
  });
  const createdWithRecords = await fetchWorkLogByIdWithRecordsSafe({
    orgId: organization.id,
    workLogId: created.id,
    recordSelect: WORK_RECORD_WITH_REFS_INCLUDE,
    warnLabel: "work-logs:create:readback",
  });
  updateWorkLogMutationTrace(trace, "readback-loaded", {
    workLogId: created.id,
    hasReadback: Boolean(createdWithRecords),
  });
  await trySyncConfirmedOrdersToInProgressFromWorkRecords({
    orgId: organization.id,
    records: normalized.records,
    mode: "create",
  });
  updateWorkLogMutationTrace(trace, "order-sync-finished");
  const createdPlanIds = collectWorkRecordAssignmentPlanIds(normalized.records);
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: createdPlanIds,
    mode: "create",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: createdPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: created.id,
  });
  res.status(201).json({
    ...(await toWorkLogResponse(createdWithRecords ?? created, {
      orgId: organization.id,
    })),
    warnings: buildWorkLogWarningResponse({
      crossLineWarnings,
    }),
  });
});

app.put("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res
      .status(404)
      .json({ ok: false, error: translateWorkLogErrorMessage("organization not found") });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res
      .status(400)
      .json({ ok: false, error: translateWorkLogErrorMessage("invalid id") });
  }

  const trace = createWorkLogMutationTrace({
    req,
    mode: "update",
    payload: req.body ?? {},
    workLogId: id,
  });
  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    select: {
      id: true,
      displayDate: true,
      workRecords: {
        select: {
          assignmentPlanId: true,
        },
      },
    },
  });
  if (!existing) {
    return res
      .status(404)
      .json({ ok: false, error: translateWorkLogErrorMessage("work log not found") });
  }
  const normalized = normalizeWorkLogPayload(req.body ?? {}, existing);
  updateWorkLogMutationTrace(trace, "normalized", summarizeWorkLogPayloadForDebug(normalized));
  if (normalized.invalidWorkerRecordIndex >= 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${normalized.invalidWorkerRecordIndex}].workerId is required`
      ),
    });
  }
  let validatedFactory: any = null;
  if (normalized.factoryId !== null) {
    validatedFactory = await prisma.factory.findFirst({
      where: { id: normalized.factoryId, orgId: organization.id },
    });
    if (!validatedFactory) {
      return res
        .status(404)
        .json({ ok: false, error: translateWorkLogErrorMessage("factory not found") });
    }
  }
  const operationStartError = validateWorkLogOperationStartDateRange({
    coverageStartDate: normalized.coverageStartDate,
    coverageEndDate: normalized.coverageEndDate,
    operationStartDateKey: resolveFactoryManagementStartDateKey(validatedFactory),
  });
  if (operationStartError) {
    return res.status(400).json({
      ok: false,
      error: operationStartError,
    });
  }
  updateWorkLogMutationTrace(trace, "factory-validated", {
    factoryId: normalized.factoryId,
  });
  const workerIds = collectWorkRecordWorkerIds(normalized.records);
  const workerFilterDateKey = normalizeDateKey(normalized.coverageStartDate) || normalized.displayDate;
  const employmentValidation = await validateWorkLogWorkerEmploymentWindow({
    orgId: organization.id,
    coverageStartDate: normalized.coverageStartDate,
    coverageEndDate: normalized.coverageEndDate,
    workerIds,
  });
  if (employmentValidation.error) {
    return res
      .status(employmentValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(employmentValidation.error) });
  }
  if (employmentValidation.invalidWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `worker employment mismatch for workDate (${employmentValidation.invalidWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "employment-validated", {
    workerIds,
    workerFilterDateKey,
    adjustmentCount: employmentValidation.adjustments.length,
  });
  normalized.records = normalized.records.map((record: any) => {
    const workerId = toPositiveIntOrNull(record?.workerId);
    const effectiveCoverage = workerId
      ? employmentValidation.coverageByWorkerId.get(workerId)
      : null;
    return {
      ...record,
      effectiveCoverageStartDate:
        effectiveCoverage?.effectiveStartDate ?? normalized.coverageStartDate,
      effectiveCoverageEndDate:
        effectiveCoverage?.effectiveEndDate ?? normalized.coverageEndDate,
    };
  });
  const lineValidation = await validateWorkLogLineWorkers({
    orgId: organization.id,
    lineId: normalized.lineId,
    factoryId: normalized.factoryId,
    workDate: workerFilterDateKey,
    coverageEndDate: normalized.coverageEndDate,
    workerIds,
  });
  if (lineValidation.error) {
    return res
      .status(lineValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(lineValidation.error) });
  }
  if (lineValidation.missingWorkerIds.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `line worker mismatch for workDate (${lineValidation.missingWorkerIds.join(",")})`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "line-validated", {
    lineId: lineValidation.line?.id ?? normalized.lineId ?? null,
    lineName: lineValidation.line?.name ?? null,
  });
  // attachCanonicalFieldsToWorkRecords must run before syncWorkRecordRefs: it is what
  // resolves styleId/styleProcessId in the first place, and syncWorkRecordRefs only
  // trusts an already-resolved styleProcessId (no fallback to caller-supplied processCode).
  normalized.records = await attachCanonicalFieldsToWorkRecords({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
  });
  const missingAssignmentPlanLinkIndices = collectMissingWorkRecordAssignmentPlanLinkIndices(
    normalized.records
  );
  if (missingAssignmentPlanLinkIndices.length > 0) {
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${missingAssignmentPlanLinkIndices[0]}].assignmentPlanId is required`
      ),
    });
  }
  const duplicateValidation = await validateWorkLogWorkerStyleProcessDuplicates({
    orgId: organization.id,
    workDate: normalized.displayDate,
    records: normalized.records,
    excludedWorkLogId: existing.id,
  });
  if (duplicateValidation.error) {
    return res
      .status(duplicateValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(duplicateValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "duplicates-validated");
  const previousPlanIds = normalizePlanIdList(
    ensureArray(existing?.workRecords).map((row) => row?.assignmentPlanId)
  );
  const ctSnapshotValidation = await validateWorkLogAssignmentPlanCtSnapshot({
    orgId: organization.id,
    lineId: lineValidation.line?.id ?? normalized.lineId,
    records: normalized.records,
    allowCompletedAssignmentPlanIds: previousPlanIds,
  });
  if (ctSnapshotValidation.error) {
    return res
      .status(ctSnapshotValidation.status)
      .json({ ok: false, error: translateWorkLogErrorMessage(ctSnapshotValidation.error) });
  }
  updateWorkLogMutationTrace(trace, "ct-snapshot-validated");
  const nextPlanIds = collectWorkRecordAssignmentPlanIds(normalized.records);
  const payrollLockValidation = await validateAssignmentPlanPayrollLock({
    orgId: organization.id,
    assignmentPlanIds: [...previousPlanIds, ...nextPlanIds],
  });
  if (payrollLockValidation.error) {
    return res.status(payrollLockValidation.status).json({
      ok: false,
      error: translateWorkLogErrorMessage(payrollLockValidation.error),
    });
  }
  updateWorkLogMutationTrace(trace, "payroll-lock-validated", {
    assignmentPlanIds: normalizePlanIdList([...previousPlanIds, ...nextPlanIds]),
  });
  const crossLineWarnings = await collectWorkLogCrossLineAssignmentWarnings({
    orgId: organization.id,
    workLogLineId: lineValidation.line?.id ?? normalized.lineId,
    workLogLineName:
      resolveOptionalString(lineValidation.line?.name, null) ??
      resolveOptionalString(normalized.lineName, null),
    records: normalized.records,
  });
  normalized.note = buildWorkLogNoteWithCrossLineAssignments({
    note: normalized.note,
    workLogLineId: lineValidation.line?.id ?? normalized.lineId,
    workLogLineName:
      resolveOptionalString(lineValidation.line?.name, null) ??
      resolveOptionalString(normalized.lineName, null),
    warnings: crossLineWarnings,
  });
  normalized.note = buildWorkLogNoteWithEmploymentAdjustments({
    note: normalized.note,
    adjustments: employmentValidation.adjustments,
  });
  normalized.records = await syncWorkRecordRefs({
    orgId: organization.id,
    records: normalized.records,
  });
  updateWorkLogMutationTrace(trace, "refs-synced", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  const missingCanonicalRefIssues = collectMissingWorkRecordCanonicalRefIssues(
    normalized.records
  );
  if (missingCanonicalRefIssues.length > 0) {
    const issue = missingCanonicalRefIssues[0]!;
    return res.status(400).json({
      ok: false,
      error: translateWorkLogErrorMessage(
        `records[${issue.index}].${issue.field} is required`
      ),
    });
  }
  updateWorkLogMutationTrace(trace, "canonical-fields-attached", {
    payload: summarizeWorkLogPayloadForDebug(normalized),
  });
  logWorkLogRecordTrace(
    `[work-logs:update] req=${trace.requestId} step=canonical-fields-attached`,
    normalized.records
  );
  const updatedBy = await resolveWorkLogUpdatedBy(organization.id, req);
  updateWorkLogMutationTrace(trace, "updated-by-resolved", {
    updatedBy,
  });

  const {
    records,
    invalidWorkerRecordIndex: _invalidWorkerRecordIndex,
    lineId: _lineId,
    lineName: _lineName,
    ...workLogData
  } = normalized;
  const updateWorkLogTransaction = async (includeCoverage: boolean) =>
    prisma.$transaction(async (tx) => {
      const next = await tx.workLog.update({
        where: { id: existing.id },
        data: {
          ...buildWorkLogWriteDataWithOptionalCoverage(workLogData, { includeCoverage }),
          updatedBy,
          records: {
            lineId: lineValidation.line?.id ?? null,
            lineName: lineValidation.line?.name ?? null,
          },
        },
        select: { id: true },
      });

      await tx.workRecord.deleteMany({
        where: { orgId: organization.id, workLogId: existing.id },
      });

      if (records.length > 0) {
        await tx.workRecord.createMany({
          data: records.map((record: any) =>
            buildCanonicalWorkRecordWriteData({
              orgId: organization.id,
              workLogId: existing.id,
              record,
              defaultLineId: lineValidation.line?.id ?? normalized.lineId ?? null,
              defaultCoverageStartDate: normalized.coverageStartDate,
              defaultCoverageEndDate: normalized.coverageEndDate,
            })
          ),
        });
      }

      return next;
    }, { timeout: 30000 });
  let updated: any;
  try {
    updated = await updateWorkLogTransaction(true);
  } catch (error) {
    if (!isWorkLogCoverageMissingColumnError(error)) throw error;
    console.warn(
      `[work-logs:update] orgId=${organization.id} workLogId=${existing.id} missing work-log coverage columns; retrying update without coverage fields`
    );
    updated = await updateWorkLogTransaction(false);
  }
  trace.workLogId = updated.id;
  updateWorkLogMutationTrace(trace, "transaction-committed", {
    workLogId: updated.id,
  });
  const updatedWithRecords = await fetchWorkLogByIdWithRecordsSafe({
    orgId: organization.id,
    workLogId: updated.id,
    recordSelect: WORK_RECORD_WITH_REFS_INCLUDE,
    warnLabel: "work-logs:update:readback",
  });
  updateWorkLogMutationTrace(trace, "readback-loaded", {
    workLogId: updated.id,
    hasReadback: Boolean(updatedWithRecords),
  });
  await trySyncConfirmedOrdersToInProgressFromWorkRecords({
    orgId: organization.id,
    records: normalized.records,
    mode: "update",
  });
  updateWorkLogMutationTrace(trace, "order-sync-finished");
  const touchedPlanIds = normalizePlanIdList([...previousPlanIds, ...nextPlanIds]);
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: touchedPlanIds,
    mode: "update",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: touchedPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: updated.id,
  });
  res.json({
    ...(await toWorkLogResponse(updatedWithRecords ?? updated, {
      orgId: organization.id,
    })),
    warnings: buildWorkLogWarningResponse({
      crossLineWarnings,
    }),
  });
});

app.delete("/work-logs/:id", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const trace = createWorkLogMutationTrace({
    req,
    mode: "delete",
    payload: { workLogId: id },
    workLogId: id,
  });
  const existing = await prisma.workLog.findFirst({
    where: { id, orgId: organization.id },
    select: {
      id: true,
      displayDate: true,
      workRecords: {
        select: {
          assignmentPlanId: true,
        },
      },
    },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }
  const deletedPlanIds = normalizePlanIdList(
    ensureArray(existing?.workRecords).map((row) => row?.assignmentPlanId)
  );
  const payrollLockValidation = await validateAssignmentPlanPayrollLock({
    orgId: organization.id,
    assignmentPlanIds: deletedPlanIds,
  });
  if (payrollLockValidation.error) {
    return res.status(payrollLockValidation.status).json({
      ok: false,
      error: translateWorkLogErrorMessage(payrollLockValidation.error),
    });
  }
  updateWorkLogMutationTrace(trace, "work-log-found", {
    workLogId: existing.id,
    assignmentPlanIds: deletedPlanIds,
  });
  updateWorkLogMutationTrace(trace, "payroll-lock-validated", {
    assignmentPlanIds: deletedPlanIds,
  });
  const deleteResult = await prisma.workLog.deleteMany({
    where: { id: existing.id, orgId: organization.id },
  });
  if (deleteResult.count < 1) {
    return res.status(404).json({ ok: false, error: "work log not found" });
  }
  updateWorkLogMutationTrace(trace, "deleted", {
    workLogId: existing.id,
    deletedCount: deleteResult.count,
  });
  await trySyncAssignmentPlanSideEffectsAfterWorkLogMutation({
    orgId: organization.id,
    assignmentPlanIds: deletedPlanIds,
    mode: "delete",
  });
  updateWorkLogMutationTrace(trace, "assignment-side-effects-finished", {
    assignmentPlanIds: deletedPlanIds,
  });
  updateWorkLogMutationTrace(trace, "response-ready", {
    workLogId: existing.id,
  });
  res.status(204).send();
});

app.get("/assignment-board-view", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeCards = !(
    req.query.includeCards === "0" || req.query.includeCards === "false"
  );
  const state = await prisma.assignmentBoardState.findUnique({
    where: { orgId: organization.id },
  });
  const response = await buildReadOnlyAssignmentBoardStateResponse(
    organization.id,
    state,
    { includeCards }
  );
  res.json(response);
});

app.get("/assignment-board-versions", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const [state, assignmentPlans] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    }),
    loadAssignmentPlansForBoardState(organization.id),
  ]);

  res.json({
    assignments: normalizeStateAssignments(
      (await annotateAssignmentPlanRowsWithPayrollLocks(organization.id, assignmentPlans)).map(
        (plan) => toAssignmentPlanResponse(plan)
      )
    ),
    createdAt: state?.createdAt ?? null,
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  });
});

app.get("/assignment-cards", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const includeProcesses = isManufacturerOrg(organization) && !(
    req.query.includeProcesses === "0" || req.query.includeProcesses === "false"
  );
  const [state, cards] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { updatedAt: true },
    }),
    loadAssignmentCardsForOrg({ orgId: organization.id }),
  ]);
  const cardStyleIds = collectPositiveIntSet(...cards.map((card) => card?.styleId));
  const orderManualLockRows = await prisma.workOrder.findMany({
    where: { OR: getOrderAccessWhere(organization.id) },
    select: {
      id: true,
      modificationLockedAt: true,
    },
  });
  const manualLockByWorkOrderId = orderManualLockRows.reduce((map, row) => {
    const workOrderId = toPositiveIntOrNull(row?.id);
    if (workOrderId === null) return map;
    map.set(workOrderId, Boolean(row?.modificationLockedAt));
    return map;
  }, new Map<number, boolean>());
  const cardsWithOrderLock = cards.map((card) => {
    const workOrderId = toPositiveIntOrNull(card?.workOrderId);
    const isManualOrderLocked =
      workOrderId == null ? true : Boolean(manualLockByWorkOrderId.get(workOrderId));
    return {
      ...card,
      isManualOrderLocked,
    };
  });
  const styleSelect = {
    id: true,
    orgId: true,
    code: true,
    name: true,
    updatedAt: true,
    organization: {
      select: { id: true, name: true, nameKo: true, nameVi: true },
    },
    ...(includeProcesses ? { processes: true } : {}),
  };
  const styles =
    cardStyleIds.length > 0
      ? await prisma.style.findMany({
          where: {
            id: { in: cardStyleIds },
          },
          orderBy: { id: "asc" },
          select: styleSelect,
        })
      : [];
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(styles, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  res.json({
    cards: cardsWithOrderLock,
    styles: styles.map((style) =>
      toStyleResponse(style, {
        includeProcesses,
        processMirrorMap,
      })
    ),
    updatedAt: state?.updatedAt ?? null,
    serverNow: new Date().toISOString(),
  });
});

app.get("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  await repairAssignmentPlanFkRefsFromAssignmentCards(organization.id);
  const [state, cards] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { id: true, createdAt: true, updatedAt: true },
    }),
    loadAssignmentCardsForOrg({ orgId: organization.id }),
  ]);
  let assignmentPlans = await loadAssignmentPlansForBoardState(organization.id);
  assignmentPlans = await annotateAssignmentPlanRowsWithPayrollLocks(
    organization.id,
    assignmentPlans
  );

  res.json(toAssignmentBoardStateResponse(state, assignmentPlans, cards));
});

// 배정 취소 전용 경량 엔드포인트
// 전체 보드 상태를 전송하지 않고 해당 assignment만 제거
app.delete("/assignment-board-state/assignment/:assignmentId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const assignmentId = resolveOptionalString(req.params.assignmentId, null);
  if (!assignmentId) {
    return res.status(400).json({ ok: false, error: "assignmentId is required" });
  }
  const cardId = resolveOptionalString(req.body?.cardId, null);
  const cardPatch = (req.body?.cardPatch && typeof req.body.cardPatch === "object")
    ? req.body.cardPatch
    : null;

  let currentCards = await loadAssignmentCardsForOrg({
    orgId: organization.id,
  });
  const targetPlan = await prisma.assignmentPlan.findFirst({
    where: { orgId: organization.id, externalId: assignmentId },
    select: { id: true, externalId: true, isCompleted: true },
  });
  if (!targetPlan) {
    return res.status(404).json({ ok: false, error: "assignment not found" });
  }

  if (targetPlan.isCompleted === true) {
    return res.status(409).json({
      ok: false,
      error: "completed assignment cannot be cancelled",
    });
  }
  await assertAssignmentPlansCanBeDetached({
    planIds: [targetPlan.id],
  });

  let patchedCard: any = null;
  if (cardId && cardPatch) {
    currentCards = currentCards.map((card: any) => {
      if (String(card?.id) !== cardId) return card;
      patchedCard = { ...card, ...cardPatch };
      return patchedCard;
    });
  }

  await prisma.$transaction(async (tx) => {
    if (cardId && cardPatch) {
      await syncAssignmentCardsForOrg({
        orgId: organization.id,
        cards: currentCards,
        db: tx,
      });
    }
    await tx.assignmentBoardState.upsert({
      where: { orgId: organization.id },
      update: {
        cards: Prisma.JsonNull,
        assignments: Prisma.JsonNull,
      },
      create: {
        orgId: organization.id,
        cards: Prisma.JsonNull,
        assignments: Prisma.JsonNull,
      },
    });
    await detachWorkRecordsAndDeleteAssignmentPlans({
      planIds: [targetPlan.id],
      db: tx,
    });
  });

  // 해당 assignment의 plan 레코드 제거
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: currentCards,
  });

  res.json({
    ok: true,
    removedAssignmentId: assignmentId,
    card: patchedCard,
  });
});

app.delete("/assignment-board-state", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  const planRows = await prisma.assignmentPlan.findMany({
    where: { orgId: organization.id },
    select: { id: true },
  });
  await assertAssignmentPlansCanBeDetached({
    planIds: planRows.map((plan) => plan.id),
  });

  await prisma.$transaction(async (tx) => {
    await tx.assignmentBoardState.upsert({
      where: { orgId: organization.id },
      update: {
        assignments: Prisma.JsonNull,
        cards: Prisma.JsonNull,
      },
      create: {
        orgId: organization.id,
        assignments: Prisma.JsonNull,
        cards: Prisma.JsonNull,
      },
    });
    await tx.assignmentCard.deleteMany({ where: { orgId: organization.id } });
    const planRows = await tx.assignmentPlan.findMany({
      where: { orgId: organization.id },
      select: { id: true },
    });
    await detachWorkRecordsAndDeleteAssignmentPlans({
      planIds: planRows.map((plan) => plan.id),
      db: tx,
    });
  });
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: [],
    assignments: [],
  });

  res.json({ ok: true });
});

app.put("/assignment-board-state", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const cards = ensureArray(req.body?.cards);
  const incomingAssignments = ensureArray(req.body?.assignments);
  const stDraftsByExternalId = normalizeAssignmentStDraftsPayload(req.body?.stDrafts);
  assertFiniteAssignmentScheduleIndices(normalizeStateAssignments(incomingAssignments));
  const currentPlanRowsForDetachGuard = await loadAssignmentPlansForBoardState(
    organization.id
  );
  const currentAssignmentsByExternalIdForDetachGuard = buildAssignmentByExternalId(
    normalizeStateAssignments(
      currentPlanRowsForDetachGuard.map((plan) => toAssignmentPlanResponse(plan))
    )
  );
  const nextAssignmentsByExternalIdForDetachGuard = buildAssignmentByExternalId(
    normalizeStateAssignments(incomingAssignments)
  );
  const removedExternalIdsForDetachGuard = Array.from(
    currentAssignmentsByExternalIdForDetachGuard.keys()
  )
    .map((externalId) => String(externalId))
    .filter((externalId) => !nextAssignmentsByExternalIdForDetachGuard.has(externalId));
  if (removedExternalIdsForDetachGuard.length > 0) {
    const removedPlanRowsForDetachGuard = await prisma.assignmentPlan.findMany({
      where: {
        orgId: organization.id,
        externalId: { in: removedExternalIdsForDetachGuard },
      },
      select: { id: true },
    });
    await assertAssignmentPlansCanBeDetached({
      planIds: removedPlanRowsForDetachGuard.map((plan) => plan.id),
    });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existingState = await tx.assignmentBoardState.findUnique({
      where: { orgId: organization.id },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const currentPlanRows = await loadAssignmentPlanRowsForBoardTx(organization.id, tx);
    const currentAssignmentsNormalized = normalizeStateAssignments(
      currentPlanRows.map((plan: any) => toAssignmentPlanResponse(plan))
    );
    const currentAssignmentsByExternalId =
      buildAssignmentByExternalId(currentAssignmentsNormalized);
    let nextAssignmentsNormalized = normalizeStateAssignments(
      incomingAssignments
    );
    const savedCards = await syncAssignmentCardsForOrg({
      orgId: organization.id,
      cards,
      db: tx,
    });
    nextAssignmentsNormalized = hydrateAssignmentFkRefsFromCards(
      nextAssignmentsNormalized,
      savedCards
    );
    let nextAssignmentsByExternalId =
      buildAssignmentByExternalId(nextAssignmentsNormalized);
    const changedIncomingExternalIds = new Set<string>();
    const removedExternalIds = new Set<string>();

    nextAssignmentsByExternalId.forEach((nextItem: any, externalId: string) => {
      const currentItem = currentAssignmentsByExternalId.get(externalId);
      if (!currentItem || !isSameAssignmentStateContent(currentItem, nextItem)) {
        changedIncomingExternalIds.add(externalId);
      }
    });
    currentAssignmentsByExternalId.forEach(
      (_currentItem: any, externalId: string) => {
        if (!nextAssignmentsByExternalId.has(externalId)) {
          removedExternalIds.add(externalId);
        }
      }
    );

    const completedGuardExternalIds = Array.from(
      new Set(
        [
          ...Array.from(nextAssignmentsByExternalId.keys()),
          ...Array.from(removedExternalIds.values()),
        ]
          .map((value) => resolveOptionalString(value, null))
          .filter((value): value is string => Boolean(value))
      )
    );
    const completedPlanRows =
      completedGuardExternalIds.length > 0
        ? await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: completedGuardExternalIds },
              isCompleted: true,
            },
            select: COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT,
          })
        : [];
    const completedPlanByExternalId = new Map(
      completedPlanRows
        .map((plan: any) => [resolveOptionalString(plan?.externalId, null), plan])
        .filter((entry): entry is [string, any] => Boolean(entry[0]))
    );
    for (const plan of completedPlanRows) {
      const externalId = resolveOptionalString(plan?.externalId, null);
      if (!externalId) continue;
      const nextItem = nextAssignmentsByExternalId.get(externalId);
      if (!nextItem) {
        throw createHttpError(
          409,
          `completed assignment cannot be removed: ${externalId}`
        );
      }
      if (stDraftsByExternalId.has(externalId)) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (stDrafts)`
        );
      }
      const changedFields = listCompletedAssignmentWriteDiffFields(plan, nextItem);
      if (changedFields.length > 0) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (${changedFields
            .slice(0, 6)
            .join(", ")})`
        );
      }
    }
    for (const [externalId, currentItem] of currentAssignmentsByExternalId.entries()) {
      if (!Boolean(currentItem?.isCompleted)) continue;
      if (completedPlanByExternalId.has(externalId)) continue;
      const nextItem = nextAssignmentsByExternalId.get(externalId);
      if (!nextItem) {
        throw createHttpError(
          409,
          `completed assignment cannot be removed: ${externalId}`
        );
      }
      if (stDraftsByExternalId.has(externalId)) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (stDrafts)`
        );
      }
      const changedFields = listCompletedAssignmentWriteDiffFields(currentItem, nextItem);
      if (changedFields.length > 0) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${externalId} (${changedFields
            .slice(0, 6)
            .join(", ")})`
        );
      }
    }
    // Defense in depth: by this point every completed assignment has already
    // passed the two guards above (no removal, no stDrafts, no write-relevant
    // field diff) or the request would have already 409'd with an explicit
    // reason. A completed AssignmentPlan must never reach updatePlanRows -
    // isSameAssignmentStateContent() compares the full board-state shape
    // (including fields the write-diff guards above intentionally ignore,
    // e.g. read-only/derived ones), so it can still flag a completed
    // assignment as "changed" even when nothing write-relevant moved. Rather
    // than rely on every future field staying in sync between the two
    // comparators, exclude known-completed externalIds from the update
    // pipeline outright.
    const completedExternalIdSet = new Set<string>(
      Array.from(completedPlanByExternalId.keys())
    );
    currentAssignmentsByExternalId.forEach((item: any, externalId: string) => {
      if (Boolean(item?.isCompleted)) completedExternalIdSet.add(externalId);
    });
    stDraftsByExternalId.forEach((_drafts, externalId) => {
      if (nextAssignmentsByExternalId.has(externalId)) {
        changedIncomingExternalIds.add(externalId);
      }
    });

    const changedIncomingAssignments = nextAssignmentsNormalized.filter((item) => {
      const externalId = resolveAssignmentExternalId(item);
      return Boolean(externalId && changedIncomingExternalIds.has(externalId));
    });
    const changedWorkOrderIds = Array.from(
      new Set(
        changedIncomingAssignments
          .map((item) => toPositiveIntOrNull(item?.workOrderId))
          .filter((value): value is number => value !== null)
      )
    );
    if (changedWorkOrderIds.length > 0) {
      const orderRows = await tx.workOrder.findMany({
        where: {
          id: { in: changedWorkOrderIds },
          OR: getOrderAccessWhere(organization.id),
        },
        select: {
          id: true,
          orderNumber: true,
          modificationLockedAt: true,
        },
      });
      const manualLockByWorkOrderId = orderRows.reduce((map, row) => {
        const workOrderId = toPositiveIntOrNull(row?.id);
        if (workOrderId === null) return map;
        map.set(workOrderId, Boolean(row?.modificationLockedAt));
        return map;
      }, new Map<number, boolean>());
      const orderNumberByWorkOrderId = orderRows.reduce((map, row) => {
        const workOrderId = toPositiveIntOrNull(row?.id);
        const orderNumber = resolveOptionalString(row?.orderNumber, null);
        if (workOrderId !== null && orderNumber) map.set(workOrderId, orderNumber);
        return map;
      }, new Map<number, string>());
      const unlockedWorkOrderIds = changedWorkOrderIds.filter(
        (workOrderId) => !Boolean(manualLockByWorkOrderId.get(workOrderId))
      );
      if (unlockedWorkOrderIds.length > 0) {
        throw createHttpError(
          409,
          `order manual lock required before scheduling assignment: ` +
            unlockedWorkOrderIds
              .slice(0, 5)
              .map((workOrderId) => orderNumberByWorkOrderId.get(workOrderId) ?? String(workOrderId))
              .join(", ")
        );
      }
    }
    const nextAssignmentExternalIds = Array.from(nextAssignmentsByExternalId.keys()).map(
      (externalId) => String(externalId)
    );
    const guardedAssignmentExternalIds = Array.from(
      new Set([
        ...nextAssignmentExternalIds,
        ...Array.from(removedExternalIds.values()).map((externalId) => String(externalId)),
      ])
    );
    const existingPlanRowsForStTotals =
      guardedAssignmentExternalIds.length > 0
        ? await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: guardedAssignmentExternalIds },
            },
            select: ASSIGNMENT_PLAN_SELECT_FOR_BOARD_SAVE as any,
          })
        : [];
    const existingPlanByExternalIdForStTotals = new Map(
      existingPlanRowsForStTotals
        .map((plan: any) => [resolveOptionalString(plan?.externalId, null), plan])
        .filter((entry): entry is [string, any] => Boolean(entry[0]))
    );
    const payrollLockMonthByExternalId = new Map<string, string>();
    existingPlanRowsForStTotals.forEach((plan: any) => {
      const externalId = resolveOptionalString(plan?.externalId, null);
      const monthKey = resolveAssignmentPlanPayrollLockMonth(plan);
      if (externalId && monthKey) payrollLockMonthByExternalId.set(externalId, monthKey);
    });
    const lockedPayrollMonthSet = await loadLockedPayrollMonthSet(
      organization.id,
      Array.from(payrollLockMonthByExternalId.values()),
      tx
    );
    const payrollLockedPlanByExternalId = new Map<string, any>();
    payrollLockMonthByExternalId.forEach((monthKey, externalId) => {
      if (!lockedPayrollMonthSet.has(monthKey)) return;
      const plan = existingPlanByExternalIdForStTotals.get(externalId);
      if (plan) payrollLockedPlanByExternalId.set(externalId, plan);
    });
    for (const externalId of removedExternalIds.values()) {
      if (!payrollLockedPlanByExternalId.has(externalId)) continue;
      throw createHttpError(
        409,
        `payroll locked assignment cannot be removed: ${externalId}`
      );
    }
    for (const assignment of nextAssignmentsNormalized) {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId) continue;
      const existingPlan = payrollLockedPlanByExternalId.get(externalId);
      if (!existingPlan) continue;
      if (stDraftsByExternalId.has(externalId)) {
        throw createHttpError(
          409,
          `payroll locked assignment cannot change ST: ${externalId}`
        );
      }
      const changedFields = listCompletedAssignmentWriteDiffFields(existingPlan, assignment);
      if (changedFields.length > 0) {
        throw createHttpError(
          409,
          `payroll locked assignment cannot be modified: ${externalId} (${changedFields
            .slice(0, 6)
            .join(", ")})`
        );
      }
    }
    nextAssignmentsByExternalId = buildAssignmentByExternalId(nextAssignmentsNormalized);
    const linkedWorkRecordPlanIds = await loadLinkedWorkRecordPlanIds({
      planIds: existingPlanRowsForStTotals.map((plan: any) => plan?.id),
      db: tx,
    });
    const linkedWorkRecordPlanIdSet = new Set(linkedWorkRecordPlanIds);
    const linkedWorkRecordExternalIdSet = new Set(
      existingPlanRowsForStTotals
        .filter((plan: any) => linkedWorkRecordPlanIdSet.has(Number(plan?.id)))
        .map((plan: any) => resolveOptionalString(plan?.externalId, null))
        .filter((value): value is string => Boolean(value))
    );
    stDraftsByExternalId.forEach((_drafts, externalId) => {
      if (!linkedWorkRecordExternalIdSet.has(externalId)) return;
      throw createHttpError(
        409,
        `assignment with linked work records cannot change ST: ${externalId}`
      );
    });
    nextAssignmentsNormalized = nextAssignmentsNormalized.map((assignment) => {
      const externalId = resolveAssignmentExternalId(assignment);
      if (!externalId || !linkedWorkRecordExternalIdSet.has(externalId)) {
        return assignment;
      }
      const existingPlan = existingPlanByExternalIdForStTotals.get(externalId);
      if (!existingPlan) return assignment;
      const preservedCtSnapshot = resolveNormalizedAssignmentCtSnapshot(existingPlan);
      const preservedCtTotalSeconds = resolveAssignmentCtTotalSeconds(existingPlan);
      const preservedStTotalSeconds =
        resolvePersistedAssignmentPlanStTotalSeconds(existingPlan);
      return {
        ...assignment,
        ...(preservedCtSnapshot ? { assignmentCtSnapshot: preservedCtSnapshot } : {}),
        ...(preservedCtTotalSeconds != null
          ? {
              ctTotalSeconds: preservedCtTotalSeconds,
              assignmentCtTotalSeconds: preservedCtTotalSeconds,
            }
          : {}),
        ...(preservedStTotalSeconds != null
          ? {
              stTotalSeconds: preservedStTotalSeconds,
              assignmentStTotalSeconds: preservedStTotalSeconds,
            }
          : {}),
      };
    });
    const stTotalPreparation = await prepareAssignmentBoardStTotalsForSave({
      organization,
      cards,
      assignments: nextAssignmentsNormalized,
      existingPlanByExternalId: existingPlanByExternalIdForStTotals,
      stDraftsByExternalId,
      db: tx,
    });
    nextAssignmentsNormalized = stTotalPreparation.assignments;
    stTotalPreparation.changedExternalIds.forEach((externalId) => {
      changedIncomingExternalIds.add(externalId);
    });
    const ctSnapshotSkippedExternalIds = new Set<string>([
      ...Array.from(linkedWorkRecordExternalIdSet.values()),
      ...Array.from(payrollLockedPlanByExternalId.keys()),
    ]);
    const ctSnapshotPreparation =
      await refreshIncomingAssignmentCtSnapshotsFromStyles({
      organization,
      cards: savedCards,
      assignments: nextAssignmentsNormalized,
      skippedExternalIds: ctSnapshotSkippedExternalIds,
      existingPlanByExternalId: existingPlanByExternalIdForStTotals,
      db: tx,
    });
    nextAssignmentsNormalized = ctSnapshotPreparation.assignments;
    assertAssignmentCtSnapshotsReadyForBoardSave({
      orgId: organization.id,
      assignments: nextAssignmentsNormalized,
      skippedExternalIds: ctSnapshotSkippedExternalIds,
      cardById: ctSnapshotPreparation.cardById,
      styleByStyleId: ctSnapshotPreparation.styleByStyleId,
      existingPlanByExternalId: existingPlanByExternalIdForStTotals,
    });
    nextAssignmentsByExternalId = buildAssignmentByExternalId(nextAssignmentsNormalized);
    assertFiniteAssignmentScheduleIndices(nextAssignmentsNormalized);

    const planSyncTargetAssignments = normalizeStateAssignments(
      nextAssignmentsNormalized.filter((item) => {
        const externalId = resolveAssignmentExternalId(item);
        if (!externalId) return false;
        if (completedExternalIdSet.has(externalId)) return false;
        const currentItem = currentAssignmentsByExternalId.get(externalId);
        return (
          !currentItem ||
          !isSameAssignmentStateContent(currentItem, item) ||
          stDraftsByExternalId.has(externalId)
        );
      })
    );
    const removedExternalIdList = Array.from(removedExternalIds.values());
    const lineIdSet =
      planSyncTargetAssignments.length > 0
        ? new Set(
            (
              await tx.line.findMany({
                where: { orgId: organization.id },
                select: { id: true },
              })
            ).map((line) => line.id)
          )
        : null;
    const normalizedPlanChanges =
      planSyncTargetAssignments.length > 0
        ? await syncAssignmentPlanWorkOrderRefs(
            organization.id,
            normalizeAssignmentPlanPayload(planSyncTargetAssignments, lineIdSet),
            tx
          )
        : [];
    const planSyncExternalIds = Array.from(
      new Set([
        ...normalizedPlanChanges.map((item: any) => item.externalId),
        ...removedExternalIdList,
      ])
    );
    const existingPlanRows =
      planSyncExternalIds.length > 0
        ? await tx.assignmentPlan.findMany({
            where: {
              orgId: organization.id,
              externalId: { in: planSyncExternalIds },
            },
            select: { id: true, externalId: true },
          })
        : [];
    const existingPlanByExternalId = new Map(
      existingPlanRows.map((plan) => [plan.externalId, plan])
    );
    const createPlanRows: any[] = [];
    const updatePlanRows: Array<{ id: number; item: any }> = [];
    normalizedPlanChanges.forEach((item: any) => {
      const existingPlan = existingPlanByExternalId.get(item.externalId);
      if (existingPlan) {
        updatePlanRows.push({ id: existingPlan.id, item });
        return;
      }
      createPlanRows.push(item);
    });
    // Real FK lookup (AGENTS.md 43): batch-resolve every distinct cardId
    // string in this save to its AssignmentCard.id once, instead of each
    // caller re-deriving the relationship from string matching.
    const cardIdStringsInThisSave = Array.from(
      new Set(
        normalizedPlanChanges
          .map((item: any) => resolveOptionalString(item?.cardId, null))
          .filter((value: string | null): value is string => Boolean(value))
      )
    );
    // Phase B (AssignmentCard/AssignmentPlan FK+join redesign): the same
    // batch lookup now also carries the card's own styleId/buyerOrgId, so a
    // newly created/updated AssignmentPlan always agrees with the card it
    // was scheduled from instead of re-deriving those independently.
    const cardIdToAssignmentCardId = new Map<
      string,
      { id: number; styleId: number | null; workOrderId: number | null; buyerOrgId: number | null }
    >();
    if (cardIdStringsInThisSave.length > 0) {
      const matchedAssignmentCards = await tx.assignmentCard.findMany({
        where: { orgId: organization.id, cardId: { in: cardIdStringsInThisSave } },
        select: { id: true, cardId: true, styleId: true, workOrderId: true, buyerOrgId: true },
      });
      matchedAssignmentCards.forEach((card) => {
        cardIdToAssignmentCardId.set(card.cardId, {
          id: card.id,
          styleId: card.styleId,
          workOrderId: card.workOrderId,
          buyerOrgId: card.buyerOrgId,
        });
      });
      const missingCardIds = cardIdStringsInThisSave.filter(
        (cardId) => !cardIdToAssignmentCardId.has(cardId)
      );
      if (missingCardIds.length > 0) {
        throw createHttpError(
          409,
          `assignment card FK missing for plan save: ${missingCardIds.join(", ")}`
        );
      }
      const cardsMissingRequiredFk = matchedAssignmentCards.filter(
        (card) =>
          toPositiveIntOrNull(card.styleId) === null ||
          toPositiveIntOrNull(card.workOrderId) === null
      );
      if (cardsMissingRequiredFk.length > 0) {
        throw createHttpError(
          409,
          `assignment card is missing styleId/workOrderId FK: ${cardsMissingRequiredFk
            .map((card) => card.cardId)
            .join(", ")}`
        );
      }
      normalizedPlanChanges.forEach((item: any) => {
        const cardId = resolveOptionalString(item?.cardId, null);
        if (!cardId) return;
        const card = cardIdToAssignmentCardId.get(cardId);
        const itemWorkOrderId = toPositiveIntOrNull(item?.workOrderId);
        if (!card || itemWorkOrderId === null || card.workOrderId !== itemWorkOrderId) {
          throw createHttpError(
            409,
            `assignment ${resolveAssignmentExternalId(item) ?? cardId} workOrderId FK does not match its assignment card`
          );
        }
        const itemBuyerOrgId = toPositiveIntOrNull(item?.buyerOrgId);
        if (
          itemBuyerOrgId !== null &&
          card.buyerOrgId !== null &&
          card.buyerOrgId !== itemBuyerOrgId
        ) {
          throw createHttpError(
            409,
            `assignment ${resolveAssignmentExternalId(item) ?? cardId} buyerOrgId FK does not match its assignment card`
          );
        }
      });
    }
    if (createPlanRows.length > 0) {
      await validateNewAssignmentPlanCtSnapshotProcesses({
        createPlanRows,
        cardIdToAssignmentCardId,
        db: tx,
      });
      await tx.assignmentPlan.createMany({
        data: createPlanRows.map((item: any) => ({
          orgId: organization.id,
          externalId: item.externalId,
          ...toAssignmentPlanWriteData(item, cardIdToAssignmentCardId),
        })) as Prisma.AssignmentPlanCreateManyInput[],
      });
    }
    for (const row of updatePlanRows) {
      const updateResult = await tx.assignmentPlan.updateMany({
        where: { id: row.id, isCompleted: false },
        data: toAssignmentPlanWriteData(
          row.item,
          cardIdToAssignmentCardId
        ) as Prisma.AssignmentPlanUncheckedUpdateInput,
      });
      if (updateResult.count !== 1) {
        throw createHttpError(
          409,
          `completed assignment cannot be modified: ${row.item?.externalId ?? row.id}`
        );
      }
    }
    const removedExternalIdSet = new Set(removedExternalIdList);
    const removedPlanRows = existingPlanRows.filter((plan) =>
      removedExternalIdSet.has(plan.externalId)
    );
    if (removedPlanRows.length > 0) {
      await detachWorkRecordsAndDeleteAssignmentPlans({
        planIds: removedPlanRows.map((plan) => plan.id),
        db: tx,
      });
    }

    const state = await tx.assignmentBoardState.upsert({
      where: { orgId: organization.id },
      update: {
        cards: Prisma.JsonNull,
        assignments: Prisma.JsonNull,
      },
      create: {
        orgId: organization.id,
        cards: Prisma.JsonNull,
        assignments: Prisma.JsonNull,
      },
    });
    const assignmentPlans = await loadAssignmentPlanRowsForBoardTx(organization.id, tx);

    return {
      state,
      savedCards,
      assignmentPlans,
      stDraftWarnings: stTotalPreparation.warnings,
    };
  }, { timeout: 90000 });
  const updatedState = updated?.state ?? null;
  const updatedCards = ensureArray(updated?.savedCards);
  const updatedAssignmentPlans = await annotateAssignmentPlanRowsWithPayrollLocks(
    organization.id,
    ensureArray(updated?.assignmentPlans)
  );
  const stDraftWarnings = ensureArray(updated?.stDraftWarnings);
  // Board save ST reverse propagation is driven only by explicit write-only stDrafts.
  // assignmentCtSnapshot is CT-only and must not be used as an ST source.
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    cards: updatedCards,
    assignments: updatedAssignmentPlans.map((plan) => toAssignmentPlanResponse(plan)),
  });
  res.json({
    ...toAssignmentBoardStateResponse(updatedState, updatedAssignmentPlans, updatedCards),
    warnings: stDraftWarnings,
  });
});

app.get("/customers", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization) && !isBrandOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const where = isManufacturerOrg(organization)
    ? { manufacturerOrgId: organization.id }
    : { brandOrgId: organization.id };
  const relationships = await prisma.orgRelationship.findMany({
    where,
    include: { brand: true, manufacturer: true },
    orderBy: { id: "asc" },
  });

  const perspective = isManufacturerOrg(organization) ? "MANUFACTURER" : "BRAND";
  res.json(relationships.map((item) => toCustomerResponse(item, perspective)));
});

app.get("/customers/:id/pricing", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where:
      perspective === "MANUFACTURER"
        ? { id, manufacturerOrgId: organization.id }
        : { id, brandOrgId: organization.id },
    select: {
      id: true,
      pricingDefaultTradeType: true,
      pricingMatrix: true,
      updatedAt: true,
    },
  });

  if (!relationship) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  res.json(toCustomerPricingResponse(relationship));
});

app.get("/order-parties", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization) && !isBrandOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const where = isManufacturerOrg(organization)
    ? { manufacturerOrgId: organization.id }
    : { brandOrgId: organization.id };

  const relationships = await prisma.orgRelationship.findMany({
    where,
    include: {
      manufacturer: true,
      brand: true,
    },
    orderBy: { id: "asc" },
  });

  const relationshipPairs = relationships.map((relationship) => ({
    manufacturerOrgId: relationship.manufacturerOrgId,
    brandOrgId: relationship.brandOrgId,
  }));

  const buyerOrgOptions = isManufacturerOrg(organization)
    ? toUniqueOrganizationOptions(
        relationships.map((relationship) => ({
          ...relationship.brand,
          defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(
            relationship.defaultSizeSetCode
          ),
        }))
      )
    : [toOrganizationOption(organization)];

  const sellerOrgOptions = isManufacturerOrg(organization)
    ? [toOrganizationOption(organization)]
    : toUniqueOrganizationOptions(
        relationships.map((relationship) => relationship.manufacturer)
      );

  res.json({
    currentOrg: toOrganizationOption(organization),
    roleHint: isManufacturerOrg(organization) ? "MANUFACTURER" : "BRAND",
    buyerOrgOptions,
    sellerOrgOptions,
    relationshipPairs,
  });
});

app.get("/orders", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orders = await prisma.workOrder.findMany({
    where: { OR: getOrderAccessWhere(organization.id) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: WORK_ORDER_RESPONSE_INCLUDE,
  });
  const assignmentLockMap = await loadOrderAssignmentModificationLockMap(orders);
  res.json(
    orders.map((order) =>
      {
        const orderKey = resolveOptionalString(order?.orderId ?? order?.id, null) ?? "";
        return toOrderResponse(order, {
          isAssignmentModificationLocked: Boolean(assignmentLockMap.get(orderKey)),
        });
      }
    )
  );
});

app.post("/orders", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const normalized = normalizeOrderPayload(req.body ?? {});
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  const buyerOrgId = toPositiveIntOrNull(normalized.buyerOrgId);
  const sellerOrgId = toPositiveIntOrNull(normalized.sellerOrgId);
  const { buyer, seller } = await resolveOrderPartiesOrThrow({
    buyerOrgId,
    sellerOrgId,
    requesterOrgId: organization.id,
  });
  normalized.buyerOrgId = buyer.id;
  normalized.customerId = buyer.id;
  normalized.sellerOrgId = seller.id;
  normalized.items = await syncOrderItemColorSnapshots(normalized.items);
  normalized.items = await syncOrderItemStyleRefs(normalized.items, [
    buyer.id,
    seller.id,
  ]);
  normalized.totalQuantity = normalized.items.reduce(
    (sum: number, item: any) => sum + (Number(item?.totalQuantity) || 0),
    0
  );
  const { order, created } = await createOrReuseSharedOrder({
    normalized,
  });
  await rebuildAssignmentCardsForOrgIds([buyer.id, seller.id]);
  const orderLockState = await getOrderModificationLockState(order);
  res.status(created ? 201 : 200).json(
    toOrderResponse(order, {
      isAssignmentModificationLocked: orderLockState.isAssignmentLocked,
    })
  );
});

app.put("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
    include: { workOrderItems: WORK_ORDER_ITEM_WITH_COLOR_INCLUDE },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }
  if (await isOrderModificationLocked(existing)) {
    return res.status(409).json({
      ok: false,
      error: ORDER_MODIFICATION_LOCK_ERROR,
    });
  }

  const normalized = normalizeOrderPayload(req.body ?? {}, existing);
  if (!normalized.orderNumber) {
    return res.status(400).json({ ok: false, error: "orderNumber is required" });
  }
  const buyerOrgId = toPositiveIntOrNull(normalized.buyerOrgId);
  const sellerOrgId = toPositiveIntOrNull(normalized.sellerOrgId);
  const { buyer, seller } = await resolveOrderPartiesOrThrow({
    buyerOrgId,
    sellerOrgId,
    requesterOrgId: organization.id,
  });
  normalized.buyerOrgId = buyer.id;
  normalized.customerId = buyer.id;
  normalized.sellerOrgId = seller.id;
  normalized.items = await syncOrderItemColorSnapshots(normalized.items);
  normalized.items = await syncOrderItemStyleRefs(normalized.items, [
    buyer.id,
    seller.id,
  ]);
  normalized.totalQuantity = normalized.items.reduce(
    (sum: number, item: any) => sum + (Number(item?.totalQuantity) || 0),
    0
  );

  const orderNumberConflict = await findSharedOrderConflict({
    buyerOrgId: buyer.id,
    sellerOrgId: seller.id,
    orderNumber: normalized.orderNumber,
    excludeOrderRecordId: existing.id,
  });
  if (orderNumberConflict) {
    return res.status(409).json({
      ok: false,
      error: "order already exists for this buyer/seller pair",
    });
  }
  // Route param is source of truth.
  normalized.orderId = existing.orderId;

  const itemsToUpsert = normalizeOrderItems(normalized.items);

  // Card/AssignmentPlan sync no longer happens at save time - it happens once,
  // at order-lock time (POST /orders/:orderId/modification-lock, locked:true).
  // This endpoint only ever rewrites WorkOrderItem. See AGENTS.md 40번.
  const { items: _updateItems, ...workOrderUpdateData } = normalized;
  const updated = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.workOrder.update({
      where: { id: existing.id },
      data: {
        ...workOrderUpdateData,
        orgId: buyer.id,
        // WorkOrderItem (rewritten below) is the source of truth; do not
        // duplicate the items array into the WorkOrder.items JSON column.
        items: Prisma.JsonNull,
      },
    });
    await tx.workOrderItem.deleteMany({ where: { workOrderId: existing.id } });
    if (itemsToUpsert.length > 0) {
      await tx.workOrderItem.createMany({
        data: itemsToUpsert.map((item: any, idx: number) => ({
          workOrderId: updatedOrder.id,
          itemId: item.id || "",
          styleId: toPositiveIntOrNull(item.styleId),
          colorId: toPositiveIntOrNull(item.colorId),
          gender: normalizeWorkOrderItemGender(item.gender, "M"),
          sizeQuantities: item.sizeQuantities ?? null,
          totalQuantity: toNonNegativeInt(item.totalQuantity, 0),
          sortOrder: idx,
        })),
      });
    }
    return tx.workOrder.findUnique({
      where: { id: updatedOrder.id },
      include: WORK_ORDER_RESPONSE_INCLUDE,
    });
  }, { timeout: 30000 });

  const updatedLockState = await getOrderModificationLockState(updated);
  res.json(
    toOrderResponse(updated, {
      isAssignmentModificationLocked: updatedLockState.isAssignmentLocked,
    })
  );
});

app.post("/orders/:orderId/modification-lock", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }
  if (typeof req.body?.locked !== "boolean") {
    return res.status(400).json({ ok: false, error: "locked boolean is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
    include: WORK_ORDER_RESPONSE_INCLUDE,
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }

  const currentLockState = await getOrderModificationLockState(existing);
  const requestedLocked = Boolean(req.body.locked);

  if (
    requestedLocked === currentLockState.isManualLocked
  ) {
    const refreshedLockState = await getOrderModificationLockState(existing);
    return res.json(
      toOrderResponse(existing, {
        isAssignmentModificationLocked: refreshedLockState.isAssignmentLocked,
      })
    );
  }

  // Unlocking is still a pure editing-permission flag - it never creates,
  // updates, or deletes AssignmentCard/AssignmentPlan rows. Unlocking used to
  // hard-delete every AssignmentPlan/AssignmentCard for the order (guarded
  // only by an order-wide "does anything have work records" check) - that
  // destructive behavior caused a production data loss incident and has been
  // removed on purpose. Do not reintroduce it.
  //
  // Locking is the one moment card/plan sync happens (AGENTS.md 40번): the
  // pool card catalog is rebuilt from the current WorkOrderItem set, and
  // already-placed AssignmentPlan rows for this order get their quantity/ST
  // reconciled to match (syncAssignmentPlansForOrderLock). A style dropped
  // from the order that already has linked work records is kept as a
  // zero-quantity overflow assignment instead of being deleted.
  const affectedOrgIds = [existing.buyerOrgId, existing.sellerOrgId]
    .map((value) => toPositiveIntOrNull(value))
    .filter((value): value is number => value !== null);
  let zeroedStyles: OrderStyleRemovalIssue[] = [];
  if (requestedLocked) {
    // Assignment scheduling is exclusively a manufacturer-side concept, but
    // either party can register/lock the shared order (buyer or seller) - so
    // AssignmentPlan rows for this order may live under either org's id, not
    // necessarily the org that happens to be calling this endpoint. Run the
    // sync for every org on the order (same set rebuildAssignmentCardsForOrgIds
    // uses below), not just `organization.id` - the org(s) with no plans just
    // no-op (syncAssignmentPlansForOrderLock returns early on 0 rows).
    const orgIdsToSync = affectedOrgIds.length > 0 ? affectedOrgIds : [organization.id];
    const zeroedStylesByStyleId = new Map<number, OrderStyleRemovalIssue>();
    await prisma.$transaction(
      async (tx) => {
        for (const orgId of orgIdsToSync) {
          const syncResult = await syncAssignmentPlansForOrderLock({
            orgId,
            order: existing,
            db: tx,
          });
          syncResult.zeroedStyles.forEach((issue) => {
            zeroedStylesByStyleId.set(issue.styleId, issue);
          });
        }
      },
      { timeout: 30000 }
    );
    zeroedStyles = Array.from(zeroedStylesByStyleId.values());
  }

  const lockedBy =
    resolveOptionalString(req.body?.lockedBy, null) ??
    getRequesterEmail(req) ??
    "unknown";
  const updated = await prisma.workOrder.update({
    where: { id: existing.id },
    data: requestedLocked
      ? {
          modificationLockedAt: new Date(),
          modificationLockedBy: lockedBy,
        }
      : {
          modificationLockedAt: null,
          modificationLockedBy: null,
        },
    include: WORK_ORDER_RESPONSE_INCLUDE,
  });
  if (requestedLocked) {
    const rebuildOrgIds = affectedOrgIds.length > 0 ? affectedOrgIds : [organization.id];
    try {
      await rebuildAssignmentCardsForOrgIds(rebuildOrgIds);
    } catch (error) {
      console.error(
        `[modification-lock] rebuildAssignmentCardsForOrgIds threw for order=${updated.orderId} orgIds=${JSON.stringify(rebuildOrgIds)}`,
        error
      );
      throw error;
    }
  }
  await syncOrderProgressStatusesForOrg({
    orgId: organization.id,
    orderIds: [updated.orderId],
    includeTerminalStages: true,
  });
  const refreshed = await prisma.workOrder.findUnique({
    where: { id: updated.id },
    include: WORK_ORDER_RESPONSE_INCLUDE,
  });
  const orderForResponse = refreshed ?? updated;

  const refreshedLockState = await getOrderModificationLockState(orderForResponse);
  return res.json({
    ...toOrderResponse(orderForResponse, {
      isAssignmentModificationLocked: refreshedLockState.isAssignmentLocked,
    }),
    zeroedStyles,
  });
});

app.delete("/orders/:orderId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res);
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ ok: false, error: "orderId is required" });
  }

  const existing = await prisma.workOrder.findFirst({
    where: {
      orderId,
      OR: getOrderAccessWhere(organization.id),
    },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "order not found" });
  }
  if (await isOrderModificationLocked(existing)) {
    return res.status(409).json({
      ok: false,
      error: ORDER_MODIFICATION_LOCK_ERROR,
    });
  }

  // Deleting the order deletes every style's card for it, i.e. a full
  // removal - guard it exactly like a partial style removal in
  // PUT /orders/:orderId. This used to be covered only incidentally, by
  // unlock always wiping cards/plans first; now that unlock is a pure
  // permission flag (see POST .../modification-lock), this guard is the
  // only thing standing between "delete an unlocked order" and silently
  // detaching real work records from their assignment.
  const deletableOrgIds = [existing.buyerOrgId, existing.sellerOrgId]
    .map((value) => toPositiveIntOrNull(value))
    .filter((value): value is number => value !== null);
  // Match via real FK paths only. If assignmentCard points to this order but
  // AssignmentPlan.workOrderId is missing, surface the drift explicitly
  // instead of inferring ownership from cardId/originOrderId strings.
  const plansForOrder = await prisma.assignmentPlan.findMany({
    where: {
      orgId: { in: deletableOrgIds },
      OR: [
        { workOrderId: existing.id },
        { assignmentCard: { is: { workOrderId: existing.id } } },
      ],
    },
    select: { id: true, externalId: true, workOrderId: true },
  });
  const plansMissingWorkOrderFk = plansForOrder.filter(
    (plan) => toPositiveIntOrNull(plan.workOrderId) !== existing.id
  );
  if (plansMissingWorkOrderFk.length > 0) {
    return res.status(409).json({
      ok: false,
      error: "assignment plan is missing workOrderId FK; fix assignment plan relations before deleting this order",
      issues: plansMissingWorkOrderFk.map((plan) => ({
        assignmentPlanId: plan.id,
        externalId: resolveOptionalString(plan.externalId, null),
        code: "ASSIGNMENT_PLAN_MISSING_WORK_ORDER_FK",
      })),
    });
  }
  const linkedPlanIds = await loadLinkedWorkRecordPlanIds({
    planIds: plansForOrder.map((plan) => plan.id),
  });
  if (linkedPlanIds.length > 0) {
    return res.status(409).json({
      ok: false,
      error: "order has assignment cards with linked work records and cannot be deleted",
      issues: [{
        styleId: null,
        styleCode: "",
        styleName: "",
        code: "ORDER_HAS_WORK_RECORDS",
        message: "This order has assignment cards with existing work records and cannot be deleted.",
      }],
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workOrder.delete({ where: { id: existing.id } });
    // Already guard-verified above (linkedPlanIds is empty) - this is
    // cleanup, not a second guard decision.
    await detachWorkRecordsAndDeleteAssignmentPlans({
      planIds: plansForOrder.map((plan) => plan.id),
      db: tx,
    });
  });
  await rebuildAssignmentCardsForOrgIds(deletableOrgIds);
  res.status(204).send();
});

app.post("/customers", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const { brandOrgId, customerOrgId, memo } = req.body ?? {};
  const sharedOrganizationData = buildSharedCustomerOrganizationData(req.body ?? {});
  const normalizedCode = sharedOrganizationData.code;
  if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
    return res.status(400).json({
      ok: false,
      error: "code must be 4 uppercase letters",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const targetType = isManufacturerPerspective
    ? ORGANIZATION_TYPE_KEYS.BRAND
    : ORGANIZATION_TYPE_KEYS.MANUFACTURER;

  let targetOrganization: any = null;
  const targetOrgIdNum = toPositiveIntOrNull(customerOrgId ?? brandOrgId);
  if (targetOrgIdNum) {
    targetOrganization = await prisma.organization.findUnique({
      where: { id: targetOrgIdNum },
    });
    if (!targetOrganization) {
      return res.status(404).json({ ok: false, error: "customer organization not found" });
    }
    if (targetOrganization.type !== targetType) {
      return res.status(400).json({
        ok: false,
        error: "invalid customer organization type",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: targetOrganization.id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    const nextTargetData = buildSharedCustomerOrganizationData(req.body ?? {}, targetOrganization);
    if (!nextTargetData.name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    targetOrganization = await prisma.organization.update({
      where: { id: targetOrganization.id },
      data: {
        name: nextTargetData.name,
        nameKo: nextTargetData.nameKo,
        nameVi: nextTargetData.nameVi,
        code: normalizedCode,
        address: nextTargetData.address,
        country: nextTargetData.country,
        countryCode: nextTargetData.countryCode,
        phone: nextTargetData.phone,
        representative: nextTargetData.representative,
        email: nextTargetData.email,
      },
    });
  } else {
    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner && existingCodeOwner.type !== targetType) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    const nextTargetData = buildSharedCustomerOrganizationData(
      req.body ?? {},
      existingCodeOwner ?? null
    );
    if (!nextTargetData.name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    if (existingCodeOwner && existingCodeOwner.type === targetType) {
      targetOrganization = await prisma.organization.update({
        where: { id: existingCodeOwner.id },
        data: {
          name: nextTargetData.name,
          nameKo: nextTargetData.nameKo,
          nameVi: nextTargetData.nameVi,
          code: normalizedCode,
          address: nextTargetData.address,
          country: nextTargetData.country,
          countryCode: nextTargetData.countryCode,
          phone: nextTargetData.phone,
          representative: nextTargetData.representative,
          email: nextTargetData.email,
        },
      });
    } else {
      targetOrganization = await prisma.organization.create({
        data: {
          name: nextTargetData.name,
          nameKo: nextTargetData.nameKo,
          nameVi: nextTargetData.nameVi,
          code: normalizedCode,
          address: nextTargetData.address,
          country: nextTargetData.country,
          countryCode: nextTargetData.countryCode,
          phone: nextTargetData.phone,
          representative: nextTargetData.representative,
          email: nextTargetData.email,
          type: targetType,
        },
      });
    }
  }

  if (!targetOrganization || targetOrganization.type !== targetType) {
    return res.status(400).json({ ok: false, error: "invalid customer organization type" });
  }

  if (targetOrganization.id === organization.id) {
    return res.status(400).json({
      ok: false,
      error: "cannot link organization to itself",
    });
  }

  const manufacturerOrgId = isManufacturerPerspective
    ? organization.id
    : targetOrganization.id;
  const brandOrgIdForRelationship = isManufacturerPerspective
    ? targetOrganization.id
    : organization.id;

  const relationship = await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId,
        brandOrgId: brandOrgIdForRelationship,
      },
    },
    update: {
      customerCode: normalizedCode,
      defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(req.body?.defaultSizeSetCode),
      managerName: resolveOptionalString(sharedOrganizationData.representative, null),
      managerPhone: resolveOptionalString(sharedOrganizationData.phone, null),
      managerEmail: resolveOptionalString(sharedOrganizationData.email, null),
      memo: resolveOptionalString(memo, null),
    },
    create: {
      manufacturerOrgId,
      brandOrgId: brandOrgIdForRelationship,
      customerCode: normalizedCode,
      defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(req.body?.defaultSizeSetCode),
      managerName: resolveOptionalString(sharedOrganizationData.representative, null),
      managerPhone: resolveOptionalString(sharedOrganizationData.phone, null),
      managerEmail: resolveOptionalString(sharedOrganizationData.email, null),
      memo: resolveOptionalString(memo, null),
    },
    include: { brand: true, manufacturer: true },
  });

  res.status(201).json(toCustomerResponse(relationship, perspective));
});

app.put("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const existing = await prisma.orgRelationship.findFirst({
    where: isManufacturerPerspective
      ? { id, manufacturerOrgId: organization.id }
      : { id, brandOrgId: organization.id },
    include: { brand: true, manufacturer: true },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  const { name, code, memo } = req.body ?? {};
  const targetOrganization = isManufacturerPerspective
    ? existing.brand
    : existing.manufacturer;
  const targetOrganizationId = isManufacturerPerspective
    ? existing.brandOrgId
    : existing.manufacturerOrgId;
  const nextTargetData = buildSharedCustomerOrganizationData(req.body ?? {}, targetOrganization);
  const normalizedCode =
    code !== undefined ? normalizeOrgCode(code) : undefined;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
  }

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: targetOrganizationId },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  await prisma.organization.update({
    where: { id: targetOrganizationId },
    data: {
      name: nextTargetData.name ?? targetOrganization?.name ?? "",
      nameKo: nextTargetData.nameKo,
      nameVi: nextTargetData.nameVi,
      ...(normalizedCode ? { code: normalizedCode } : {}),
      address: nextTargetData.address,
      country: nextTargetData.country,
      countryCode: nextTargetData.countryCode,
      phone: nextTargetData.phone,
      representative: nextTargetData.representative,
      email: nextTargetData.email,
    },
  });

  const relationshipUpdateData: any = {
    managerName: resolveOptionalString(nextTargetData.representative, existing.managerName),
    managerPhone: resolveOptionalString(nextTargetData.phone, existing.managerPhone),
    managerEmail: resolveOptionalString(nextTargetData.email, existing.managerEmail),
    memo: resolveOptionalString(memo, existing.memo),
    ...(req.body?.defaultSizeSetCode !== undefined
      ? {
          defaultSizeSetCode: normalizeCustomerDefaultSizeSetCode(
            req.body.defaultSizeSetCode
          ),
        }
      : {}),
    ...(code !== undefined ? { customerCode: normalizedCode } : {}),
  };
  await prisma.orgRelationship.update({
    where: { id: existing.id },
    data: relationshipUpdateData,
  });

  const refreshed = await prisma.orgRelationship.findUnique({
    where: { id: existing.id },
    include: { brand: true, manufacturer: true },
  });

  res.json(toCustomerResponse(refreshed, perspective));
});

app.put("/customers/:id/pricing", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const existing = await prisma.orgRelationship.findFirst({
    where:
      perspective === "MANUFACTURER"
        ? { id, manufacturerOrgId: organization.id }
        : { id, brandOrgId: organization.id },
    select: {
      id: true,
      pricingDefaultTradeType: true,
      pricingMatrix: true,
      updatedAt: true,
    },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  const normalizedPayload = normalizeCustomerPricingPayload(req.body ?? {});

  const updated = await prisma.orgRelationship.update({
    where: { id: existing.id },
    data: {
      pricingDefaultTradeType: normalizedPayload.defaultTradeType,
      pricingMatrix: normalizedPayload.rows,
    },
    select: {
      id: true,
      pricingDefaultTradeType: true,
      pricingMatrix: true,
      updatedAt: true,
    },
  });

  res.json(toCustomerPricingResponse(updated));
});

app.delete("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const perspective = resolveCustomerPerspective(organization);
  if (!perspective) {
    return res.status(400).json({
      ok: false,
      error: "invalid organization type",
    });
  }

  const isManufacturerPerspective = perspective === "MANUFACTURER";
  const existing = await prisma.orgRelationship.findFirst({
    where: isManufacturerPerspective
      ? { id, manufacturerOrgId: organization.id }
      : { id, brandOrgId: organization.id },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  await prisma.orgRelationship.delete({ where: { id: existing.id } });
  res.status(204).send();
});

app.get("/styles", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);
  const compact = req.query.compact === "1" || req.query.compact === "true";
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);
  const accessibleOwnerOrgIds = await getAccessibleStyleOwnerOrgIds(organization);
  const ownerScope =
    ownerOrgId === null
      ? accessibleOwnerOrgIds
      : accessibleOwnerOrgIds.includes(ownerOrgId)
        ? [ownerOrgId]
        : null;
  if (!ownerScope) {
    return res.status(403).json({ ok: false, error: "style access denied" });
  }

  const styles: any[] = compact
    ? await prisma.style.findMany({
        where: { orgId: { in: ownerScope } },
        orderBy: { id: "asc" },
        // Skip heavy BOM payload for list pages that only need summary/process data.
        select: {
          id: true,
          orgId: true,
          code: true,
          name: true,
          organization: {
            select: { id: true, name: true, nameKo: true, nameVi: true },
          },
          registrationDate: true,
          designer: true,
          collection: true,
          season: true,
          imageUrls: true,
          processes: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { workRecords: true } },
        },
      })
    : await prisma.style.findMany({
        where: { orgId: { in: ownerScope } },
        orderBy: { id: "asc" },
        include: {
          organization: {
            select: { id: true, name: true, nameKo: true, nameVi: true },
          },
          _count: { select: { workRecords: true } },
        },
      });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(styles, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();
  res.json(
    styles.map((style) =>
      toStyleResponse(style, { includeProcesses, processMirrorMap })
    )
  );
});

app.get("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const style = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!style) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([style], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  res.json(toStyleResponse(style, { includeProcesses, processMirrorMap }));
});

app.post("/styles", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const payload = normalizeStylePayload(req.body ?? {}, null, { includeProcesses });
  if (!payload.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  const duplicateProcess = findStyleProcessDuplicateIdentity(payload.processes);
  if (duplicateProcess) {
    return res.status(400).json({
      ok: false,
      error: createStyleProcessDuplicateError(duplicateProcess),
    });
  }
  const owner = await resolveStyleOwnerForCreateOrThrow({
    organization,
    payload: req.body ?? {},
  });
  payload.customer = owner.ownerOrgName || payload.customer;
  if (!payload.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: owner.ownerOrgId,
    name: payload.name,
    styleCode: payload.code,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: owner.ownerOrgId, code: payload.code },
  });
  if (existing) {
    return res
      .status(409)
      .json({ ok: false, error: "styleId already exists" });
  }

  const created = await prisma.$transaction(async (tx) => {
    const syncedProcesses = includeProcesses
      ? await syncProcessMasterFromStyleProcesses({
          processes: payload.processes,
          db: tx,
        })
      : payload.processes;
    const syncedDuplicateProcess = includeProcesses
      ? findStyleProcessDuplicateIdentity(syncedProcesses)
      : null;
    if (syncedDuplicateProcess) {
      throw createHttpError(
        400,
        createStyleProcessDuplicateError(syncedDuplicateProcess)
      );
    }

    const createdStyle = await tx.style.create({
      data: {
        orgId: owner.ownerOrgId,
        code: payload.code,
        name: payload.name,
        registrationDate: payload.registrationDate,
        designer: payload.designer,
        collection: payload.collection,
        season: payload.season,
        imageUrls: payload.imageUrls,
        // Style.processes JSON is no longer written; StyleProcess/StyleProcessStandard
        // (synced below via syncStyleProcessStorageForStyle) are the source of truth.
        processes: Prisma.JsonNull,
        bom: payload.bom,
        bomNotes: payload.bomNotes,
        revenueMemo: payload.revenueMemo,
      },
    });
    if (includeProcesses) {
      await syncStyleProcessStorageForStyle({
        styleId: createdStyle.id,
        orgId: organization.id,
        processes: syncedProcesses,
        db: tx,
      });
    }
    return tx.style.findUniqueOrThrow({
      where: { id: createdStyle.id },
      include: {
        organization: {
          select: { id: true, name: true, nameKo: true, nameVi: true },
        },
      },
    });
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([created], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  await rebuildAssignmentCardsForOrgIds(
    await resolveStyleSyncTargetOrgIds(owner.ownerOrgId)
  );
  res
    .status(201)
    .json(toStyleResponse(created, { includeProcesses, processMirrorMap }));
});

app.put("/styles/:styleId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const existing = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  // Style.processes JSON is no longer persisted (see Phase 2 above), so `existing.processes`
  // is not a usable "no change" fallback anymore. A request that omits `processes`
  // entirely means "leave the style's processes untouched", not "clear them".
  const processesProvided = includeProcesses && req.body?.processes !== undefined;

  const normalized = normalizeStylePayload(
    {
      code: req.body?.code ?? req.body?.styleCode ?? existing.code,
      name: req.body?.name ?? existing.name,
      customer: existing.organization?.name,
      registrationDate: req.body?.registrationDate ?? existing.registrationDate,
      designer: req.body?.designer ?? existing.designer,
      collection: req.body?.collection ?? existing.collection,
      season: req.body?.season ?? existing.season,
      imageUrls: req.body?.imageUrls ?? existing.imageUrls,
      processes: processesProvided ? req.body.processes : [],
      bom: req.body?.bom ?? existing.bom,
      bomNotes: req.body?.bomNotes ?? existing.bomNotes,
    },
    existing.code,
    { includeProcesses: true }
  );

  if (!normalized.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  const duplicateProcess = processesProvided
    ? findStyleProcessDuplicateIdentity(normalized.processes)
    : null;
  if (duplicateProcess) {
    return res.status(400).json({
      ok: false,
      error: createStyleProcessDuplicateError(duplicateProcess),
    });
  }

  const conflictMessage = await findStyleConflict({
    orgId: existing.orgId,
    name: normalized.name,
    styleCode: normalized.code,
    excludeStyleId: existing.id,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const syncedProcesses = processesProvided
      ? await syncProcessMasterFromStyleProcesses({
          processes: normalized.processes,
          db: tx,
        })
      : normalized.processes;
    const syncedDuplicateProcess = processesProvided
      ? findStyleProcessDuplicateIdentity(syncedProcesses)
      : null;
    if (syncedDuplicateProcess) {
      throw createHttpError(
        400,
        createStyleProcessDuplicateError(syncedDuplicateProcess)
      );
    }

    if (!processesProvided) {
      // The request isn't touching processes, but this style may still be a legacy
      // row whose only copy of its process data is the Style.processes JSON we're
      // about to clear below. Self-heal StyleProcess/StyleProcessStandard from that
      // JSON first (inside this same transaction, so a failure rolls back and the
      // JSON is never cleared without a successful relational backfill).
      await ensureStyleProcessStorageForStyles([existing], {
        processOrgId: organization.id,
        db: tx,
      });
    }

    const updatedStyle = await tx.style.update({
      where: { id: existing.id },
      data: {
        code: normalized.code,
        name: normalized.name,
        registrationDate: normalized.registrationDate,
        designer: normalized.designer,
        collection: normalized.collection,
        season: normalized.season,
        imageUrls: normalized.imageUrls,
        // Style.processes JSON is no longer written; StyleProcess/StyleProcessStandard
        // (synced above/below) are the source of truth. Explicitly clear any legacy
        // value instead of leaving a stale copy behind -- safe now that the branch
        // above guarantees relational rows exist before this write can commit.
        processes: Prisma.JsonNull,
        bom: normalized.bom,
        bomNotes: normalized.bomNotes,
      },
    });
    if (processesProvided) {
      await syncStyleProcessStorageForStyle({
        styleId: existing.id,
        orgId: organization.id,
        processes: syncedProcesses,
        db: tx,
      });
    }
    return tx.style.findUniqueOrThrow({
      where: { id: updatedStyle.id },
      include: {
        organization: {
          select: { id: true, name: true, nameKo: true, nameVi: true },
        },
      },
    });
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles([updated], {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  await rebuildAssignmentCardsForOrgIds(
    await resolveStyleSyncTargetOrgIds(existing.orgId)
  );
  res.json(toStyleResponse(updated, { includeProcesses, processMirrorMap }));
});

app.delete("/styles/:styleId", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }
  const ownerOrgId = parseStyleOwnerOrgIdQuery(req.query.ownerOrgId);

  const existing = await resolveStyleByIdForAccess({
    organization,
    styleId,
    ownerOrgId,
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }
  if (existing.orgId !== organization.id) {
    return res
      .status(403)
      .json({ ok: false, error: "only owner organization can delete style" });
  }

  const inUseWorkRecord = await prisma.workRecord.findFirst({
    where: {
      styleId: existing.id,
    },
    select: { id: true },
  });
  if (inUseWorkRecord) {
    return res.status(409).json({
      ok: false,
      error: "작업기록이 존재해서 삭제할 수 없습니다.",
    });
  }

  const inUseOrderItem = await prisma.workOrderItem.findFirst({
    where: {
      styleId: existing.id,
      workOrder: {
        OR: [{ orgId: existing.orgId }, { buyerOrgId: existing.orgId }],
      },
    },
    select: {
      workOrder: { select: { orderId: true, orderNumber: true } },
    },
  });
  if (inUseOrderItem) {
    const orderLabel = inUseOrderItem.workOrder.orderNumber || inUseOrderItem.workOrder.orderId;
    return res.status(409).json({
      ok: false,
      error: `style is used by order ${orderLabel}`,
    });
  }

  try {
    await prisma.style.delete({
      where: { id: existing.id },
    });
    res.status(204).send();
  } catch (error) {
    // P2025 = Record to delete does not exist.
    if (getErrorCode(error) === "P2025") {
      return res.status(404).json({ ok: false, error: "style not found" });
    }
    res.status(500).json({ ok: false, error: "failed to delete style" });
  }
});

app.post("/styles/import", async (req, res) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!accessContext) return;
  const { organization } = accessContext;
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const rows = Array.isArray(req.body?.styles) ? req.body.styles : [];
  if (rows.length === 0) {
    return res.status(400).json({ ok: false, error: "styles is required" });
  }

  const normalizedRows = rows
    .map((item: any, rowIndex: number) => ({
      rowIndex,
      raw: item,
      normalized: normalizeStylePayload(item, null, { includeProcesses }),
    }))
    .filter((item: any) => {
      if (!item.normalized?.name) return false;
      if (item.normalized?.customer) return true;
      const customerOrgId = toPositiveIntOrNull(
        item.raw?.customerOrgId ?? item.raw?.buyerOrgId ?? item.raw?.customerId
      );
      return customerOrgId !== null;
    });

  if (normalizedRows.length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "no valid styles to import" });
  }
  for (const item of normalizedRows) {
    const duplicateProcess = findStyleProcessDuplicateIdentity(
      item.normalized.processes
    );
    if (duplicateProcess) {
      return res.status(400).json({
        ok: false,
        error: createStyleProcessDuplicateError(
          duplicateProcess,
          `styles[${item.rowIndex}].processes`
        ),
      });
    }
  }

  const rowsWithOwner = await Promise.all(
    normalizedRows.map(async (item: any) => {
      const owner = await resolveStyleOwnerForCreateOrThrow({
        organization,
        payload: item.raw ?? item.normalized,
      });
      return {
        ...item.normalized,
        customer: owner.ownerOrgName || item.normalized.customer,
        ownerOrgId: owner.ownerOrgId,
      };
    })
  );

  const seenNameKeys = new Set();
  const seenCodeKeys = new Set();
  for (const item of rowsWithOwner) {
    const nameKey = `${item.ownerOrgId}:${toStyleIdentityKey(null, item.name)}`;
    if (seenNameKeys.has(nameKey)) {
      return res.status(409).json({
        ok: false,
        error: "style name already exists for this customer",
      });
    }
    seenNameKeys.add(nameKey);

    const codeKey = `${item.ownerOrgId}:${toStyleIdentityKey(null, item.code)}`;
    if (seenCodeKeys.has(codeKey)) {
      return res.status(409).json({
        ok: false,
        error: "style code already exists for this customer",
      });
    }
    seenCodeKeys.add(codeKey);
  }

  const uniqueOwnerOrgIds = Array.from(
    new Set(rowsWithOwner.map((item: any) => item.ownerOrgId))
  );
  const uniqueStyleCodes = Array.from(
    new Set(rowsWithOwner.map((item: any) => item.code))
  );
  const existingStyleRows = await prisma.style.findMany({
    where: {
      orgId: { in: uniqueOwnerOrgIds },
      code: { in: uniqueStyleCodes },
    },
    select: { id: true, code: true, orgId: true },
  });
  const existingStyleIdByOwnerCode = new Map(
    existingStyleRows.map((row) => [`${row.orgId}:${row.code}`, row.id])
  );

  for (const item of rowsWithOwner) {
    const conflictMessage = await findStyleConflict({
      orgId: item.ownerOrgId,
      name: item.name,
      styleCode: item.code,
      excludeStyleId:
        existingStyleIdByOwnerCode.get(`${item.ownerOrgId}:${item.code}`) ??
        null,
    });
    if (conflictMessage) {
      return res.status(409).json({ ok: false, error: conflictMessage });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of rowsWithOwner) {
      const { ownerOrgId, customer: _customer, ...stylePayload } = item;
      const syncedProcesses = includeProcesses
        ? await syncProcessMasterFromStyleProcesses({
            processes: stylePayload.processes,
            db: tx,
          })
        : stylePayload.processes;
      const syncedDuplicateProcess = includeProcesses
        ? findStyleProcessDuplicateIdentity(syncedProcesses)
        : null;
      if (syncedDuplicateProcess) {
        throw createHttpError(
          400,
          createStyleProcessDuplicateError(
            syncedDuplicateProcess,
            `styles[${stylePayload.code}].processes`
          )
        );
      }

      const upserted = await tx.style.upsert({
        where: {
          orgId_code: {
            orgId: ownerOrgId,
            code: stylePayload.code,
          },
        },
        update: {
          code: stylePayload.code,
          name: stylePayload.name,
          registrationDate: stylePayload.registrationDate,
          designer: stylePayload.designer,
          collection: stylePayload.collection,
          season: stylePayload.season,
          imageUrls: stylePayload.imageUrls,
          // Style.processes JSON is no longer written; StyleProcess/StyleProcessStandard
          // (synced below via syncStyleProcessStorageForStyle) are the source of truth.
          processes: Prisma.JsonNull,
          bom: stylePayload.bom,
          bomNotes: stylePayload.bomNotes,
        },
        create: {
          orgId: ownerOrgId,
          ...stylePayload,
          processes: Prisma.JsonNull,
        },
      });
      if (includeProcesses) {
        await syncStyleProcessStorageForStyle({
          styleId: upserted.id,
          orgId: organization.id,
          processes: syncedProcesses,
          db: tx,
        });
      }
    }
  });

  const imported = await prisma.style.findMany({
    where: { orgId: { in: uniqueOwnerOrgIds } },
    include: {
      organization: {
        select: { id: true, name: true, nameKo: true, nameVi: true },
      },
    },
    orderBy: { id: "asc" },
  });
  const processMirrorMap = includeProcesses
    ? await ensureStyleProcessStorageForStyles(imported, {
        processOrgId: organization.id,
      })
    : new Map<number, any[]>();

  const syncTargetOrgIds = (
    await Promise.all(uniqueOwnerOrgIds.map((orgId) => resolveStyleSyncTargetOrgIds(orgId)))
  ).flat();
  await rebuildAssignmentCardsForOrgIds(syncTargetOrgIds);
  res.status(201).json(
    imported.map((style) =>
      toStyleResponse(style, { includeProcesses, processMirrorMap })
    )
  );
});

app.get("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const canManageProcesses = isManufacturerOrg(organization);
  const includeColors =
    !["0", "false"].includes(String(req.query.includeColors ?? "").trim().toLowerCase());
  const includeCategories =
    !["0", "false"].includes(String(req.query.includeCategories ?? "").trim().toLowerCase());
  const includeRoles =
    !["0", "false"].includes(String(req.query.includeRoles ?? "").trim().toLowerCase());
  const includeProcesses =
    canManageProcesses &&
    !["0", "false"].includes(String(req.query.includeProcesses ?? "").trim().toLowerCase());
  await seedAttributesIfEmpty(organization.id, {
    includeColors,
    includeCategories,
    // Keep process master deletion persistent; do not auto-reseed processes on read.
    includeProcesses: false,
  });

  const [colors, categories, roles, processes] = await Promise.all([
    includeColors
      ? prisma.attrColor.findMany({
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    includeCategories
      ? listGlobalCategorySection(organization.id)
      : Promise.resolve([]),
    includeRoles
      ? ensureDefaultEmployeeRoles(organization.id).then((items) =>
          items.filter((item) => isWorkerEmployeeRoleCode(item.code)).map(toAttrRoleResponse)
        )
      : Promise.resolve([]),
    includeProcesses
      ? prisma.attrProcess.findMany({
          where: { orgId: organization.id },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);

  res.json({
    colors,
    categories,
    roles,
    processes,
    canManageProcesses,
  });
});

app.get("/process-master-options", async (req, res) => {
  const requesterEmail = getRequesterEmail(req);
  if (!requesterEmail) {
    return res.status(401).json({ ok: false, error: "request user email is required" });
  }

  const systemUser = await prisma.systemUser.findUnique({
    where: { email: requesterEmail },
    select: { systemRole: true },
  });
  const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
  if (!isSystemAdmin) {
    const accessContext = await requireOrgRole(req, res, {
      allowedRoles: ORG_MANAGEMENT_ROLES,
      allowSystemAdmin: false,
    });
    if (!accessContext) return;
  }

  await ensureProcessMasterOptionTypeSchemaReady();
  await ensureProcessMasterOptionRelationSchemaReady();
  const rows = await listProcessMasterOptions();
  const relations = await listProcessMasterOptionRelations();
  const usageConflicts = await findProcessMasterDeletionUsageConflicts(rows);
  return res.json(
    buildProcessMasterOptionsResponse(rows, relations, usageConflicts)
  );
});

app.put("/process-master-options", async (req, res, next) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  try {
    await ensureProcessMasterOptionTypeSchemaReady();
    await ensureProcessMasterOptionRelationSchemaReady();
    const payload = req.body ?? {};
    const rows = await syncProcessMasterOptions(payload);
    const relations = await syncProcessMasterRelations({
      payload,
      processMasterRows: rows,
    });
    const usageConflicts = await findProcessMasterDeletionUsageConflicts(rows);
    await syncStyleProcessCompositionNamesWithMasterOptions({
      processMasterRows: rows,
    });
    return res.json(
      buildProcessMasterOptionsResponse(rows, relations, usageConflicts)
    );
  } catch (error) {
    if (isProcessMasterOptionInUseError(error)) {
      const usageCount = Number(error.usageCount || 0);
      const conflicts = Array.isArray(error.conflicts)
        ? error.conflicts.map((item) => ({
            id: toPositiveIntOrNull(item?.id),
            type: normalizeProcessMasterType(item?.type),
            code: normalizeProcessMasterCode(item?.code),
            label: normalizeProcessMasterLabel(item?.label),
            nameKo: normalizeProcessMasterLabel(item?.nameKo),
            nameEn: normalizeProcessMasterLabel(item?.nameEn),
            nameVi: normalizeProcessMasterLabel(item?.nameVi),
            styleProcessCount: Number(item?.styleProcessCount || 0),
            referenceCount: Number(item?.referenceCount || 0),
            sampleStyleProcessIds: ensureArray(item?.sampleStyleProcessIds)
              .map((id) => toPositiveIntOrNull(id))
              .filter((id): id is number => id !== null),
          }))
        : [];

      return res.status(409).json({
        ok: false,
        reason: "PROCESS_MASTER_OPTION_IN_USE",
        usageCount,
        conflicts,
        error: getErrorMessage(
          error,
          "사용 중인 공정 항목은 삭제할 수 없습니다."
        ),
      });
    }
    return next(error);
  }
});

app.post("/attributes/colors", async (req, res) => {
  const systemAdmin = await requireSystemAdmin(req, res);
  if (!systemAdmin) return;

  const { name, nameKo, nameEn, nameVi } = resolveManagedColorNameData(req.body ?? {});
  const code = resolveOptionalString(req.body?.code, null);
  if (!name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const existingCodes = await prisma.attrColor.findMany({
    select: { code: true },
  });
  const usedCodes = existingCodes.reduce((set: Set<string>, item) => {
    const trackedCode = normalizeManagedAttributeCode(item.code);
    if (trackedCode) {
      set.add(trackedCode);
    }
    return set;
  }, new Set<string>());

  const nextCode = resolveColorAttributeCode({ code, name, usedCodes });
  const created = await prisma.attrColor.create({
    data: {
      code: nextCode,
      name,
      nameKo,
      nameEn,
      nameVi,
    },
  });

  res.status(201).json(created);
});

app.put("/attributes", async (req, res) => {
  const payload = req.body ?? {};
  const includesColors = payload.colors !== undefined;
  const includesCategories = payload.categories !== undefined;
  const includesRoles = payload.roles !== undefined;
  const includesProcesses = payload.processes !== undefined;
  const isProcessOnlyPayload =
    includesProcesses && !includesColors && !includesCategories && !includesRoles;

  let accessContext: Awaited<ReturnType<typeof requireOrgRole>> | null = null;
  if (isProcessOnlyPayload) {
    accessContext = await requireOrgRole(req, res, {
      allowedRoles: ORG_MANAGEMENT_ROLES,
      allowSystemAdmin: true,
    });
    if (!accessContext) return;
  } else {
    const systemAdmin = await requireSystemAdmin(req, res);
    if (!systemAdmin) return;
  }

  const organization =
    accessContext?.organization ??
    (await getOrganizationByQuery(req));
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  const includeProcesses = isManufacturerOrg(organization);

  const tasks = [];
  const response: {
    colors?: any[];
    categories?: any[];
    roles?: any[];
    processes?: any[];
  } = {};

  if (payload.colors) {
    tasks.push(
      syncGlobalColorSection(payload.colors).then(async (data) => {
        response.colors = data;
        const assignmentOrgIds = (
          await prisma.organization.findMany({
            where: {
              type: { in: ["MANUFACTURER", "BRAND"] },
            },
            select: { id: true },
          })
        ).map((item) => item.id);
        await rebuildAssignmentCardsForOrgIds(assignmentOrgIds);
      })
    );
  }
  if (payload.categories) {
    tasks.push(
      syncGlobalCategorySection(payload.categories, { fallbackOrgId: organization.id }).then(
        (data) => {
          response.categories = data;
        }
      )
    );
  }
  if (payload.roles) {
    tasks.push(
      syncRoleSection(organization.id, payload.roles).then((data) => {
        response.roles = data;
      })
    );
  }
  if (payload.processes) {
    if (!includeProcesses) {
      return res.status(403).json({
        ok: false,
        error: "brand organizations cannot manage processes",
      });
    }
    tasks.push(
      syncSection(prisma.attrProcess, organization.id, payload.processes, {
        resolveNameData: resolveManagedProcessNameData,
      }).then(
        async (data) => {
          response.processes = data;
          await syncStyleProcessNamesFromMaster({
            orgId: organization.id,
            processes: data,
          });
        }
      )
    );
  }

  await Promise.all(tasks);

  res.json(response);
});

app.get("/at-sync/status", async (req, res) => {
  const access = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!access) return;

  const mode = String(req.query?.mode ?? "")
    .trim()
    .toLowerCase();
  const explicitTrainingMonthKey = normalizeMonthKey(req.query?.trainingMonthKey);
  const hasTrainingMonthField = req.query?.trainingMonthKey !== undefined;

  if (hasTrainingMonthField && !explicitTrainingMonthKey) {
    return res.status(400).json({
      ok: false,
      error: "trainingMonthKey must be YYYY-MM",
    });
  }

  if (
    mode &&
    mode !== "auto" &&
    mode !== "current" &&
    mode !== "previous"
  ) {
    return res.status(400).json({
      ok: false,
      error: "mode must be one of: auto, current, previous",
    });
  }

  const todayKey = toDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
  const currentMonthKey = normalizeMonthKey(todayKey.slice(0, 7));
  const previousMonthKey = currentMonthKey ? shiftMonthKey(currentMonthKey, -1) : "";
  const overrideTrainingMonthKey =
    explicitTrainingMonthKey ||
    (mode === "current" ? currentMonthKey : "") ||
    (mode === "previous" ? previousMonthKey : "") ||
    "";
  const status = await buildAtSyncStatusForOrg(access.organization.id, {
    trainingMonthKey: overrideTrainingMonthKey,
  });

  return res.json({
    ok: true,
    orgId: access.organization.id,
    mode: mode || (overrideTrainingMonthKey ? "override" : "auto"),
    runtimeMarker: AT_SYNC_RUNTIME_MARKER,
    ...status,
  });
});

app.post("/at-sync/run-now", async (req, res) => {
  const access = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!access) return;

  const mode = String(req.body?.mode ?? "")
    .trim()
    .toLowerCase();
  const debug = req.body?.debug === true;
  const explicitTrainingMonthKey = normalizeMonthKey(req.body?.trainingMonthKey);
  const hasTrainingMonthField = req.body?.trainingMonthKey !== undefined;

  if (hasTrainingMonthField && !explicitTrainingMonthKey) {
    return res.status(400).json({
      ok: false,
      error: "trainingMonthKey must be YYYY-MM",
    });
  }

  if (
    mode &&
    mode !== "auto" &&
    mode !== "current" &&
    mode !== "previous"
  ) {
    return res.status(400).json({
      ok: false,
      error: "mode must be one of: auto, current, previous",
    });
  }

  const todayKey = toDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
  const currentMonthKey = normalizeMonthKey(todayKey.slice(0, 7));
  const previousMonthKey = currentMonthKey ? shiftMonthKey(currentMonthKey, -1) : "";

  const overrideTrainingMonthKey =
    explicitTrainingMonthKey ||
    (mode === "current" ? currentMonthKey : "") ||
    (mode === "previous" ? previousMonthKey : "") ||
    "";

  const resolvedTrainingMonthKey = resolveAtSyncTrainingMonthKey({
    trainingMonthKey: overrideTrainingMonthKey,
  });
  const startedAt = Date.now();
  const result = await syncStyleProcessActualTimesFromWorkRecords(access.organization.id, {
    trainingMonthKey: overrideTrainingMonthKey,
    debug,
  });

  return res.json({
    ok: true,
    orgId: access.organization.id,
    mode: mode || (overrideTrainingMonthKey ? "override" : "auto"),
    runtimeMarker: AT_SYNC_RUNTIME_MARKER,
    trainingMonthKey: resolvedTrainingMonthKey,
    updatedStyles: Number(result?.updatedStyles || 0),
    updatedProcesses: Number(result?.updatedProcesses || 0),
    reason: resolveOptionalString(result?.reason, null) || "done",
    durationMs: Date.now() - startedAt,
    ...(debug && result?.diagnostics ? { diagnostics: result.diagnostics } : {}),
  });
});

// ─── Payroll ───────────────────────────────────────────────────────────────

app.post("/at-sync/reset", async (req, res) => {
  const access = await requireOrgRole(req, res, {
    allowedRoles: ORG_MANAGEMENT_ROLES,
  });
  if (!access) return;

  const startedAt = Date.now();
  const result = await resetAtTrainingStateForOrg(access.organization.id);
  const todayKey = toDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
  const currentMonthKey = normalizeMonthKey(todayKey.slice(0, 7));
  const previousMonthKey = currentMonthKey ? shiftMonthKey(currentMonthKey, -1) : "";
  const status = await buildAtSyncStatusForOrg(access.organization.id, {
    trainingMonthKey: previousMonthKey,
  });

  return res.json({
    ok: true,
    orgId: access.organization.id,
    runtimeMarker: AT_SYNC_RUNTIME_MARKER,
    durationMs: Date.now() - startedAt,
    ...result,
    status,
  });
});

app.use(payrollRouter);
app.use(quantitySettlementRouter);

// ───────────────────────────────────────────────────────────────────────────

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const errorRecord = toErrorRecord(error);
  const prismaErrorCode = getErrorCode(error);
  const prismaMeta =
    errorRecord && typeof errorRecord.meta === "object" && errorRecord.meta !== null
      ? (errorRecord.meta as Record<string, unknown>)
      : null;
  const prismaErrorTargetRaw = prismaMeta?.target;
  const prismaErrorTarget = Array.isArray(prismaErrorTargetRaw)
    ? prismaErrorTargetRaw.map((item) => String(item))
    : [String(prismaErrorTargetRaw || "")];
  const prismaConstraint = String(prismaMeta?.constraint || "");
  const hasCompositeTargetFields =
    prismaErrorTarget.includes("orgId") &&
    prismaErrorTarget.includes("customerId") &&
    prismaErrorTarget.includes("orderNumber");
  const hasSharedOrderTargetFields =
    prismaErrorTarget.includes("buyerOrgId") &&
    prismaErrorTarget.includes("sellerOrgId") &&
    prismaErrorTarget.includes("orderNumber");
  const hasAttributeCodeTargetFields =
    prismaErrorTarget.includes("orgId") &&
    prismaErrorTarget.includes("code");
  const hasGlobalColorCodeTargetField =
    prismaErrorTarget.includes("code") &&
    !prismaErrorTarget.includes("orgId");
  const isOrderNumberByPairUniqueError =
    prismaErrorCode === "P2002" &&
    (hasSharedOrderTargetFields ||
      prismaErrorTarget.some((item) =>
        /WorkOrder_.*buyerOrgId.*sellerOrgId.*orderNumber.*_key/i.test(item)
      ));
  if (isOrderNumberByPairUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "order already exists for this buyer/seller pair",
    });
  }
  const isOrderNumberByCustomerUniqueError =
    prismaErrorCode === "P2002" &&
    (hasCompositeTargetFields ||
      prismaErrorTarget.some((item) =>
        /WorkOrder_orgId_customerId_orderNumber_key/i.test(item)
      ));
  if (isOrderNumberByCustomerUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "order number already exists for this customer",
    });
  }
  const isGlobalColorCodeUniqueError =
    prismaErrorCode === "P2002" &&
    (hasGlobalColorCodeTargetField ||
      prismaErrorTarget.some((item) => /AttrColor_code_key/i.test(item)));
  if (isGlobalColorCodeUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "color code already exists",
    });
  }
  const isAttributeCodeUniqueError =
    prismaErrorCode === "P2002" &&
    (hasAttributeCodeTargetFields ||
      prismaErrorTarget.some((item) =>
        /Attr(Category|Role|Process)_orgId_code_key/i.test(item)
      ));
  if (isAttributeCodeUniqueError) {
    return res.status(409).json({
      ok: false,
      error: "attribute code already exists in this organization",
    });
  }
  if (prismaErrorCode === "P2002") {
    return res.status(409).json({
      ok: false,
      error: "same data already exists. Refresh and try again",
    });
  }
  const isForeignKeyConstraintError = prismaErrorCode === "P2003";
  if (isForeignKeyConstraintError) {
    if (/WorkOrderItem_styleId_fkey/i.test(prismaConstraint)) {
      return res.status(409).json({
        ok: false,
        error:
          "one or more selected styles are out of date. Re-select the style and save again",
      });
    }
    if (/WorkOrderItem_colorId_fkey/i.test(prismaConstraint)) {
      return res.status(409).json({
        ok: false,
        error:
          "one or more selected colors are out of date. Re-select the color and save again",
      });
    }
    if (
      /WorkOrder_(buyerOrgId|sellerOrgId|customerId)_fkey/i.test(prismaConstraint)
    ) {
      return res.status(409).json({
        ok: false,
        error:
          "linked buyer or seller information is out of date. Refresh and try again",
      });
    }
    return res.status(409).json({
      ok: false,
      error: "linked data is out of date. Refresh and try again",
    });
  }
  if (prismaErrorCode === "P2025") {
    return res.status(404).json({
      ok: false,
      error: "the requested record no longer exists. Refresh and try again",
    });
  }
  if (prismaErrorCode === "P2034") {
    return res.status(409).json({
      ok: false,
      error: "another update completed first. Refresh and try again",
    });
  }
  const rawErrorMessage = getErrorMessage(error, String(error));
  const workLogTrace = (req as any)?.__workLogTrace;
  const workLogRequestId = resolveOptionalString(workLogTrace?.requestId, null);
  if (workLogRequestId) {
    res.setHeader("X-WorkLog-Request-Id", workLogRequestId);
  }
  const respondWithTrackedError = (
    statusCode: number,
    body: Record<string, unknown>
  ) => {
    if (workLogRequestId && body.requestId === undefined) {
      return res.status(statusCode).json({
        ...body,
        requestId: workLogRequestId,
      });
    }
    return res.status(statusCode).json(body);
  };
  if (workLogTrace && typeof workLogTrace === "object") {
    console.error(
      `[work-logs:${String(workLogTrace.mode || "unknown")}] req=${String(
        workLogTrace.requestId || "unknown"
      )} failed at step=${String(workLogTrace.step || "unknown")}`,
      {
        method: req.method,
        path: req.originalUrl,
        workLogId: workLogTrace.workLogId ?? null,
        status: getErrorStatus(error),
        code: getErrorCode(error),
        message: rawErrorMessage,
        payloadSummary: workLogTrace.payloadSummary ?? null,
      }
    );
  }
  if (prismaErrorCode === "P2022") {
    const missingColumn = resolveOptionalString((error as any)?.meta?.column, null);
    const suffix = missingColumn ? ` (missing column: ${missingColumn})` : "";
    return res.status(503).json({
      ok: false,
      error:
        `server database schema is out of sync with backend code${suffix}. ` +
        `Apply migration_fix.sql and redeploy backend, then retry`,
    });
  }
  if (prismaErrorCode === "P2021") {
    const missingTableMessage =
      /QuantitySettlementSnapshot/i.test(rawErrorMessage)
        ? "quantity settlement storage is not ready on server. Apply the backend database update first"
        : "server database schema is missing a required table. Update the backend and database schema, then try again";
    return res.status(503).json({
      ok: false,
      error: missingTableMessage,
    });
  }
  if (prismaErrorCode === "P2011") {
    return res.status(400).json({
      ok: false,
      error: "required data is missing. Check the form and try again",
    });
  }
  if (
    /invalid input value for enum\s+"?WorkOrderStatus"?/i.test(rawErrorMessage) &&
    /EDITING/i.test(rawErrorMessage)
  ) {
    return res.status(409).json({
      ok: false,
      error:
        "order status schema is out of date on the server. Retry after backend migration/deploy sync",
    });
  }

  const normalizedRequestPath = String(
    String(req.originalUrl || "").split("?")[0] || ""
  ).trim();
  if (
    normalizedRequestPath === "/assignment-plans" ||
    normalizedRequestPath === "/assignment-plan-progress"
  ) {
    if (/WorkRecord|work record|work log/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked work log rows. Check work log and assignment connections first",
      });
    }
    if (/WorkOrder|order|Style|style/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked order or style rows. Check order and style setup first",
      });
    }
    if (/Line|Factory|lineId|factoryId/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is missing linked line or factory rows. Check organization setup first",
      });
    }
    if (/AssignmentPlan|AssignmentBoardState|assignment plan|assignment board|cardId|externalId/i.test(rawErrorMessage)) {
      return res.status(409).json({
        ok: false,
        error:
          "production batch data is incomplete. Check assignment plan and board source data first",
      });
    }
  }
  if (/^\/assignment-plans\/[^/]+\/qc-history$/i.test(normalizedRequestPath)) {
    return res.status(409).json({
      ok: false,
      error:
        "qc history data is incomplete. Check batch, color, and qc event references first",
    });
  }
  if (
    normalizedRequestPath === "/qc-pass-events" ||
    /^\/qc-pass-events\/[^/]+\/cancel$/i.test(normalizedRequestPath)
  ) {
    return res.status(409).json({
      ok: false,
      error:
        "qc event could not be processed because linked batch or reference data is missing",
    });
  }

  const status = getErrorStatus(error);
  if (status !== null) {
    return respondWithTrackedError(status, {
      ok: false,
      error: getErrorMessage(error, "request failed"),
    });
  }
  console.error(`[api] ${req.method} ${req.originalUrl}`, error);
  return respondWithTrackedError(500, {
    ok: false,
    error: "internal server error",
  });
});

const port = Number(process.env.PORT) || 4000;
const host = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const AT_AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const AT_AUTO_SYNC_DB_LOCK_NAMESPACE = 20260223;
const AT_AUTO_SYNC_DB_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const AT_AUTO_SYNC_JOB_KEY = "AT_SYNC";
let atAutoSyncTimer: NodeJS.Timeout | null = null;
let atAutoSyncInProgress = false;
let atAutoSyncLastTrainingMonthKey: string | null = null;
let atAutoSyncRunHistoryTableReady = false;
let atAutoSyncRunHistoryTableUnsupported = false;
let workRecordCanonicalSchemaReady = false;
let organizationLocalizationColumnsReady = false;
let workOrderLocalizationColumnsReady = false;
let styleLocalizationColumnsReady = false;

const ensureOrganizationLocalizationColumnsReady = async () => {
  if (organizationLocalizationColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "nameKo" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "nameVi" TEXT
  `);
  organizationLocalizationColumnsReady = true;
};

const ensureWorkOrderLocalizationColumnsReady = async () => {
  if (workOrderLocalizationColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "WorkOrder"
      DROP COLUMN IF EXISTS "buyerOrgName",
      DROP COLUMN IF EXISTS "buyerOrgNameKo",
      DROP COLUMN IF EXISTS "buyerOrgNameVi",
      DROP COLUMN IF EXISTS "sellerOrgName",
      DROP COLUMN IF EXISTS "customerName"
  `);
  workOrderLocalizationColumnsReady = true;
};

const ensureStyleLocalizationColumnsReady = async () => {
  if (styleLocalizationColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Style" DROP CONSTRAINT IF EXISTS "Style_orgId_customer_name_key"
  `);
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "Style_orgId_customer_name_key"
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_name_key"
      ON "Style"("orgId", "name")
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Style"
      DROP COLUMN IF EXISTS "customer",
      DROP COLUMN IF EXISTS "customerNameKo",
      DROP COLUMN IF EXISTS "customerNameVi"
  `);
  styleLocalizationColumnsReady = true;
};

type AutoAtSyncSummary = {
  manufacturerCount: number;
  totalUpdatedStyles: number;
  totalUpdatedProcesses: number;
};

type AutoAtSyncExecutionResult = {
  executed: boolean;
  reason: "done" | "already_completed" | "locked_by_other_instance";
  summary: AutoAtSyncSummary;
};

const ensureWorkRecordCanonicalSchemaReady = async () => {
  if (workRecordCanonicalSchemaReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "WorkRecord"
      ADD COLUMN IF NOT EXISTS "lineId" INTEGER,
      ADD COLUMN IF NOT EXISTS "effectiveCoverageStartDate" TEXT,
      ADD COLUMN IF NOT EXISTS "effectiveCoverageEndDate" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
      ON "WorkRecord"("orgId", "lineId")
  `);
  workRecordCanonicalSchemaReady = true;
};

const ensureAtAutoSyncRunHistoryTable = async () => {
  if (atAutoSyncRunHistoryTableReady) return true;
  if (atAutoSyncRunHistoryTableUnsupported) return false;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SchedulerRunHistory" (
        "jobKey" TEXT NOT NULL,
        "monthKey" TEXT NOT NULL,
        "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("jobKey", "monthKey")
      )
    `);
    atAutoSyncRunHistoryTableReady = true;
    return true;
  } catch (error: unknown) {
    atAutoSyncRunHistoryTableUnsupported = true;
    console.warn(
      `[AT sync][scheduler] db run-history disabled: ${getErrorMessage(error, String(error))}`
    );
    return false;
  }
};

const toAtAutoSyncLockKey = (trainingMonthKey: string) => {
  const normalized = String(trainingMonthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return year * 100 + month;
};

const runAutoAtSyncAcrossManufacturers = async (): Promise<AutoAtSyncSummary> => {
  const manufacturerRows = await prisma.organization.findMany({
    where: { type: "MANUFACTURER" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let totalUpdatedStyles = 0;
  let totalUpdatedProcesses = 0;
  for (const row of manufacturerRows) {
    const result = await syncStyleProcessActualTimesFromWorkRecords(row.id);
    totalUpdatedStyles += Number(result?.updatedStyles || 0);
    totalUpdatedProcesses += Number(result?.updatedProcesses || 0);
  }

  return {
    manufacturerCount: manufacturerRows.length,
    totalUpdatedStyles,
    totalUpdatedProcesses,
  };
};

const runAutoAtSyncWithDbLock = async (
  trainingMonthKey: string
): Promise<AutoAtSyncExecutionResult> => {
  const lockKey = toAtAutoSyncLockKey(trainingMonthKey);
  if (lockKey === null) {
    const summary = await runAutoAtSyncAcrossManufacturers();
    return { executed: true, reason: "done", summary };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(CAST(${AT_AUTO_SYNC_DB_LOCK_NAMESPACE} AS integer), CAST(${lockKey} AS integer)) AS acquired`
      );
      if (lockRows[0]?.acquired !== true) {
        return {
          executed: false,
          reason: "locked_by_other_instance" as const,
          summary: {
            manufacturerCount: 0,
            totalUpdatedStyles: 0,
            totalUpdatedProcesses: 0,
          },
        };
      }

      const completedRows = await tx.$queryRaw<Array<{ completed: boolean }>>(
        Prisma.sql`SELECT TRUE AS completed FROM "SchedulerRunHistory" WHERE "jobKey" = ${AT_AUTO_SYNC_JOB_KEY} AND "monthKey" = ${trainingMonthKey} LIMIT 1`
      );
      if (completedRows[0]?.completed === true) {
        return {
          executed: false,
          reason: "already_completed" as const,
          summary: {
            manufacturerCount: 0,
            totalUpdatedStyles: 0,
            totalUpdatedProcesses: 0,
          },
        };
      }

      const summary = await runAutoAtSyncAcrossManufacturers();
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "SchedulerRunHistory" ("jobKey", "monthKey", "completedAt") VALUES (${AT_AUTO_SYNC_JOB_KEY}, ${trainingMonthKey}, NOW()) ON CONFLICT ("jobKey", "monthKey") DO NOTHING`
      );

      return { executed: true, reason: "done" as const, summary };
    },
    { timeout: AT_AUTO_SYNC_DB_LOCK_TIMEOUT_MS }
  );

  return result;
};

const runAutoAtSyncIfDue = async (trigger: "startup" | "interval") => {
  if (atAutoSyncInProgress) return;

  const now = new Date();
  const todayKey = toDateKeyInTimeZone(now, BUSINESS_TIME_ZONE);
  const todayParts = todayKey ? parseDateKeyParts(todayKey) : null;
  if (!todayParts) return;
  if (todayParts.day < AT_TRAINING_CUTOFF_DAY) return;

  const trainingMonthKey = resolveAtTrainingMonthKey({
    now,
    timeZone: BUSINESS_TIME_ZONE,
    cutoffDay: AT_TRAINING_CUTOFF_DAY,
  });
  if (!trainingMonthKey) return;
  if (atAutoSyncLastTrainingMonthKey === trainingMonthKey) return;

  atAutoSyncInProgress = true;
  try {
    const canUseDbLock = await ensureAtAutoSyncRunHistoryTable();
    if (!canUseDbLock) {
      const summary = await runAutoAtSyncAcrossManufacturers();
      atAutoSyncLastTrainingMonthKey = trainingMonthKey;
      console.log(
        `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} mode=in_memory manufacturers=${summary.manufacturerCount} updatedStyles=${summary.totalUpdatedStyles} updatedProcesses=${summary.totalUpdatedProcesses}`
      );
      return;
    }

    const result = await runAutoAtSyncWithDbLock(trainingMonthKey);
    if (!result.executed) {
      if (result.reason === "already_completed") {
        atAutoSyncLastTrainingMonthKey = trainingMonthKey;
      }
      console.log(
        `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} skipped=${result.reason}`
      );
      return;
    }

    atAutoSyncLastTrainingMonthKey = trainingMonthKey;
    console.log(
      `[AT sync][scheduler:${trigger}] month=${trainingMonthKey} mode=db_lock manufacturers=${result.summary.manufacturerCount} updatedStyles=${result.summary.totalUpdatedStyles} updatedProcesses=${result.summary.totalUpdatedProcesses}`
    );
  } catch (error: unknown) {
    console.error(
      `[AT sync][scheduler:${trigger}] failed:`,
      getErrorMessage(error, String(error))
    );
  } finally {
    atAutoSyncInProgress = false;
  }
};

const startAutoAtSyncScheduler = () => {
  if (!AT_AUTO_SYNC_ENABLED) {
    console.log("[AT sync][scheduler] disabled (manual trigger only)");
    return;
  }
  if (atAutoSyncTimer) return;
  runAutoAtSyncIfDue("startup").catch((error: unknown) => {
    console.error(
      "[AT sync][scheduler:startup] failed:",
      getErrorMessage(error, String(error))
    );
  });
  atAutoSyncTimer = setInterval(() => {
    runAutoAtSyncIfDue("interval").catch((error: unknown) => {
      console.error(
        "[AT sync][scheduler:interval] failed:",
        getErrorMessage(error, String(error))
      );
    });
  }, AT_AUTO_SYNC_INTERVAL_MS);
  if (typeof atAutoSyncTimer.unref === "function") {
    atAutoSyncTimer.unref();
  }
};

const resolveDatabaseEndpoint = (): string => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}:${parsed.port || "5432"}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
};

const ensureDatabaseReady = async () => {
  const endpoint = resolveDatabaseEndpoint();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= STARTUP_DB_MAX_RETRIES; attempt += 1) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= STARTUP_DB_MAX_RETRIES;
      const message = getErrorMessage(error, "unknown startup DB error");
      if (isLastAttempt) break;
      console.warn(
        `[startup] DB connect attempt ${attempt}/${STARTUP_DB_MAX_RETRIES} failed (${endpoint}): ${message}. Retrying in ${STARTUP_DB_RETRY_DELAY_MS}ms.`
      );
      await wait(STARTUP_DB_RETRY_DELAY_MS);
    }
  }

  throw lastError;
};

const findMissingRuntimeSchemaColumns = async (): Promise<string[]> => {
  const requiredColumnKeys = Array.from(
    new Set(
      [
        ...STARTUP_REQUIRED_RUNTIME_COLUMNS,
        ...STARTUP_REQUIRED_RUNTIME_AUDIT_FK_COLUMNS,
      ].map((column) => `${column.tableName}.${column.columnName}`)
    )
  );
  const targetTableNames = Array.from(
    new Set(requiredColumnKeys.map((key) => key.split(".")[0]))
  );
  const rows = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${targetTableNames}::text[])
  `;
  const available = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`)
  );
  return requiredColumnKeys.filter((columnKey) => !available.has(columnKey));
};

const findForbiddenRuntimeSchemaColumns = async (): Promise<string[]> => {
  const targetTableNames = Array.from(
    new Set(STARTUP_FORBIDDEN_RUNTIME_COLUMNS.map((column) => column.tableName))
  );
  const rows = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${targetTableNames}::text[])
  `;
  const available = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`)
  );
  return STARTUP_FORBIDDEN_RUNTIME_COLUMNS
    .map((column) => `${column.tableName}.${column.columnName}`)
    .filter((columnKey) => available.has(columnKey));
};

const findForbiddenRuntimeSchemaTables = async (): Promise<string[]> => {
  const targetTableNames = Array.from(STARTUP_FORBIDDEN_RUNTIME_TABLES);
  if (targetTableNames.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${targetTableNames}::text[])
  `;
  const available = new Set(rows.map((row) => row.table_name));
  return targetTableNames.filter((tableName) => available.has(tableName));
};

const findRuntimeSchemaDriftReasons = async (): Promise<string[]> => {
  const driftReasons = await findMissingRuntimeSchemaColumns();
  const forbiddenColumns = await findForbiddenRuntimeSchemaColumns();
  forbiddenColumns.forEach((column) => {
    driftReasons.push(`${column} still present`);
  });
  const forbiddenTables = await findForbiddenRuntimeSchemaTables();
  forbiddenTables.forEach((table) => {
    driftReasons.push(`${table} table still present`);
  });

  const enumNames = Array.from(
    new Set(STARTUP_REQUIRED_RUNTIME_ENUM_VALUES.map((item) => item.enumName))
  );
  const enumRows = await prisma.$queryRaw<
    Array<{ enum_name: string; enumlabel: string }>
  >`
    SELECT t.typname AS enum_name, e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = ANY(${enumNames}::text[])
  `;
  const availableEnumValues = new Set(
    enumRows.map((row) => `${row.enum_name}.${row.enumlabel}`)
  );
  STARTUP_REQUIRED_RUNTIME_ENUM_VALUES.forEach((item) => {
    const key = `${item.enumName}.${item.value}`;
    if (!availableEnumValues.has(key)) {
      driftReasons.push(key);
    }
  });

  return driftReasons;
};

const applyMigrationFixForRuntimeSchemaDrift = async (driftReasons: string[]) => {
  if (!STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT) {
    throw new Error(
      `[startup] Required DB schema updates are missing and automatic migration is disabled: ${driftReasons.join(
        ", "
      )}`
    );
  }

  const backendRoot = resolvePath(__dirname, "..");
  const migrationFile = resolvePath(backendRoot, "migration_fix.sql");
  const prismaRunner = resolvePath(backendRoot, "scripts", "run-prisma.js");
  if (!existsSync(migrationFile) || !existsSync(prismaRunner)) {
    throw new Error(
      `[startup] Cannot apply migration_fix.sql automatically; missing file(s): ${migrationFile}, ${prismaRunner}`
    );
  }

  console.warn(
    `[startup] Runtime DB schema drift detected (${driftReasons.join(
      ", "
    )}). Applying migration_fix.sql before accepting traffic.`
  );
  const result = spawnSync(
    process.execPath,
    [
      prismaRunner,
      "db",
      "execute",
      "--schema",
      "./prisma/schema.prisma",
      "--file",
      "./migration_fix.sql",
    ],
    {
      cwd: backendRoot,
      encoding: "utf8",
      env: process.env,
      stdio: "pipe",
      timeout: 120_000,
    }
  );

  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
  if (result.error) {
    throw new Error(
      `[startup] migration_fix.sql failed to execute: ${getErrorMessage(
        result.error,
        "unknown spawn error"
      )}`
    );
  }
  if (result.signal) {
    throw new Error(
      `[startup] migration_fix.sql terminated by signal ${result.signal}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `[startup] migration_fix.sql failed with exit code ${result.status ?? "unknown"}`
    );
  }

  const remainingDriftReasons = await findRuntimeSchemaDriftReasons();
  if (remainingDriftReasons.length > 0) {
    throw new Error(
      `[startup] migration_fix.sql completed but required DB schema updates are still missing: ${remainingDriftReasons.join(
        ", "
      )}`
    );
  }
  console.log("[startup] migration_fix.sql completed and required DB schema updates are present.");
};

const ensureRuntimeSchemaReady = async () => {
  const driftReasons = await findRuntimeSchemaDriftReasons();
  if (driftReasons.length === 0) return;
  await applyMigrationFixForRuntimeSchemaDrift(driftReasons);
};

const ensureWorkOrderStatusSchemaReady = async () => {
  const enumRows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'WorkOrderStatus'
    ORDER BY enumsortorder
  `;
  const availableStatusCodes = new Set(
    enumRows
      .map((row) => resolveOptionalString(row?.enumlabel, null))
      .filter((value): value is string => Boolean(value))
  );
  supportsWorkOrderEditingStatus = availableStatusCodes.has("EDITING");
  const missingStatusCodes = Array.from(WORK_ORDER_STATUS_CODES).filter(
    (statusCode) =>
      statusCode !== "EDITING" && !availableStatusCodes.has(statusCode)
  );
  if (missingStatusCodes.length > 0) {
    throw new Error(
      `[startup] WorkOrderStatus enum is missing DB values: ${missingStatusCodes.join(
        ", "
      )}. Apply the latest schema sync before starting the API.`
    );
  }
  if (!supportsWorkOrderEditingStatus) {
    console.warn(
      "[startup] WorkOrderStatus enum is missing EDITING. Compatibility mode is enabled (unlocked orders use ORDER_RECEIVED in DB)."
    );
  }

  const defaultRows = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrder'
      AND column_name = 'status'
  `;
  const statusColumnDefault =
    resolveOptionalString(defaultRows[0]?.column_default, null) ?? "";
  if (!statusColumnDefault.includes("'EDITING'")) {
    if (supportsWorkOrderEditingStatus) {
      // ALTER TYPE ADD VALUE runs in migration_fix.sql but SET DEFAULT cannot
      // follow in the same transaction (PostgreSQL limitation). Apply it here
      // in a separate Prisma call so it runs after the migration commits.
      await prisma.$executeRaw`ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'EDITING'::"WorkOrderStatus"`;
      console.log("[startup] WorkOrder.status default set to EDITING.");
    } else {
      console.warn(
        `[startup] WorkOrder.status default is not EDITING (current: ${
          statusColumnDefault || "missing"
        }).`
      );
    }
  }
};

const ensureProcessMasterOptionTypeSchemaReady = async () => {
  const requiredEnumValues = [
    "LOCATION",
    "TARGET_SPEC",
    "ACTION_SPEC",
  ];

  for (const enumValue of requiredEnumValues) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'ProcessMasterOptionType'
            AND e.enumlabel = '${enumValue}'
        ) THEN
          ALTER TYPE "ProcessMasterOptionType" ADD VALUE '${enumValue}';
        END IF;
      END
      $$;
    `);
  }
};

const ensureProcessMasterOptionRelationSchemaReady = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProcessMasterOptionRelation" (
      "id" SERIAL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "parentOptionId" INTEGER NOT NULL,
      "childOptionId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      CONSTRAINT "ProcessMasterOptionRelation_parentOptionId_fkey"
        FOREIGN KEY ("parentOptionId")
        REFERENCES "ProcessMasterOption"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT "ProcessMasterOptionRelation_childOptionId_fkey"
        FOREIGN KEY ("childOptionId")
        REFERENCES "ProcessMasterOption"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_type_parent_child_key"
      ON "ProcessMasterOptionRelation" ("type", "parentOptionId", "childOptionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_parentOptionId_idx"
      ON "ProcessMasterOptionRelation" ("parentOptionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProcessMasterOptionRelation_childOptionId_idx"
      ON "ProcessMasterOptionRelation" ("childOptionId");
  `);

  const allowedTypesSql = PROCESS_MASTER_RELATION_TYPE_KEYS.map(
    (type) => `'${type}'`
  ).join(", ");
  await prisma.$executeRawUnsafe(`
    DELETE FROM "ProcessMasterOptionRelation"
    WHERE "type" NOT IN (${allowedTypesSql});
  `);
};

type StartupLifecycleState = "booting" | "ready" | "error";

let startupLifecycleState: StartupLifecycleState = "booting";
let startupBootstrapAttempt = 0;
let startupBootstrapRetryTimer: NodeJS.Timeout | null = null;

const scheduleStartupBootstrapRetry = () => {
  if (startupBootstrapRetryTimer) return;
  startupBootstrapRetryTimer = setTimeout(() => {
    startupBootstrapRetryTimer = null;
    void bootstrapApplicationServices();
  }, STARTUP_BOOTSTRAP_RETRY_DELAY_MS);
  if (typeof startupBootstrapRetryTimer.unref === "function") {
    startupBootstrapRetryTimer.unref();
  }
};

const bootstrapApplicationServices = async () => {
  startupBootstrapAttempt += 1;
  startupLifecycleState = "booting";

  try {
    await ensureDatabaseReady();
    await ensureOrganizationLocalizationColumnsReady();
    await ensureWorkOrderLocalizationColumnsReady();
    await ensureStyleLocalizationColumnsReady();
    await ensureWorkRecordCanonicalSchemaReady();
    await ensureWorkOrderStatusSchemaReady();
    await ensureProcessMasterOptionTypeSchemaReady();
    await ensureProcessMasterOptionRelationSchemaReady();
    await ensureHardcodedSystemAdmin();
    startupLifecycleState = "ready";
    console.log(
      `[startup] Background bootstrap completed on attempt ${startupBootstrapAttempt}.`
    );
  } catch (error) {
    startupLifecycleState = "error";
    supportsWorkOrderEditingStatus = false;

    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error(
        `[startup] Unable to connect to database at ${resolveDatabaseEndpoint()}. Check DATABASE_URL/network access and retry.`
      );
    }

    console.error(
      `[startup] Background bootstrap attempt ${startupBootstrapAttempt} failed. Retrying in ${STARTUP_BOOTSTRAP_RETRY_DELAY_MS}ms.`
    );
    console.error(error);
    scheduleStartupBootstrapRetry();
  }
};

const startServer = async () => {
  await ensureDatabaseReady();
  await ensureRuntimeSchemaReady();
  app.listen(port, host, () => {
    console.log(`API running on http://${host}:${port}`);
  });
  void bootstrapApplicationServices();
};

if (process.env.BARO_SKIP_API_START !== "1") {
  startServer().catch((error) => {
    console.error("failed to start API server", error);
    process.exit(1);
  });
}
