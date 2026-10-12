// =====================================================================
// partyThemes.js — 遊びごとのお祝いの型（ただ1つの表）
//
// 雰囲気の段（なし・すっきり・にぎやか・おおさわぎ。atmosphere.js）が「どれだけ」出すかを
// 決め、この表が「何を」出すかを決める。以前は、どの遊びでも 押すと 出てくる と同じ
// お祝い（ハートの粒・海の魚の観客・動物のパレード・びんの星・「おおさわぎ！」）が出ていて、
// 「全部同じ演出になっている。それぞれのゲームにあった演出に」と言われた（2026-10-01）。
//
// 舞台（games/partyStage.js）・演出（fx/fxPresets.js）・けっか（games/results.js）は、
// 遊びの名前で分岐せず、この表の欄を読む。絵は art/partyArt.js が欄の名前から描く。
//   particles … 押したとき・おいわいの粒の形と色（粒の形は fx/fxParticles.js）と重力。
//               finaleShapes があれば、最後のおいわいの粒はその形（ぬりえ: できた絵に絵の具を飛ばさない）
//   rain      … おいわいで上から降らせる粒の形
//   item      … キラキラびんにたまるもの（星・ふうせん・絵の具・ボール・絵がら・景品・魚・音符）
//   crowd     … 観客（はじめの遊びのおおさわぎだけ。課題には出さない）
//   parade    … おおさわぎの最後に横切るもの: march（はねながら横へ）/ rise（下から空へ）/ leap（弧を描いて跳ぶ）
//   show      … おおさわぎの最後の見せ場: otter（ラッコが真ん中へ。押すと 出てくる の元の作り）/
//               kusudama（くす玉が割れる）/ frame（できた絵に額縁と金の札）/ cheer（応援団が跳ねる）/ stamp（札だけ）
//   stamp     … 最後の大きな札の文（i18n のキー。声には出さない）
//   hero      … 見せ場が囲む主役（frame の額縁をはめる絵。遊びの画面の要素の選び方）
//   avoid     … 見せ場・札がかぶせてはいけないもの（遊びの言葉・割ったふうせん・打った数など）。
//               はじめの遊びでは、最後も子どものやったことが見えるように、その上下のあいた帯に置く
//
// 黄色（#FFC83D）は走査の枠だけに使うので、どの色の組にも入れない（tests/party.test.mjs）。
// DOM に触れない純粋な表。
// =====================================================================

/** 遊び → お祝いの型。ここに無い遊び（基準をとる回など）は、粒だけ既定の見た目で出す。 */
export const PARTY_THEME_OF = Object.freeze({
  "color-legacy": "pop",
  balloon: "balloon",
  coloring: "coloring",
  baseball: "baseball",
  "slot-l1": "slot",
  "slot-l2": "slot",
  crane: "crane",
  fishing: "fishing",
  "fishing-gonogo": "fishing",
  gonogo: "gonogo",
});

const PARTY = ["#FF8082", "#03AF7A", "#F6AA00", "#4DC4FF", "#D65DB1", "#FF4B00", "#FFFFFF"];

const TABLE = {
  // 押すと 出てくる（海の動物）。おおさわぎの元の作り（docs/party-mode-2026-09-29.md）。
  pop: {
    particles: { shapes: ["sparkle", "star", "star", "heart", "heart"], colors: PARTY, gravity: 170 },
    rain: ["confetti", "confetti", "confetti", "star"],
    item: "star",
    itemColors: ["#F6AA00", "#FF8082", "#03AF7A", "#4DC4FF", "#D65DB1", "#FF4B00", "#FFFFFF"],
    crowd: "fish",
    parade: "march",
    show: "otter",
    stamp: "party.bigParty",
  },
  // ふうせん わり（空）。割れたら紙吹雪と紙テープ。最後は くす玉が割れて、ふうせんが空へ。
  balloon: {
    particles: { shapes: ["confetti", "confetti", "ribbon", "ribbon", "balloon"], colors: ["#FF4B00", "#F6AA00", "#03AF7A", "#005AFF", "#990099", "#FFFFFF"], gravity: 260 },
    rain: ["confetti", "confetti", "ribbon"],
    item: "balloon",
    itemColors: ["#FF4B00", "#F6AA00", "#03AF7A", "#005AFF", "#990099"],
    crowd: "bird",
    parade: "rise",
    show: "kusudama",
    stamp: "party.stamp.balloon",
    avoid: ".balloon-word, .balloon.is-popped .balloon-mark",
  },
  // ぬりえ（アトリエ）。絵の具のしぶき。最後は できた絵に額縁と金の札。
  coloring: {
    // 押したときの粒は少なく速く、絵の外へ飛ばす（塗っている絵が主役。粒で絵を隠さない）。
    particles: {
      shapes: ["drop", "drop", "splat", "splat", "sparkle"],
      finaleShapes: ["sparkle", "star", "star", "sparkle"],
      colors: ["#FF4B00", "#F6AA00", "#03AF7A", "#4DC4FF", "#005AFF", "#D65DB1"],
      gravity: 640,
      pressCount: 8,
      pressSpeed: [700, 1150],
    },
    // 降らせるのは きらきらと紙吹雪（絵の具のしずくを降らせると、できた絵を汚したように見えた）。
    rain: ["sparkle", "confetti", "confetti"],
    item: "paint",
    itemColors: ["#FF4B00", "#F6AA00", "#03AF7A", "#4DC4FF", "#005AFF", "#D65DB1"],
    crowd: "crayon",
    parade: "march",
    show: "frame",
    stamp: "party.stamp.coloring",
    hero: ".coloring-card",
    avoid: ".coloring-word",
  },
  // ボールを打つ（スタジアム）。火花と紙テープ。最後は応援団が跳ねて、ジェット風船が上がる。
  baseball: {
    particles: { shapes: ["streak", "streak", "confetti", "ribbon", "star"], colors: ["#FFFFFF", "#FF4B00", "#005AFF", "#F6AA00", "#03AF7A"], gravity: 420 },
    rain: ["confetti", "ribbon", "confetti"],
    item: "ball",
    itemColors: ["#FFFFFF"],
    crowd: "fan",
    parade: "rise",
    show: "cheer",
    stamp: "party.stamp.baseball",
    avoid: ".bb-word, .bb-slots",
  },
  // リール（遊園地）。止めた絵がらが窓から飛び出して、行進する。
  slot: {
    particles: { shapes: ["star", "star", "sparkle", "confetti"], colors: ["#FF4B00", "#03AF7A", "#F6AA00", "#4DC4FF", "#005AFF", "#D65DB1"], gravity: 220 },
    rain: ["confetti", "star", "confetti"],
    item: "symbol",
    itemColors: ["#FF4B00"],
    crowd: null,
    parade: "march",
    show: "stamp",
    stamp: "party.stamp.slot",
  },
  // アーム（ゲームセンター）。取れた景品がきらきら。最後は景品がはねて行進する。
  crane: {
    particles: { shapes: ["star", "sparkle", "heart", "confetti"], colors: ["#FF8082", "#F6AA00", "#D08A4E", "#4DC4FF", "#FFFFFF"], gravity: 240 },
    rain: ["confetti", "star", "heart"],
    item: "prize",
    itemColors: ["#D08A4E"],
    crowd: null,
    parade: "march",
    show: "stamp",
    stamp: "party.stamp.crane",
  },
  // さかなつり（海）。しぶきと泡。最後は魚が弧を描いて跳ぶ。
  fishing: {
    particles: { shapes: ["drop", "drop", "bubble", "fish"], colors: ["#4DC4FF", "#1FA2E0", "#D8F3FF", "#FFFFFF", "#FF8082"], gravity: 520 },
    rain: ["drop", "bubble", "confetti"],
    item: "fish",
    itemColors: ["#FF8082", "#F6AA00", "#4DC4FF", "#D65DB1", "#03AF7A"],
    crowd: null,
    parade: "leap",
    show: "stamp",
    stamp: "party.stamp.fishing",
  },
  // 高い音だけ（舞台）。音符が舞う。最後は音符が行進して、拍手の札。
  gonogo: {
    particles: { shapes: ["note", "note", "sparkle", "star"], colors: ["#990099", "#D65DB1", "#4DC4FF", "#FF8082", "#005AFF", "#FFFFFF"], gravity: 120 },
    rain: ["note", "confetti", "note"],
    item: "note",
    itemColors: ["#990099", "#D65DB1", "#005AFF", "#FF4B00", "#03AF7A"],
    crowd: null,
    parade: "march",
    show: "stamp",
    stamp: "party.stamp.gonogo",
  },
};

function freezeDeep(value) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") freezeDeep(child);
  });
  return Object.freeze(value);
}

/** 型の表（id を足して凍らせる）。 */
export const PARTY_THEMES = freezeDeep(Object.fromEntries(Object.entries(TABLE).map(([id, row]) => [id, { id, ...row }])));

/**
 * 遊びのお祝いの型。遊びの id（"crane"）でも型の名前（"pop"）でも引ける。
 * 表に無ければ null（呼ぶ側は既定の見た目のまま）。
 */
export function partyThemeFor(gameIdOrTheme) {
  if (!gameIdOrTheme) return null;
  return PARTY_THEMES[PARTY_THEME_OF[gameIdOrTheme] ?? gameIdOrTheme] ?? null;
}
