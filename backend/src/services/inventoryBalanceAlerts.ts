export async function negativeInventoryBalances(db:any,orgId:number,page=0){
 const rows=await db.$queryRaw`SELECT v.id AS "variantId",v."baseId",v."masterId",v.attributes,i.data AS master,
  SUM(m.quantity)::text AS balance,COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity>0),0)::text AS received,
  (-COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity<0),0))::text AS issued,
  MAX(m."movementDate")::text AS "lastDate",COUNT(*) OVER()::integer AS "totalCount"
 FROM "InventoryVariant" v JOIN "MaterialItem" i ON i.id=v."masterId" AND i."orgId"=v."orgId" AND i."baseId"=v."baseId"
 JOIN "InventoryMovement" m ON m."variantId"=v.id AND m."orgId"=v."orgId" AND m.status='APPROVED'
 WHERE v."orgId"=${orgId} GROUP BY v.id,i.id HAVING SUM(m.quantity)<0
 ORDER BY i.data->'baseSnapshot'->>'code',v.id OFFSET ${page*10} LIMIT 10`;
 return {rows:rows.map(({totalCount,...row}:any)=>row),total:rows[0]?.totalCount??0,page};
}
