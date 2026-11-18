import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 6000;
const validName = name => typeof name === 'string' && /^[\w.-]+$/.test(name) && !name.startsWith('.');
const digest = data => createHash('sha256').update(data).digest('hex');

// Only public, same-origin static assets are copied. Never carry HTML, API
// responses, credentials or application data into the next deployment.
export async function collectPreviousAssets(origin, { now = Date.now(), fetcher = fetch } = {}) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Invalid asset origin');
  const get = async pathname => fetcher(new URL(pathname, base), { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  const manifestResponse = await get('/asset-retention.json');
  const files = new Map();
  let total = 0;
  const inBatches = async (items, action) => {
    for (let offset = 0; offset < items.length; offset += 8) await Promise.all(items.slice(offset, offset + 8).map(action));
  };
  const download = async (name, lastSeen, expected) => {
    if (!validName(name)) throw Error('Invalid retained asset name');
    if (files.has(name)) return;
    if (files.size >= MAX_FILES) throw Error('Retained asset count exceeds limit');
    const response = await get(`/assets/${name}`);
    if (!response.ok || /text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw Error(`Cannot retain asset ${name}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    total += data.length;
    if (total > MAX_BYTES) throw Error('Retained assets exceed size limit');
    if (expected && (expected.size !== data.length || expected.sha256 !== digest(data))) throw Error(`Retained asset integrity mismatch: ${name}`);
    files.set(name, { data, lastSeen });
    if (files.size % 50 === 0) console.log(`Verified ${files.size} previous frontend assets.`);
  };
  if (manifestResponse.ok && /application\/json/i.test(manifestResponse.headers.get('content-type') || '')) {
    const manifest = await manifestResponse.json();
    if (manifest.version !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length > MAX_FILES) throw Error('Invalid retention manifest');
    for (const asset of manifest.assets) {
      if (!validName(asset.name) || !Number.isFinite(asset.lastSeen) || asset.lastSeen > now + 300000 || !Number.isInteger(asset.size) || asset.size < 0 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw Error('Invalid retention manifest entry');
    }
    if (new Set(manifest.assets.map(asset => asset.name)).size !== manifest.assets.length) throw Error('Duplicate retention manifest entry');
    await inBatches(manifest.assets.filter(asset => now - asset.lastSeen <= RETENTION_MS), asset => download(asset.name, asset.lastSeen, asset));
  } else {
    // One-time migration from deployments without a manifest. Vite's entry and
    // dependency map enumerate the hashed lazy chunks, including unopened pages.
    if (manifestResponse.status !== 404) throw Error('Cannot read previous retention manifest');
    const response = await get('/');
    if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Cannot read previous frontend entry');
    const discover = text => [...text.matchAll(/["'`(](?:\/assets\/|assets\/|\.\/)?([\w.-]+-[\w-]{8}\.[a-z0-9]+)["'`)]/g)].map(match => match[1]);
    const pending = new Set(discover(await response.text()));
    if (!pending.size) throw Error('Previous frontend entry contains no hashed assets');
    while (pending.size) {
      const batch = [...pending];
      pending.clear();
      if (files.size + batch.length > MAX_FILES) throw Error('Retained asset count exceeds limit');
      await inBatches(batch, async name => {
        await download(name, now);
        if (/\.(js|css)$/.test(name)) for (const dependency of discover(files.get(name).data.toString('utf8'))) if (!files.has(dependency)) pending.add(dependency);
      });
      for (const name of files.keys()) pending.delete(name);
    }
  }
  return files;
}

export async function mergeAssets(distDir, previous, now = Date.now()) {
  const assetsDir = join(distDir, 'assets');
  const assets = [];
  const current = new Set(await readdir(assetsDir));
  for (const name of current) {
    if (!validName(name)) throw Error('Unexpected asset path');
    const data = await readFile(join(assetsDir, name));
    const old = previous.get(name);
    if (old && !old.data.equals(data)) throw Error(`Immutable asset collision: ${name}`);
    assets.push({ name, lastSeen: now, size: data.length, sha256: digest(data) });
  }
  for (const [name, asset] of previous) {
    if (!validName(name)) throw Error('Invalid retained asset name');
    if (current.has(name) || now - asset.lastSeen > RETENTION_MS) continue;
    await writeFile(join(assetsDir, name), asset.data);
    assets.push({ name, lastSeen: asset.lastSeen, size: asset.data.length, sha256: digest(asset.data) });
  }
  await writeFile(join(distDir, 'asset-retention.json'), JSON.stringify({ version: 1, assets }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = dirname(fileURLToPath(import.meta.url));
  const origin = process.argv.find(arg => arg.startsWith('--retain-from='))?.slice('--retain-from='.length);
  // Download before building; an unavailable previous release blocks deployment
  // rather than silently publishing a release that breaks existing tabs.
  const previous = origin ? await collectPreviousAssets(origin) : new Map();
  const result = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await mergeAssets(join(root, 'dist'), previous);
  console.log(`Retained ${previous.size} previous frontend assets (14-day window).`);
}
