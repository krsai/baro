import dotenv from "dotenv";
import { assertSafeApplicationDatabaseEnv } from "./databaseTargetGuard";

dotenv.config({ override: false });

// Railway variable propagation can be inconsistent during edits.
// Keep both names populated from whichever one exists.
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
process.env.DATABASE_URL ||= process.env.DIRECT_URL;

assertSafeApplicationDatabaseEnv();

// Keep external Prisma engine overrides intact.
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
