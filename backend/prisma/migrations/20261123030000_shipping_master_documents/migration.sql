-- Extend review-copy printing to the saved Master. Never rewrite old documents.
ALTER TABLE "FreightDocument" DROP CONSTRAINT IF EXISTS "FreightDocument_kind_check";
ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_kind_check"
 CHECK(kind IN ('AN','DO','POD','MANIFEST','HOUSE_DRAFT','MASTER_DRAFT','COMMERCIAL_INVOICE','PACKING_LIST'));
ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_master_kind_check"
 CHECK(kind<>'MASTER_DRAFT' OR ("jobId" IS NOT NULL AND "dispatchId" IS NULL
 AND snapshot->'source'->'bill'->>'kind' IS NOT DISTINCT FROM 'MASTER'));
CREATE OR REPLACE FUNCTION baro_shipping_master_documents_ready() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightDocument_kind_check'
 AND conrelid='"FreightDocument"'::regclass AND pg_get_constraintdef(oid) LIKE '%MASTER_DRAFT%');
$$;
-- Rollback: stop new Master review-copy writes; keep kinds, snapshots and FKs.
