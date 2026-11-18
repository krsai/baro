// Prisma does not model tables maintained by SQL migrations. Keep their data and FKs.
function additiveSchemaPlan(sql) {
  const statements = sql.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
  const externalTables = new Set(statements.flatMap(statement => {
    const match = statement.match(/^DROP TABLE "([^"]+)"$/);
    return match ? [match[1]] : [];
  }));
  const unsupported = [];
  const changes = statements.filter(statement => {
    if (/^DROP TABLE /.test(statement)) return false;
    const alter = statement.match(/^ALTER TABLE "([^"]+)"/);
    if (alter && externalTables.has(alter[1])) return false;
    if (/^CREATE (UNIQUE )?INDEX /.test(statement) || /^CREATE TABLE /.test(statement)) return true;
    if (alter && /^ALTER TABLE "[^"]+"\s+ADD (COLUMN|CONSTRAINT)\b/.test(statement) && !/\bDROP\b|\bALTER COLUMN\b/.test(statement)) return true;
    unsupported.push(statement);
    return false;
  });
  if (unsupported.length) throw new Error('Schema preparation requires explicit migrations (' + unsupported.length + ' statements):\n' + unsupported.join(';\n'));
  // Repeatable preparation creates an equivalent partial index for nullable factory codes.
  const body = changes.join(';\n').replace('CREATE UNIQUE INDEX "Factory_orgId_factoryCode_key"', 'CREATE UNIQUE INDEX IF NOT EXISTS "Factory_orgId_factoryCode_key"');
  return { sql: changes.length ? 'BEGIN;\n' + body + ';\nCOMMIT;\n' : '', preservedTables: [...externalTables] };
}
module.exports = { additiveSchemaPlan };
