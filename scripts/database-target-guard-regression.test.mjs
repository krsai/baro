import test from "node:test";
import assert from "node:assert/strict";
import databaseTargetGuard from "../backend/src/config/databaseTargetGuard.js";

const {
  assertSafeApplicationDatabaseEnv,
  isSupabaseDatabaseUrl,
  resolveDatabaseHost,
} = databaseTargetGuard;

test("allows Railway application database URLs", () => {
  assert.doesNotThrow(() =>
    assertSafeApplicationDatabaseEnv({
      DATABASE_URL:
        "postgresql://user:secret@postgres.railway.internal:5432/railway",
      DIRECT_URL:
        "postgresql://user:secret@mainline.proxy.rlwy.net:31661/railway",
    })
  );
});

test("blocks Supabase Postgres without exposing credentials", () => {
  const secret = "do-not-print-this-password";
  assert.throws(
    () =>
      assertSafeApplicationDatabaseEnv({
        DIRECT_URL: `postgresql://postgres:${secret}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`,
      }),
    (error) => {
      assert.match(String(error?.message), /Refusing Supabase Postgres/);
      assert.match(String(error?.message), /DIRECT_URL/);
      assert.doesNotMatch(String(error?.message), new RegExp(secret));
      return true;
    }
  );
});

test("checks both application database variables independently", () => {
  assert.throws(() =>
    assertSafeApplicationDatabaseEnv({
      DATABASE_URL:
        "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      DIRECT_URL:
        "postgresql://user:secret@postgres.railway.internal:5432/railway",
    })
  );
});

test("does not inspect Supabase authentication variables", () => {
  assert.doesNotThrow(() =>
    assertSafeApplicationDatabaseEnv({
      SUPABASE_URL: "https://project.supabase.co",
      DATABASE_URL:
        "postgresql://user:secret@postgres.railway.internal:5432/railway",
    })
  );
});

test("database host helpers recognize Supabase pooler addresses", () => {
  const url =
    "postgresql://postgres:secret@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres";
  assert.equal(
    resolveDatabaseHost(url),
    "aws-1-ap-northeast-2.pooler.supabase.com"
  );
  assert.equal(isSupabaseDatabaseUrl(url), true);
});
