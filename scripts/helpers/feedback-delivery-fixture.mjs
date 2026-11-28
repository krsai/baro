import {readFileSync} from 'node:fs';
import {prismaPGlite} from './prisma-pglite.mjs';
export async function feedbackDeliveryFixture(){
 const f=await prismaPGlite();
 await f.pg.exec(`CREATE TYPE "OrgUserRole" AS ENUM ('ADMIN','WORKER','ACCOUNTANT','OPERATOR');CREATE TYPE "OrgMembershipStatus" AS ENUM ('ACTIVE','SUSPENDED','TERMINATED');
 CREATE TABLE "Organization"(id INT PRIMARY KEY,"isActive" BOOL DEFAULT true,"ownerOrgId" INT,type TEXT DEFAULT 'MANUFACTURER');
 CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,"orgRole" "OrgUserRole",status "OrgMembershipStatus",name TEXT,"employeeNo" TEXT,"joinedAt" TIMESTAMP,"leftAt" TIMESTAMP,UNIQUE(id,"orgId"));
 CREATE TABLE "Factory"(id INT PRIMARY KEY,"orgId" INT,name TEXT,"managementStartDate" TEXT DEFAULT '2026-04-01',UNIQUE(id,"orgId"));
 CREATE TABLE "WorkLog"(id INT PRIMARY KEY,"orgId" INT,"factoryId" INT,"workDate" TEXT,"recordKind" TEXT DEFAULT 'EMPLOYEE',"coverageStartDate" TEXT,"coverageEndDate" TEXT,"createdAt" TIMESTAMP,"createdByEmployeeId" INT);
 CREATE TABLE "OrganizationHoliday"("orgId" INT,"holidayDate" TEXT);
 CREATE TABLE "EmployeeLeaveDay"("orgId" INT,"employeeId" INT,"leaveDate" TEXT,"cancelledAt" TIMESTAMP);
 CREATE TABLE "WorkTimeRequest"(id TEXT,"orgId" INT,"employeeId" INT,status TEXT,kind TEXT);
 CREATE TABLE "WorkTimeDay"("requestId" TEXT,"orgId" INT,"workDate" TEXT);
 CREATE TABLE "ChangeApprovalRequest"(id TEXT PRIMARY KEY,"orgId" INT,"requestedByEmployeeId" INT,menu TEXT,operation TEXT,status TEXT,"appliedAt" TIMESTAMP,"createdAt" TIMESTAMP,payload JSONB);
 CREATE TABLE "BankLedgerDocument"(id TEXT PRIMARY KEY,"orgId" INT,"changeRequestId" TEXT,"transactionDate" TEXT);
 INSERT INTO "Organization"(id) VALUES(1),(2);INSERT INTO "Factory"(id,"orgId",name) VALUES(1,1,'HANOI'),(2,2,'OTHER');
 INSERT INTO "Employee"(id,"orgId","orgRole",status,name,"employeeNo") VALUES(1,1,'ADMIN','ACTIVE','Admin','A1'),(2,1,'OPERATOR','ACTIVE','Worker One','W1'),(3,2,'ADMIN','ACTIVE','Other Admin','A2'),(4,1,'ADMIN','SUSPENDED','Former Admin','A3'),(5,1,'WORKER','ACTIVE','Another Worker','W2');`);
 for(const version of ['20261128020000_daily_work_log_roster','20261128030000_employee_feedback_preparation','20261128040000_employee_feedback_delivery'])await f.pg.exec(readFileSync(`backend/prisma/migrations/${version}/migration.sql`,'utf8'));
 return f;
}
