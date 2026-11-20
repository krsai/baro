-- Reuse the existing financial final-drafter authority, including verified vacancy.
-- Existing inventory snapshots and independent decisions are left intact.
CREATE OR REPLACE FUNCTION baro_inventory_final_drafter_allowed(policy jsonb,company integer,actor integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(policy->'config'->>'version'='2' AND jsonb_array_length(policy->'config'->'stages')>0
 AND policy->'finalDrafterStage'=policy->'config'->'stages'->-1
 AND policy->'approverIds'=jsonb_build_array(actor)
 AND baro_final_drafter_allowed(policy||jsonb_build_object('config',(policy->'config')||jsonb_build_object('registrationStages',policy->'config'->'stages')),company,actor),false)
$$;
DO $guards$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('baro_inventory_approval_guard()'::regprocedure);
 IF position('inventory final drafter policy mismatch' IN definition)=0 THEN
  definition:=replace(definition,'IF baro_approval_no_line(NEW.policy) THEN',
   'IF baro_inventory_final_drafter_allowed(NEW.policy,NEW."orgId",actor) THEN
     IF NOT baro_approval_snapshot_matches(NEW."orgId",''INVENTORY'',NEW.operation,NEW.policy->''config'') OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status=''ACTIVE'' AND NEW.policy->''config''->''drafterRoles'' ? "orgRole"::text) THEN RAISE EXCEPTION ''inventory final drafter policy mismatch''; END IF;
    ELSIF baro_approval_no_line(NEW.policy) THEN');
  definition:=replace(definition,'NEW."employeeId"=r."drafterId" OR','(NEW."employeeId"=r."drafterId" AND NOT baro_inventory_final_drafter_allowed(r.policy,r."orgId",actor)) OR');
  definition:=replace(definition,'AND NOT baro_inventory_stage_eligible(NEW."orgId",NEW."employeeId",r.policy->''config''->''stages''->NEW.position)',
   'AND NOT baro_inventory_final_drafter_allowed(r.policy,r."orgId",actor) AND NOT baro_inventory_stage_eligible(NEW."orgId",NEW."employeeId",r.policy->''config''->''stages''->NEW.position)');
  EXECUTE definition;
 END IF;
 definition:=pg_get_functiondef('baro_inventory_approval_consistency()'::regprocedure);
 IF position('inventory final drafter unapplied' IN definition)=0 THEN
  definition:=replace(definition,'IF r.status=''PENDING'' AND baro_approval_no_line(r.policy)',
   'IF r.status=''PENDING'' AND baro_inventory_final_drafter_allowed(r.policy,r."orgId",r."drafterId") THEN RAISE EXCEPTION ''inventory final drafter unapplied''; END IF;
    IF r.status=''PENDING'' AND baro_approval_no_line(r.policy)');
  EXECUTE definition;
 END IF;
END $guards$;
