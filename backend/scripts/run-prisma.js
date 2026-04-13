const { spawnSync } = require("child_process");

const resolveNpxCommand = () => (process.platform === "win32" ? "npx.cmd" : "npx");

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

const result = spawnSync(resolveNpxCommand(), ["prisma", ...args], {
  env,
  stdio: "inherit",
});

process.exit(result.status || 0);
