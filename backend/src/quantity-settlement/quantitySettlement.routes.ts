import { Router } from "express";
import {
  getQuantitySettlementController,
  saveQuantitySettlementController,
} from "./quantitySettlement.controller";

export const quantitySettlementRouter = Router();

quantitySettlementRouter.get("/quantity-settlement", getQuantitySettlementController);
quantitySettlementRouter.post("/quantity-settlement", saveQuantitySettlementController);
