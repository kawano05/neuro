import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || "dist");
const requestedPort = Number(process.argv[3] ?? process.env.PORT ?? 0);
const host = process.env.HOST || "127.0.0.1";
const basePath = normalizeBasePath(process.env.BASE_PATH || "/");

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  throw new TypeError(`Invalid port: ${process.argv[3] ?? process.env.PORT}`);
}

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

function candidateForRequest(request) {
  let pathname;
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    pathname = stripBasePath(decodeURIComponent(url.pathname));
  } catch {
    return null;
  }
  if (pathname === null) return null;

  let filePath = resolve(root, `.${pathname}`);

  if (!isInsideRoot(filePath)) return null;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    if (!acceptsHtmlNavigation(request)) return null;
    filePath = join(root, "index.html");
  }
  return filePath;
}

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function stripBasePath(pathname) {
  if (basePath === "/") return pathname;
  const baseWithoutTrailingSlash = basePath.slice(0, -1);
  if (pathname === baseWithoutTrailingSlash || pathname === basePath) return "/";
  if (!pathname.startsWith(basePath)) return null;
  return `/${pathname.slice(basePath.length)}`;
}

function acceptsHtmlNavigation(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return request.headers["sec-fetch-mode"] === "navigate" || request.headers.accept?.includes("text/html");
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const filePath = candidateForRequest(request);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
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
  server.close(() => {
    process.exitCode = 0;
  });
  server.closeAllConnections();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("error", (error) => {
  console.error(`Unable to serve ${root}: ${error.message}`);
  process.exitCode = 1;
});

server.listen(requestedPort, host, () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : requestedPort;
  console.log(`Serving ${root} at http://${host}:${activePort}${basePath}`);
});
