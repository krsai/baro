ALTER TABLE "Warehouse"
  ADD COLUMN "nameKo" TEXT,
  ADD COLUMN "nameVi" TEXT;

UPDATE "Warehouse"
SET
  "name" = 'Default Warehouse',
  "nameKo" = '기본 창고',
  "nameVi" = 'Kho mặc định'
WHERE "name" = '기본 창고';
