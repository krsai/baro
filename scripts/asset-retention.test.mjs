import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeFrontendAssets, RETENTION_MS } from '../frontend/build-with-retained-assets.mjs';

const now = 1800000000000;
const origin = 'https://example.test';
const manifestPath = '/asset-retention.json';
const response = (body, type = 'text/javascript', status = 200) => new Response(body, { status, headers: { 'content-type': type } });
const json = assets => response(JSON.stringify({ version: 1, assets }), 'application/json');
const readManifest = async dir => JSON.parse(await readFile(join(dir, 'asset-retention.json'), 'utf8')).assets;
const notFound = () => response('', 'application/json', 404);

async function buildOutput(t, assets = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'baro-assets-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'assets'));
  for (const [name, body] of Object.entries(assets)) await writeFile(join(dir, 'assets', name), body);
  return dir;
}

test('deployments retain older lazy chunks, reuse identical build files, and expire old files on schedule', async t => {
  const oldPage = 'page-aaaaaaaa.js';
  const newPage = 'page-bbbbbbbb.js';
  const vendor = 'vendor-cccccccc.js';
  const first = await buildOutput(t, { [oldPage]: 'export const value="old"', [vendor]: 'export default 1' });
  await finalizeFrontendAssets(first, { now });
  const firstManifest = await readManifest(first);
  const second = await buildOutput(t, { [newPage]: 'export const value="new"', [vendor]: 'export default 1' });
  const requests = [];
  const retained = await finalizeFrontendAssets(second, {
    origin, now: now + 1000,
    fetcher: async url => {
      requests.push(url.pathname);
      return url.pathname === manifestPath ? json(firstManifest) : response(await readFile(join(first, url.pathname)));
    },
  });
  assert.equal(retained, 1);
  assert.deepEqual(requests, [manifestPath, '/assets/' + oldPage]);
  assert.deepEqual(await readFile(join(second, 'assets', oldPage)), await readFile(join(first, 'assets', oldPage)));
  const secondManifest = await readManifest(second);
  assert.equal(secondManifest.find(asset => asset.name === oldPage).lastSeen, now);
  assert.equal(secondManifest.find(asset => asset.name === vendor).lastSeen, now + 1000);

  const third = await buildOutput(t);
  requests.length = 0;
  await finalizeFrontendAssets(third, {
    origin, now: now + RETENTION_MS + 1,
    fetcher: async url => {
      requests.push(url.pathname);
      return url.pathname === manifestPath ? json(secondManifest) : response(await readFile(join(second, url.pathname)));
    },
  });
  assert.deepEqual(new Set(requests), new Set([manifestPath, '/assets/' + newPage, '/assets/' + vendor]));
  await assert.rejects(readFile(join(third, 'assets', oldPage)), { code: 'ENOENT' });
});

test('first deployment discovers the previous Vite lazy dependency map without executing code', async t => {
  const dir = await buildOutput(t);
  const bodies = {
    '/': ['<script src="/assets/index-aaaaaaaa.js"></script>', 'text/html'],
    '/assets/index-aaaaaaaa.js': ['const deps=["assets/page-bbbbbbbb.js","assets/page-cccccccc.css"];import("./vendor-dddddddd.js")'],
    '/assets/page-bbbbbbbb.js': ['export default 1'],
    '/assets/page-cccccccc.css': ['body{background:url(/assets/image-eeeeeeee.png)}'],
    '/assets/image-eeeeeeee.png': ['image bytes', 'image/png'],
    '/assets/vendor-dddddddd.js': ['export default 2'],
  };
  const fetcher = async url => bodies[url.pathname] ? response(...bodies[url.pathname]) : notFound();
  assert.equal(await finalizeFrontendAssets(dir, { origin, now, fetcher }), 5);
  assert.equal(await readFile(join(dir, 'assets', 'page-bbbbbbbb.js'), 'utf8'), 'export default 1');
  await assert.rejects(finalizeFrontendAssets(dir, { origin, now, fetcher: async () => response('', 'text/plain', 503) }), /manifest/);
  await assert.rejects(finalizeFrontendAssets(dir, { origin, now, fetcher: async () => response('<html>', 'text/html') }), /manifest/);
});

test('retention rejects corrupt responses and never overwrites an immutable built file', async t => {
  const name = 'page-aaaaaaaa.js';
  const sha256 = createHash('sha256').update('old').digest('hex');
  const previous = { name, lastSeen: now, size: 3, sha256 };
  const dir = await buildOutput(t, { [name]: 'new' });
  const missing = await buildOutput(t);
  const onlyManifest = async url => {
    assert.equal(url.pathname, manifestPath);
    return json([previous]);
  };
  await assert.rejects(finalizeFrontendAssets(dir, { origin, now, fetcher: onlyManifest }), /collision/);
  assert.equal(await readFile(join(dir, 'assets', name), 'utf8'), 'new');
  await assert.rejects(finalizeFrontendAssets(missing, {
    origin, now, fetcher: async url => url.pathname === manifestPath ? json([previous]) : response('bad'),
  }), /integrity/);
  await assert.rejects(finalizeFrontendAssets(missing, {
    origin, now, fetcher: async url => url.pathname === manifestPath ? json([previous]) : response('old with extra bytes'),
  }), /exceeds 3 bytes/);
  await assert.rejects(readFile(join(missing, 'asset-retention.json')), { code: 'ENOENT' });
});

test('retention rejects invalid paths and an oversized output plan before downloading files', async t => {
  const dir = await buildOutput(t);
  const asset = { lastSeen: now, size: 16 * 1024 ** 2, sha256: 'a'.repeat(64) };
  const plan = assets => async url => {
    assert.equal(url.pathname, manifestPath);
    return json(assets);
  };
  await assert.rejects(finalizeFrontendAssets(dir, {
    origin, now, fetcher: plan([{ ...asset, name: '../secret' }]),
  }), /entry/);
  const large = Array.from({ length: 257 }, (_, index) => ({ ...asset, name: 'page-' + index + '.js' }));
  await assert.rejects(finalizeFrontendAssets(dir, { origin, now, fetcher: plan(large) }), /exceeds 4096 MiB/);
});
