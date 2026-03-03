-- ============================================================
-- STEP 1: WorkOrderItem 테이블 생성
-- ============================================================
CREATE TABLE "WorkOrderItem" (
  "id"             SERIAL PRIMARY KEY,
  "workOrderId"    INTEGER NOT NULL,
  "itemId"         TEXT NOT NULL DEFAULT '',
  "styleId"        TEXT,
  "styleName"      TEXT,
  "styleCode"      TEXT,
  "colorId"        INTEGER,
  "colorCode"      TEXT,
  "colorName"      TEXT,
  "gender"         TEXT,
  "sizeQuantities" JSONB,
  "totalQuantity"  INTEGER NOT NULL DEFAULT 0,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STEP 2: 기존 WorkOrder.items JSON → WorkOrderItem 행으로 이전
-- ============================================================
DO $$
DECLARE
  r          RECORD;
  item       JSONB;
  sort_idx   INTEGER;
  qty_val    INTEGER;
  color_fk   INTEGER;
BEGIN
  FOR r IN SELECT id, "orgId", "buyerOrgId", "sellerOrgId", items FROM "WorkOrder" WHERE items IS NOT NULL LOOP
    sort_idx := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(r.items) LOOP
      -- totalQuantity 계산
      qty_val := COALESCE((item->>'totalQuantity')::INTEGER, 0);
      IF qty_val = 0 THEN
        SELECT COALESCE(SUM(val::INTEGER), 0)
          INTO qty_val
          FROM jsonb_each_text(COALESCE(item->'sizeQuantities', '{}')) AS kv(key, val);
      END IF;

      -- colorId FK 해소: orgId 범위 내 AttrColor 매칭
      color_fk := NULL;
      IF (item->>'colorId') IS NOT NULL AND (item->>'colorId') ~ '^\d+$' THEN
        SELECT ac.id INTO color_fk
          FROM "AttrColor" ac
         WHERE ac.id = (item->>'colorId')::INTEGER
           AND ac."orgId" IN (r."orgId", COALESCE(r."buyerOrgId", -1), COALESCE(r."sellerOrgId", -1))
         LIMIT 1;
      END IF;
      -- colorId 매칭 실패 시 colorCode로 재시도
      IF color_fk IS NULL AND (item->>'colorCode') IS NOT NULL THEN
        SELECT ac.id INTO color_fk
          FROM "AttrColor" ac
         WHERE ac.code = item->>'colorCode'
           AND ac."orgId" IN (r."orgId", COALESCE(r."buyerOrgId", -1), COALESCE(r."sellerOrgId", -1))
         LIMIT 1;
      END IF;

      INSERT INTO "WorkOrderItem" (
        "workOrderId", "itemId", "styleId", "styleName", "styleCode",
        "colorId", "colorCode", "colorName", "gender",
        "sizeQuantities", "totalQuantity", "sortOrder",
        "createdAt", "updatedAt"
      ) VALUES (
        r.id,
        COALESCE(item->>'id', ''),
        NULLIF(TRIM(item->>'styleId'), ''),
        NULLIF(TRIM(item->>'styleName'), ''),
        NULLIF(TRIM(item->>'styleCode'), ''),
        color_fk,
        NULLIF(TRIM(item->>'colorCode'), ''),
        NULLIF(TRIM(item->>'colorName'), ''),
        NULLIF(TRIM(item->>'gender'), ''),
        item->'sizeQuantities',
        qty_val,
        sort_idx,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
      sort_idx := sort_idx + 1;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- STEP 3: WorkOrderItem FK 및 인덱스 추가
-- ============================================================
ALTER TABLE "WorkOrderItem"
  ADD CONSTRAINT "WorkOrderItem_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkOrderItem"
  ADD CONSTRAINT "WorkOrderItem_colorId_fkey"
    FOREIGN KEY ("colorId") REFERENCES "AttrColor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkOrderItem_workOrderId_idx" ON "WorkOrderItem"("workOrderId");
CREATE INDEX "WorkOrderItem_colorId_idx" ON "WorkOrderItem"("colorId");

-- ============================================================
-- STEP 4: WorkRecord에 processId 컬럼 추가 및 초기값 채우기
-- ============================================================
ALTER TABLE "WorkRecord" ADD COLUMN "processId" INTEGER;

UPDATE "WorkRecord" wr
SET "processId" = ap.id
FROM "AttrProcess" ap
WHERE ap."orgId" = wr."orgId"
  AND ap.code = wr."processCode"
  AND wr."processCode" IS NOT NULL;

-- ============================================================
-- STEP 5: WorkRecord FK 추가 (colorId, processId)
-- ============================================================

-- orphan colorId NULL 처리 (다른 org 또는 삭제된 AttrColor 참조)
UPDATE "WorkRecord" wr
SET "colorId" = NULL
WHERE "colorId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AttrColor" ac
    WHERE ac.id = wr."colorId"
  );

ALTER TABLE "WorkRecord"
  ADD CONSTRAINT "WorkRecord_colorId_fkey"
    FOREIGN KEY ("colorId") REFERENCES "AttrColor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkRecord"
  ADD CONSTRAINT "WorkRecord_processId_fkey"
    FOREIGN KEY ("processId") REFERENCES "AttrProcess"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkRecord_colorId_idx" ON "WorkRecord"("colorId");
CREATE INDEX "WorkRecord_processId_idx" ON "WorkRecord"("processId");
