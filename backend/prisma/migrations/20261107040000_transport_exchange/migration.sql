CREATE TABLE "TransportExchange" (
 id TEXT PRIMARY KEY,
 "senderOrgId" INTEGER NOT NULL REFERENCES "Organization"(id),
 "receiverOrgId" INTEGER NOT NULL REFERENCES "Organization"(id),
 "senderJobId" TEXT,
 "receiverJobId" TEXT,
 "clientKey" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
 "senderSnapshot" JSONB NOT NULL,
 "receiverSnapshot" JSONB,
 version INTEGER NOT NULL DEFAULT 1,
 "createdBy" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK("senderOrgId"<>"receiverOrgId"),
 UNIQUE("senderOrgId","clientKey"),
 FOREIGN KEY("senderJobId","senderOrgId") REFERENCES "FreightJob"(id,"orgId"),
 FOREIGN KEY("receiverJobId","receiverOrgId") REFERENCES "FreightJob"(id,"orgId"),
 FOREIGN KEY("createdBy","senderOrgId") REFERENCES "Employee"(id,"orgId")
);
CREATE INDEX "TransportExchange_receiver_status" ON "TransportExchange"("receiverOrgId",status,"updatedAt");
CREATE TABLE "TransportExchangeEvent" (
 id TEXT PRIMARY KEY,
 "exchangeId" TEXT NOT NULL REFERENCES "TransportExchange"(id),
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id),
 "actorId" INTEGER NOT NULL,
 version INTEGER NOT NULL,
 action TEXT NOT NULL,
 snapshot JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("exchangeId",version),
 FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId")
);
CREATE FUNCTION baro_transport_exchange_event_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TRANSPORT_EXCHANGE_HISTORY_IMMUTABLE'; END; $$;
CREATE TRIGGER "TransportExchangeEvent_append_only" BEFORE UPDATE OR DELETE ON "TransportExchangeEvent" FOR EACH ROW EXECUTE FUNCTION baro_transport_exchange_event_guard();
