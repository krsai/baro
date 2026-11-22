-- New private document kinds only. Preserve all existing IDs, FKs and snapshots.
ALTER TABLE "FreightDocument" DROP CONSTRAINT IF EXISTS "FreightDocument_kind_check";
ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_kind_check"
 CHECK(kind IN ('AN','DO','POD','MANIFEST','HOUSE_DRAFT','COMMERCIAL_INVOICE','PACKING_LIST'));

CREATE OR REPLACE FUNCTION baro_shipping_trade_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind IN ('COMMERCIAL_INVOICE','PACKING_LIST') THEN
  IF NEW."jobId" IS NULL OR NEW."dispatchId" IS NOT NULL OR
     NEW.snapshot->'tradeDocument'->>'sourceMode' NOT IN ('FILE','FORM') OR
     NEW.snapshot->'tradeDocument'->>'sourceMode' IS NULL THEN
   RAISE EXCEPTION 'SHIPPING_TRADE_DOCUMENT_INVALID';
  END IF;
  IF NEW.snapshot->'tradeDocument'->>'sourceMode'='FILE' AND
    (jsonb_typeof(NEW.snapshot->'tradeDocument'->'file'->'base64') IS DISTINCT FROM 'string' OR
     length(NEW.snapshot->'tradeDocument'->'file'->>'base64') NOT BETWEEN 4 AND 2796204 OR
     length(NEW.snapshot->'tradeDocument'->'file'->>'sha256') IS DISTINCT FROM 64) THEN
   RAISE EXCEPTION 'SHIPPING_TRADE_DOCUMENT_INVALID';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightDocument_trade_guard" ON "FreightDocument";
CREATE TRIGGER "FreightDocument_trade_guard" BEFORE INSERT ON "FreightDocument"
 FOR EACH ROW EXECUTE FUNCTION baro_shipping_trade_document_guard();
CREATE OR REPLACE FUNCTION baro_shipping_trade_documents_ready() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightDocument_kind_check'
  AND conrelid='"FreightDocument"'::regclass AND pg_get_constraintdef(oid) LIKE '%COMMERCIAL_INVOICE%'
  AND pg_get_constraintdef(oid) LIKE '%PACKING_LIST%');
$$;
-- Rollback: stop new trade-document writes or keep this compatible constraint.
-- Never drop the new kinds, source files, original snapshots or document shares.
