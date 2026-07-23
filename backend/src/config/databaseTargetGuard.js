const APPLICATION_DATABASE_ENV_NAMES = ["DATABASE_URL", "DIRECT_URL"];
const SUPABASE_DATABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.com"];

const resolveDatabaseHost = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;

  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isSupabaseDatabaseUrl = (value) => {
  const host = resolveDatabaseHost(value);
  if (!host) return false;

  return SUPABASE_DATABASE_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
  );
};

const assertSafeApplicationDatabaseEnv = (env = process.env) => {
  const blockedNames = APPLICATION_DATABASE_ENV_NAMES.filter((name) =>
    isSupabaseDatabaseUrl(env[name])
  );
  if (blockedNames.length === 0) return;

  throw new Error(
    `[database-target] Refusing Supabase Postgres in ${blockedNames.join(
      ", "
    )}. BARO uses Supabase for authentication only; configure Railway Postgres for the application database.`
  );
};

module.exports = {
  assertSafeApplicationDatabaseEnv,
  isSupabaseDatabaseUrl,
  resolveDatabaseHost,
};
