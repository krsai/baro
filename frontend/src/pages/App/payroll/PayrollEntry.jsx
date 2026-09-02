import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tooltip, alpha } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import AppPageContainer from "../../../components/AppPageContainer";
import PageToolbar from "../../../components/PageToolbar";
import TableStatusRow from "../../../components/TableStatusRow";
import { useAppActions } from "../../../context/AppContext";
import { useAuth } from "../../../context/AuthContext";
import { useLanguage } from "../../../context/LanguageContext";
import { buildQueryString, requestJSON } from "../../../utils/apiClient";
import { formatNumberWithCommas } from "../../../utils/numberFormat";
import { getPayTypeLabel, normalizePayType } from "../../../constants/payType";
import { fetchAttributes } from "../../../utils/attributeApi";

// Mirrors EmployeeBoard.jsx's active-member sort order (org role -> worker job role -> employeeNo -> name)
// so the payroll detail table lists employees in the same order as the Employee menu.
const WORKER_JOB_ROLE_CODES = new Set([
  "WORKER_SUPERVISOR",
  "WORKER_CUTTING",
  "WORKER_SEWING",
  "WORKER_IRONING",
  "WORKER_INSPECTION",
  "WORKER_PACKING",
  "WORKER_OTHER",
]);
const ORG_ROLE_SORT_ORDER = { ADMIN: 1, OPERATOR: 2, ACCOUNTANT: 3, WORKER: 4 };
const isWorkerJobRoleOption = (role) =>
  WORKER_JOB_ROLE_CODES.has(String(role?.code || "").trim().toUpperCase());
const isWorkerOrgRole = (value) => String(value || "").toUpperCase() === "WORKER";
const getOrgRoleSortOrder = (value) =>
  ORG_ROLE_SORT_ORDER[String(value || "").toUpperCase()] || Number.MAX_SAFE_INTEGER;
const sortJobRoleOptions = (rows = []) =>
  [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.name || a?.code || "").localeCompare(String(b?.name || b?.code || ""));
  });
const resolveWorkerJobSortOrder = (employee, workerRoleOrderIndex) => {
  const roleCode = String(employee?.roleCode || "").trim().toUpperCase();
  if (roleCode === "WORKER_SUPERVISOR") return -1;
  const roleIdKey = String(employee?.roleId || "").trim();
  if (roleIdKey && workerRoleOrderIndex.byId.has(roleIdKey)) {
    return workerRoleOrderIndex.byId.get(roleIdKey);
  }
  if (roleCode && workerRoleOrderIndex.byCode.has(roleCode)) {
    return workerRoleOrderIndex.byCode.get(roleCode);
  }
  return Number.MAX_SAFE_INTEGER;
};

const TEXT = {
  ko: {
    title: "생산수당 상세",
    loading: "생산수당 상세 내역을 불러오는 중입니다.",
    fetchError: "생산수당 상세 내역을 불러오지 못했습니다.",
    empty: "생산수당 대상 성과급 직원이 없습니다.",
    employeeAllowance: "직원별 생산수당",
    people: "명",
    total: "총 생산수당",
    employee: "직원",
    allowance: "생산수당",
    basis: "산출 근거",
    details: "상세",
    collapse: "접기",
    formula: "생산수당 = 작업수량 × CT초 × 월 계산 시점의 공장 생산수당 초당 단가. 직원별 적용 초당 단가를 수정하면 해당 직원의 월 전체 CT초에 동일하게 적용됩니다.",
    process: "공정",
    quantity: "수량",
    ctSeconds: "총 CT초",
    averageRate: "초당 급여",
    appliedRate: "적용 초당 단가",
    saveRates: "단가 저장",
    saving: "저장 중...",
    saveSuccess: "직원별 적용 단가를 저장했습니다.",
    saveError: "직원별 적용 단가 저장에 실패했습니다.",
    noRecords: "작업 기록이 없습니다.",
    current: "진행 중",
    confirmed: "확정",
  },
  en: {
    title: "Production Allowance Details",
    loading: "Loading production allowance details.",
    fetchError: "Failed to load production allowance details.",
    empty: "No performance-pay employees are eligible for production allowance.",
    employeeAllowance: "Production Allowance by Employee",
    people: " employees",
    total: "Total Production Allowance",
    employee: "Employee",
    allowance: "Production Allowance",
    basis: "Calculation Basis",
    details: "Details",
    collapse: "Collapse",
    formula: "Production allowance = quantity × CT seconds × the current factory rate when the month is calculated. An employee override applies one rate to all of that employee’s CT seconds for the month.",
    process: "Process",
    quantity: "Quantity",
    ctSeconds: "Total CT Seconds",
    averageRate: "Pay per Second",
    appliedRate: "Applied Rate / sec",
    saveRates: "Save Rates",
    saving: "Saving...",
    saveSuccess: "Saved employee rates.",
    saveError: "Failed to save employee rates.",
    noRecords: "No work records.",
    current: "In Progress",
    confirmed: "Confirmed",
  },
  vi: {
    title: "Chi tiết phu cap san luong",
    loading: "Đang tải chi tiet phu cap san luong.",
    fetchError: "Không thể tai chi tiet phu cap san luong.",
    empty: "Không có nhan vien luong san pham thuoc doi tuong tinh phu cap.",
    employeeAllowance: "Phụ cấp san luong theo nhan vien",
    people: " nhan vien",
    total: "Tong phu cap san luong",
    employee: "Nhân viên",
    allowance: "Phụ cấp san luong",
    basis: "Co so tinh",
    details: "Chi tiết",
    collapse: "Thu gon",
    formula: "Phụ cấp san luong = so luong × giay CT × don gia hien tai cua nha may khi tinh thang. Đơn giá sua theo nhan vien ap dung cho toan bo giay CT cua nhan vien trong thang.",
    process: "Công đoạn",
    quantity: "Số lượng",
    ctSeconds: "Tong giay CT",
    averageRate: "Luong moi giay",
    appliedRate: "Đơn giá ap dung/giay",
    saveRates: "Luu don gia",
    saving: "Đang lưu...",
    saveSuccess: "Đã lưu don gia theo nhan vien.",
    saveError: "Không thể luu don gia theo nhan vien.",
    noRecords: "Không có ghi chep cong viec.",
    current: "Đang tiến hành",
    confirmed: "Đã xác nhận",
  },
};

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value) || 0), {
    fallback: "0",
    maximumFractionDigits: 0,
  })} VND`;
const formatSeconds = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value) || 0), {
    fallback: "0",
    maximumFractionDigits: 0,
  })} s`;
const formatRate = (value) =>
  `${formatNumberWithCommas(Number(value) || 0, {
    fallback: "0",
    maximumFractionDigits: 2,
  })} VND/s`;
const productionAllowanceOf = (employee) => Number(employee?.productionAllowance ?? employee?.productionEarnings ?? 0) || 0;
const normalizeEmployeePayType = (value) => {
  return normalizePayType(value, "GENERAL");
};
const escapePrintText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const LOCK_TEXT = {
  ko: {
    locked: "잠금됨",
    unlocked: "수정 가능",
    unlockConfirm: "이 생산수당 계산의 잠금을 해제하시겠습니까?",
    lockedHelp: "잠금 상태입니다. 누르면 잠금을 해제합니다.",
    unlockedHelp: "잠금 해제 상태입니다. 누르면 잠급니다.",
    saveFirst: "수정한 초당 단가를 먼저 저장해야 잠글 수 있습니다.",
    error: "잠금 상태 변경에 실패했습니다.",
  },
  en: {
    locked: "Locked",
    unlocked: "Editable",
    unlockConfirm: "Unlock this production allowance calculation?",
    lockedHelp: "Locked. Click to unlock.",
    unlockedHelp: "Unlocked. Click to lock.",
    saveFirst: "Save the changed rates before locking.",
    error: "Failed to change the lock status.",
  },
  vi: {
    locked: "Đã khóa",
    unlocked: "Có thể sửa",
    unlockConfirm: "Mở khóa ket qua phu cap san luong nay?",
    lockedHelp: "Đang khóa. Bam de mo khoa.",
    unlockedHelp: "Dang mo khoa. Bam de khoa.",
    saveFirst: "Hay luu don gia da sua truoc khi khoa.",
    error: "Không thể thay doi trang thai khoa.",
  },
};
const getPayrollLockButtonSx = (locked) => (theme) => ({
  minWidth: 116,
  height: 36,
  px: 1.75,
  borderRadius: 1.5,
  border: `1px solid ${locked ? alpha(theme.palette.text.primary, 0.9) : alpha(theme.palette.primary.main, 0.38)}`,
  backgroundColor: locked ? alpha(theme.palette.text.primary, 0.9) : alpha(theme.palette.primary.main, 0.08),
  color: locked ? theme.palette.common.white : theme.palette.primary.main,
  fontWeight: 700,
  "&:hover": {
    borderColor: locked ? theme.palette.text.primary : alpha(theme.palette.primary.main, 0.55),
    backgroundColor: locked ? theme.palette.text.primary : alpha(theme.palette.primary.main, 0.16),
  },
  "& .MuiButton-startIcon": {
    marginLeft: 0,
    marginRight: theme.spacing(0.75),
  },
  "&.Mui-disabled": locked
    ? {
        borderColor: alpha(theme.palette.text.primary, 0.38),
        backgroundColor: alpha(theme.palette.text.primary, 0.38),
        color: alpha(theme.palette.common.white, 0.76),
      }
    : {
        borderColor: alpha(theme.palette.primary.main, 0.22),
        backgroundColor: alpha(theme.palette.primary.main, 0.08),
        color: alpha(theme.palette.primary.main, 0.48),
      },
});

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const [searchParams] = useSearchParams();
  const { showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const pageTitle = languageCode === "ko" ? "급여 계산 상세" : languageCode === "vi" ? "Chi tiết tính lương" : "Payroll Details";
  const month = String(payrollId || "").trim();
  const factoryId = Number(searchParams.get("factoryId")) || null;
  const lineId = Number(searchParams.get("lineId")) || null;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [togglingLock, setTogglingLock] = useState(false);
  const [employeeDirectory, setEmployeeDirectory] = useState([]);
  const [jobRoleOptions, setJobRoleOptions] = useState([]);
  const [factories, setFactories] = useState([]);
  const [payslipEmployee, setPayslipEmployee] = useState(null);

  const load = useCallback(async () => {
    if (!activeOrgId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !factoryId) return;
    setLoading(true);
    try {
      const [payload, directory, attributes, calendar] = await Promise.all([
        requestJSON("/payroll" + buildQueryString({ orgId: activeOrgId, month, factoryId }), { forceRefresh: true }),
        requestJSON("/employees" + buildQueryString({ orgId: activeOrgId }), {
          forceRefresh: true,
        }),
        fetchAttributes({
          orgId: activeOrgId,
          includeColors: false,
          includeCategories: false,
          includeRoles: true,
          includeProcesses: false,
          skipGlobalLoading: true,
        }).catch(() => null),
        requestJSON("/payroll/calendar" + buildQueryString({ orgId: activeOrgId }), {
          forceRefresh: true,
          skipGlobalLoading: true,
        }).catch(() => null),
      ]);
      setData(payload);
      setEmployeeDirectory(Array.isArray(directory) ? directory : []);
      const roles = Array.isArray(attributes?.roles) ? attributes.roles : [];
      setJobRoleOptions(sortJobRoleOptions(roles.filter(isWorkerJobRoleOption)));
      setFactories(Array.isArray(calendar?.factories) ? calendar.factories : []);
    } catch (error) {
      setData(null);
      showNotification(error?.message || text.fetchError, "error");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, factoryId, month, showNotification, text.fetchError]);

  useEffect(() => {
    load();
  }, [load]);

  const workerRoleOrderIndex = useMemo(() => {
    const byId = new Map();
    const byCode = new Map();
    jobRoleOptions.forEach((role, index) => {
      const order = Number.isFinite(Number(role?.sortOrder)) ? Number(role.sortOrder) : index + 1;
      const roleIdKey = String(role?.id || "").trim();
      const roleCodeKey = String(role?.code || "").trim().toUpperCase();
      if (roleIdKey) byId.set(roleIdKey, order);
      if (roleCodeKey) byCode.set(roleCodeKey, order);
    });
    return { byId, byCode };
  }, [jobRoleOptions]);

  const employees = useMemo(() => {
    const payrollRows = Array.isArray(data?.employees) ? data.employees : [];
    const payrollByWorkerId = new Map(payrollRows.filter((employee) => Number(employee?.workerId) > 0).map((employee) => [Number(employee.workerId), employee]));
    const directoryById = new Map(employeeDirectory.map((employee) => [Number(employee.id), employee]));
    const directoryRows = data?.snapshotExists ? [] : employeeDirectory.filter((employee) => !["PENDING", "REJECTED"].includes(String(employee?.status || "").toUpperCase()));
    const knownWorkerIds = new Set(directoryRows.map((employee) => Number(employee.id)));
    const rows = [
      ...directoryRows.map((employee) => ({
        ...employee,
        ...(payrollByWorkerId.get(Number(employee.id)) || {}),
        workerId: Number(employee.id),
        workerName: employee.name || payrollByWorkerId.get(Number(employee.id))?.workerName,
        payType: normalizeEmployeePayType(employee.payType),
      })),
      ...payrollRows.filter((employee) => !knownWorkerIds.has(Number(employee?.workerId))),
    ];
    const mapped = rows
      .map((employee) => {
        const processes = (Array.isArray(employee?.processes) ? employee.processes : []).filter((process) => (!factoryId || Number(process.factoryId) === factoryId) && (!lineId || Number(process.lineId) === lineId));
        const productionAllowance = processes.reduce((sum, process) => sum + Number(process.totalEarnings || 0), 0);
        const directoryMatch = directoryById.get(Number(employee?.workerId));
        return {
          ...employee,
          roleCode: employee.roleCode || directoryMatch?.roleCode || "",
          roleId: employee.roleId ?? directoryMatch?.roleId ?? null,
          employeeNo: employee.employeeNo ?? directoryMatch?.employeeNo ?? null,
          payType: normalizeEmployeePayType(employee.payType),
          processes,
          productionAllowance,
          productionEarnings: productionAllowance,
        };
      })
      .filter((employee) => (!factoryId || Number(employee.factoryId) === factoryId || employee.processes.length > 0) && (!lineId || Number(employee.lineId) === lineId || employee.processes.length > 0));
    return [...mapped].sort((a, b) => {
      const roleOrderDiff = getOrgRoleSortOrder(a.orgRole) - getOrgRoleSortOrder(b.orgRole);
      if (roleOrderDiff !== 0) return roleOrderDiff;
      if (isWorkerOrgRole(a.orgRole) && isWorkerOrgRole(b.orgRole)) {
        const workerJobDiff =
          resolveWorkerJobSortOrder(a, workerRoleOrderIndex) - resolveWorkerJobSortOrder(b, workerRoleOrderIndex);
        if (workerJobDiff !== 0) return workerJobDiff;
      }
      const aNo = String(a?.employeeNo || "");
      const bNo = String(b?.employeeNo || "");
      if (aNo && bNo) {
        const noCompare = aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: "base" });
        if (noCompare !== 0) return noCompare;
      } else if (aNo) return -1;
      else if (bNo) return 1;
      const aName = String(a?.workerName || "");
      const bName = String(b?.workerName || "");
      return aName.localeCompare(bName, "ko");
    });
  }, [data?.employees, data?.snapshotExists, employeeDirectory, factoryId, lineId, workerRoleOrderIndex]);
  const total = useMemo(() => employees.reduce((sum, employee) => sum + Number(employee?.grossSalary || 0), 0), [employees]);
  const payslipText =
    languageCode === "ko"
      ? {
          title: "월 급여명세서",
          employee: "직원",
          payType: "급여 타입",
          earnings: "지급 항목",
          amount: "금액",
          base: "기본급",
          allowance: "일반 수당",
          production: "생산수당",
          deductions: "공제",
          net: "최종 지급액",
          pending: "미계산",
          notApplicable: "해당 없음",
          print: "인쇄",
          close: "닫기",
          open: "급여표",
          preview: "계산 결과",
        }
      : languageCode === "vi"
        ? {
            title: "Phiếu lương tháng",
            employee: "Nhân viên",
            payType: "Loại lương",
            earnings: "Khoản chi trả",
            amount: "Số tiền",
            base: "Lương cơ bản",
            allowance: "Phụ cấp",
            production: "Phụ cấp sản lượng",
            deductions: "Khấu trừ",
            net: "Thực lĩnh",
            pending: "Chưa tính",
            notApplicable: "Không áp dụng",
            print: "In",
            close: "Đóng",
            open: "Phiếu lương",
            preview: "Kết quả tính",
          }
        : {
            title: "Monthly Payslip",
            employee: "Employee",
            payType: "Pay Type",
            earnings: "Earnings",
            amount: "Amount",
            base: "Base Salary",
            allowance: "Allowances",
            production: "Production Allowance",
            deductions: "Deductions",
            net: "Net Pay",
            pending: "Not calculated",
            notApplicable: "Not applicable",
            print: "Print",
            close: "Close",
            open: "Payslip",
            preview: "Calculated Result",
            payrollByEmployee: "Payroll by Employee",
            productionSubtotal: "Production Allowance Subtotal",
            details: "Production Details",
          };
  const unifiedPayrollText =
    languageCode === "ko"
      ? {
          payrollByEmployee: "\uC9C1\uC6D0\uBCC4 \uAE09\uC5EC \uACC4\uC0B0",
          productionSubtotal: "\uC0DD\uC0B0\uC218\uB2F9 \uC18C\uACC4",
          details: "\uC0DD\uC0B0 \uC0C1\uC138",
          calculated: "\uACC4\uC0B0 \uC644\uB8CC",
          item: "\uAE09\uC5EC \uD56D\uBAA9",
          category: "\uC218\uC2DD",
        }
      : languageCode === "vi"
        ? {
            payrollByEmployee: "Tinh luong theo nhan vien",
            productionSubtotal: "Tong phu cap san luong",
            details: "Chi tiet san luong",
            calculated: "Da tinh xong",
            item: "Khoan luong",
            category: "Công thức",
          }
        : {
            payrollByEmployee: "Payroll by Employee",
            productionSubtotal: "Production Allowance Subtotal",
            details: "Production Details",
            calculated: "Calculated",
            item: "Payroll Item",
          category: "Formula",
        };
  const payslipInfoText = languageCode === "ko"
    ? {
        basicInfo: "급여 계산 기본 정보", actualWorkdays: "실제 근무일수", scheduledWorkdays: "기준 근무일수",
        holidayWorkdays: "휴일 근무일수", fullAttendance: "만근 여부", tenureYears: "근속 연수",
        salaryVersion: "급여 체계 버전", yes: "만근", no: "미만근", days: "일", years: "년",
        productionBasis: "생산수당 산출 내역", totalPayroll: "총 급여",
      }
    : languageCode === "vi"
      ? {
          basicInfo: "Thông tin cơ bản tính lương", actualWorkdays: "Ngày làm việc thực tế", scheduledWorkdays: "Ngày làm việc tiêu chuẩn",
          holidayWorkdays: "Ngày làm việc ngày nghỉ", fullAttendance: "Chuyên cần đầy đủ", tenureYears: "Thâm niên",
          salaryVersion: "Phiên bản cơ cấu lương", yes: "Đủ", no: "Chưa đủ", days: "ngày", years: "năm",
          productionBasis: "Chi tiết tính phụ cấp sản lượng", totalPayroll: "Tổng lương",
        }
      : {
          basicInfo: "Payroll Calculation Information", actualWorkdays: "Actual Workdays", scheduledWorkdays: "Scheduled Workdays",
          holidayWorkdays: "Holiday Workdays", fullAttendance: "Full Attendance", tenureYears: "Tenure",
          salaryVersion: "Salary System Version", yes: "Yes", no: "No", days: "days", years: "years",
          productionBasis: "Production Allowance Calculation", totalPayroll: "Total Payroll",
        };
  const salaryItemName = useCallback(
    (item) => {
      if (languageCode === "vi") return item?.nameVi || item?.nameKo || item?.nameEn || item?.name || "-";
      if (languageCode === "en") return item?.nameEn || item?.nameKo || item?.nameVi || item?.name || "-";
      return item?.nameKo || item?.name || item?.nameEn || item?.nameVi || "-";
    },
    [languageCode],
  );
  const formulaParameterLabels = useMemo(() => {
    if (languageCode === "ko") return {
      GRADE_RATE: "직급별 단가", TENURE_YEARS: "근속 연수", ACTUAL_WORKDAYS: "실제 근무일수",
      SCHEDULED_WORKDAYS: "기준 근무일수", HOLIDAY_WORKDAYS: "휴일 근무일수", WORK_HOURS: "정규 근무시간",
      OVERTIME_HOURS: "연장근무시간", HOLIDAY_HOURS: "휴일 특근시간", FULL_ATTENDANCE_FACTOR: "만근 여부",
      PRODUCTION_ALLOWANCE: "생산수당",
    };
    if (languageCode === "vi") return {
      GRADE_RATE: "Đơn giá theo cấp bậc", TENURE_YEARS: "Thâm niên", ACTUAL_WORKDAYS: "Ngày làm thực tế",
      SCHEDULED_WORKDAYS: "Ngày làm tiêu chuẩn", HOLIDAY_WORKDAYS: "Ngày làm ngày nghỉ", WORK_HOURS: "Giờ làm chính thức",
      OVERTIME_HOURS: "Giờ tăng ca", HOLIDAY_HOURS: "Giờ làm ngày nghỉ", FULL_ATTENDANCE_FACTOR: "Đủ chuyên cần",
      PRODUCTION_ALLOWANCE: "Phụ cấp sản lượng",
    };
    return {
      GRADE_RATE: "Grade Rate", TENURE_YEARS: "Tenure Years", ACTUAL_WORKDAYS: "Actual Workdays",
      SCHEDULED_WORKDAYS: "Scheduled Workdays", HOLIDAY_WORKDAYS: "Holiday Workdays", WORK_HOURS: "Regular Hours",
      OVERTIME_HOURS: "Overtime Hours", HOLIDAY_HOURS: "Holiday Hours", FULL_ATTENDANCE_FACTOR: "Full Attendance",
      PRODUCTION_ALLOWANCE: "Production Allowance",
    };
  }, [languageCode]);
  const formatSalaryFormula = useCallback((formula) => {
    const tokens = Array.isArray(formula) ? formula : [];
    if (tokens.length === 0) return "-";
    return tokens.map((token) => {
      const value = String(token);
      if (value.startsWith("CONST:")) return value.slice(6);
      return formulaParameterLabels[value] || value;
    }).join(" ");
  }, [formulaParameterLabels]);
  const payslipRows = useCallback(
    (employee) => {
      const calculatedItems = Array.isArray(employee?.salaryItems) ? employee.salaryItems : [];
      if (calculatedItems.length > 0)
        return calculatedItems.map((item) => ({
          key: item.code,
          name: salaryItemName(item),
          category: item.category,
          formula: formatSalaryFormula(item.formula),
          amount: formatDong(item.amount),
        }));
      return [
        {
          key: "legacy-base",
          name: payslipText.base,
          category: "BASE",
          formula: "-",
          amount: payslipText.pending,
        },
        {
          key: "legacy-allowance",
          name: payslipText.allowance,
          category: "ALLOWANCE",
          formula: "-",
          amount: payslipText.pending,
        },
        ...(employee?.payType === "OUTPUT"
          ? [
              {
                key: "legacy-production",
                name: payslipText.production,
                category: "INCENTIVE",
                formula: "-",
                amount: formatDong(productionAllowanceOf(employee)),
              },
            ]
          : []),
      ];
    },
    [formatSalaryFormula, payslipText.allowance, payslipText.base, payslipText.pending, payslipText.production, salaryItemName],
  );
  const handlePrintPayslip = () => {
    if (!payslipEmployee) return;
    const rows = payslipRows(payslipEmployee);
    const itemHtml = rows.map((row) => `<tr><td>${escapePrintText(row.name)}</td><td>${escapePrintText(row.formula || "-")}</td><td>${escapePrintText(row.amount)}</td></tr>`).join("");
    const parameters = payslipEmployee.parameters || {};
    const infoHtml = [
      [payslipText.employee, payslipEmployee.workerName || "-"],
      [payslipText.payType, getPayTypeLabel(payslipEmployee.payType, payslipEmployee.payType, languageCode)],
      [payslipInfoText.actualWorkdays, `${Number(parameters.ACTUAL_WORKDAYS || 0)} ${payslipInfoText.days}`],
      [payslipInfoText.scheduledWorkdays, `${Number(parameters.SCHEDULED_WORKDAYS || 0)} ${payslipInfoText.days}`],
      [payslipInfoText.holidayWorkdays, `${Number(parameters.HOLIDAY_WORKDAYS || 0)} ${payslipInfoText.days}`],
      [payslipInfoText.fullAttendance, Number(parameters.FULL_ATTENDANCE_FACTOR || 0) >= 1 ? payslipInfoText.yes : payslipInfoText.no],
      [payslipInfoText.tenureYears, `${formatNumberWithCommas(Number(parameters.TENURE_YEARS || 0), { maximumFractionDigits: 2 })} ${payslipInfoText.years}`],
      [payslipInfoText.salaryVersion, payslipEmployee.salarySystemVersionNumber ? `Ver.${payslipEmployee.salarySystemVersionNumber}` : "-"],
    ].map(([label, value]) => `<b>${escapePrintText(label)}</b><span>${escapePrintText(value)}</span>`).join("");
    const productionHtml = payslipEmployee.payType === "OUTPUT"
      ? `<h2>${escapePrintText(payslipInfoText.productionBasis)}</h2><table><thead><tr><th>${escapePrintText(text.process)}</th><th>${escapePrintText(text.quantity)}</th><th>${escapePrintText(text.ctSeconds)}</th><th>${escapePrintText(text.averageRate)}</th><th>${escapePrintText(text.allowance)}</th></tr></thead><tbody>${(payslipEmployee.processes || []).map((process) => `<tr><td>${escapePrintText(process.processName || process.processCode || "-")}</td><td>${escapePrintText(formatNumberWithCommas(process.totalQuantity || 0))}</td><td>${escapePrintText(formatSeconds(process.totalCtSeconds))}</td><td>${escapePrintText(formatRate(process.wagePerSecond))}</td><td>${escapePrintText(formatDong(process.totalEarnings))}</td></tr>`).join("")}</tbody></table>`
      : "";
    const popup = window.open("", "_blank", "width=820,height=900");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>${escapePrintText(payslipText.title)} ${escapePrintText(month)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:36px}h1{font-size:22px;margin:0 0 24px}h2{font-size:16px;margin:26px 0 10px}.meta{display:grid;grid-template-columns:150px 1fr 150px 1fr;gap:8px 16px;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{padding:11px;border:1px solid #ccc;text-align:left}th:not(:first-child),td:not(:first-child){text-align:right}.total{font-weight:700;background:#f5f5f5}.note{margin-top:18px;color:#666;font-size:12px}@media print{body{padding:0}}</style></head><body><h1>${escapePrintText(payslipText.title)} · ${escapePrintText(month)}</h1><h2>${escapePrintText(payslipInfoText.basicInfo)}</h2><div class="meta">${infoHtml}</div><table><thead><tr><th>${escapePrintText(unifiedPayrollText.item)}</th><th>${escapePrintText(unifiedPayrollText.category)}</th><th>${escapePrintText(payslipText.amount)}</th></tr></thead><tbody>${itemHtml}<tr><td>${escapePrintText(payslipText.deductions)}</td><td>-</td><td>${escapePrintText(formatDong(payslipEmployee.deductions || 0))}</td></tr><tr class="total"><td>${escapePrintText(payslipText.net)}</td><td>-</td><td>${escapePrintText(formatDong(payslipEmployee.netSalary || 0))}</td></tr></tbody></table>${productionHtml}<div class="note">${escapePrintText(payslipText.preview)}</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script></body></html>`);
    popup.document.close();
  };
  const provisional = data?.isProvisional === true;
  const locked = Boolean(data && !provisional);
  const currentFactory = useMemo(
    () => factories.find((factory) => Number(factory.id) === Number(factoryId)) || null,
    [factories, factoryId],
  );
  const factoryDisplayName = currentFactory
    ? (languageCode === "vi" ? currentFactory.nameVi : languageCode === "ko" ? currentFactory.nameKo : currentFactory.name)
      || currentFactory.name
      || ""
    : "";

  const handleLockToggle = async () => {
    if (!data || togglingLock) return;
    const lockText = LOCK_TEXT[languageCode] || LOCK_TEXT.en;
    if (locked && !window.confirm(lockText.unlockConfirm)) return;
    setTogglingLock(true);
    try {
      const updated = await requestJSON(
        `/payroll/snapshots/${month}/${locked ? "unlock" : "lock"}` + buildQueryString({ orgId: activeOrgId, factoryId }),
        locked
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                factoryId,
                lockedBy: activeProfile?.email || activeProfile?.name || "administrator",
              }),
            },
      );
      setData((previous) => ({ ...previous, ...updated }));
    } catch (error) {
      showNotification(error?.message || lockText.error, "error");
    } finally {
      setTogglingLock(false);
    }
  };

  return (
    <AppPageContainer
      title={factoryDisplayName ? `${pageTitle} · ${month} · ${factoryDisplayName}` : `${pageTitle} · ${month}`}
      toolbar={
        <PageToolbar
          showLastUpdater={false}
          right={
            data ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Tooltip title={(LOCK_TEXT[languageCode] || LOCK_TEXT.en)[locked ? "lockedHelp" : "unlockedHelp"]}>
                  <span>
                    <Button size="small" variant="contained" color="inherit" startIcon={locked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />} disabled={togglingLock} onClick={handleLockToggle} sx={getPayrollLockButtonSx(locked)}>
                      {(LOCK_TEXT[languageCode] || LOCK_TEXT.en)[locked ? "locked" : "unlocked"]}
                    </Button>
                  </span>
                </Tooltip>
                {togglingLock ? <CircularProgress size={16} /> : null}
              </Stack>
            ) : null
          }
        />
      }
    >
      <Box sx={{ width: "100%" }}>
        {!factoryId ? (
          <Alert severity="error">
            {languageCode === "ko"
              ? "공장이 지정되지 않았습니다. 급여 계산 목록에서 다시 진입해 주세요."
              : languageCode === "vi"
                ? "Chưa chọn nhà máy. Vui lòng vào lại từ danh sách tính lương."
                : "No factory selected. Please open this page from the payroll list again."}
          </Alert>
        ) : null}
        {factoryId && loading ? (
          <Paper variant="outlined" sx={{ p: 3 }}>
            {text.loading}
          </Paper>
        ) : null}
        {factoryId && !loading && !data ? <Alert severity="error">{text.fetchError}</Alert> : null}
        {!loading && data && employees.length === 0 ? <Alert severity="info">{text.empty}</Alert> : null}
        {!loading && data && employees.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Box
              sx={{
                px: 2,
                py: 1.25,
                bgcolor: "grey.50",
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {unifiedPayrollText.payrollByEmployee}
                </Typography>
                <Chip size="small" label={`${employees.length}${text.people}`} variant="outlined" />
                <Chip size="small" color="success" label={unifiedPayrollText.calculated} variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {payslipInfoText.totalPayroll} {formatDong(total)}
                </Typography>
              </Stack>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{text.employee}</TableCell>
                    <TableCell align="center">{payslipText.payType}</TableCell>
                    <TableCell align="right">{payslipText.base}</TableCell>
                    <TableCell align="right">{payslipText.allowance}</TableCell>
                    <TableCell align="right">{payslipText.production}</TableCell>
                    <TableCell align="right">{payslipText.deductions}</TableCell>
                    <TableCell align="right">{payslipText.net}</TableCell>
                    <TableCell align="center">{payslipText.open}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map((employee, index) => {
                    const key = employee.employeeKey || `employee-${index}`;
                    const salaryItems = Array.isArray(employee.salaryItems) ? employee.salaryItems : [];
                    const baseAmount = salaryItems.filter((item) => item.category === "BASE").reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    const allowanceAmount = salaryItems.filter((item) => item.category === "ALLOWANCE").reduce((sum, item) => sum + Number(item.amount || 0), 0);
                    return (
                      <React.Fragment key={key}>
                        <TableRow hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {employee.workerName || "-"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {employee.roleName || "-"}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip size="small" variant="outlined" label={getPayTypeLabel(employee.payType, employee.payType, languageCode)} />
                          </TableCell>
                          <TableCell align="right">{formatDong(baseAmount)}</TableCell>
                          <TableCell align="right">{formatDong(allowanceAmount)}</TableCell>
                          <TableCell align="right">
                            {employee.payType === "OUTPUT" ? (
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatDong(productionAllowanceOf(employee))}</Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                {payslipText.notApplicable}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">{formatDong(employee.deductions || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatDong(employee.netSalary || 0)}
                          </TableCell>
                          <TableCell align="center">
                            <Button size="small" variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => setPayslipEmployee(employee)}>
                              {payslipText.open}
                            </Button>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ) : null}
      </Box>
      <Dialog open={Boolean(payslipEmployee)} onClose={() => setPayslipEmployee(null)} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>
              {payslipText.title} · {month}
            </span>
            <Chip size="small" label={payslipText.preview} variant="outlined" />
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="subtitle2" fontWeight={700}>{payslipInfoText.basicInfo}</Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "130px 1fr", md: "150px 1fr 150px 1fr" },
                rowGap: 1,
                columnGap: 2,
              }}
            >
              <Typography color="text.secondary">{payslipText.employee}</Typography>
              <Typography fontWeight={700}>{payslipEmployee?.workerName || "-"}</Typography>
              <Typography color="text.secondary">{payslipText.payType}</Typography>
              <Typography>
                {getPayTypeLabel(payslipEmployee?.payType, payslipEmployee?.payType || "-", languageCode)} ({payslipEmployee?.payType || "-"})
              </Typography>
              <Typography color="text.secondary">{payslipInfoText.actualWorkdays}</Typography>
              <Typography>{Number(payslipEmployee?.parameters?.ACTUAL_WORKDAYS || 0)} {payslipInfoText.days}</Typography>
              <Typography color="text.secondary">{payslipInfoText.scheduledWorkdays}</Typography>
              <Typography>{Number(payslipEmployee?.parameters?.SCHEDULED_WORKDAYS || 0)} {payslipInfoText.days}</Typography>
              <Typography color="text.secondary">{payslipInfoText.holidayWorkdays}</Typography>
              <Typography>{Number(payslipEmployee?.parameters?.HOLIDAY_WORKDAYS || 0)} {payslipInfoText.days}</Typography>
              <Typography color="text.secondary">{payslipInfoText.fullAttendance}</Typography>
              <Typography>{Number(payslipEmployee?.parameters?.FULL_ATTENDANCE_FACTOR || 0) >= 1 ? payslipInfoText.yes : payslipInfoText.no}</Typography>
              <Typography color="text.secondary">{payslipInfoText.tenureYears}</Typography>
              <Typography>{formatNumberWithCommas(Number(payslipEmployee?.parameters?.TENURE_YEARS || 0), { maximumFractionDigits: 2 })} {payslipInfoText.years}</Typography>
              <Typography color="text.secondary">{payslipInfoText.salaryVersion}</Typography>
              <Typography>{payslipEmployee?.salarySystemVersionNumber ? `Ver.${payslipEmployee.salarySystemVersionNumber}` : "-"}</Typography>
            </Box>
            <Divider />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{unifiedPayrollText.item}</TableCell>
                  <TableCell>{unifiedPayrollText.category}</TableCell>
                  <TableCell align="right">{payslipText.amount}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payslipEmployee &&
                  payslipRows(payslipEmployee).map((row) => (
                    <TableRow key={row.key}>
                      <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell>{row.formula || "-"}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: row.amount === payslipText.pending ? "text.secondary" : "text.primary",
                        }}
                      >
                        {row.amount}
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow>
                  <TableCell>{payslipText.deductions}</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell align="right">{formatDong(payslipEmployee?.deductions || 0)}</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell sx={{ fontWeight: 700 }}>{payslipText.net}</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {formatDong(payslipEmployee?.netSalary || 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {payslipEmployee?.payType === "OUTPUT" ? <>
              <Divider />
              <Typography variant="subtitle2" fontWeight={700}>{payslipInfoText.productionBasis}</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{text.process}</TableCell>
                    <TableCell align="right">{text.quantity}</TableCell>
                    <TableCell align="right">{text.ctSeconds}</TableCell>
                    <TableCell align="right">{text.averageRate}</TableCell>
                    <TableCell align="right">{text.allowance}</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {(payslipEmployee.processes || []).length === 0
                      ? <TableStatusRow colSpan={5} message={text.noRecords} />
                      : payslipEmployee.processes.map((process, processIndex) => <TableRow key={process.styleProcessId || `payslip-process-${processIndex}`}>
                          <TableCell>{process.processName || process.processCode || "-"}</TableCell>
                          <TableCell align="right">{formatNumberWithCommas(process.totalQuantity || 0)}</TableCell>
                          <TableCell align="right">{formatSeconds(process.totalCtSeconds)}</TableCell>
                          <TableCell align="right">{formatRate(process.wagePerSecond)}</TableCell>
                          <TableCell align="right">{formatDong(process.totalEarnings)}</TableCell>
                        </TableRow>)}
                  </TableBody>
                </Table>
              </TableContainer>
            </> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayslipEmployee(null)}>{payslipText.close}</Button>
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={handlePrintPayslip}>
            {payslipText.print}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default PayrollEntry;
