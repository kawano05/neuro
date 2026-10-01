// =====================================================================
// scripts/generate-guide.mjs — 印刷用の説明書 public/guide.html を作る
//
//   node scripts/generate-guide.mjs          … public/guide.html を書き直す
//   node scripts/generate-guide.mjs --check  … 書き直しが要るなら 1 で終わる（書かない）
//
// 中身は設定画面の「はじめての方へ：つかいかた」と同じ src/lib/supporterGuide.js から作る。
// 絵と印刷の体裁は scripts/guide-template.html。設定の名前・並び・雰囲気の説明を直したら、
// これを走らせて public/guide.html も一緒にコミットする（tests/supporter-guide.test.mjs が
// 古いままのファイルを見つける）。
//
// public/ に作ったものを置くのは、開発サーバー・ビルド・iPad のアプリのどれでも同じ1枚の
// HTML として読めるようにするため（Service Worker が先読みし、オフラインでも開ける）。
// =====================================================================

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_LEAD, GUIDE_TITLE, supporterGuideHtml } from "../src/lib/supporterGuide.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATE_PATH = resolve(projectRoot, "scripts/guide-template.html");
export const GUIDE_PATH = resolve(projectRoot, "public/guide.html");

const GENERATED_NOTE =
  "このファイルは scripts/generate-guide.mjs が作る（手で直さない）。文は src/lib/supporterGuide.js、" +
  "絵と印刷の体裁は scripts/guide-template.html。";

/** 印刷用の説明書の HTML（改行は LF）。 */
export async function renderPrintableGuide() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const filled = template
    .replace("{{GENERATED_NOTE}}", GENERATED_NOTE)
    .replaceAll("{{TITLE}}", GUIDE_TITLE)
    .replace("{{LEAD}}", GUIDE_LEAD)
    .replace("{{BODY}}", supporterGuideHtml({ print: true }));
  if (/\{\{[A-Z_]+\}\}/.test(filled)) throw new Error("generate-guide: ひな形の差し込み口が残っている");
  return filled.replace(/\r\n/g, "\n");
}

/** いまの public/guide.html（改行は LF にそろえる。git の改行変換に左右されない）。 */
export async function readCommittedGuide() {
  return (await readFile(GUIDE_PATH, "utf8")).replace(/\r\n/g, "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = await renderPrintableGuide();
  if (process.argv.includes("--check")) {
    const current = await readCommittedGuide();
    if (current !== next) {
      console.error("public/guide.html が古い。node scripts/generate-guide.mjs で作り直す。");
      process.exit(1);
    }
    console.log("public/guide.html is up to date");
  } else {
    await writeFile(GUIDE_PATH, next, "utf8");
    console.log("Generated public/guide.html");
  }
}
