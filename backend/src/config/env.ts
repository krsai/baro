import dotenv from "dotenv";
import { assertSafeApplicationDatabaseEnv } from "./databaseTargetGuard";
import { assertValidBusinessTimeZone } from "../utils/payrollMonth";

dotenv.config({ override: false });

// Railway variable propagation can be inconsistent during edits.
// Keep both names populated from whichever one exists.
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
process.env.DATABASE_URL ||= process.env.DIRECT_URL;

assertSafeApplicationDatabaseEnv();
process.env.BUSINESS_TIME_ZONE = assertValidBusinessTimeZone(
  process.env.BUSINESS_TIME_ZONE
);

// Keep external Prisma engine overrides intact.
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
