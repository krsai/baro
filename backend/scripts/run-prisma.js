const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const {
  assertSafeApplicationDatabaseEnv,
} = require("../src/config/databaseTargetGuard");

dotenv.config({ override: false });
const prismaCli = require.resolve("prisma/build/index.js");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("[run-prisma] Missing Prisma arguments.");
  process.exit(1);
}

const effectiveDbUrl =
  String(process.env.DIRECT_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim();

const env = {
  ...process.env,
};

if (effectiveDbUrl) {
  env.DIRECT_URL = effectiveDbUrl;
  env.DATABASE_URL = effectiveDbUrl;
}

const prismaArgs = [...args];
const isDatabaseCommand = !["generate", "format", "validate", "version"].includes(
  prismaArgs[0]
);
if (isDatabaseCommand) {
  try {
    assertSafeApplicationDatabaseEnv(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (prismaArgs[0] === "db" && prismaArgs[1] === "execute") {
  const schemaIndex = prismaArgs.indexOf("--schema");
  const hasUrl = prismaArgs.includes("--url");
  if (!hasUrl && schemaIndex >= 0 && effectiveDbUrl) {
    prismaArgs.splice(schemaIndex, 2, "--url", effectiveDbUrl);
  }
}

const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
  env,
  stdio: "inherit",
});

process.exit(result.status || 0);
