// Explicit database preparation. Never called by normal API startup.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const legacySteps = require('./database-legacy-steps.json');

function preparationPlan(mode = 'prepare') {
  if (!['prepare', 'legacy', 'initialize'].includes(mode)) throw new Error('Unknown preparation mode');
  const generate = { script: 'prisma:prepare-client' };
  const schema = { script: 'prisma:deploy:safe' };
  const sql = [{ script: 'prisma:apply:migration-fix' }, { script: 'prisma:apply:factory-child-org-integrity' }];
  const maintenance = value => ({ node: 'scripts/application-database-maintenance.js', args: [value] });
  if (mode === 'initialize') return [generate, { node: 'scripts/assert-empty-database.js' }, schema, ...sql, { node: 'scripts/migrate-expenses.js' }, { node: 'scripts/migrate-entity-profiles.js' }, maintenance('prepare')];
  return [generate, ...(mode === 'legacy' ? [...legacySteps, maintenance('legacy')] : []),
    ...sql, schema, { node: 'scripts/migrate-expenses.js' }, { node: 'scripts/migrate-entity-profiles.js' }, maintenance('prepare'), ...(mode === 'legacy' ? [maintenance('historical-cards')] : [])];
}

function runPlan(plan, run = spawnSync) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const step of plan) {
    const args = step.script ? [npmCli, 'run', step.script] : [step.node, ...(step.args || [])];
    console.log(`[database-prepare] ${step.script || [step.node, ...(step.args || [])].join(' ')}`);
    const result = run(process.execPath, args, { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'inherit' });
    if (result.error || result.signal || result.status !== 0) throw new Error(`Database preparation failed at ${step.script || step.node}`);
  }
}

if (require.main === module) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some(flag => !['--legacy', '--initialize', '--dry-run'].includes(flag)) || flags.includes('--legacy') && flags.includes('--initialize')) throw new Error('Use --legacy OR --initialize, optionally --dry-run');
    const plan = preparationPlan(flags.includes('--legacy') ? 'legacy' : flags.includes('--initialize') ? 'initialize' : 'prepare');
    if (flags.includes('--dry-run')) console.log(JSON.stringify(plan, null, 2));
    else runPlan(plan);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { preparationPlan, runPlan };
