const http = require("http");
const fs = require("fs");
const path = require("path");

const host = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const port = Number(process.env.PORT) || 4173;
const distDir = path.join(__dirname, "dist");
const indexFile = path.join(distDir, "index.html");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const HTML_CACHE_CONTROL = "no-cache, no-store, must-revalidate";
const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const STATIC_CACHE_CONTROL = "public, max-age=3600";

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
};

const resolveCacheControl = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return HTML_CACHE_CONTROL;

  const relativePath = path
    .relative(distDir, filePath)
    .split(path.sep)
    .join("/");
  if (relativePath.startsWith("assets/")) {
    return IMMUTABLE_ASSET_CACHE_CONTROL;
  }

  return STATIC_CACHE_CONTROL;
};

const sendFile = (res, filePath, statusCode = 200) => {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(res, error.code === "ENOENT" ? 404 : 500, {
        ok: false,
        error: error.code === "ENOENT" ? "not found" : "failed to read file",
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(statusCode, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": resolveCacheControl(filePath),
    });
    res.end(buffer);
  });
};

const resolveStaticPath = (requestPath) => {
  const normalizedPath = decodeURIComponent(String(requestPath || "/")).replace(/^\/+/, "");
  const absolutePath = path.resolve(distDir, normalizedPath);
  if (!absolutePath.startsWith(distDir)) return null;
  return absolutePath;
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const requestedPath = resolveStaticPath(requestUrl.pathname);
  if (
    requestedPath &&
    fs.existsSync(requestedPath) &&
    fs.statSync(requestedPath).isFile()
  ) {
    sendFile(res, requestedPath);
    return;
  }

  const requestedExt = path.extname(requestUrl.pathname);
  if (requestedExt) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  sendFile(res, indexFile);
});

server.listen(port, host, () => {
  console.log(`Frontend running on http://${host}:${port}`);
});
