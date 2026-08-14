import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authContext = await readFile(
  new URL('../frontend/src/context/AuthContext.jsx', import.meta.url),
  'utf8'
);

test('token refresh keeps the mounted workspace while a valid profile exists', () => {
  assert.match(authContext, /\(accessLoading && !effectiveProfile\)/);
  assert.doesNotMatch(
    authContext.slice(authContext.indexOf('const loadingState ='), authContext.indexOf('const hasWorkspaceAccess =')),
    /\(accessLoading \|\|/
  );
});

test('transient access-context failures preserve the matching valid profile', () => {
  assert.match(authContext, /previousEmail === normalizedCurrentUserEmail \? previous : null/);
  assert.match(authContext, /Token refreshes commonly happen after the browser has been in the/);
});
