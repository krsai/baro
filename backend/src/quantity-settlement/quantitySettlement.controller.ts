import { type Request, type Response } from "express";
import { requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  getQuantitySettlementByMonth,
  saveQuantitySettlementByMonth,
} from "./quantitySettlement.service";

const QUANTITY_SETTLEMENT_ROLES = ["ADMIN", "OPERATOR", "ACCOUNTANT"] as const;

export const getQuantitySettlementController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: [...QUANTITY_SETTLEMENT_ROLES],
  });
  if (!accessContext) return;
  const { organization } = accessContext;

  const settlement = await getQuantitySettlementByMonth(
    organization.id,
    String(req.query.month || "")
  );
  return res.json(settlement);
};

export const saveQuantitySettlementController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res, {
    allowedRoles: [...QUANTITY_SETTLEMENT_ROLES],
  });
  if (!accessContext) return;

  const settlement = await saveQuantitySettlementByMonth({
    orgId: accessContext.organization.id,
    month: String(req.body?.month || ""),
    savedBy:
      resolveOptionalString(req.body?.savedBy, null) ??
      accessContext.requesterEmail ??
      "unknown",
    rows: req.body?.rows,
  });

  return res.json(settlement);
};
