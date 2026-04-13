const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ override: true });
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

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  env,
  stdio: "inherit",
});

process.exit(result.status || 0);
