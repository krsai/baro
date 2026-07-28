import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const messagesPath = path.join(root, 'frontend/src/constants/uiMessages.js');
let source = fs.readFileSync(messagesPath, 'utf8');
source = source
  .slice(source.indexOf('export const UI_MESSAGES'), source.indexOf('const resolveMessageNode'))
  .replace('export const UI_MESSAGES', 'UI_MESSAGES');
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

const files = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(target);
  }
};
visit(path.join(root, 'frontend/src'));

const resolveKey = (key) => key.split('.').reduce((value, token) => value?.[token], context.UI_MESSAGES);
const missing = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/getUiMessage\(\s*['"]([^'"]+)['"]/g)) {
    if (!resolveKey(match[1])) missing.push(`${path.relative(root, file)}: ${match[1]}`);
  }
}

const incomplete = [];
const inspect = (value, key = '') => {
  if (!value || typeof value !== 'object') return;
  const languages = ['ko', 'en', 'vi'];
  if (languages.some((language) => language in value)) {
    const absent = languages.filter((language) => !String(value[language] ?? '').trim());
    if (absent.length) incomplete.push(`${key}: ${absent.join(', ')}`);
    return;
  }
  Object.entries(value).forEach(([token, child]) => inspect(child, key ? `${key}.${token}` : token));
};
inspect(context.UI_MESSAGES);

if (missing.length || incomplete.length) {
  if (missing.length) console.error(`Missing UI message keys:\n${[...new Set(missing)].join('\n')}`);
  if (incomplete.length) console.error(`Incomplete ko/en/vi messages:\n${incomplete.join('\n')}`);
  process.exit(1);
}
console.log('UI message check passed: all referenced keys and ko/en/vi values are present.');
