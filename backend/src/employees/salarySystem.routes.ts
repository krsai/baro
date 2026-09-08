import { createHttpError } from "../utils/http";
import { editRevision, assertEditRevision, editTransaction } from "../utils/editRevision";
import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import { validateSalaryFormula } from "./salaryFormula";
import { normalizeCurrencyCode } from "../currency";

type Args = { requireSalarySystemManager: (req: any, res: any, orgId: number) => Promise<boolean> };
const PAY_TYPES = ["GENERAL", "OUTPUT_FIXED", "OUTPUT"];
const PAYMENT_MONTHS_BY_CYCLE = {
  MONTHLY: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  QUARTERLY: [3, 6, 9, 12],
  SEMIANNUAL: [6, 12],
  ANNUAL: [12],
} as const;
const toJsonSnapshot = (value: unknown) => JSON.parse(JSON.stringify(value));

export const createSalarySystemRouter = ({ requireSalarySystemManager }: Args) => {
  const router = Router();
  const resolveFactory = async (orgId: number, rawFactoryId: unknown) => {
    const requestedId = Number(rawFactoryId);
    if (Number.isSafeInteger(requestedId) && requestedId > 0) return prisma.factory.findFirst({ where: { id: requestedId, orgId } });
    return prisma.factory.findFirst({ where: { orgId }, orderBy: { id: "asc" } });
  };
  const state = async (orgId: number, factoryId: number, db: typeof prisma | import("@prisma/client").Prisma.TransactionClient = prisma) => {
    const [factory, items, rates, versions] = await Promise.all([
      db.factory.findFirst({ where: { id: factoryId, orgId }, select: { salaryCurrency: { select: { code: true } }, organization: { select: { salaryCurrency: { select: { code: true } } } } } }),
      db.salaryItem.findMany({ where: { orgId, factoryId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      db.salaryItemRate.findMany({ where: { orgId, factoryId }, orderBy: [{ payType: "asc" }, { gradeId: "asc" }, { salaryItemId: "asc" }] }),
      db.salarySystemVersion.findMany({ where: { orgId, factoryId }, orderBy: { versionNumber: "desc" } }),
    ]);
    const result = {
      factoryId,
      currencyCode: factory?.salaryCurrency?.code || factory?.organization.salaryCurrency?.code || "VND",
      items: items.map(({ id, ...item }) => ({ ...item, id: item.code, databaseId: id })),
      rates: rates.map((rate) => ({ ...rate, salaryItemCode: items.find((item) => item.id === rate.salaryItemId)?.code })),
      versions: versions.map((version) => {
        const snapshot = version.snapshot && typeof version.snapshot === "object" && !Array.isArray(version.snapshot) ? version.snapshot as any : {};
        return { ...version, confirmedAt: version.confirmedDate.toISOString().slice(0, 10), currencyCode: normalizeCurrencyCode(snapshot.currencyCode) || "VND", items: Array.isArray(snapshot.items) ? snapshot.items : [], rates: Array.isArray(snapshot.rates) ? snapshot.rates : [] };
      }),
    };
    return { ...result, editRevision: editRevision(result) };
  };
  const ensureInitialDraft = async (orgId: number, factoryId: number) => {
    if (await prisma.salaryItem.findFirst({ where: { orgId, factoryId }, select: { id: true } })) return;
    const legacy = await prisma.employeeCompensationPolicy.findMany({ where: { orgId } });
    const definitions = [
      { code: "baseSalary", name: "기본급", nameKo: "기본급", nameEn: "Base Salary", nameVi: "Lương cơ bản", category: "BASE", payTypes: PAY_TYPES, formula: ["GRADE_RATE"], required: true },
      { code: "allowanceTotal", name: "수당", nameKo: "수당", nameEn: "Allowance", nameVi: "Phụ cấp", category: "ALLOWANCE", payTypes: PAY_TYPES, formula: ["GRADE_RATE"], required: false },
      { code: "incentiveTotal", name: "생산수당", nameKo: "생산수당", nameEn: "Production Allowance", nameVi: "Phụ cấp sản lượng", category: "INCENTIVE", payTypes: ["OUTPUT"], formula: ["PRODUCTION_ALLOWANCE"], required: true },
    ];
    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, definition] of definitions.entries()) {
        const item = await tx.salaryItem.create({ data: { orgId, factoryId, ...definition, payCycle: "MONTHLY", paymentMonths: PAYMENT_MONTHS_BY_CYCLE.MONTHLY, sortOrder } });
        const field = definition.code === "baseSalary" ? "baseSalary" : definition.code === "allowanceTotal" ? "allowance" : "incentive";
        const rows = definition.category === "INCENTIVE" ? [] : legacy.map((row) => ({ orgId, factoryId, payType: row.payType, gradeId: row.gradeId, salaryItemId: item.id, amount: row[field] }));
        if (rows.length) await tx.salaryItemRate.createMany({ data: rows });
      }
    });
  };
  // Only the single item coded "incentiveTotal" is the fixed production-allowance
  // passthrough. Other INCENTIVE-category items (e.g. a production-ST-excess bonus)
  // are ordinary user-managed items and must not be touched here.
  const ensureFixedIncentiveItem = async (orgId: number, factoryId: number) => {
    const fixedItem = await prisma.salaryItem.findFirst({ where: { orgId, factoryId, code: "incentiveTotal" } });
    const data = { name: "생산수당", nameKo: "생산수당", nameEn: "Production Allowance", nameVi: "Phụ cấp sản lượng", category: "INCENTIVE", payTypes: ["OUTPUT"], formula: ["PRODUCTION_ALLOWANCE"], payCycle: "MONTHLY", paymentMonths: PAYMENT_MONTHS_BY_CYCLE.MONTHLY, capValue: null, required: true, isActive: true };
    if (!fixedItem) {
      const last = await prisma.salaryItem.findFirst({ where: { orgId, factoryId, isActive: true }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      await prisma.salaryItem.upsert({ where: { factoryId_code: { factoryId, code: "incentiveTotal" } }, create: { orgId, factoryId, code: "incentiveTotal", ...data, sortOrder: (last?.sortOrder || 0) + 1 }, update: data });
      return;
    }
    const isCanonical = fixedItem.name === data.name && fixedItem.nameEn === data.nameEn && fixedItem.nameVi === data.nameVi
      && fixedItem.category === data.category && JSON.stringify(fixedItem.payTypes) === JSON.stringify(data.payTypes)
      && JSON.stringify(fixedItem.formula) === JSON.stringify(data.formula) && fixedItem.payCycle === data.payCycle
      && JSON.stringify(fixedItem.paymentMonths) === JSON.stringify(data.paymentMonths) && fixedItem.capValue === null
      && fixedItem.required && fixedItem.isActive;
    if (!isCanonical) await prisma.salaryItem.update({ where: { id: fixedItem.id }, data });
  };
  const ensureV1 = async (orgId: number, factoryId: number, actor: string) => {
    if (await prisma.salarySystemVersion.findFirst({ where: { orgId, factoryId }, select: { id: true } })) return;
    const current = await state(orgId, factoryId);
    await prisma.salarySystemVersion.create({ data: { orgId, factoryId, versionNumber: 1, effectiveMonth: "1900-01", confirmedBy: actor, snapshot: toJsonSnapshot({ currencyCode: current.currencyCode, items: current.items, rates: current.rates }) } });
  };

  router.get("/salary-system", async (req, res) => {
    const org = await getOrganizationByQuery(req);
    if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const factory = await resolveFactory(org.id, req.query.factoryId);
    if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    await ensureInitialDraft(org.id, factory.id);
    await ensureFixedIncentiveItem(org.id, factory.id);
    await ensureV1(org.id, factory.id, getRequesterEmail(req) || "system@baro.local");
    res.json(await state(org.id, factory.id));
  });

  router.get("/salary-system/revision", async (req, res) => {
    const org = await getOrganizationByQuery(req);
    if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const factory = await resolveFactory(org.id, req.query.factoryId);
    if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    res.json({ editRevision: (await state(org.id, factory.id)).editRevision });
  });

  router.put("/salary-system", async (req, res) => {
    const org = await getOrganizationByQuery(req);
    if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const factory = await resolveFactory(org.id, req.query.factoryId);
    if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const rates: any[] = Array.isArray(req.body?.rates) ? req.body.rates : [];
    const currencyCode = normalizeCurrencyCode(req.body?.currencyCode);
    if (!currencyCode) return res.status(400).json({ ok: false, error: "invalid salary currency" });
    const codes = new Set<string>();
    const payTypesByCode = new Map<string, string[]>();
    for (const raw of items) {
      const code = String(raw?.code || raw?.id || "").trim();
      const category = String(raw?.category || "").toUpperCase();
      const payCycle = String(raw?.payCycle || "").toUpperCase();
      const payTypes: string[] = Array.isArray(raw?.payTypes) ? raw.payTypes.map((value: unknown) => String(value).toUpperCase()) : [];
      const paymentMonths: number[] = Array.isArray(raw?.paymentMonths) ? raw.paymentMonths.map(Number).sort((a: number, b: number) => a - b) : [];
      const capValue = raw?.capValue === "" || raw?.capValue == null ? null : Number(raw.capValue);
      const expectedMonthCount = PAYMENT_MONTHS_BY_CYCLE[payCycle as keyof typeof PAYMENT_MONTHS_BY_CYCLE]?.length;
      if (!code || codes.has(code) || [raw?.nameKo, raw?.nameEn, raw?.nameVi].some((name) => !String(name || "").trim()) || !["BASE", "ALLOWANCE", "INCENTIVE"].includes(category) || payTypes.length < 1 || new Set(payTypes).size !== payTypes.length || payTypes.some((value) => !PAY_TYPES.includes(value)) || (category === "INCENTIVE" && (payTypes.length !== 1 || payTypes[0] !== "OUTPUT")) || !expectedMonthCount || paymentMonths.length !== expectedMonthCount || new Set(paymentMonths).size !== paymentMonths.length || paymentMonths.some((month) => !Number.isInteger(month) || month < 1 || month > 12) || (category === "INCENTIVE" && paymentMonths.some((month, index) => month !== PAYMENT_MONTHS_BY_CYCLE.MONTHLY[index])) || (capValue !== null && (!Number.isSafeInteger(capValue) || capValue < 0)) || !validateSalaryFormula(raw?.formula, category)) return res.status(400).json({ ok: false, error: "invalid salary item" });
      codes.add(code);
      payTypesByCode.set(code, payTypes);
    }
    // Exactly one item must be the fixed production-allowance passthrough (code
    // "incentiveTotal"); other INCENTIVE-category items are optional and user-defined
    // (e.g. a production-ST-excess bonus), so they are not counted here.
    if (items.filter((raw) => String(raw?.code || raw?.id || "").trim() === "incentiveTotal").length !== 1) return res.status(400).json({ ok: false, error: "exactly one fixed incentive item is required" });
    const gradeIds = new Set((await prisma.employeeGrade.findMany({ where: { orgId: org.id, isActive: true }, select: { id: true } })).map((row) => row.id));
    const rateKeys = rates.map((r) => `${r.payType}:${Number(r.gradeId)}:${String(r.salaryItemCode)}`);
    if (new Set(rateKeys).size !== rateKeys.length || rates.some((r) => !codes.has(String(r.salaryItemCode)) || String(r.salaryItemCode) === "incentiveTotal" || !PAY_TYPES.includes(r.payType) || !payTypesByCode.get(String(r.salaryItemCode))?.includes(r.payType) || !gradeIds.has(Number(r.gradeId)) || !Number.isSafeInteger(Number(r.amount)) || Number(r.amount) < 0)) return res.status(400).json({ ok: false, error: "invalid salary rate" });
    const result = await editTransaction(prisma, async (tx) => {
      assertEditRevision(req.body?.expectedRevision, (await state(org.id, factory.id, tx)).editRevision);
      const currency = await tx.currency.findUnique({ where: { code: currencyCode }, select: { id: true } });
      if (!currency) throw new Error(`currency ${currencyCode} is not configured`);
      await tx.factory.update({ where: { id: factory.id }, data: { salaryCurrencyId: currency.id } });
      const ids = new Map<string, number>();
      for (const [sortOrder, raw] of items.entries()) {
        const code = String(raw.code || raw.id).trim(); const category = String(raw.category).toUpperCase();
        // Only the fixed passthrough item (code "incentiveTotal") is forced to the
        // canonical name/formula/cap. Other INCENTIVE-category items (e.g. a
        // production-ST-excess bonus) keep the user's own name/formula/cap, same as
        // BASE/ALLOWANCE items - only their payTypes/payCycle/paymentMonths are still
        // forced to the INCENTIVE-wide rule (output-only, monthly).
        const isFixedIncentiveTotal = code === "incentiveTotal";
        const nameKo = isFixedIncentiveTotal ? "생산수당" : String(raw.nameKo).trim(); const nameEn = isFixedIncentiveTotal ? "Production Allowance" : String(raw.nameEn).trim(); const nameVi = isFixedIncentiveTotal ? "Phụ cấp sản lượng" : String(raw.nameVi).trim();
        const data = { name: nameKo, nameKo, nameEn, nameVi, category, payTypes: category === "INCENTIVE" ? ["OUTPUT"] : payTypesByCode.get(code)!, formula: isFixedIncentiveTotal ? ["PRODUCTION_ALLOWANCE"] : raw.formula, payCycle: category === "INCENTIVE" ? "MONTHLY" : raw.payCycle, paymentMonths: category === "INCENTIVE" ? PAYMENT_MONTHS_BY_CYCLE.MONTHLY : raw.paymentMonths, capValue: isFixedIncentiveTotal ? null : raw.capValue === "" || raw.capValue == null ? null : Number(raw.capValue), required: isFixedIncentiveTotal || raw.required === true, sortOrder, isActive: true };
        const saved = await tx.salaryItem.upsert({ where: { factoryId_code: { factoryId: factory.id, code } }, create: { orgId: org.id, factoryId: factory.id, code, ...data }, update: data }); ids.set(code, saved.id);
      }
      await tx.salaryItem.updateMany({ where: { orgId: org.id, factoryId: factory.id, code: { notIn: [...codes] }, required: false }, data: { isActive: false } });
      await tx.salaryItemRate.deleteMany({ where: { orgId: org.id, factoryId: factory.id } });
      if (rates.length) await tx.salaryItemRate.createMany({ data: rates.map((r) => ({ orgId: org.id, factoryId: factory.id, payType: r.payType, gradeId: Number(r.gradeId), salaryItemId: ids.get(String(r.salaryItemCode))!, amount: Number(r.amount) })) });
      if (req.body?.createVersion === true) {
        const current = await state(org.id, factory.id, tx);
        await tx.salarySystemVersion.create({ data: { orgId: org.id, factoryId: factory.id, versionNumber: (current.versions[0]?.versionNumber || 0) + 1, effectiveMonth: null, confirmedBy: getRequesterEmail(req) || "system@baro.local", snapshot: toJsonSnapshot({ currencyCode: current.currencyCode, items: current.items, rates: current.rates }) } });
      }
      return state(org.id, factory.id, tx);
    });
    res.json(result);
  });

  router.post("/salary-system/versions", async (req, res) => {
    const org = await getOrganizationByQuery(req); if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const factory = await resolveFactory(org.id, req.query.factoryId); if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    const created = await editTransaction(prisma, async (tx) => {
      const current = await state(org.id, factory.id, tx);
      assertEditRevision(req.body?.expectedRevision, current.editRevision);
      return tx.salarySystemVersion.create({ data: { orgId: org.id, factoryId: factory.id, versionNumber: (current.versions[0]?.versionNumber || 0) + 1, effectiveMonth: null, confirmedBy: getRequesterEmail(req) || "system@baro.local", snapshot: toJsonSnapshot({ currencyCode: current.currencyCode, items: current.items, rates: current.rates }) } });
    });
    res.status(201).json(created);
  });

  router.put("/salary-system/version-boundaries", async (req, res) => {
    const org = await getOrganizationByQuery(req); if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const factory = await resolveFactory(org.id, req.query.factoryId); if (!factory) return res.status(404).json({ ok: false, error: "factory not found" });
    const boundaries: any[] = Array.isArray(req.body?.boundaries) ? req.body.boundaries : [];
    const result = await editTransaction(prisma, async (tx) => {
      assertEditRevision(req.body?.expectedRevision, (await state(org.id, factory.id, tx)).editRevision);
      const versions = await tx.salarySystemVersion.findMany({ where: { orgId: org.id, factoryId: factory.id }, orderBy: { versionNumber: "asc" } });
      const editableVersions = versions.filter((version) => version.versionNumber > 1);
      const versionById = new Map(editableVersions.map((version) => [version.id, version]));
      const seenVersionIds = new Set<number>(); const seenMonths = new Set<string>();
      for (const row of boundaries) {
        const versionId = Number(row?.versionId); const startMonth = String(row?.startMonth || "");
        if (!versionById.has(versionId) || seenVersionIds.has(versionId) || seenMonths.has(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) throw createHttpError(400, "invalid salary version boundaries");
        seenVersionIds.add(versionId); seenMonths.add(startMonth);
      }
      const ordered = [...boundaries].sort((a, b) => String(a.startMonth).localeCompare(String(b.startMonth)));
      for (let index = 1; index < ordered.length; index += 1) {
        if (versionById.get(Number(ordered[index - 1].versionId))!.versionNumber >= versionById.get(Number(ordered[index].versionId))!.versionNumber) throw createHttpError(400, "salary version boundaries must follow version order");
      }

      if (editableVersions.length) await tx.salarySystemVersion.updateMany({ where: { orgId: org.id, factoryId: factory.id, versionNumber: { gt: 1 } }, data: { effectiveMonth: null } });
      for (const row of boundaries) await tx.salarySystemVersion.update({ where: { id: Number(row.versionId) }, data: { effectiveMonth: String(row.startMonth) } });
      return state(org.id, factory.id, tx);
    });
    res.json(result);
  });
  return router;
};
