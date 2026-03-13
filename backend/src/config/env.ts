import dotenv from "dotenv";

dotenv.config({ override: true });

// Some Windows environments fail to connect to Supabase with Prisma's default engine,
// while the binary engine works reliably. Keep external overrides intact.
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
