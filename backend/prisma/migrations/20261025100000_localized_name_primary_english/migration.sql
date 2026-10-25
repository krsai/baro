-- Names have three slots. name/label are compatibility aliases of English.
-- Historical document JSON and all business FKs/amounts are deliberately untouched.
CREATE TABLE "LocalizedNameMigrationAudit" (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "recordId" INTEGER NOT NULL,
  "beforeNames" JSONB NOT NULL,
  "afterNames" JSONB NOT NULL,
  "changedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(version, "tableName", "recordId")
);
CREATE FUNCTION protect_localized_name_migration_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'LOCALIZED_NAME_AUDIT_APPEND_ONLY'; END $$;
CREATE TRIGGER localized_name_audit_append_only BEFORE UPDATE OR DELETE ON "LocalizedNameMigrationAudit"
FOR EACH ROW EXECUTE FUNCTION protect_localized_name_migration_audit();

DO $names$
DECLARE
  table_name TEXT;
  record RECORD;
  original JSONB;
  before_names JSONB;
  after_names JSONB;
  english TEXT;
  primary_key TEXT;
  assignments TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ProcessMasterOption','Organization','Factory','Warehouse','EmployeeGrade','SalaryItem',
    'AttrColor','AttrCategory','AttrProcess','PriorCompletionReason','OutsourcingServiceType',
    'TransactionCode','SettingServiceDefault','PartnerRole','SettingTransactionCodeDefault',
    'TransactionCodeBase','ExpenseType','TaxTreatment'
  ] LOOP
    EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE', table_name);
    FOR record IN EXECUTE format('SELECT id, to_jsonb(t) AS data FROM %I t ORDER BY id FOR UPDATE', table_name) LOOP
      original := record.data;
      primary_key := CASE WHEN original ? 'nameEn' THEN 'nameEn' ELSE 'name' END;
      english := coalesce(nullif(btrim(original->>primary_key),''),nullif(btrim(original->>'nameKo'),''),
        nullif(btrim(original->>'nameVi'),''),nullif(btrim(original->>'name'),''),nullif(btrim(original->>'label'),''));
      IF english IS NULL THEN RAISE EXCEPTION 'LOCALIZED_NAME_EMPTY: % %',table_name,record.id; END IF;
      before_names := jsonb_build_object(primary_key,original->primary_key);
      after_names := jsonb_build_object(primary_key,english);
      assignments := format('%I = $1',primary_key);
      IF original ? 'name' AND primary_key <> 'name' THEN
        before_names := before_names || jsonb_build_object('name',original->'name');
        after_names := after_names || jsonb_build_object('name',english);
        assignments := assignments || ', name = $1';
      END IF;
      IF original ? 'label' THEN
        before_names := before_names || jsonb_build_object('label',original->'label');
        after_names := after_names || jsonb_build_object('label',english);
        assignments := assignments || ', label = $1';
      END IF;
      IF before_names IS DISTINCT FROM after_names THEN
        INSERT INTO "LocalizedNameMigrationAudit"(version,"tableName","recordId","beforeNames","afterNames")
          VALUES('20261025100000_localized_name_primary_english',table_name,record.id,before_names,after_names);
        EXECUTE format('UPDATE %I SET %s WHERE id = $2',table_name,assignments) USING english,record.id;
      END IF;
    END LOOP;
  END LOOP;
END $names$;
