import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {parse} = require('../frontend/node_modules/@babel/parser');
const traverse = require('../frontend/node_modules/@babel/traverse').default;

function propagationOnly(attribute) {
  const handler = attribute?.value?.expression;
  if (handler?.type !== 'ArrowFunctionExpression') return false;
  const body = handler.body.type === 'BlockStatement' ? handler.body.body.map(statement => statement.expression) : [handler.body];
  return body.length > 0 && body.every(expression => expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' && expression.callee.property.name === 'stopPropagation' &&
    expression.callee.object.name === handler.params[0]?.name && expression.arguments.length === 0);
}

test('record opening uses the shared policy; preview/selection/expansion are explicit', () => {
  const failures = [];
  function scan(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) { scan(file); continue; }
      if (!file.endsWith('.jsx')) continue;
      const source = readFileSync(file, 'utf8');
      const ast = parse(source, {sourceType: 'module', plugins: ['jsx']});
      const shared = file.endsWith('/RecordInteraction.jsx');
      traverse(ast, {JSXElement(p) {
        const node = p.node, opening = node.openingElement, name = opening.name.name;
        const attr = key => opening.attributes.find(a => a.name?.name === key);
        const report = message => failures.push(`${file}:${node.loc.start.line} ${message}`);
        if (shared) return;
        const double = attr('onDoubleClick');
        if (double && !propagationOnly(double) && !file.endsWith('/LookupSearchDialog.jsx')) {
          report('Use RecordRow/onOpen for record opening.');
        }
        if (['TableRow', 'tr', 'Paper'].includes(name) && attr('onClick')) {
          if (!['preview', 'select', 'expand', 'lookup'].includes(attr('data-record-interaction')?.value?.value)) {
            report('Declare preview/select/expand/lookup, or use RecordRow for opening.');
          }
        }
        if (name === 'RecordRow') {
          if (!attr('recordKey') || !attr('onOpen')) report('RecordRow requires an actual record key and open action.');
          if (attr('onClick') || attr('onDoubleClick') || attr('onKeyDown')) report('Do not override common row gestures.');
          if (!p.findParent(parent => parent.isJSXElement() && parent.node.openingElement.name.name === 'RecordInteractionScope')) {
            report('Scope row selection to its own list.');
          }
        }
        if (['TableRow', 'tr', 'Paper', 'Box'].includes(name) && attr('onContextMenu') && !source.slice(node.start, node.end).includes('RecordMenuButton')) {
          report('Provide a visible RecordMenuButton for the same context menu.');
        }
      }});
    }
  }
  scan('frontend/src');
  assert.deepEqual(failures, []);
});
