import { createHttpError } from "../utils/http";

type EmployeeGradeClient = {
  employeeGrade: {
    findFirst: (args: any) => Promise<{ id: number } | null>;
  };
};

export const resolveDefaultEmployeeGradeId = async (
  db: EmployeeGradeClient,
  orgId: number
) => {
  const grade = await db.employeeGrade.findFirst({
    where: { orgId, isDefault: true, isActive: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (!grade) {
    throw createHttpError(409, "default employee grade is not configured");
  }
  return grade.id;
};
