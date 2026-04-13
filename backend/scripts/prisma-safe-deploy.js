const { spawnSync } = require("child_process");

const resolveNpxCommand = () => (process.platform === "win32" ? "npx.cmd" : "npx");

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

const npxCommand = resolveNpxCommand();

const runPrisma = (args, label) => {
  console.log(`[prisma-safe-deploy] ${label}`);
  const result = spawnSync(npxCommand, ["prisma", ...args], {
    env: commandEnv,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result;
};

const parseFailedMigrationName = (outputText) => {
  const match = String(outputText || "").match(/The `([^`]+)` migration .* failed/i);
  return match?.[1] ? String(match[1]).trim() : "";
};

const firstAttempt = runPrisma(["migrate", "deploy"], "Running prisma migrate deploy");
if (firstAttempt.status === 0) {
  process.exit(0);
}

const firstOutput = `${firstAttempt.stdout || ""}\n${firstAttempt.stderr || ""}`;
const isFailedMigrationState = /P3009|failed migrations in the target database/i.test(
  firstOutput
);

if (isFailedMigrationState) {
  const failedMigrationName = parseFailedMigrationName(firstOutput);
  if (failedMigrationName) {
    const resolveAttempt = runPrisma(
      ["migrate", "resolve", "--rolled-back", failedMigrationName],
      `Resolving failed migration as rolled back: ${failedMigrationName}`
    );

    if (resolveAttempt.status === 0) {
      const retryAttempt = runPrisma(
        ["migrate", "deploy"],
        "Retrying prisma migrate deploy after resolve"
      );
      if (retryAttempt.status === 0) {
        process.exit(0);
      }
    }
  }
}

console.warn(
  "[prisma-safe-deploy] migrate deploy could not complete. Falling back to prisma db push --accept-data-loss."
);
const pushAttempt = runPrisma(
  ["db", "push", "--accept-data-loss"],
  "Running prisma db push --accept-data-loss"
);
if (pushAttempt.status === 0) {
  process.exit(0);
}

process.exit(pushAttempt.status || firstAttempt.status || 1);
