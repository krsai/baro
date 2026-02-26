const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  ".prisma",
  "client",
  "default.js"
);

const broken = "require('#main-entry-point')";
const fixed = "require('./index.js')";

if (!fs.existsSync(target)) {
  console.log("[prisma-entry-fix] skip: generated client not found");
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (!source.includes(broken)) {
  console.log("[prisma-entry-fix] skip: no patch needed");
  process.exit(0);
}

fs.writeFileSync(target, source.replace(broken, fixed), "utf8");
console.log("[prisma-entry-fix] patched node_modules/.prisma/client/default.js");
