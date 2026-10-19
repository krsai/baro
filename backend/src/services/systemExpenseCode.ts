// Resolve only through source FKs; tenant IDs remain the persisted business references.
export const SYSTEM_EXPENSE_CODE_INCLUDE = {
  serviceType: true, taxTreatment: true,
  base: { include: { expenseType: true, variants: true } },
};

export function resolveSystemExpenseCode(row: any) {
  const base = row?.base, tax = row?.taxTreatment;
  const source = base?.variants?.find((variant: any) => variant.taxTreatmentId === row.taxTreatmentId && variant.isActive && variant.isEnabled);
  if (!row?.isActive || !base?.isActive || !base.expenseType?.isActive || !tax || !source) return null;
  return { ...row, code: base.code + tax.suffix, nameKo: base.nameKo, nameEn: base.nameEn, nameVi: base.nameVi,
    vatEnabled: tax.code === 'VAT', systemSourceId: source.id };
}
