-- Customer relationships for service companies do not transfer production data ownership.
-- Preserve the existing manufacturer ownership rules and all stored ownership values.
CREATE OR REPLACE FUNCTION baro_customer_relationship_data_owner() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."manufacturerOrgId" AND type::text='MANUFACTURER') THEN
    UPDATE "Organization" SET "dataOwnerOrgId"=NEW."manufacturerOrgId"
    WHERE id=NEW."brandOrgId" AND "dataOwnerOrgId" IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "relationship_data_owner" ON "OrgRelationship";
CREATE TRIGGER "relationship_data_owner" AFTER INSERT ON "OrgRelationship"
FOR EACH ROW EXECUTE FUNCTION baro_customer_relationship_data_owner();
