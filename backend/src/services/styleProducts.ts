import { createHttpError } from '../utils/http';
import { retryEditTransaction } from '../utils/editRevision';

export const STYLE_PRODUCT_FIELDS = ['code', 'name', 'registrationDate', 'designer', 'season', 'imageUrls'] as const;

export function styleOwnershipDto(style: any) {
  return {
    productStyleId: style.productStyleId ?? null,
    productOwnerOrgId: style.productOwnerOrgId ?? style.customerOrgId,
    appliedProductRevision: style.appliedProductRevision ?? null,
    productionOwnerOrgId: style.orgId,
    productOwnerOrgName: style.customerOrganization?.name ?? '',
    productionOwnerOrgName: style.organization?.name ?? '',
  };
}

export function validateProductFields(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !(STYLE_PRODUCT_FIELDS as readonly string[]).includes(key))) {
    throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  }
  if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 200 ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.length > 500) {
    throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  }
  for (const key of ['registrationDate', 'designer', 'season']) {
    if (input[key] !== null && input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 500)) {
      throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
    }
  }
  if (input.imageUrls !== null && input.imageUrls !== undefined &&
      (!Array.isArray(input.imageUrls) || input.imageUrls.length > 100 || input.imageUrls.some((url: any) => typeof url !== 'string' || url.length > 2000000))) {
    throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  }
  return Object.fromEntries(STYLE_PRODUCT_FIELDS.map(key => [key, input[key] ?? null]));
}

async function actor(db: any, orgId: number, actorId: number) {
  const employee = await db.employee.findFirst({ where: { id: actorId, orgId, status: 'ACTIVE', orgRole: { in: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'] }, organization: { isActive: true } } });
  if (!employee) throw createHttpError(403, 'STYLE_PRODUCT_ACCESS_DENIED');
}

export async function readStyleProduct(db: any, orgId: number, actorId: number, id: number) {
  await actor(db, orgId, actorId);
  const product = (await db.$queryRawUnsafe(`SELECT p.id,p."ownerOrgId",p.revision,p.fields FROM "StyleProduct" p
    WHERE p.id=$1 AND (p."ownerOrgId"=$2 OR baro_style_product_trade_connected($2,p."ownerOrgId"))`, id, orgId))[0];
  if (!product) throw createHttpError(404, 'STYLE_PRODUCT_NOT_FOUND');
  return product;
}

export async function listStyleProducts(db: any, orgId: number, actorId: number) {
  await actor(db, orgId, actorId);
  return db.$queryRawUnsafe(`SELECT p.id,p."ownerOrgId",p.revision,p.fields-'imageUrls' AS fields,o.name AS "ownerOrgName",r."brandOrgId" AS "customerOrgId"
    FROM "StyleProduct" p JOIN "Organization" o ON o.id=p."ownerOrgId" AND o."isActive"
    LEFT JOIN "OrgRelationship" r ON r."manufacturerOrgId"=$1 AND baro_style_product_trade_connected($1,p."ownerOrgId",r."brandOrgId")
    WHERE p."ownerOrgId"=$1 OR r."brandOrgId" IS NOT NULL ORDER BY p.id,r."brandOrgId"`, orgId);
}

export async function takeStyleProduct(db: any, orgId: number, actorId: number, id: number, input: any) {
  if (!Number.isSafeInteger(input?.customerOrgId) || input.customerOrgId < 1 ||
      !Number.isSafeInteger(input?.revision) || input.revision < 1 ||
      Object.keys(input).some(key => !['customerOrgId', 'revision'].includes(key))) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  return retryEditTransaction(db, async tx => {
    await actor(tx, orgId, actorId);
    const manufacturer = await tx.organization.findFirst({ where: { id: orgId, type: 'MANUFACTURER', isActive: true } });
    if (!manufacturer) throw createHttpError(403, 'STYLE_PRODUCT_ACCESS_DENIED');
    const rows = await tx.$queryRawUnsafe<any[]>(`SELECT p.* FROM "StyleProduct" p JOIN "Organization" o ON o.id=p."ownerOrgId" AND o."isActive"
      WHERE p.id=$1 AND baro_style_product_trade_connected($2,p."ownerOrgId",$3) FOR UPDATE OF p`, id, orgId, input.customerOrgId);
    const product = rows[0];
    if (!product) throw createHttpError(404, 'STYLE_PRODUCT_NOT_FOUND');
    const previous = await tx.style.findFirst({ where: { orgId, productStyleId: id }, select: { id: true, productStyleId: true, appliedProductRevision: true } });
    if (previous) {
      if (previous.appliedProductRevision !== input.revision) throw createHttpError(409, 'STYLE_PRODUCT_REVISION_CONFLICT');
      return previous;
    }
    if (product.revision !== input.revision) throw createHttpError(409, 'STYLE_PRODUCT_REVISION_CONFLICT');
    const relationship = await tx.orgRelationship.findUnique({ where: { manufacturerOrgId_brandOrgId: { manufacturerOrgId: orgId, brandOrgId: input.customerOrgId } }, select: { timeBucketSetVersionId: true } });
    if (!relationship?.timeBucketSetVersionId) throw createHttpError(409, 'relationship time bucket version is missing');
    return (await tx.$queryRawUnsafe<any[]>(`INSERT INTO "Style"("orgId","customerOrgId","productStyleId","productOwnerOrgId","appliedProductRevision",code,name,"registrationDate",designer,season,"imageUrls","timeBucketSetVersionId","createdByEmployeeId","updatedAt")
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,CURRENT_TIMESTAMP)
      RETURNING id,"productStyleId","appliedProductRevision"`, orgId, input.customerOrgId, id, product.ownerOrgId, product.revision,
      product.fields.code, product.fields.name, product.fields.registrationDate, product.fields.designer, product.fields.season,
      JSON.stringify(product.fields.imageUrls), relationship.timeBucketSetVersionId, actorId))[0];
  });
}

export async function updateStyleProduct(db: any, orgId: number, actorId: number, id: number, input: any) {
  const fields = validateProductFields(input?.fields);
  if (!Number.isSafeInteger(input?.revision) || input.revision < 1 ||
      Object.keys(input).some(key => !['fields', 'revision'].includes(key))) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  return retryEditTransaction(db, async tx => {
    await actor(tx, orgId, actorId);
    const rows = await tx.$queryRawUnsafe<any[]>('SELECT id,"ownerOrgId",revision,fields,fields=$3::jsonb AS matches FROM "StyleProduct" WHERE id=$1 AND baro_style_product_can_edit($2,"ownerOrgId") FOR UPDATE', id, orgId, JSON.stringify(fields));
    const previous = rows[0];
    if (!previous) throw createHttpError(404, 'STYLE_PRODUCT_NOT_FOUND');
    // An identical retry never creates a second revision; changed retries conflict.
    if (previous.matches && [previous.revision, previous.revision - 1].includes(input.revision)) {
      return { id, ownerOrgId: previous.ownerOrgId, revision: previous.revision, fields: previous.fields };
    }
    if (previous.revision !== input.revision) throw createHttpError(409, 'STYLE_PRODUCT_REVISION_CONFLICT');
    await tx.$queryRawUnsafe("SELECT set_config('baro.style_product_actor_org',$1,true)", String(orgId));
    await tx.$executeRawUnsafe('UPDATE "StyleProduct" SET fields=$1::jsonb,revision=revision+1 WHERE id=$2 AND "ownerOrgId"=$3', JSON.stringify(fields), id, previous.ownerOrgId);
    // Only the product original changes. No producer snapshot, process, order,
    // production version, issued document or financial data is rewritten.
    return tx.styleProduct.findUniqueOrThrow({ where: { id }, select: { id: true, ownerOrgId: true, revision: true, fields: true } });
  });
}

export async function createStyleProduct(db: any, orgId: number, actorId: number, input: any) {
  const fields = validateProductFields(input?.fields);
  if (Object.keys(input).some(key => !['fields', 'customerOrgId'].includes(key))) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
  return retryEditTransaction(db, async tx => {
    await actor(tx, orgId, actorId);
    let ownerOrgId = orgId;
    let custodianOrgId: number | null = null;
    if (input.customerOrgId !== undefined) {
      if (!Number.isSafeInteger(input.customerOrgId) || input.customerOrgId < 1) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
      const resolved = await tx.$queryRawUnsafe<any[]>('SELECT baro_style_product_resolve_owner($1,$2) AS "ownerOrgId"', orgId, input.customerOrgId);
      ownerOrgId = resolved[0].ownerOrgId;
      custodianOrgId = orgId;
    } else {
      const owner = await tx.organization.findFirst({ where: { id: orgId, type: 'BRAND', isActive: true, ownerOrgId: null, OR: [{ dataOwnerOrgId: null }, { dataOwnerOrgId: orgId }] } });
      if (!owner) throw createHttpError(403, 'STYLE_PRODUCT_OWNER_REQUIRED');
    }
    await tx.$queryRawUnsafe("SELECT set_config('baro.style_product_actor_org',$1,true)", String(orgId));
    // Unique owner+code identifies retries without merging a different payload.
    const previous = await tx.$queryRawUnsafe<any[]>('SELECT id,revision,fields,fields=$3::jsonb AS matches FROM "StyleProduct" WHERE "ownerOrgId"=$1 AND fields->>\'code\'=$2 FOR UPDATE', ownerOrgId, fields.code, JSON.stringify(fields));
    if (previous[0]) {
      if (!previous[0].matches) throw createHttpError(409, 'STYLE_PRODUCT_REVISION_CONFLICT');
      return { id: previous[0].id, ownerOrgId, revision: previous[0].revision, fields: previous[0].fields };
    }
    return (await tx.$queryRawUnsafe<any[]>('INSERT INTO "StyleProduct"("ownerOrgId",fields,"custodianOrgId") VALUES($1,$2::jsonb,$3) RETURNING id,"ownerOrgId",revision,fields', ownerOrgId, JSON.stringify(fields), custodianOrgId))[0];
  });
}

export function registerStyleProductRoutes(app: any, db: any, gates: any) {
  const access = async (req: any, res: any) => {
    const ctx = await gates.requireOrgRole(req, res, { allowedRoles: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'], allowSystemAdmin: false });
    if (!ctx) return null;
    const setting = await gates.loadPolicy();
    if (!setting.policy?.[ctx.organization.type]?.[ctx.employee.orgRole]?.includes('STYLE')) throw createHttpError(403, 'STYLE_PRODUCT_ACCESS_DENIED');
    return { orgId: ctx.organization.id, actorId: gates.actorId() };
  };
  app.get('/style-products', async (req: any, res: any) => {
    const scope = await access(req, res);
    if (scope) res.json(await listStyleProducts(db, scope.orgId, scope.actorId));
  });
  app.post('/style-products', async (req: any, res: any) => {
    const scope = await access(req, res);
    if (scope) res.json(await createStyleProduct(db, scope.orgId, scope.actorId, req.body));
  });
  app.post('/style-products/:id/production-style', async (req: any, res: any) => {
    const scope = await access(req, res);
    if (!scope) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
    res.json(await takeStyleProduct(db, scope.orgId, scope.actorId, id, req.body));
  });
  const route = (method: string, run: any) => app[method]('/style-products/:id', async (req: any, res: any) => {
    const scope = await access(req, res);
    if (!scope) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw createHttpError(400, 'STYLE_PRODUCT_FIELDS_INVALID');
    res.json(await run(scope, id, req.body));
  });
  route('get', ({ orgId, actorId }: any, id: number) => readStyleProduct(db, orgId, actorId, id));
  route('put', ({ orgId, actorId }: any, id: number, input: any) => updateStyleProduct(db, orgId, actorId, id, input));
}
