const { spawnSync } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ override: true });
const prismaCli = require.resolve("prisma/build/index.js");

const effectiveDbUrl =
  String(process.env.DIRECT_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim();

if (!effectiveDbUrl) {
  console.error(
    "[prisma-safe-deploy] DIRECT_URL / DATABASE_URL is empty. Aborting deployment."
  );
  process.exit(1);
}

const commandEnv = {
  ...process.env,
  DIRECT_URL: effectiveDbUrl,
  DATABASE_URL: String(process.env.DATABASE_URL || "").trim() || effectiveDbUrl,
};

const runPrisma = (args, label) => {
  console.log(`[prisma-safe-deploy] ${label}`);
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    env: commandEnv,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result;
};

const pushAttempt = runPrisma(
  ["db", "push", "--skip-generate"],
  "Running prisma db push --skip-generate"
);
if (pushAttempt.status === 0) {
  process.exit(0);
}

console.error(
  "[prisma-safe-deploy] db push failed. Deployment aborted without accept-data-loss/force-reset. Review the schema diff and apply destructive changes manually before retrying."
);
process.exit(pushAttempt.status || 1);
