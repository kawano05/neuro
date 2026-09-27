// =====================================================================
// games/coloring.js — はじめの遊び「ぬりえ」
//
// 白黒の線の絵に、押すたびに色が1か所ずつついていく。5回で絵ができあがる。
// 失敗は無い——いつ押しても、押せば必ず次の場所に色がつく。時間制限も無い。
//
// 打ち合わせで出た例（docs/design-renewal-2026-09-25.md §1.4）:
// 「塗り絵……やったことによって絵が現れてくる。達成感が得られるものが受ける」。
// 最後のひと押しで背景の丸に色がつき、絵がいちばん大きく変わるようにしてある
// （できあがった、が分かる瞬間を最後に置く）。
//
// 絵は「おすと でてくる」の動物を使い回す（art/hakkiriArt.js）。回ごとに
// 次の動物へ替わる。共通の約束は beginnerKit.js。測定の課題ではない。
// =====================================================================

import { POP_ANIMALS } from "../art/hakkiriArt.js";
import { BEGINNER_TARGET_PRESSES, createBeginnerFlow, playPrefsFor } from "./beginnerKit.js";

const GAME_ID = "coloring";

// 読み上げは押した音が終わってから。
export const COLORING_TTS_DELAY_MS = 260;
// できあがった絵を見せてから結果へ。
export const COLORING_FINISH_DELAY_MS = 1700;

// 回ごとに次の動物へ（同じ絵ばかりにならないように）。
let nextPicture = 0;

/**
 * 動物ごとの「ぬる場所」（絵の部品の番号。art/hakkiriArt.js の body の並び順）。
 *
 * 部品の並び順で機械的に分けると、イルカの4回目が「口の線」だけになり、黒い線が
 * 紺の線に変わるだけで押しても何も起きないように見えた（2026-09-27）。どの回も
 * はっきり色が変わるよう、手で組んである: 大きい体 → ひれ・足 → おなか・模様 →
 * 顔（目が入って「生きる」のを最後に）。最後の5回目は背景（coloringMarkup）。
 */
export const COLORING_GROUPS = {
  dolphin: [[0], [1, 3], [2], [4, 5, 6]],
  turtle: [[6, 7, 8], [0, 1, 2, 3, 4], [5], [9, 10, 11]],
  octopus: [[5], [0, 1, 2, 3, 4], [10, 11, 12], [6, 7, 8, 9]],
  crab: [[7], [2, 3, 4, 5], [0, 1, 6], [8, 9, 10, 11, 12]],
  whale: [[2], [0, 1], [3, 4], [5, 6, 7]],
};

/**
 * 絵を、押す回数ぶんの「ぬる場所」に分ける。
 *
 * 動物の部品（体・ひれ・目……）を前から順に 0〜(回数-2) へ振り分け、
 * 最後の1回には背景の丸ときらきらを取っておく。線だけの部品（口など）は
 * 塗りの無い線として扱う（白で塗りつぶすと形が変わる）。
 *
 * @param {{viewBox: string, body: string}} art 動物の絵（viewBox 300x240）
 * @param {number} [parts] 押す回数
 * @returns {string} SVG の中身（class="cl-part" と data-part を付けたもの）
 */
export function coloringMarkup(art, parts = BEGINNER_TARGET_PRESSES) {
  const tags = art.body.match(/<(path|circle|ellipse|rect)\b[^>]*>(?:<\/\1>)?/g) || [];
  const lastPart = parts - 1;
  // 手で組んだ場所があればそれを使う。無い絵（あとから足した絵）は並び順で分ける。
  const groups = art.id && parts === BEGINNER_TARGET_PRESSES ? COLORING_GROUPS[art.id] : null;
  const groupOf = (index) => {
    if (groups) {
      const found = groups.findIndex((members) => members.includes(index));
      if (found >= 0) return found;
    }
    return Math.min(lastPart - 1, Math.floor((index * lastPart) / tags.length));
  };
  const tag = (markup, part) => {
    const line = /fill="none"/.test(markup);
    return markup.replace(/^<(\w+)/, `<$1 class="cl-part${line ? " cl-line" : ""}" data-part="${part}"`);
  };
  const backdrop = [
    '<circle cx="150" cy="122" r="112" fill="#D9F3FF"></circle>',
    '<path d="M38 40 L 43 54 L 57 58 L 43 62 L 38 76 L 33 62 L 19 58 L 33 54 Z" fill="#FFC83D"></path>',
    '<path d="M262 26 L 266 37 L 277 40 L 266 43 L 262 54 L 258 43 L 247 40 L 258 37 Z" fill="#FFC83D"></path>',
  ].map((markup) => tag(markup, lastPart));
  const body = tags.map((markup, index) => tag(markup, groupOf(index)));
  return [...backdrop.slice(0, 1), ...body, ...backdrop.slice(1)].join("");
}

export function createColoringGame(ctx) {
  const { settings, t, tHtml, fx } = ctx;

  let stageEl = null;
  let picture = POP_ANIMALS[0];

  // 押す → 音 → 進み → 5回目 → フィナーレ → けっか（beginnerKit.js の共通の流れ）。
  const flow = createBeginnerFlow(ctx, {
    gameId: GAME_ID,
    ttsDelayMs: COLORING_TTS_DELAY_MS,
    finishDelayMs: COLORING_FINISH_DELAY_MS,
    logLabel: "ぬりえ",
    onPress(pressIndex) {
      update();
      // ② 起きたこと: 色がついた場所から、その色のしぶき。
      const parts = [...(stageEl?.querySelectorAll(`.cl-part[data-part="${pressIndex}"]`) || [])];
      const painted = parts.find((part) => !part.classList.contains("cl-line"));
      fx?.paintSplash(stageEl?.querySelector(".coloring-card"), {
        k: pressIndex,
        color: painted?.getAttribute("fill") || "#FFC83D",
        parts,
      });
      fx?.motion.stamp(stageEl?.querySelector(".coloring-word"), { delayMs: 90 });
      return { creature: picture.id };
    },
    progressSpeech: (remaining) => t("coloring.voice.progress", { n: remaining }),
    finishSpeech: () => t("coloring.voice.finish", { name: t(`animal.${picture.id}`) }),
    finishSummary: () => ({ presses: BEGINNER_TARGET_PRESSES, picture: picture.id }),
    // ⑤ フィナーレ: できあがった絵が跳ねて、星の輪と紙吹雪。
    onFinale: () => fx?.finale(stageEl, { hero: stageEl?.querySelector(".coloring-card") }),
  });

  function wordKey() {
    const colored = flow.count();
    if (colored === 0) return "color.prompt";
    return `coloring.word.${Math.min(colored - 1, BEGINNER_TARGET_PRESSES - 1)}`;
  }

  /** 絵を置く（開いたときに1回だけ。色は update が付ける）。 */
  function build() {
    if (!stageEl) return;
    stageEl.innerHTML = `
      <span class="coloring-stage" aria-hidden="true">
        <span class="coloring-card">
          <svg class="coloring-art" viewBox="${picture.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${coloringMarkup(picture)}</svg>
        </span>
        <span class="coloring-word"></span>
      </span>
    `;
    update();
  }

  function update() {
    if (!stageEl) return;
    const colored = flow.count();
    stageEl.classList.toggle("is-light", playPrefsFor(settings, GAME_ID).background === "light");
    stageEl.querySelectorAll(".cl-part").forEach((part) => {
      part.classList.toggle("is-colored", Number(part.dataset.part) < colored);
    });
    stageEl.classList.toggle("is-complete", colored >= BEGINNER_TARGET_PRESSES);
    const word = stageEl.querySelector(".coloring-word");
    if (word) word.innerHTML = tHtml(wordKey());
  }

  /** スイッチ入力1回ぶん。いつ押しても次の場所に色がつく（失敗が無い）。 */
  function handleInput() {
    flow.handleInput();
  }

  return {
    mount(el) {
      stageEl = el;
      flow.reset();
      picture = POP_ANIMALS[nextPicture % POP_ANIMALS.length];
      nextPicture += 1;
      stageEl.classList.add("module-coloring");
      build();
    },
    handleInput,
    /** この遊びの設定を変えたあと。ぬった場所はそのまま。 */
    applySettings() {
      update();
    },
    destroy() {
      flow.destroy();
      if (stageEl) {
        stageEl.classList.remove("module-coloring", "is-light", "is-complete");
        stageEl.innerHTML = "";
      }
      stageEl = null;
    },
  };
}
