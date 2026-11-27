// =====================================================================
// i18n-todo.mjs — ある言語に、まだ訳していない文を出す
//
//   node scripts/i18n-todo.mjs de          … ドイツ語（src/lib/locales/de.js）に足りない文
//   node scripts/i18n-todo.mjs de --all    … 訳し済みも含めて全部（新しい言語を始めるとき）
//
// 出すのは JSON。strings は「鍵 → 英語の文」、phrases は「英語の文 → 日本語の文（参考）」。
// 訳したら、src/lib/locales/<言語>.js の strings・phrases に入れる。{n} のような穴は そのまま残す
// （語順に合わせて動かしてよい）。{n:trial|trials} は「n が 1 のとき|ほか」の2つを、その言語で書く。
// 足し方の全体は docs/adding-a-language.md。
// =====================================================================

import { LANGUAGES } from "../src/lib/locales/index.js";
import { auditCatalog, translationSource } from "./i18n-source.mjs";

const [code, ...flags] = process.argv.slice(2);
if (!code) {
  console.error("使い方: node scripts/i18n-todo.mjs <言語> [--all]");
  process.exit(1);
}
const source = await translationSource();
const catalog = LANGUAGES.find((language) => language.code === code) ?? {};
const audit = auditCatalog(catalog, source);
const all = flags.includes("--all");
const stringKeys = all ? Object.keys(source.strings) : audit.missingStrings;
const phrases = all ? source.phrases : audit.missingPhrases;

console.log(
  JSON.stringify(
    {
      strings: Object.fromEntries(stringKeys.map((key) => [key, source.strings[key]])),
      phrases: Object.fromEntries(phrases.map((english) => [english, source.japanese.get(english) ?? ""])),
    },
    null,
    2
  )
);
console.error(
  `${code}: 辞書 ${stringKeys.length} 件、文 ${phrases.length} 件` +
    (audit.extraStrings.length + audit.extraPhrases.length
      ? `（もう使っていない訳: 辞書 ${audit.extraStrings.length} 件、文 ${audit.extraPhrases.length} 件）`
      : "")
);
