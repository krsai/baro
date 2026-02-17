import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['frontend/src', 'backend/src'];
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.css',
  '.scss',
  '.html',
  '.md',
]);

const PATTERNS = [
  { label: 'U+FFFD replacement char', regex: /\uFFFD/u },
  { label: 'CJK compatibility ideograph', regex: /[\uF900-\uFAFF]/u },
];

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(fullPath);
  }
  return files;
}

function findLineNumber(content, charIndex) {
  let line = 1;
  for (let i = 0; i < charIndex; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

async function main() {
  const issues = [];

  for (const relativeDir of TARGET_DIRS) {
    const absDir = path.join(ROOT, relativeDir);
    let files = [];
    try {
      files = await listFiles(absDir);
    } catch {
      continue;
    }

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      for (const pattern of PATTERNS) {
        const match = pattern.regex.exec(content);
        if (!match) continue;
        issues.push({
          file: path.relative(ROOT, file),
          line: findLineNumber(content, match.index),
          label: pattern.label,
        });
      }
    }
  }

  if (issues.length === 0) {
    console.log('Encoding check passed: no suspicious mojibake patterns found.');
    return;
  }

  console.error('Encoding check failed. Suspicious text found:');
  for (const issue of issues) {
    console.error(`- ${issue.file}:${issue.line} (${issue.label})`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
