import dotenv from "dotenv";

dotenv.config({ override: true });

// Railway variable propagation can be inconsistent during edits.
// Keep both names populated from whichever one exists.
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
process.env.DATABASE_URL ||= process.env.DIRECT_URL;

// Some Windows environments fail to connect to Supabase with Prisma's default engine,
// while the binary engine works reliably. Keep external overrides intact.
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
