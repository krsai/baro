import { Router } from "express";
import {
  deletePayrollSnapshotController,
  getPayrollCalendarController,
  getPayrollController,
  getPayrollReadinessController,
  listPayrollSnapshotsController,
  savePayrollSnapshotController,
} from "./payroll.controller";

export const payrollRouter = Router();

payrollRouter.get("/payroll/snapshots", listPayrollSnapshotsController);
payrollRouter.get("/payroll/calendar", getPayrollCalendarController);
payrollRouter.get("/payroll/readiness", getPayrollReadinessController);
payrollRouter.get("/payroll", getPayrollController);
payrollRouter.post("/payroll/snapshots", savePayrollSnapshotController);
payrollRouter.post("/payroll/lock", savePayrollSnapshotController);
payrollRouter.delete("/payroll/snapshots/:month", deletePayrollSnapshotController);
