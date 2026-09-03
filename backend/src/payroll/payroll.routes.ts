import { Router } from "express";
import {
  deletePayrollSnapshotController,
  getPayrollCalendarController,
  getPayrollController,
  getPayrollSettingsController,
  getPayrollReadinessController,
  listPayrollSnapshotsController,
  lockPayrollSnapshotController,
  savePayrollSnapshotController,
  unlockPayrollSnapshotController,
  updatePayrollEmployeeRatesController,
  updatePayrollSettingsController,
} from "./payroll.controller";

export const payrollRouter = Router();

payrollRouter.get("/payroll/snapshots", listPayrollSnapshotsController);
payrollRouter.get("/payroll/calendar", getPayrollCalendarController);
payrollRouter.get("/payroll/readiness", getPayrollReadinessController);
payrollRouter.get("/payroll/settings", getPayrollSettingsController);
payrollRouter.put("/payroll/settings", updatePayrollSettingsController);
payrollRouter.get("/payroll", getPayrollController);
payrollRouter.post("/payroll/snapshots", savePayrollSnapshotController);
payrollRouter.post("/payroll/snapshots/:month/lock", lockPayrollSnapshotController);
payrollRouter.post("/payroll/snapshots/:month/unlock", unlockPayrollSnapshotController);
payrollRouter.put("/payroll/snapshots/:month/employee-rates", updatePayrollEmployeeRatesController);
payrollRouter.delete("/payroll/snapshots/:month", deletePayrollSnapshotController);
