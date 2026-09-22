import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const ts = require('typescript');

// Inspect syntax, not comments or descriptive strings. Quoted/computed property
// names are still code references and must not bypass the retired-domain guard.
export function retiredLineReferences(source, filename = 'source.ts') {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    /[jt]sx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const matches = [];
  const forbidden = new Set(['lineId', 'lineAssignmentId', 'LineAssignment', 'isLineLeader', 'lineLeaderStartAt', 'lineLeaderEndAt']);
  function visit(node) {
    if (ts.isIdentifier(node) && forbidden.has(node.text)) matches.push(node.text);
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && forbidden.has(node.text)) {
      const p = node.parent;
      if (p.name === node || ts.isElementAccessExpression(p) || ts.isComputedPropertyName(p)) matches.push(node.text);
    }
    if (ts.isPropertyAccessExpression(node) && ['prisma', 'db', 'tx'].includes(node.expression.getText(tree)) && ['line', 'lineAssignment'].includes(node.name.text)) matches.push(node.getText(tree));
    if (ts.isElementAccessExpression(node) && ['prisma', 'db', 'tx'].includes(node.expression.getText(tree)) && ['line', 'lineAssignment'].includes(node.argumentExpression.text)) matches.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return matches;
}
