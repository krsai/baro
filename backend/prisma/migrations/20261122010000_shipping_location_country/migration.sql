-- Extend only new explicit route snapshots; never rewrite stored documents or addresses.
CREATE OR REPLACE FUNCTION baro_shipping_route_contacts(details JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(jsonb_object_agg(key,COALESCE((SELECT jsonb_object_agg(p.key,p.value) FROM jsonb_each(CASE WHEN jsonb_typeof(value)='object' THEN value ELSE '{}'::jsonb END) p WHERE p.key IN ('label','contactName','phone','country') AND jsonb_typeof(p.value)='string'),'{}'::jsonb)),'{}'::jsonb)
 FROM jsonb_each(CASE WHEN jsonb_typeof(details)='object' THEN details ELSE '{}'::jsonb END)
 WHERE key IN ('ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR');
$$;
CREATE OR REPLACE FUNCTION baro_shipping_location_country_ready() RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$ SELECT true; $$;
-- Rollback: compatible application deployment. Retain saved country snapshots and audit history.
