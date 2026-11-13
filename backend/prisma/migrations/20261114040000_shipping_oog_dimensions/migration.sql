-- New OOG sizes are explicit actual cargo dimensions; preserve historical text.
CREATE OR REPLACE FUNCTION baro_shipping_oog_packages(packages JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(jsonb_agg(COALESCE((SELECT jsonb_object_agg(p.key,p.value) FROM jsonb_each(item) p WHERE p.key IN ('quantity','lengthM','widthM','heightM') AND jsonb_typeof(p.value)='string'),'{}'::jsonb) ORDER BY ordinal),'[]'::jsonb)
 FROM jsonb_array_elements(packages) WITH ORDINALITY AS cargo_item(item,ordinal);
$$;
CREATE OR REPLACE FUNCTION baro_shipping_keys() RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
 SELECT ARRAY['origin','destination','etd','eta','plannedDate','vessel','voyage','shipmentType','incoterms','incotermsPlace','pickupAddress','shipper','consignee','notify','cargo','marks','quantity','unit','weightKg','cbm','containerType','containerCount','dangerousGoodsDetails','deliveryDate','recipient','pickupRequired','dangerousGoods','workScope','transportService','customerRole','notifySameAsConsignee','shipperParty','consigneeParty','notifyParty','cargoSchemaVersion','containers','packages','outOfGauge','oogDetails','hsCode','dgClass','unNumber','originPortCode','destinationPortCode','routeLocations','oogSchemaVersion','oogPackages'];
$$;
CREATE OR REPLACE FUNCTION baro_shipping_projection(mode TEXT,status TEXT,data JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT jsonb_build_object('mode',mode,'status',status,'data',COALESCE((SELECT jsonb_object_agg(key,
 CASE WHEN key IN ('shipperParty','consigneeParty','notifyParty') THEN (SELECT jsonb_object_agg(p.key,p.value) FROM jsonb_each(value) p WHERE p.key IN ('name','address','contactName','phone','email')) WHEN key='oogPackages' THEN baro_shipping_oog_packages(value) WHEN key='routeLocations' THEN baro_shipping_route_locations(value) ELSE value END)
 FROM jsonb_each(data) WHERE key=ANY(baro_shipping_keys()) AND (key NOT IN ('oogSchemaVersion','oogPackages') OR data->'oogSchemaVersion'='1'::jsonb AND data->'cargoSchemaVersion'='1'::jsonb) AND (data->'cargoSchemaVersion'='1'::jsonb OR key IN ('originPortCode','destinationPortCode') AND jsonb_typeof(data->'routeLocations')='object' OR key NOT IN ('shipperParty','consigneeParty','notifyParty','hsCode','dgClass','unNumber','originPortCode','destinationPortCode'))),'{}'::jsonb));
$$;


-- Rollback: compatible app deployment; retain all cargo data, FKs, snapshots and audit history.
