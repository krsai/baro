#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const normalizeText = (value) => String(value ?? "").trim();
const normalizeKey = (value) => normalizeText(value).toUpperCase();
const normalizeGender = (value) => {
  const key = normalizeKey(value);
  if (key === "M" || key === "W" || key === "U") return key;
  return "";
};

const hasCorruptedText = (value) => {
  const text = normalizeText(value);
  if (!text) return false;
  return text.includes("?") || text.includes("�");
};

const shouldReplaceText = (current, next) => {
  const currentText = normalizeText(current);
  const nextText = normalizeText(next);
  if (!nextText) return false;
  if (!currentText) return true;
  return hasCorruptedText(currentText);
};

const parseCardIdentity = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const parts = text.split("::");
  if (parts.length < 2) return null;
  const [orderId, styleId, color, gender] = parts;
  if (!orderId || !styleId) return null;
  return {
    orderId,
    styleId,
    colorKey: normalizeKey(color),
    gender: normalizeGender(gender),
  };
};

const findOrderItemByIdentity = (order, identity) => {
  if (!order || !identity) return null;
  const items = Array.isArray(order.items) ? order.items : [];
  const styleIdKey = normalizeText(identity.styleId);
  const colorKey = normalizeKey(identity.colorKey);
  const genderKey = normalizeGender(identity.gender);

  const exact = items.find((item) => {
    const itemStyleId = normalizeText(item?.styleId);
    if (!itemStyleId || itemStyleId !== styleIdKey) return false;
    const itemColorKey = normalizeKey(item?.colorCode || item?.colorId || item?.colorName);
    const itemGender = normalizeGender(item?.gender);
    if (colorKey && itemColorKey && colorKey !== itemColorKey) return false;
    if (genderKey && itemGender && genderKey !== itemGender) return false;
    return true;
  });
  if (exact) return exact;

  return (
    items.find((item) => normalizeText(item?.styleId) === styleIdKey) || null
  );
};

const buildLabel = (styleName, gender) => {
  const name = normalizeText(styleName);
  const normalizedGender = normalizeGender(gender);
  if (!name) return "";
  return normalizedGender ? `${name} [${normalizedGender}]` : name;
};

const resolveFallbackDisplay = ({
  target,
  styleByStyleId,
  orderByOrderId,
  orderByOrderNumber,
  cardIdentityText,
}) => {
  const cardIdentity = parseCardIdentity(cardIdentityText);
  const orderNo = normalizeText(target?.orderNo);
  const styleIdFromIdentity = normalizeText(cardIdentity?.styleId);
  const order =
    (cardIdentity?.orderId ? orderByOrderId.get(cardIdentity.orderId) : null) ||
    (orderNo ? orderByOrderNumber.get(orderNo) : null) ||
    null;
  const orderItem = findOrderItemByIdentity(order, cardIdentity);
  const style = styleIdFromIdentity ? styleByStyleId.get(styleIdFromIdentity) || null : null;
  const hasVariantIdentity = Boolean(
    normalizeKey(cardIdentity?.colorKey) || normalizeGender(cardIdentity?.gender)
  );
  const gender =
    normalizeGender(cardIdentity?.gender) ||
    normalizeGender(target?.gender) ||
    (hasVariantIdentity ? normalizeGender(orderItem?.gender) : "");

  const resolvedStyleName =
    normalizeText(orderItem?.styleName) ||
    normalizeText(style?.name) ||
    normalizeText(target?.styleName) ||
    normalizeText(target?.label).replace(/\s*\[(M|W|U)\]\s*$/i, "").trim();
  const resolvedCustomer =
    normalizeText(order?.customerName) ||
    normalizeText(order?.buyerOrgName) ||
    normalizeText(style?.customer) ||
    normalizeText(target?.customer);
  const resolvedOrderNo =
    normalizeText(order?.orderNumber) || normalizeText(target?.orderNo);
  const resolvedColorName =
    (hasVariantIdentity ? normalizeText(orderItem?.colorName) : "") ||
    normalizeText(target?.colorName);
  const resolvedLabel = buildLabel(resolvedStyleName, gender);

  return {
    orderNo: resolvedOrderNo,
    customer: resolvedCustomer,
    styleName: resolvedStyleName,
    colorName: resolvedColorName,
    label: resolvedLabel,
    gender,
  };
};

const repairAssignmentLikeItem = (item, fallback) => {
  if (!item || typeof item !== "object") {
    return { value: item, changed: false };
  }
  const next = { ...item };
  let changed = false;

  const replaceField = (field, value) => {
    if (!shouldReplaceText(next[field], value)) return;
    next[field] = normalizeText(value);
    changed = true;
  };

  replaceField("orderNo", fallback.orderNo);
  replaceField("customer", fallback.customer);
  replaceField("label", fallback.label);
  replaceField("colorName", fallback.colorName);

  if (!normalizeText(next.gender) && normalizeText(fallback.gender)) {
    next.gender = fallback.gender;
    changed = true;
  }

  return { value: next, changed };
};

const repairCardItem = (card, fallback) => {
  if (!card || typeof card !== "object") {
    return { value: card, changed: false };
  }
  const next = { ...card };
  let changed = false;

  const replaceField = (field, value) => {
    if (!shouldReplaceText(next[field], value)) return;
    next[field] = normalizeText(value);
    changed = true;
  };

  replaceField("orderNo", fallback.orderNo);
  replaceField("customer", fallback.customer);
  replaceField("styleName", fallback.styleName);
  replaceField("colorName", fallback.colorName);

  if (!normalizeText(next.gender) && normalizeText(fallback.gender)) {
    next.gender = fallback.gender;
    changed = true;
  }

  return { value: next, changed };
};

const buildOrderMaps = (orders) => {
  const orderByOrderId = new Map();
  const orderByOrderNumber = new Map();
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderId = normalizeText(order?.orderId);
    const orderNo = normalizeText(order?.orderNumber);
    if (orderId) orderByOrderId.set(orderId, order);
    if (orderNo) orderByOrderNumber.set(orderNo, order);
  });
  return { orderByOrderId, orderByOrderNumber };
};

const repairOrganization = async (orgId) => {
  const [styles, orders, boardState, plans] = await Promise.all([
    prisma.style.findMany({ where: { orgId } }),
    prisma.workOrder.findMany({ where: { orgId } }),
    prisma.assignmentBoardState.findUnique({ where: { orgId } }),
    prisma.assignmentPlan.findMany({ where: { orgId } }),
  ]);

  const styleByStyleId = new Map(
    (Array.isArray(styles) ? styles : []).map((style) => [normalizeText(style?.styleId), style])
  );
  const { orderByOrderId, orderByOrderNumber } = buildOrderMaps(orders);

  let updatedPlanCount = 0;
  for (const plan of plans) {
    const fallback = resolveFallbackDisplay({
      target: plan,
      styleByStyleId,
      orderByOrderId,
      orderByOrderNumber,
      cardIdentityText: plan?.cardId || plan?.originOrderId || "",
    });
    const repaired = repairAssignmentLikeItem(plan, fallback);
    if (!repaired.changed) continue;
    await prisma.assignmentPlan.update({
      where: { id: plan.id },
      data: {
        orderNo: normalizeText(repaired.value.orderNo) || null,
        customer: normalizeText(repaired.value.customer) || null,
        label: normalizeText(repaired.value.label) || null,
        colorName: normalizeText(repaired.value.colorName) || null,
      },
    });
    updatedPlanCount += 1;
  }

  let updatedBoardCards = 0;
  let updatedBoardAssignments = 0;
  if (boardState) {
    const cards = Array.isArray(boardState.cards) ? boardState.cards : [];
    const assignments = Array.isArray(boardState.assignments) ? boardState.assignments : [];

    const repairedCards = cards.map((card) => {
      const fallback = resolveFallbackDisplay({
        target: card,
        styleByStyleId,
        orderByOrderId,
        orderByOrderNumber,
        cardIdentityText: card?.id || card?.originOrderId || "",
      });
      const repaired = repairCardItem(card, fallback);
      if (repaired.changed) updatedBoardCards += 1;
      return repaired.value;
    });

    const repairedAssignments = assignments.map((assignment) => {
      const fallback = resolveFallbackDisplay({
        target: assignment,
        styleByStyleId,
        orderByOrderId,
        orderByOrderNumber,
        cardIdentityText:
          assignment?.cardId || assignment?.originOrderId || assignment?.id || "",
      });
      const repaired = repairAssignmentLikeItem(assignment, fallback);
      if (repaired.changed) updatedBoardAssignments += 1;
      return repaired.value;
    });

    if (updatedBoardCards > 0 || updatedBoardAssignments > 0) {
      await prisma.assignmentBoardState.update({
        where: { id: boardState.id },
        data: {
          cards: repairedCards,
          assignments: repairedAssignments,
        },
      });
    }
  }

  return {
    orgId,
    updatedPlanCount,
    updatedBoardCards,
    updatedBoardAssignments,
  };
};

const parseOrgIdArg = () => {
  const arg = process.argv.find((value) => String(value).startsWith("--orgId="));
  if (!arg) return null;
  const raw = String(arg).split("=")[1];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid orgId argument: ${raw}`);
  }
  return Math.trunc(parsed);
};

async function main() {
  const targetOrgId = parseOrgIdArg();
  const orgIds = targetOrgId
    ? [targetOrgId]
    : (
        await prisma.organization.findMany({
          select: { id: true },
          orderBy: { id: "asc" },
        })
      ).map((org) => org.id);

  const results = [];
  for (const orgId of orgIds) {
    const result = await repairOrganization(orgId);
    results.push(result);
  }

  const summary = results.reduce(
    (acc, row) => {
      acc.organizations += 1;
      acc.updatedPlanCount += row.updatedPlanCount;
      acc.updatedBoardCards += row.updatedBoardCards;
      acc.updatedBoardAssignments += row.updatedBoardAssignments;
      return acc;
    },
    {
      organizations: 0,
      updatedPlanCount: 0,
      updatedBoardCards: 0,
      updatedBoardAssignments: 0,
    }
  );

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main()
  .catch((error) => {
    console.error("[repair-assignment-text] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
