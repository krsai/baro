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
      { code: "incentiveTotal", name: "성과급", category: "INCENTIVE", payTypes: ["OUTPUT"], formula: ["GRADE_RATE"], required: false },
    ];
    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, definition] of definitions.entries()) {
        const item = await tx.salaryItem.create({ data: { orgId, ...definition, payCycle: "MONTHLY", sortOrder } });
        const field = definition.code === "baseSalary" ? "baseSalary" : definition.code === "allowanceTotal" ? "allowance" : "incentive";
        const rows = legacy.filter((row) => definition.category !== "INCENTIVE" || row.payType === "OUTPUT").map((row) => ({ orgId, payType: row.payType, gradeId: row.gradeId, salaryItemId: item.id, amount: row[field] }));
        if (rows.length) await tx.salaryItemRate.createMany({ data: rows });
      }
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
    for (const raw of items) {
      const code = String(raw?.code || raw?.id || "").trim();
      const category = String(raw?.category || "").toUpperCase();
      const capValue = raw?.capValue === "" || raw?.capValue == null ? null : Number(raw.capValue);
      if (!code || codes.has(code) || !String(raw?.name || "").trim() || !["BASE", "ALLOWANCE", "INCENTIVE"].includes(category) || !["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(raw?.payCycle) || (capValue !== null && (!Number.isSafeInteger(capValue) || capValue < 0)) || !validateSalaryFormula(raw?.formula, category)) return res.status(400).json({ ok: false, error: "invalid salary item" });
      codes.add(code);
    }
    const gradeIds = new Set((await prisma.employeeGrade.findMany({ where: { orgId: org.id, isActive: true }, select: { id: true } })).map((row) => row.id));
    const rateKeys = rates.map((r) => `${r.payType}:${Number(r.gradeId)}:${String(r.salaryItemCode)}`);
    if (new Set(rateKeys).size !== rateKeys.length || rates.some((r) => !codes.has(String(r.salaryItemCode)) || !PAY_TYPES.includes(r.payType) || !gradeIds.has(Number(r.gradeId)) || !Number.isSafeInteger(Number(r.amount)) || Number(r.amount) < 0)) return res.status(400).json({ ok: false, error: "invalid salary rate" });
    await prisma.$transaction(async (tx) => {
      const ids = new Map<string, number>();
      for (const [sortOrder, raw] of items.entries()) {
        const code = String(raw.code || raw.id).trim(); const category = String(raw.category).toUpperCase();
        const data = { name: String(raw.name).trim(), category, payTypes: category === "INCENTIVE" ? ["OUTPUT"] : PAY_TYPES, formula: raw.formula, payCycle: raw.payCycle, capValue: raw.capValue === "" || raw.capValue == null ? null : Number(raw.capValue), required: raw.required === true, sortOrder, isActive: true };
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
    const effectiveMonth = String(req.body?.effectiveMonth || ""); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) return res.status(400).json({ ok: false, error: "valid effectiveMonth is required" });
    if (await prisma.salarySystemVersion.findUnique({ where: { orgId_effectiveMonth: { orgId: org.id, effectiveMonth } }, select: { id: true } })) return res.status(409).json({ ok: false, error: "a salary version already exists for this effective month" });
    const actor = getRequesterEmail(req) || "system@baro.local"; await ensureInitialDraft(org.id); await ensureV1(org.id, actor); const current = await state(org.id);
    const last = await prisma.salarySystemVersion.findFirst({ where: { orgId: org.id }, orderBy: { versionNumber: "desc" } });
    const created = await prisma.salarySystemVersion.create({ data: { orgId: org.id, versionNumber: (last?.versionNumber || 0) + 1, effectiveMonth, confirmedBy: actor, snapshot: toJsonSnapshot({ items: current.items, rates: current.rates }) } }); res.status(201).json(created);
  });
  return router;
};
