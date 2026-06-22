import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || process.env.PORT || 4173);
const host = "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function isInsideRoot(filePath) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  const lowerRoot = normalizedRoot.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  return lowerPath === root.toLowerCase() || lowerPath.startsWith(lowerRoot);
}

function candidateForRequest(requestUrl, hostHeader) {
  const url = new URL(requestUrl, `http://${hostHeader || `${host}:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath = resolve(root, `.${pathname}`);

  if (!isInsideRoot(filePath)) return null;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    filePath = join(root, "index.html");
  }
  return filePath;
}

const server = createServer((request, response) => {
  const filePath = candidateForRequest(request.url || "/", request.headers.host);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      response.writeHead(500);
      response.end("Server error");
    })
    .pipe(response);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});
