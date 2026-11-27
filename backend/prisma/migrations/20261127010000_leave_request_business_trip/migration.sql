-- Add a distinct trip type; retain all original requests, payroll and grant history.
ALTER TABLE "WorkTimeRequest" DROP CONSTRAINT IF EXISTS "WorkTimeRequest_values_check";
ALTER TABLE "WorkTimeRequest" ADD CONSTRAINT "WorkTimeRequest_values_check" CHECK (
 kind IN ('OVERTIME','SPECIAL','ANNUAL','ANNUAL_AM','ANNUAL_PM','PAID','UNPAID','BUSINESS_TRIP') AND
 status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','CANCELLED') AND revision>=0 AND
 "startDate" ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND "endDate">="startDate" AND
 length(trim(reason)) BETWEEN 1 AND 1000 AND
 ("requestedMinutes" IS NULL OR "requestedMinutes" BETWEEN 1 AND 1440) AND
 ("approvedMinutes" IS NULL OR "approvedMinutes" BETWEEN 1 AND "requestedMinutes"));
CREATE OR REPLACE FUNCTION baro_leave_trip_ready() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"WorkTimeRequest"'::regclass
 AND conname='WorkTimeRequest_values_check' AND pg_get_constraintdef(oid) LIKE '%BUSINESS_TRIP%');
$$;
