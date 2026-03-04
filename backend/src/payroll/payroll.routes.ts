import { Router } from "express";
import {
  deletePayrollSnapshotController,
  getPayrollController,
  listPayrollSnapshotsController,
  lockPayrollController,
} from "./payroll.controller";

export const payrollRouter = Router();

payrollRouter.get("/payroll/snapshots", listPayrollSnapshotsController);
payrollRouter.get("/payroll", getPayrollController);
payrollRouter.post("/payroll/lock", lockPayrollController);
payrollRouter.delete("/payroll/snapshots/:month", deletePayrollSnapshotController);
