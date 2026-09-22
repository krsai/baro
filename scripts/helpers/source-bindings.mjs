import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const ts = require('typescript');

// Execute actual declarations with explicit boundary doubles, without starting
// the application's HTTP listener or opening its configured database.
export function loadSourceBindings(filename, names, dependencies = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      if (declarations.has(node.name.text)) throw new Error(`Ambiguous binding: ${node.name.text}`);
      declarations.set(node.name.text, `const ${node.getText(tree)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const name of names) if (!declarations.has(name)) throw new Error(`Missing binding: ${name}`);
  const code = ts.transpileModule([...declarations.values()].join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn { ${names.join(',')} };`)(...Object.values(dependencies));
}
