import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const selectSuites = (scripts) => Object.keys(scripts).filter(
  (name) => name.startsWith('test:') && !['test:regression', 'test:line-removal-transition'].includes(name)
);

export async function runSuites(names, execute, report = console.log) {
  const results = [];
  for (const name of names) {
    report(`\n[regression] ${name}`);
    let code;
    try { code = await execute(name); } catch (error) { report(String(error)); code = 1; }
    results.push({ name, code });
  }
  const failed = results.filter(({ code }) => code !== 0);
  report(`\n[regression] ${results.length - failed.length}/${results.length} suites passed`);
  for (const { name, code } of failed) report(`[regression] FAIL ${name} (exit ${code})`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  // npm sets its JS entry point: invoking Node avoids .cmd/.ps1 shell differences.
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run via npm run test:regression');
  process.exitCode = await runSuites(selectSuites(scripts), (name) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, 'run', name], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  }));
}
