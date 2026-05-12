import { type Request, type Response } from "express";
import { getOrganizationByQuery, requireOrgRole } from "../middleware/access";
import { resolveOptionalString } from "../utils/common";
import {
  getQuantitySettlementByMonth,
  saveQuantitySettlementByMonth,
} from "./quantitySettlement.service";

export const getQuantitySettlementController = async (req: Request, res: Response) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const settlement = await getQuantitySettlementByMonth(
    organization.id,
    String(req.query.month || "")
  );
  return res.json(settlement);
};

export const saveQuantitySettlementController = async (req: Request, res: Response) => {
  const accessContext = await requireOrgRole(req, res);
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

