import { Prisma } from "@prisma/client";

const EMPLOYEE_NUMBER_WIDTH = 4;
const EMPLOYEE_NUMBER_LOCK_NAMESPACE = 20421;

type EmployeeNumberClient = Pick<
  Prisma.TransactionClient,
  "$executeRaw" | "employee"
>;

export const normalizeEmployeeNo = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(/^(?:[A-Za-z]{2,3}-)?(\d+)$/);
  if (!match) return normalized;

  return match[1]!.padStart(EMPLOYEE_NUMBER_WIDTH, "0");
};

export const resolveNextEmployeeNo = (values: unknown[]): string => {
  let maxSequence = 0;

  values.forEach((value) => {
    const normalized = normalizeEmployeeNo(value);
    if (!normalized || !/^\d+$/.test(normalized)) return;

    const sequence = Number(normalized);
    if (Number.isSafeInteger(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  return String(maxSequence + 1).padStart(EMPLOYEE_NUMBER_WIDTH, "0");
};

export const generateNextEmployeeNo = async (
  db: EmployeeNumberClient,
  orgId: number
): Promise<string> => {
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${EMPLOYEE_NUMBER_LOCK_NAMESPACE}::integer,
      ${orgId}::integer
    )
  `;

  const existingEmployees = await db.employee.findMany({
    where: { orgId },
    select: { employeeNo: true },
  });

  return resolveNextEmployeeNo(existingEmployees.map((employee) => employee.employeeNo));
};
