-- Preserve existing remarks; allow line breaks in the enlarged request remark field.
ALTER TABLE "ExpenseRequest" DROP CONSTRAINT IF EXISTS "ExpenseRequest_remark_check";
ALTER TABLE "ExpenseRequest" DROP CONSTRAINT IF EXISTS "ExpenseRequest_remark_multiline_check";
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_remark_multiline_check" CHECK(length(remark)<=500);
