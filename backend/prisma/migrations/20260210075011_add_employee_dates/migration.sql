-- AlterEnum
ALTER TYPE "OrgMembershipStatus" ADD VALUE 'TERMINATED';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "leaveEndAt" TIMESTAMP(3),
ADD COLUMN     "leaveStartAt" TIMESTAMP(3),
ADD COLUMN     "leftAt" TIMESTAMP(3);
