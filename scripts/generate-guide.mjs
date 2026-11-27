// =====================================================================
// scripts/generate-guide.mjs — 印刷用の説明書を、言語ごとに作る（public/guide.html が日本語、
// ほかは public/guide-<言語>.html。言語の一覧は src/lib/locales/index.js）
//
//   node scripts/generate-guide.mjs          … 全部の言語の説明書を書き直す
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
import { LANGUAGES, guideFileName } from "../src/lib/locales/index.js";
import { printableGuideWords, supporterGuideHtml } from "../src/lib/supporterGuide.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATE_PATH = resolve(projectRoot, "scripts/guide-template.html");
export const GUIDE_PATH = resolve(projectRoot, "public/guide.html");
/** 言語ごとの置き場所（点検用の にせの言語には作らない）。 */
export const GUIDE_PATHS = Object.fromEntries(
  LANGUAGES.filter((language) => !language.pseudo).map((language) => [
    language.code,
    resolve(projectRoot, "public", guideFileName(language.code)),
  ])
);

const GENERATED_NOTE =
  "このファイルは scripts/generate-guide.mjs が作る（手で直さない）。文は src/lib/supporterGuide.js、" +
  "絵と印刷の体裁は scripts/guide-template.html。";

/** 印刷用の説明書の HTML（改行は LF）。 */
export async function renderPrintableGuide(lang = "ja") {
  const words = printableGuideWords(lang);
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const filled = template
    .replace("{{GENERATED_NOTE}}", GENERATED_NOTE)
    .replace("{{LANG}}", words.htmlLang)
    .replace("{{TITLE_SUFFIX}}", words.titleSuffix)
    .replaceAll("{{TITLE}}", words.title)
    .replace("{{LEAD}}", words.lead)
    .replace("{{PRINT}}", words.print)
    .replace("{{FOOT}}", words.foot)
    .replace("{{BODY}}", supporterGuideHtml({ print: true, lang }));
  if (/\{\{[A-Z_]+\}\}/.test(filled)) throw new Error("generate-guide: ひな形の差し込み口が残っている");
  return filled.replace(/\r\n/g, "\n");
}

/** いまの public/guide.html（改行は LF にそろえる。git の改行変換に左右されない）。 */
export async function readCommittedGuide(lang = "ja") {
  return (await readFile(GUIDE_PATHS[lang], "utf8")).replace(/\r\n/g, "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [lang, path] of Object.entries(GUIDE_PATHS)) {
    const name = `public/${path.split(/[\\/]/).pop()}`;
    const next = await renderPrintableGuide(lang);
    if (process.argv.includes("--check")) {
      const current = await readCommittedGuide(lang).catch(() => null);
      if (current !== next) {
        console.error(`${name} が古い。node scripts/generate-guide.mjs で作り直す。`);
        process.exit(1);
      }
      console.log(`${name} is up to date`);
    } else {
      await writeFile(path, next, "utf8");
      console.log(`Generated ${name}`);
    }
  }
}
