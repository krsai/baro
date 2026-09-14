import { Prisma } from "@prisma/client";

const EMPLOYEE_NUMBER_WIDTH = 4;
const EMPLOYEE_NUMBER_LOCK_NAMESPACE = 20421;

type EmployeeNumberClient = Pick<
  Prisma.TransactionClient,
  "$executeRaw" | "employee" | "organization"
>;

export const normalizeEmployeeNo = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(/^(?:[A-Za-z]{2,3}-)?(\d+)$/);
  if (!match) return normalized;

  return match[1]!.padStart(EMPLOYEE_NUMBER_WIDTH, "0");
};

// 조직 코드(Organization.code, 4자리 대문자)가 있으면 사번은 "{조직 코드}{4자리 순번}"
// (예: BRVN0001) 형태다. 순번은 조직 코드 유무와 무관하게 기존 사번 끝의 숫자를
// 그대로 이어받는다 - 조직 코드 도입 이전 사번("0024")과 이후 사번("BRVN0025")이
// 섞여 있어도 최댓값을 정확히 찾아 다음 순번을 이어가며, 조직 코드가 없는 조직은
// 기존처럼 접두어 없는 숫자만 채번한다.
export const resolveNextEmployeeNo = (
  values: unknown[],
  orgCode?: string | null
): string => {
  let maxSequence = 0;

  values.forEach((value) => {
    const normalized = normalizeEmployeeNo(value);
    if (!normalized) return;
    const match = normalized.match(/(\d+)$/);
    if (!match) return;

    const sequence = Number(match[1]);
    if (Number.isSafeInteger(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  const nextDigits = String(maxSequence + 1).padStart(EMPLOYEE_NUMBER_WIDTH, "0");
  const normalizedOrgCode =
    typeof orgCode === "string" && orgCode.trim() ? orgCode.trim().toUpperCase() : "";
  return normalizedOrgCode ? `${normalizedOrgCode}${nextDigits}` : nextDigits;
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

  const [existingEmployees, organization] = await Promise.all([
    db.employee.findMany({
      where: { orgId },
      select: { employeeNo: true },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { code: true },
    }),
  ]);

  return resolveNextEmployeeNo(
    existingEmployees.map((employee) => employee.employeeNo),
    organization?.code ?? null
  );
};
