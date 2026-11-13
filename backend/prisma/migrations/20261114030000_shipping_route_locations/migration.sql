-- Preserve four route stops in new public snapshots; never rewrite saved ones.
CREATE OR REPLACE FUNCTION baro_shipping_route_locations(locations JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(locations)
 WHERE key IN ('ORIGIN_DOOR','ORIGIN_TERMINAL','DESTINATION_TERMINAL','DESTINATION_DOOR') AND jsonb_typeof(value)='string';
$$;
CREATE OR REPLACE FUNCTION baro_shipping_keys() RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
 SELECT ARRAY['origin','destination','etd','eta','plannedDate','vessel','voyage','shipmentType','incoterms','incotermsPlace','pickupAddress','shipper','consignee','notify','cargo','marks','quantity','unit','weightKg','cbm','containerType','containerCount','dangerousGoodsDetails','deliveryDate','recipient','pickupRequired','dangerousGoods','workScope','transportService','customerRole','notifySameAsConsignee','shipperParty','consigneeParty','notifyParty','cargoSchemaVersion','containers','packages','outOfGauge','oogDetails','hsCode','dgClass','unNumber','originPortCode','destinationPortCode','routeLocations'];
$$;
CREATE OR REPLACE FUNCTION baro_shipping_projection(mode TEXT,status TEXT,data JSONB) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
 SELECT jsonb_build_object('mode',mode,'status',status,'data',COALESCE((SELECT jsonb_object_agg(key,
 CASE WHEN key IN ('shipperParty','consigneeParty','notifyParty') THEN (SELECT jsonb_object_agg(p.key,p.value) FROM jsonb_each(value) p WHERE p.key IN ('name','address','contactName','phone','email')) WHEN key='routeLocations' THEN baro_shipping_route_locations(value) ELSE value END)
 FROM jsonb_each(data) WHERE key=ANY(baro_shipping_keys()) AND (data->'cargoSchemaVersion'='1'::jsonb OR key IN ('originPortCode','destinationPortCode') AND jsonb_typeof(data->'routeLocations')='object' OR key NOT IN ('shipperParty','consigneeParty','notifyParty','hsCode','dgClass','unNumber','originPortCode','destinationPortCode'))),'{}'::jsonb));
$$;

-- Rollback: compatible application deployment; retain route data, port FKs and snapshots.
