import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectPreviousAssets, mergeAssets, RETENTION_MS } from '../frontend/build-with-retained-assets.mjs';

const now = 1800000000000;
const response = (body, type = 'text/javascript', status = 200) => new Response(body, { status, headers: { 'content-type': type } });
test('two deployments keep unopened old chunks and their dependency bytes; expiration does not extend on every build', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baro-assets-'));
  try {
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'page-aaaaaaaa.js'), 'export const value="old"');
    await mergeAssets(dir, new Map(), now);
    const manifest = await readFile(join(dir, 'asset-retention.json'), 'utf8');
    const fetcher = async url => url.pathname === '/asset-retention.json' ? response(manifest, 'application/json') : response('export const value="old"');
    const previous = await collectPreviousAssets('https://example.test', { now: now + 1000, fetcher });
    await rm(join(dir, 'assets', 'page-aaaaaaaa.js'));
    await writeFile(join(dir, 'assets', 'page-bbbbbbbb.js'), 'export const value="new"');
    await mergeAssets(dir, previous, now + 1000);
    assert.equal(await readFile(join(dir, 'assets', 'page-aaaaaaaa.js'), 'utf8'), 'export const value="old"');
    const next = JSON.parse(await readFile(join(dir, 'asset-retention.json'), 'utf8'));
    assert.equal(next.assets.find(asset => asset.name === 'page-aaaaaaaa.js').lastSeen, now);
    const requested = [];
    await collectPreviousAssets('https://example.test', { now: now + RETENTION_MS + 1, fetcher: async url => {
      requested.push(url.pathname);
      return url.pathname === '/asset-retention.json' ? response(JSON.stringify(next), 'application/json') : response('export const value="new"');
    } });
    assert.deepEqual(requested, ['/asset-retention.json', '/assets/page-bbbbbbbb.js']);
    await assert.rejects(collectPreviousAssets('https://example.test', { now, fetcher: async url => url.pathname === '/asset-retention.json' ? response(manifest, 'application/json') : response('corrupt') }), /integrity/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('first deployment discovers the previous Vite lazy dependency map without executing code', async () => {
  const bodies = {
    '/': ['<script src="/assets/index-aaaaaaaa.js"></script>', 'text/html'],
    '/assets/index-aaaaaaaa.js': ['const deps=["assets/page-bbbbbbbb.js","assets/page-cccccccc.css"];import("./vendor-dddddddd.js")'],
    '/assets/page-bbbbbbbb.js': ['export default 1'],
    '/assets/page-cccccccc.css': ['body{background:url(/assets/image-eeeeeeee.png)}'],
    '/assets/image-eeeeeeee.png': ['image bytes', 'image/png'],
    '/assets/vendor-dddddddd.js': ['export default 2'],
  };
  const fetcher = async url => bodies[url.pathname] ? response(...bodies[url.pathname]) : response('', 'application/json', 404);
  const assets = await collectPreviousAssets('https://example.test', { now, fetcher });
  assert.equal(assets.size, 5);
  assert.equal(assets.get('page-bbbbbbbb.js').data.toString(), 'export default 1');
  await assert.rejects(collectPreviousAssets('https://example.test', { now, fetcher: async () => response('', 'text/plain', 503) }), /manifest/);
  await assert.rejects(collectPreviousAssets('https://example.test', { now, fetcher: async () => response('<html>', 'text/html') }), /manifest/);
});

test('retention rejects path traversal and immutable filename collisions', async () => {
  const manifest = { version: 1, assets: [{ name: '../secret', lastSeen: now, size: 1, sha256: 'a'.repeat(64) }] };
  await assert.rejects(collectPreviousAssets('https://example.test', { now, fetcher: async () => response(JSON.stringify(manifest), 'application/json') }), /entry/);
  const dir = await mkdtemp(join(tmpdir(), 'baro-assets-'));
  try {
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets/page-aaaaaaaa.js'), 'new');
    await assert.rejects(mergeAssets(dir, new Map([['page-aaaaaaaa.js', { data: Buffer.from('old'), lastSeen: now }]]), now), /collision/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
