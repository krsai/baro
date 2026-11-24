-- Preserve the recorded request when accepted operational fields change.
-- The older shipping guard derives a snapshot again for an unlinked customer.
-- Run after that guard, retaining the saved source rather than inferring a new one.
CREATE OR REPLACE FUNCTION baro_shipping_operation_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."receiptStatus"='ACCEPTED' THEN NEW."requestSnapshot":=OLD."requestSnapshot"; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "zz_FreightJob_operation_snapshot_guard" ON "FreightJob";
CREATE TRIGGER "zz_FreightJob_operation_snapshot_guard" BEFORE UPDATE ON "FreightJob"
 FOR EACH ROW EXECUTE FUNCTION baro_shipping_operation_snapshot_guard();
-- Idempotent DDL only: no historical rows, relationships or snapshots are rewritten.
-- Rollback: stop new operation edits; keep this source-preservation guard and data.
