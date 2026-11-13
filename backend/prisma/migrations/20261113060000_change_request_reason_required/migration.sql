-- Require a reason on new edit/deletion requests. Earlier requests and their
-- snapshots stay unchanged; deciding/retrying them must remain possible.
CREATE OR REPLACE FUNCTION baro_change_request_reason_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE trimmed_reason text;
BEGIN
 trimmed_reason:=btrim(COALESCE(NEW.reason,''),E' \t\n\r\f'||U&'\000B\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF NEW.operation IN ('UPDATE','DELETE') AND (length(trimmed_reason)=0 OR length(trimmed_reason)>1000) THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ChangeApprovalRequest_reason_required" ON "ChangeApprovalRequest";
CREATE TRIGGER "ChangeApprovalRequest_reason_required" BEFORE INSERT ON "ChangeApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_change_request_reason_guard();
-- Rollback: stop new edit/deletion submissions and retain rows, audit and this
-- additive guard. Recover with a forward fix; never manufacture old reasons.
