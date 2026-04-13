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

const firstAttempt = runPrisma(
  ["db", "push", "--accept-data-loss", "--skip-generate"],
  "Running prisma db push --accept-data-loss --skip-generate"
);
if (firstAttempt.status === 0) {
  process.exit(0);
}

console.warn(
  "[prisma-safe-deploy] db push failed. Falling back to force reset + db push."
);
const resetAttempt = runPrisma(
  ["db", "push", "--accept-data-loss", "--force-reset", "--skip-generate"],
  "Running prisma db push --accept-data-loss --force-reset --skip-generate"
);
if (resetAttempt.status === 0) {
  process.exit(0);
}

process.exit(resetAttempt.status || firstAttempt.status || 1);
