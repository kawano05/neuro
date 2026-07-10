import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(projectRoot, process.argv[2] || "dist");
const templatePath = resolve(projectRoot, "public/sw.js");
const outputPath = resolve(distRoot, "sw.js");

const requiredAssets = ["index.html", "manifest.webmanifest", "icon.svg"];
const assetPaths = (await listFiles(distRoot))
  .map((filePath) => toPosixPath(relative(distRoot, filePath)))
  .filter((assetPath) => assetPath !== "sw.js")
  .sort();

for (const requiredAsset of requiredAssets) {
  if (!assetPaths.includes(requiredAsset)) {
    throw new Error(`Cannot generate Service Worker: ${requiredAsset} is missing from ${distRoot}`);
  }
}

if (!assetPaths.some((assetPath) => /^assets\/.+\.[a-z0-9]+$/i.test(assetPath))) {
  throw new Error(`Cannot generate Service Worker: no built assets were found in ${distRoot}/assets`);
}

const versionHash = createHash("sha256");
for (const assetPath of assetPaths) {
  versionHash.update(assetPath);
  versionHash.update("\0");
  versionHash.update(await readFile(resolve(distRoot, assetPath)));
  versionHash.update("\0");
}
const cacheVersion = versionHash.digest("hex").slice(0, 16);

const template = await readFile(templatePath, "utf8");
const generated = template
  .replace('"__CACHE_VERSION__"', JSON.stringify(cacheVersion))
  .replace("/* __PRECACHE_ASSETS__ */ []", JSON.stringify(assetPaths, null, 2));

if (generated.includes("__CACHE_VERSION__") || generated.includes("__PRECACHE_ASSETS__")) {
  throw new Error("Cannot generate Service Worker: template placeholders were not replaced");
}

await writeFile(outputPath, generated, "utf8");
console.log(`Generated ${toPosixPath(relative(projectRoot, outputPath))} with ${assetPaths.length} precached assets (${cacheVersion})`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

function toPosixPath(filePath) {
  return filePath.split(sep).join("/");
}
