-- Existing bill numbers and all historical snapshots remain unchanged.
ALTER TABLE "FreightBill" ADD COLUMN IF NOT EXISTS "houseNumberManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_house_managed_kind_check" CHECK (NOT "houseNumberManaged" OR kind='HOUSE');
CREATE UNIQUE INDEX "FreightBill_managed_house_number_key" ON "FreightBill"("orgId",upper(number)) WHERE "houseNumberManaged";
CREATE OR REPLACE FUNCTION baro_managed_house_number_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."houseNumberManaged" AND (NOT NEW."houseNumberManaged" OR NEW.number<>OLD.number) THEN RAISE EXCEPTION 'FREIGHT_HBL_NUMBER_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FreightBill_managed_number_guard" BEFORE UPDATE ON "FreightBill" FOR EACH ROW EXECUTE FUNCTION baro_managed_house_number_guard();
