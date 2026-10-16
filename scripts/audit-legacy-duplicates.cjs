// Read-only source audit. No application imports, environment loading, or DB access.
// Run from the repository root; --json prints the complete evidence inventory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../backend/node_modules/typescript');

const walk = directory => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const files = ['frontend/src', 'backend/src'].flatMap(walk)
  .filter(file => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(file));
const knownFiles = new Set(files);
const edges = {};
const lineCounts = {};
const functions = [];
const endpoints = [];
const declarationOnly = [];
const resolveImport = (file, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return [base, ...['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '/index.js', '/index.jsx', '/index.ts'].map(extension => base + extension)]
    .find(candidate => knownFiles.has(candidate));
};
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : undefined);
  const identifiers = new Map();
  edges[file] = [];
  lineCounts[file] = source.split('\n').length;
  const line = node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  const addImport = specifier => {
    const resolved = resolveImport(file, specifier);
    if (resolved) edges[file].push(resolved);
  };
  const visit = node => {
    if (ts.isIdentifier(node)) identifiers.set(node.text, (identifiers.get(node.text) || 0) + 1);
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addImport(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const first = node.arguments[0];
      if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require') && first && ts.isStringLiteral(first)) addImport(first.text);
      if (file.startsWith('backend/') && ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(ast);
        const method = node.expression.name.text;
        if (/^(?:app|\w*router)$/i.test(receiver) && ['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const paths = first && ts.isStringLiteral(first) ? [first]
            : first && ts.isArrayLiteralExpression(first) ? first.elements.filter(ts.isStringLiteral) : [];
          for (const route of paths) endpoints.push({ file, line: line(node), receiver, method, path: route.text });
        }
      }
    }
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body) {
      const body = node.body.getText(ast);
      if (body.length > 100) {
        const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, body);
        const tokens = [];
        while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
        const name = node.name?.getText(ast) || (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(ast) : 'anonymous');
        functions.push({ file, line: line(node), name, characters: body.length,
          hash: crypto.createHash('sha256').update(tokens.join(' ')).digest('hex') });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (file === 'backend/src/index.ts') {
    for (const statement of ast.statements) {
      if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const declarations = ts.isVariableStatement(statement) ? statement.declarationList.declarations
        : ts.isFunctionDeclaration(statement) ? [statement] : [];
      for (const declaration of declarations) {
        if (declaration.name && ts.isIdentifier(declaration.name) && identifiers.get(declaration.name.text) === 1) {
          declarationOnly.push({ file, line: line(declaration), name: declaration.name.text });
        }
      }
    }
  }
}
// Include the two browser acceptance entrypoints to avoid calling them dead code.
const roots = ['frontend/src/index.jsx', 'frontend/src/invoiceAcceptance.jsx',
  'frontend/src/search-select-acceptance.jsx', 'backend/src/index.ts'];
const reachable = new Set();
const visitFile = file => {
  if (reachable.has(file)) return;
  reachable.add(file);
  (edges[file] || []).forEach(visitFile);
};
roots.forEach(visitFile);
const groupBy = (rows, key) => {
  const result = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(row);
  }
  return [...result.values()];
};
const duplicateBodies = groupBy(functions, row => row.hash).filter(group => group.length > 1)
  .sort((left, right) => right[0].characters - left[0].characters)
  .map(group => group.map(({ hash, ...row }) => row));
const result = {
  limitations: [
    'Static import graph, literal imports only; external consumers and operational logs are not inspected.',
    'Unreachable files may be imported by tests or maintenance tools outside the source roots.',
    'Identical body tokens are candidates, not proof of equal contracts or removable functionality.',
    'Identifier counts are syntax-based, not a type-checked reference search.',
    'Endpoint declarations include factory registrations, not runtime mount counts; no HTTP requests are made.',
  ],
  sourceFiles: files.length,
  sourceLines: Object.values(lineCounts).reduce((sum, count) => sum + count, 0),
  byRoot: ['frontend/src', 'backend/src'].map(root => ({ root, files: files.filter(file => file.startsWith(root + '/')).length })),
  roots,
  unreachable: files.filter(file => !reachable.has(file)).map(file => ({ file, lines: lineCounts[file] })),
  declarationOnly,
  duplicateBodies,
  endpoints,
  duplicateEndpointDeclarations: groupBy(endpoints, row => `${row.method} ${row.path}`).filter(group => group.length > 1),
  largestFiles: Object.entries(lineCounts).sort((left, right) => right[1] - left[1]).slice(0, 15),
};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else console.log(JSON.stringify({
  sourceFiles: result.sourceFiles, sourceLines: result.sourceLines, byRoot: result.byRoot,
  unreachable: result.unreachable, declarationOnly: result.declarationOnly,
  duplicateBodyGroups: duplicateBodies.length,
  crossFileDuplicateBodyGroups: duplicateBodies.filter(group => new Set(group.map(row => row.file)).size > 1).length,
  endpointDeclarations: endpoints.length,
  duplicateEndpointDeclarations: result.duplicateEndpointDeclarations,
  limitations: result.limitations,
}, null, 2));
