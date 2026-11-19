import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MIB = 1024 ** 2;
// Bound the published directory and the manifest the next build will read.
const MAX_BYTES = 4 * 1024 * MIB;
const MAX_FILES = 100_000;
const MAX_ASSET_BYTES = 16 * MIB;
const MAX_MANIFEST_BYTES = 64 * MIB;
const DOWNLOAD_CONCURRENCY = 24;
const validName = name => typeof name === 'string' && name.length <= 255 && /^[\w.-]+$/.test(name) && !name.startsWith('.');
const digest = data => createHash('sha256').update(data).digest('hex');

export function retentionOrigin(args = [], env = {}) {
  const option = args.find(arg => arg.startsWith('--retain-from='));
  if (option) {
    const value = option.slice('--retain-from='.length);
    if (!value) throw Error('Asset retention origin is empty');
    return value;
  }
  if (env.FRONTEND_RETAIN_FROM) return env.FRONTEND_RETAIN_FROM;
  // Keep frontend-only options inside this frontend-owned entry point.
  // A generic Railway build command must also remain valid in backend/.
  return env.RAILWAY_SERVICE_ID && env.RAILWAY_ENVIRONMENT_NAME === 'production'
    ? 'https://www.barogarment.com' : null;
}

async function readBody(response, maxBytes, label) {
  if (!response.body) throw Error(`${label} has no response body`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw Error(`${label} exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

async function downloadInBatches(items, download) {
  for (let offset = 0; offset < items.length; offset += DOWNLOAD_CONCURRENCY) {
    await Promise.all(items.slice(offset, offset + DOWNLOAD_CONCURRENCY).map(download));
    if (offset && (offset / DOWNLOAD_CONCURRENCY) % 25 === 0) {
      console.log(`Verified ${Math.min(offset + DOWNLOAD_CONCURRENCY, items.length)} of ${items.length} previous frontend files.`);
    }
  }
}

async function retainPreviousAssets(origin, { now, fetcher, addAsset, saveAsset }) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Invalid asset origin');
  const get = pathname => fetcher(new URL(pathname, base), {
    redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' },
  });
  const download = async (name, maxBytes) => {
    if (!validName(name)) throw Error('Invalid retained asset name');
    const response = await get(`/assets/${name}`);
    if (!response.ok || /text\/html|application\/json/i.test(response.headers.get('content-type') || '')) {
      throw Error(`Cannot retain asset ${name}: HTTP ${response.status}`);
    }
    return readBody(response, maxBytes, `Retained asset ${name}`);
  };

  const manifestResponse = await get('/asset-retention.json');
  if (manifestResponse.ok && /application\/json/i.test(manifestResponse.headers.get('content-type') || '')) {
    const manifest = JSON.parse(await readBody(manifestResponse, MAX_MANIFEST_BYTES, 'Retention manifest'));
    if (manifest?.version !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length > MAX_FILES) throw Error('Invalid retention manifest');
    const seen = new Set();
    const missing = [];
    let missingBytes = 0;
    for (const asset of manifest.assets) {
      if (!validName(asset?.name) || !Number.isFinite(asset.lastSeen) || asset.lastSeen > now + 300000 ||
        !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > MAX_ASSET_BYTES ||
        typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        throw Error('Invalid retention manifest entry');
      }
      if (seen.has(asset.name)) throw Error('Duplicate retention manifest entry');
      seen.add(asset.name);
      if (now - asset.lastSeen > RETENTION_MS) continue;
      if (addAsset(asset)) {
        missing.push(asset);
        missingBytes += asset.size;
      }
    }
    console.log(`Downloading ${missing.length} previous frontend files (${(missingBytes / MIB).toFixed(1)} MiB).`);
    await downloadInBatches(missing, async asset => {
      const data = await download(asset.name, asset.size);
      if (data.length !== asset.size || digest(data) !== asset.sha256) throw Error(`Retained asset integrity mismatch: ${asset.name}`);
      await saveAsset(asset.name, data);
    });
    return missing.length;
  }

  // First build from a deployment without a manifest. The Vite dependency map
  // reaches lazy chunks even if those pages have never been opened.
  if (manifestResponse.status !== 404) throw Error(`Cannot read previous retention manifest: HTTP ${manifestResponse.status}`);
  const response = await get('/');
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Cannot read previous frontend entry');
  const discover = text => [...text.matchAll(/["'`(](?:\/assets\/|assets\/|\.\/)?([\w.-]+-[\w-]{8}\.[a-z0-9]+)["'`)]/g)].map(match => match[1]);
  const pending = new Set(discover((await readBody(response, MAX_ASSET_BYTES, 'Previous frontend entry')).toString('utf8')));
  if (!pending.size) throw Error('Previous frontend entry contains no hashed assets');
  const seen = new Set();
  let retained = 0;
  while (pending.size) {
    const batch = [...pending];
    pending.clear();
    if (seen.size + batch.length > MAX_FILES) throw Error('Previous frontend dependency count exceeds limit');
    for (const name of batch) seen.add(name);
    await downloadInBatches(batch, async name => {
      const data = await download(name, MAX_ASSET_BYTES);
      if (addAsset({ name, size: data.length, sha256: digest(data), lastSeen: now })) {
        await saveAsset(name, data);
        retained++;
      }
      if (/\.(js|css)$/.test(name)) {
        for (const dependency of discover(data.toString('utf8'))) {
          if (!seen.has(dependency)) pending.add(dependency);
        }
      }
    });
  }
  return retained;
}

// Retain public, same-origin assets as verified files. Keep only metadata and
// the active batch in memory even when the retention window covers many builds.
export async function finalizeFrontendAssets(distDir, { origin, now = Date.now(), fetcher = fetch } = {}) {
  const assetsDir = join(distDir, 'assets');
  const inventory = new Map();
  let totalBytes = 0;
  const addAsset = ({ name, lastSeen, size, sha256 }) => {
    const existing = inventory.get(name);
    if (existing) {
      if (existing.size !== size || existing.sha256 !== sha256) throw Error(`Immutable asset collision: ${name}`);
      return false;
    }
    if (inventory.size >= MAX_FILES) throw Error(`Frontend output exceeds ${MAX_FILES} asset files`);
    totalBytes += size;
    if (totalBytes > MAX_BYTES) throw Error(`Frontend output exceeds ${MAX_BYTES / MIB} MiB of assets`);
    inventory.set(name, { name, lastSeen, size, sha256 });
    return true;
  };

  for (const entry of await readdir(assetsDir, { withFileTypes: true })) {
    const { name } = entry;
    if (!entry.isFile() || !validName(name)) throw Error('Unexpected asset path');
    const path = join(assetsDir, name);
    if ((await stat(path)).size > MAX_ASSET_BYTES) throw Error(`Built asset exceeds size limit: ${name}`);
    const data = await readFile(path);
    addAsset({ name, lastSeen: now, size: data.length, sha256: digest(data) });
  }

  const retainedCount = origin ? await retainPreviousAssets(origin, {
    now, fetcher, addAsset,
    saveAsset: (name, data) => writeFile(join(assetsDir, name), data, { flag: 'wx' }),
  }) : 0;
  const manifest = JSON.stringify({ version: 1, assets: [...inventory.values()] });
  if (Buffer.byteLength(manifest) > MAX_MANIFEST_BYTES) throw Error('Frontend output manifest exceeds size limit');
  await writeFile(join(distDir, 'asset-retention.json'), manifest);
  return retainedCount;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = dirname(fileURLToPath(import.meta.url));
  const origin = retentionOrigin(process.argv.slice(2), process.env);
  const result = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  const retainedCount = await finalizeFrontendAssets(join(root, 'dist'), { origin });
  console.log(`Retained ${retainedCount} previous frontend files (14-day window).`);
}
