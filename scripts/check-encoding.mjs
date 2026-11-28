import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ROOT = process.cwd();
const TARGET_DIRS = ['frontend/src', 'backend/src'];
const EXCLUDED_DOCUMENT_DIRS = new Set(['node_modules','dist','build','coverage','.git','.cache','.next','.agents','.codex','.aws']);
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
  { label: 'NUL character in text', regex: /\u0000/u },
  { label: 'Possible lossy text (question-mark runs)', regex: /\?{3,}|\?{2,}(?:[ \t]+\?+)+/u },
];

async function listDocuments(dir=ROOT) {
  const documents=[];
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if(entry.isDirectory()&&!EXCLUDED_DOCUMENT_DIRS.has(entry.name))documents.push(...await listDocuments(path.join(dir,entry.name)));
    else if(entry.isFile()&&path.extname(entry.name).toLowerCase()==='.md')documents.push(path.join(dir,entry.name));
  }
  return documents;
}

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
  let sourceCount=0;

  for (const relativeDir of TARGET_DIRS) {
    const absDir = path.join(ROOT, relativeDir);
    let files = [];
    try {
      files = await listFiles(absDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if(path.extname(file).toLowerCase()==='.md')continue;
      sourceCount++;
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

  // Walk all project Markdown, including files ignored by search configuration.
  // Valid nullish operators remain allowed; lossy prose cannot hide in todo or READMEs.
  const documents=await listDocuments();
  for (const file of documents) {
    const content = await fs.readFile(file, 'utf8');
    for (const pattern of PATTERNS) {
      const match = pattern.regex.exec(content);
      if (match) issues.push({file:path.relative(ROOT,file),line:findLineNumber(content,match.index),label:pattern.label});
    }
  }

  // Lossy historical sources are preserved as bytes, not silently edited or exempted prose.
  let archiveCount=0;
  const archiveDir=path.join(ROOT,'docs/originals');
  let archives=[];try{archives=await fs.readdir(archiveDir);}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const name of archives.filter(name=>name.endsWith('.source.json'))){
    const file=path.join(archiveDir,name),archive=JSON.parse(await fs.readFile(file,'utf8'));
    const bytes=Buffer.from(archive.contentBase64||'','base64'),hash=createHash('sha256').update(bytes).digest('hex');
    if(archive.kind!=='preserved-source'||archive.normalization!=='LF'||!archive.sourcePath||!archive.sourceCommit||!bytes.length||bytes.toString('base64')!==archive.contentBase64||hash!==archive.sha256)issues.push({file:path.relative(ROOT,file),line:1,label:'Preserved source checksum/metadata mismatch'});
    archiveCount++;
  }

  if (issues.length === 0) {
    console.log('Encoding check passed: no suspicious mojibake patterns found.');
    console.log(`Checked ${sourceCount} source files, ${documents.length} Markdown documents and ${archiveCount} preserved sources.`);
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
