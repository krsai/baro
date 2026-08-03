import { Router } from "express";
import {
  deletePayrollSnapshotController,
  getPayrollCalendarController,
  getPayrollController,
  getPayrollReadinessController,
  listPayrollSnapshotsController,
  lockPayrollSnapshotController,
  recalculatePayrollSnapshotLineController,
  savePayrollSnapshotController,
  unlockPayrollSnapshotController,
  updatePayrollEmployeeRatesController,
} from "./payroll.controller";

export const payrollRouter = Router();

payrollRouter.get("/payroll/snapshots", listPayrollSnapshotsController);
payrollRouter.get("/payroll/calendar", getPayrollCalendarController);
payrollRouter.get("/payroll/readiness", getPayrollReadinessController);
payrollRouter.get("/payroll", getPayrollController);
payrollRouter.post("/payroll/snapshots", savePayrollSnapshotController);
payrollRouter.post("/payroll/snapshots/:month/recalculate-line", recalculatePayrollSnapshotLineController);
payrollRouter.post("/payroll/snapshots/:month/lock", lockPayrollSnapshotController);
payrollRouter.post("/payroll/snapshots/:month/unlock", unlockPayrollSnapshotController);
payrollRouter.put("/payroll/snapshots/:month/employee-rates", updatePayrollEmployeeRatesController);
payrollRouter.delete("/payroll/snapshots/:month", deletePayrollSnapshotController);
