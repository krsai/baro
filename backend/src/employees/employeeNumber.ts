import { Prisma } from "@prisma/client";

const EMPLOYEE_NUMBER_WIDTH = 4;
const EMPLOYEE_NUMBER_LOCK_NAMESPACE = 20421;

type EmployeeNumberClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "employee" | "factory"
>;

export const normalizeEmployeeNo = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(/^(.*-)(\d+)$/);
  if (!match) return normalized;

  return `${match[1]}${match[2]!.padStart(EMPLOYEE_NUMBER_WIDTH, "0")}`;
};

export const generateNextEmployeeNo = async (
  db: EmployeeNumberClient,
  orgId: number,
  factoryId: number
): Promise<string | null> => {
  await db.$queryRaw`
    SELECT pg_advisory_xact_lock(
      ${EMPLOYEE_NUMBER_LOCK_NAMESPACE}::integer,
      ${factoryId}::integer
    )
  `;

  const factory = await db.factory.findFirst({
    where: { id: factoryId, orgId },
    select: { factoryCode: true },
  });
  const factoryCode = String(factory?.factoryCode ?? "").trim();
  if (!factoryCode) return null;

  const existingEmployees = await db.employee.findMany({
    where: { orgId, factoryId },
    select: { employeeNo: true },
  });
  const prefix = `${factoryCode}-`;
  let maxSequence = 0;

  existingEmployees.forEach((employee) => {
    const employeeNo = String(employee.employeeNo ?? "").trim();
    if (!employeeNo.startsWith(prefix)) return;

    const suffix = employeeNo.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return;

    const sequence = Number(suffix);
    if (Number.isSafeInteger(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  return `${prefix}${String(maxSequence + 1).padStart(
    EMPLOYEE_NUMBER_WIDTH,
    "0"
  )}`;
};
