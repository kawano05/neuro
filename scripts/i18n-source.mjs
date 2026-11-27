// =====================================================================
// i18n-source.mjs — ソースに書いてある {ja, en} の組を全部集める
//
// 支援者の世界の文は、使う場所に {ja, en} の組で書いてある（src/lib/supporterText.js の say）。
// 3つ目からの言語は、その英語の文を鍵にして訳を引く（src/lib/locales/ の phrases）。
// だから「いま訳すべき英語の文はどれか」は、ソースを読まないと分からない。ここで集める。
//
// 使う所:
//   - tests/locales.test.mjs … どの言語にも訳の抜けが無いことを確かめる
//   - scripts/i18n-todo.mjs  … 抜けている訳を、訳を書き込む形で出す
//
// 字面（正規表現）でなく構文木で読む。組は入れ子の中にも、Svelte の {…} の中にもあり、
// 英語の文に " や , が入るので、字面では取りこぼす。
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJs } from "acorn";
import { parse as parseSvelte } from "svelte/compiler";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "locales" ? [] : sourceFiles(path);
    return /\.(js|svelte)$/.test(entry.name) ? [path] : [];
  });
}

/** 構文木を、形を問わず全部たどる（Svelte の木は ESTree の節を中に抱えている）。 */
function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, seen);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const value of Object.values(node)) walk(value, visit, seen);
}

const keyName = (property) =>
  property?.type === "Property" && !property.computed ? (property.key.name ?? property.key.value) : null;

/** 文字列の節なら その文字列（"a" + "b" の つなぎも）。式を挟んだ `…${x}…` や、条件式などは null。 */
function staticText(node) {
  if (node?.type === "BinaryExpression" && node.operator === "+") {
    const left = staticText(node.left);
    const right = staticText(node.right);
    return left === null || right === null ? null : left + right;
  }
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function lineOf(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

/**
 * @returns {{
 *   pairs: Array<{en: string, ja: string|null, file: string, line: number}>,
 *   dynamic: Array<{file: string, line: number, text: string}>
 * }}
 * pairs は、英語が決まった文字列になっている組。dynamic は、英語が式で組み立ててある組
 * （訳を鍵で引けない。{name} の穴あきの文にして、値は say の3つ目で渡す）。
 */
export function collectPairs(dir = join(root, "src")) {
  const pairs = [];
  const dynamic = [];
  for (const path of sourceFiles(dir)) {
    const source = readFileSync(path, "utf8");
    const file = relative(root, path).replaceAll("\\", "/");
    const tree = path.endsWith(".svelte")
      ? parseSvelte(source, { modern: true })
      : parseJs(source, { ecmaVersion: "latest", sourceType: "module" });
    walk(tree, (node) => {
      if (node.type !== "ObjectExpression") return;
      // 利用者の世界の辞書から作った組（key つき）は、辞書の訳を引くので、ここでは数えない。
      if (node.properties.some((property) => keyName(property) === "key")) return;
      const ja = node.properties.find((property) => keyName(property) === "ja");
      const en = node.properties.find((property) => keyName(property) === "en");
      if (!ja || !en) return;
      // 言語ごとの表（声の名前の並びなど）は、文の組ではない。
      if (["ArrayExpression", "ObjectExpression"].includes(en.value.type)) return;
      const line = lineOf(source, node.start);
      const text = staticText(en.value);
      if (text === null) dynamic.push({ file, line, text: source.slice(en.value.start, en.value.end) });
      else pairs.push({ en: text, ja: staticText(ja.value), file, line });
    });
  }
  return { pairs, dynamic };
}

/** 訳すべき英語の文（重なりを除いた並び）。 */
export function sourcePhrases(dir) {
  return [...new Set(collectPairs(dir).pairs.map((pair) => pair.en))];
}

/** 文の中の穴の名前（{n}・{n:trial|trials} の n）。訳が穴を落としていないかを比べるのに使う。 */
export function placeholderNames(text) {
  return [...new Set([...String(text).matchAll(/\{(\w+)(?::[^{}]*)?\}/g)].map((match) => match[1]))].sort();
}

/**
 * 3つ目からの言語が訳すもの全部。
 *   strings … 利用者の世界の辞書（鍵 → 英語の文）
 *   phrases … 支援者の世界と、学ぶ・伝える・クレジットの英語の文
 */
export async function translationSource() {
  const { allStringKeys, entryFor } = await import("../src/lib/i18n.js");
  const { learnPhrases } = await import("../src/lib/learnText.js");
  const { creditPhrases } = await import("../src/lib/soundCredits.js");
  const { pairs, dynamic } = collectPairs();
  const japanese = new Map(pairs.map((pair) => [pair.en, pair.ja]));
  return {
    strings: Object.fromEntries(allStringKeys().map((key) => [key, entryFor(key).en])),
    phrases: [...new Set([...pairs.map((pair) => pair.en), ...learnPhrases(), ...creditPhrases()])].filter(Boolean),
    japanese,
    dynamic,
  };
}

/** その言語のファイルに足りないもの・余っているもの・穴の食い違い。 */
export function auditCatalog(catalog, source) {
  const strings = catalog.strings ?? {};
  const phrases = catalog.phrases ?? {};
  const mismatched = (english, translated) =>
    JSON.stringify(placeholderNames(english)) !== JSON.stringify(placeholderNames(translated));
  return {
    // 英語が空の鍵（その言語では何も出さない所）は、訳も空でよい。
    missingStrings: Object.keys(source.strings).filter((key) => strings[key] == null || (strings[key] === "" && source.strings[key] !== "")),
    extraStrings: Object.keys(strings).filter((key) => !(key in source.strings)),
    missingPhrases: source.phrases.filter((english) => !phrases[english]),
    extraPhrases: Object.keys(phrases).filter((english) => !source.phrases.includes(english)),
    placeholderMismatch: [
      ...Object.keys(source.strings).filter((key) => strings[key] && mismatched(source.strings[key], strings[key])),
      ...source.phrases.filter((english) => phrases[english] && mismatched(english, phrases[english])),
    ],
  };
}
