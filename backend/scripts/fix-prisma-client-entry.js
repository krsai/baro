const fs = require("fs");
const path = require("path");

const targetFiles = [
  path.join(__dirname, "..", "node_modules", ".prisma", "client", "default.js"),
];

const brokenRequirePattern = /require\((['"])#main-entry-point\1\)/g;
let patchedCount = 0;
let checkedCount = 0;

for (const target of targetFiles) {
  if (!fs.existsSync(target)) continue;
  checkedCount += 1;
  const source = fs.readFileSync(target, "utf8");
  const patched = source.replace(brokenRequirePattern, "require('./index.js')");
  if (patched !== source) {
    fs.writeFileSync(target, patched, "utf8");
    patchedCount += 1;
    console.log(`[prisma-entry-fix] patched ${path.relative(process.cwd(), target)}`);
  }
}

if (checkedCount === 0) {
  console.log("[prisma-entry-fix] skip: generated client not found");
  process.exit(0);
}
if (patchedCount === 0) {
  console.log("[prisma-entry-fix] skip: no patch needed");
  process.exit(0);
}
