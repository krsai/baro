-- User-requested category terminology only. Retain IDs, codes and transaction FKs.
UPDATE "PartnerRole" SET "nameKo"='유통',"nameEn"='Distribution',"nameVi"='Phân phối'
WHERE code='MATERIAL_SUPPLIER';
