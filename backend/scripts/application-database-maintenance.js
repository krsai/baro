// Intentionally separate from npm start. The imported API must not listen.
const mode = process.argv[2];
if (!['prepare', 'legacy', 'historical-cards'].includes(mode)) {
  console.error('Specify prepare, legacy, or historical-cards');
  process.exitCode = 1;
} else {
  process.env.BARO_SKIP_API_START = '1';
  const { runDatabaseMaintenance } = require('../dist/index.js');
  runDatabaseMaintenance(mode).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
