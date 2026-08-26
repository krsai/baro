import { Router } from "express";
import { prisma } from "../db";
import { getOrganizationByQuery, getRequesterEmail } from "../middleware/access";
import { validateSalaryFormula } from "./salaryFormula";

type Args = { requireSalarySystemManager: (req: any, res: any, orgId: number) => Promise<boolean> };
const PAY_TYPES = ["GENERAL", "OUTPUT"];
const toJsonSnapshot = (value: unknown) => JSON.parse(JSON.stringify(value));

export const createSalarySystemRouter = ({ requireSalarySystemManager }: Args) => {
  const router = Router();
  const state = async (orgId: number) => {
    const [items, rates, versions] = await Promise.all([
      prisma.salaryItem.findMany({ where: { orgId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      prisma.salaryItemRate.findMany({ where: { orgId }, orderBy: [{ payType: "asc" }, { gradeId: "asc" }, { salaryItemId: "asc" }] }),
      prisma.salarySystemVersion.findMany({ where: { orgId }, orderBy: { versionNumber: "desc" } }),
    ]);
    return {
      items: items.map(({ id, ...item }) => ({ ...item, id: item.code, databaseId: id })),
      rates: rates.map((rate) => ({ ...rate, salaryItemCode: items.find((item) => item.id === rate.salaryItemId)?.code })),
      versions: versions.map((version) => {
        const snapshot = version.snapshot && typeof version.snapshot === "object" && !Array.isArray(version.snapshot) ? version.snapshot as any : {};
        return { ...version, confirmedAt: version.confirmedDate.toISOString().slice(0, 10), items: Array.isArray(snapshot.items) ? snapshot.items : [], rates: Array.isArray(snapshot.rates) ? snapshot.rates : [] };
      }),
    };
  };
  const ensureInitialDraft = async (orgId: number) => {
    if (await prisma.salaryItem.findFirst({ where: { orgId }, select: { id: true } })) return;
    const legacy = await prisma.employeeCompensationPolicy.findMany({ where: { orgId } });
    const definitions = [
      { code: "baseSalary", name: "기본급", category: "BASE", payTypes: PAY_TYPES, formula: ["GRADE_RATE"], required: true },
      { code: "allowanceTotal", name: "수당", category: "ALLOWANCE", payTypes: PAY_TYPES, formula: ["GRADE_RATE"], required: false },
      { code: "incentiveTotal", name: "성과급", category: "INCENTIVE", payTypes: ["OUTPUT"], formula: ["PRODUCTION_ALLOWANCE"], required: true },
    ];
    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, definition] of definitions.entries()) {
        const item = await tx.salaryItem.create({ data: { orgId, ...definition, payCycle: "MONTHLY", sortOrder } });
        const field = definition.code === "baseSalary" ? "baseSalary" : definition.code === "allowanceTotal" ? "allowance" : "incentive";
        const rows = definition.category === "INCENTIVE" ? [] : legacy.map((row) => ({ orgId, payType: row.payType, gradeId: row.gradeId, salaryItemId: item.id, amount: row[field] }));
        if (rows.length) await tx.salaryItemRate.createMany({ data: rows });
      }
    });
  };
  const ensureFixedIncentiveItem = async (orgId: number) => {
    const incentiveItems = await prisma.salaryItem.findMany({ where: { orgId, category: "INCENTIVE", isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    if (incentiveItems.length === 0) {
      const last = await prisma.salaryItem.findFirst({ where: { orgId, isActive: true }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const data = { name: "성과급", category: "INCENTIVE", payTypes: ["OUTPUT"], formula: ["PRODUCTION_ALLOWANCE"], payCycle: "MONTHLY", capValue: null, required: true, sortOrder: (last?.sortOrder || 0) + 1, isActive: true };
      await prisma.salaryItem.upsert({ where: { orgId_code: { orgId, code: "incentiveTotal" } }, create: { orgId, code: "incentiveTotal", ...data }, update: data });
      return;
    }
    const [fixedItem, ...duplicates] = incentiveItems;
    const fixedItemId = fixedItem!.id;
    await prisma.$transaction(async (tx) => {
      await tx.salaryItem.update({ where: { id: fixedItemId }, data: { name: "성과급", payTypes: ["OUTPUT"], formula: ["PRODUCTION_ALLOWANCE"], payCycle: "MONTHLY", capValue: null, required: true } });
      await tx.salaryItemRate.deleteMany({ where: { orgId, salaryItemId: { in: incentiveItems.map((item) => item.id) } } });
      if (duplicates.length) await tx.salaryItem.updateMany({ where: { id: { in: duplicates.map((item) => item.id) } }, data: { isActive: false } });
    });
  };
  const ensureV1 = async (orgId: number, actor: string) => {
    if (await prisma.salarySystemVersion.findFirst({ where: { orgId }, select: { id: true } })) return;
    const current = await state(orgId);
    await prisma.salarySystemVersion.create({ data: { orgId, versionNumber: 1, effectiveMonth: "1900-01", confirmedBy: actor, snapshot: toJsonSnapshot({ items: current.items, rates: current.rates }) } });
  };

  router.get("/salary-system", async (req, res) => {
    const org = await getOrganizationByQuery(req);
    if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    await ensureInitialDraft(org.id);
    await ensureFixedIncentiveItem(org.id);
    await ensureV1(org.id, getRequesterEmail(req) || "system@baro.local");
    res.json(await state(org.id));
  });

  router.put("/salary-system", async (req, res) => {
    const org = await getOrganizationByQuery(req);
    if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const rates: any[] = Array.isArray(req.body?.rates) ? req.body.rates : [];
    const codes = new Set<string>();
    const categoryByCode = new Map<string, string>();
    for (const raw of items) {
      const code = String(raw?.code || raw?.id || "").trim();
      const category = String(raw?.category || "").toUpperCase();
      const capValue = raw?.capValue === "" || raw?.capValue == null ? null : Number(raw.capValue);
      if (!code || codes.has(code) || !String(raw?.name || "").trim() || !["BASE", "ALLOWANCE", "INCENTIVE"].includes(category) || !["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(raw?.payCycle) || (capValue !== null && (!Number.isSafeInteger(capValue) || capValue < 0)) || !validateSalaryFormula(raw?.formula, category)) return res.status(400).json({ ok: false, error: "invalid salary item" });
      codes.add(code);
      categoryByCode.set(code, category);
    }
    if (items.filter((raw) => String(raw?.category || "").toUpperCase() === "INCENTIVE").length !== 1) return res.status(400).json({ ok: false, error: "exactly one fixed incentive item is required" });
    const gradeIds = new Set((await prisma.employeeGrade.findMany({ where: { orgId: org.id, isActive: true }, select: { id: true } })).map((row) => row.id));
    const rateKeys = rates.map((r) => `${r.payType}:${Number(r.gradeId)}:${String(r.salaryItemCode)}`);
    if (new Set(rateKeys).size !== rateKeys.length || rates.some((r) => !codes.has(String(r.salaryItemCode)) || categoryByCode.get(String(r.salaryItemCode)) === "INCENTIVE" || !PAY_TYPES.includes(r.payType) || !gradeIds.has(Number(r.gradeId)) || !Number.isSafeInteger(Number(r.amount)) || Number(r.amount) < 0)) return res.status(400).json({ ok: false, error: "invalid salary rate" });
    await prisma.$transaction(async (tx) => {
      const ids = new Map<string, number>();
      for (const [sortOrder, raw] of items.entries()) {
        const code = String(raw.code || raw.id).trim(); const category = String(raw.category).toUpperCase();
        const data = { name: category === "INCENTIVE" ? "성과급" : String(raw.name).trim(), category, payTypes: category === "INCENTIVE" ? ["OUTPUT"] : PAY_TYPES, formula: category === "INCENTIVE" ? ["PRODUCTION_ALLOWANCE"] : raw.formula, payCycle: category === "INCENTIVE" ? "MONTHLY" : raw.payCycle, capValue: category === "INCENTIVE" ? null : raw.capValue === "" || raw.capValue == null ? null : Number(raw.capValue), required: category === "INCENTIVE" || raw.required === true, sortOrder, isActive: true };
        const saved = await tx.salaryItem.upsert({ where: { orgId_code: { orgId: org.id, code } }, create: { orgId: org.id, code, ...data }, update: data }); ids.set(code, saved.id);
      }
      await tx.salaryItem.updateMany({ where: { orgId: org.id, code: { notIn: [...codes] }, required: false }, data: { isActive: false } });
      await tx.salaryItemRate.deleteMany({ where: { orgId: org.id } });
      if (rates.length) await tx.salaryItemRate.createMany({ data: rates.map((r) => ({ orgId: org.id, payType: r.payType, gradeId: Number(r.gradeId), salaryItemId: ids.get(String(r.salaryItemCode))!, amount: Number(r.amount) })) });
    });
    res.json(await state(org.id));
  });

  router.post("/salary-system/versions", async (req, res) => {
    const org = await getOrganizationByQuery(req); if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const actor = getRequesterEmail(req) || "system@baro.local"; await ensureInitialDraft(org.id); await ensureFixedIncentiveItem(org.id); await ensureV1(org.id, actor); const current = await state(org.id);
    const last = await prisma.salarySystemVersion.findFirst({ where: { orgId: org.id }, orderBy: { versionNumber: "desc" } });
    const created = await prisma.salarySystemVersion.create({ data: { orgId: org.id, versionNumber: (last?.versionNumber || 0) + 1, effectiveMonth: null, confirmedBy: actor, snapshot: toJsonSnapshot({ items: current.items, rates: current.rates }) } }); res.status(201).json(created);
  });

  router.put("/salary-system/version-boundaries", async (req, res) => {
    const org = await getOrganizationByQuery(req); if (!org) return res.status(404).json({ ok: false, error: "organization not found" });
    if (!(await requireSalarySystemManager(req, res, org.id))) return;
    const boundaries: any[] = Array.isArray(req.body?.boundaries) ? req.body.boundaries : [];
    const versions = await prisma.salarySystemVersion.findMany({ where: { orgId: org.id }, orderBy: { versionNumber: "asc" } });
    const editableVersions = versions.filter((version) => version.versionNumber > 1);
    const versionById = new Map(editableVersions.map((version) => [version.id, version]));
    const seenVersionIds = new Set<number>(); const seenMonths = new Set<string>();
    for (const row of boundaries) {
      const versionId = Number(row?.versionId); const startMonth = String(row?.startMonth || "");
      if (!versionById.has(versionId) || seenVersionIds.has(versionId) || seenMonths.has(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) return res.status(400).json({ ok: false, error: "invalid salary version boundaries" });
      seenVersionIds.add(versionId); seenMonths.add(startMonth);
    }
    const ordered = [...boundaries].sort((a, b) => String(a.startMonth).localeCompare(String(b.startMonth)));
    for (let index = 1; index < ordered.length; index += 1) {
      if (versionById.get(Number(ordered[index - 1].versionId))!.versionNumber >= versionById.get(Number(ordered[index].versionId))!.versionNumber) return res.status(400).json({ ok: false, error: "salary version boundaries must follow version order" });
    }
    await prisma.$transaction(async (tx) => {
      if (editableVersions.length) await tx.salarySystemVersion.updateMany({ where: { orgId: org.id, versionNumber: { gt: 1 } }, data: { effectiveMonth: null } });
      for (const row of boundaries) await tx.salarySystemVersion.update({ where: { id: Number(row.versionId) }, data: { effectiveMonth: String(row.startMonth) } });
    });
    res.json(await state(org.id));
  });
  return router;
};
