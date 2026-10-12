// 単体の検査（tests/*.test.mjs）を全部、1つずつ回す（npm run test:unit）。
//
// 以前は package.json に検査のファイルを1つずつ並べていた。並べ忘れた検査は黙って回らない
// ——実際に slot-fit.test.mjs は、ほかの検査の引数として渡されていて、一度も回っていなかった。
// 置いた検査が必ず回るように、ここでフォルダから集める（Node 20 の node --test はファイルの
// パターンを読めないので、自前で集める）。

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

const failed = [];
for (const name of files) {
  const run = spawnSync(process.execPath, [join(here, name)], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (run.status === 0) {
    console.log(`ok ${name}`);
  } else {
    failed.push(name);
    console.log(`not ok ${name}`);
    process.stdout.write(run.stdout);
    process.stderr.write(run.stderr);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} の検査ファイルが通った`);
if (failed.length) {
  console.error(`通らなかった: ${failed.join(", ")}`);
  process.exitCode = 1;
}
