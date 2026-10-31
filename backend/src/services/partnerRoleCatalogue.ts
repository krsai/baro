import type {Prisma} from '@prisma/client';

const query={orderBy:[{sortOrder:'asc'},{id:'asc'}],include:{_count:{select:{industries:{where:{code:{not:'GENERAL'}}}}}}} satisfies Prisma.PartnerRoleFindManyArgs;
// GENERAL is an archived reference, not a selectable industry. Keep a category
// visible if any real industry still uses it, even if that industry is inactive.
export async function partnerRoleCatalogue(db:any){
 const rows=await db.partnerRole.findMany(query);
 return rows.filter((row:any)=>row.code!=='MANAGEMENT'||row._count?.industries!==0).map(({_count,...row}:any)=>row);
}
