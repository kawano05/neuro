// =====================================================================
// supporterGuide.js — 支援者向けの説明書の中身（ただ1つ）
//
// 同じ説明を2か所で見せる:
//   - 設定画面の「はじめての方へ：つかいかた」（views/SettingsGuide.svelte）
//   - 印刷して渡す説明書 public/guide.html（scripts/generate-guide.mjs がこのファイルから作る）
// 以前は2か所に手で書いていて、設定画面を「よく使う6項目＋くわしい設定」に作り直したあとも、
// 印刷用だけが消えた4つのタブ（スイッチ／見え方・音／むずかしさ／そくてい）で説明していた。
// 設定の名前と道順（「よく使う設定」→「枠が動く速さ」）は settingsFields.js から、雰囲気の
// 名前と説明は atmosphere.js と i18n の辞書から引くので、画面を直せば説明書も一緒に変わる
// （tests/supporter-guide.test.mjs が、印刷用のファイルが古いままになっていないかを見る）。
//
// 文は支援者向けなので日本語だけ（i18n は通さない）。「小学校高学年が読んで分かる」くらいの言葉。
// 返すのは HTML の文字列。ここに書いた文と、escapeHtml を通した定義の値だけでできている。
// =====================================================================

import { ATMOSPHERE_LEVELS, ATMOSPHERES } from "./atmosphere.js";
import { translate } from "./i18n.js";
import { PLAY_DETAILS, settingPath, settingsField, settingsGroup } from "./settingsFields.js";
import { escapeHtml } from "./utils.js";

export const GUIDE_TITLE = "かんたん説明書";
export const GUIDE_LEAD =
  "ご家族・先生・支援者の方へ。NeuroNode（ニューロノード）のスイッチで「押す」練習を、遊びながらするアプリです。" +
  "はじめは、いつ押しても必ず何かが起きる遊びから始めます。";

const path = (key) => escapeHtml(settingPath(key));
const label = (key) => escapeHtml(settingsField(key).label);
const optionLabel = (key, value) => escapeHtml(settingsField(key).options.find(([option]) => option === value)[1]);
const atmosphereName = (level) => escapeHtml(translate(ATMOSPHERES[level].label, "kanji"));

/** はじめる前に（1回だけ）。 */
function beforeSection() {
  return {
    title: "はじめる前に（1回だけ）",
    html: `
      <ul>
        <li>NeuroNode を iPad に<strong>キーボードとしてつなぎます</strong>。スイッチを押すと、アプリの遊びが進みます。</li>
        <li>iPad の「設定」→「アクセシビリティ」→「スイッチコントロール」は<strong>オフのまま</strong>にします。
          アプリの黄色い枠で選びます（アプリの中の設定を変える必要はありません）。</li>
        <li>音が大事な遊びです。iPad の<strong>音量</strong>を上げ、<strong>消音（マナーモード）</strong>を切っておきます。</li>
      </ul>
      <p class="note">
        iPad 本体のスイッチコントロールで操作したいときだけ、iPad とアプリ（支援者の設定の
        ${path("switchControlMode")}）の<strong>両方をオン</strong>にします。
        iPad だけをオンにすると、黄色い枠（アプリ）と iPad の枠が両方出て、うまく選べません。
      </p>`,
  };
}

/** 画面の見本（印刷用だけ。アプリの画面を簡単にした絵）。 */
const STEP_PICTURES = {
  start: `<div class="screen light" aria-hidden="true"><div class="big-button">はじめる</div></div>`,
  choose: `<div class="screen light" aria-hidden="true"><span class="corner">支援者の設定</span><div class="tiles"><span>①</span><span>②</span><span>③</span><span>④</span><span>⑤</span><span>⑥</span><span>⑦</span><span>⑧</span><span>…</span></div></div>`,
  play: `<div class="screen" aria-hidden="true"><div class="bar"><span>この遊びの設定</span><span>× おわる</span></div><svg class="animal" viewBox="0 0 300 240"><path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path><path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path><circle cx="222" cy="104" r="8" fill="#10222E"></circle></svg></div>`,
  done: `<div class="screen light" aria-hidden="true"><div class="done">できた！</div><div class="buttons"><span>もういちど</span><span>遊びを選ぶ</span></div></div>`,
};

const STEPS = [
  { id: "start", title: "① はじめる", text: "最初の画面は「はじめる」だけです。スイッチを1回押すと、遊びを選ぶ画面になります。" },
  {
    id: "choose",
    title: "② 遊びを選ぶ",
    text:
      "黄色い枠が順番に動きます。遊びたい絵に枠が来たら押します。" +
      "①がいちばんかんたんで、番号が大きいほどむずかしくなります。画面を指でさわっても選べます。",
  },
  {
    id: "play",
    title: "③ 遊ぶ",
    text:
      "押すと絵や音が出ます。右上の「この遊びの設定」で、音や速さ、タイミングの遊びの絵（新しい絵／前の絵）を" +
      "その場で変えられます（支援者がさわるボタンです。変えられる遊びだけ）。やめるときは「おわる」です。",
  },
  { id: "done", title: "④ できた！", text: "終わると「できた！」の画面になります。「もういちど」か「遊びを選ぶ」を選びます。" },
];

function stepsSection(print) {
  const cards = STEPS.map(
    (step) => `
        <div class="step">
          ${print ? STEP_PICTURES[step.id] : ""}
          <p><strong>${step.title}</strong><br />${step.text}</p>
        </div>`
  ).join("");
  return { title: "つかいかた", html: `\n      <div class="steps">${cards}\n      </div>` };
}

const GAMES = [
  ["①", "押すと 出てくる", "押すたびに、真っ暗な画面から生きものが出てきます。いつ押しても大丈夫。", "はじめは ここから"],
  ["②", "ふうせん わり", "押すたびに、ふうせんが1つずつ割れます。5回で全部割れます。", "かんたん"],
  ["③", "ぬりえ", "押すたびに、絵に色がついていきます。5回でできあがり。", "かんたん"],
  ["④", "ボールを 打つ", "転がってくるボールを、押してバットで打ちます。振れば必ず当たり、ぴったりだとホームラン。", "なれたら"],
  ["⑤", "リールを 止める", "回る絵が、目標の絵になったときに押します（タイミングの練習）。", "なれたら"],
  ["⑥", "高い音だけ", "高い音のときだけ押し、低い音では待ちます。", "なれたら"],
  ["⑦", "アームで つかむ", "動くアームが景品の上に来たときに押します。", "チャレンジ"],
  ["⑧", "さかなつり", "「アタリ」の音（れんしゅうでは大きな「！」も）が出たら、すぐ押します。", "チャレンジ"],
];

function gamesSection(print) {
  const list = print
    ? `\n      <table>
        <thead>
          <tr><th>番号</th><th>遊び</th><th>どんな遊び？</th><th>むずかしさ</th></tr>
        </thead>
        <tbody>
${GAMES.map(([no, name, text, level]) => `          <tr><td class="no">${no}</td><td>${name}</td><td>${text}</td><td><span class="badge">${level}</span></td></tr>`).join("\n")}
        </tbody>
      </table>`
    : `\n      <ol class="guide-games">
${GAMES.map(([no, name, text, level]) => `        <li><strong>${no} ${name}</strong>（${level}）${text}</li>`).join("\n")}
      </ol>`;
  return {
    title: "遊びの順番（おすすめ）",
    pageBreak: true,
    html: `${list}
      <p class="note">①〜③は失敗がありません。「押したら何かが起きる」ことが分かったら、④（振れば必ず当たる、タイミングの入り口）へ。そのあと⑤からのタイミングの遊びへ進みます。</p>`,
  };
}

/** 支援者の設定。並び・名前・説明は settingsFields.js から引く（画面と同じもの）。 */
function settingsSection() {
  const common = settingsGroup("common");
  const commonItems = common.fields
    .map((field) => `<li><strong>${escapeHtml(field.label)}</strong> … ${escapeHtml(field.hint)}</li>`)
    .join("\n          ");
  const fieldNames = (groupId) => settingsGroup(groupId).fields.map((field) => escapeHtml(field.label)).join("、");
  const playNames = PLAY_DETAILS.groups.map((id) => escapeHtml(settingsGroup(id).title)).join("、");
  const atmospheres = ATMOSPHERE_LEVELS.map(
    (level) =>
      `<li><strong>${atmosphereName(level)}</strong> … ${escapeHtml(translate(ATMOSPHERES[level].description, "kanji"))}</li>`
  ).join("\n          ");
  return {
    title: "支援者の設定",
    html: `
      <p>
        遊びを選ぶ画面の右上「<strong>支援者の設定</strong>」を、指でさわると開きます（スイッチでは開きません。
        ご本人が誤って開かないようにしてあり、設定の画面では黄色い枠も止まります）。戻るときは「← ホームへ」です。
        変更は自動で保存されます。キーボードでは Tab で移動し、Enter／Space で見出しを開閉します。
      </p>
      <p><strong>「${escapeHtml(common.title)}」</strong>（最初から出ている6つ）</p>
      <ul>
          ${commonItems}
      </ul>
      <p><strong>くわしい設定</strong>（見出しを押すと開きます。いくつでも同時に開けます）</p>
      <ul>
        <li><strong>${escapeHtml(settingsGroup("switch").title)}</strong> … ${fieldNames("switch")}</li>
        <li><strong>${escapeHtml(settingsGroup("senses").title)}</strong> … ${fieldNames("senses")}</li>
        <li><strong>${escapeHtml(PLAY_DETAILS.title)}</strong> … ${playNames}の速さ・回数など（遊びの中の「この遊びの設定」からも変えられます）</li>
        <li><strong>音の素材</strong> … 声と効果音の素材の作者と出典</li>
        <li><strong>${escapeHtml(settingsGroup("research").title)}</strong> … 研究で測るときだけ使います。ふだんは「れんしゅう」のままさわりません。
          「そくてい」の回は、遊びの速さ・回数・手がかりが決まった値に固定されます。押すタイミングの基準をとる手順もここにあります。</li>
      </ul>
      <p class="note">
        くわしい設定には、まとまりごとに「<strong>既定に戻す</strong>」があります。押すと、何を戻したかがすぐ下に出ます。
        灰色で変えられない項目には、その行に理由が出ます（そくていの回は、そくていで使う値も出ます）。
      </p>
      <p><strong>${label("fxLevel")}</strong>（よく使う設定のいちばん上。4つから選びます）</p>
      <ul>
          ${atmospheres}
      </ul>
      <p class="note">
        光や音に敏感な人は「${atmosphereName("subtle")}」か「${atmosphereName("none")}」に。光の点滅は、どの雰囲気でも1秒に3回までです。
        そくていの回は、どの雰囲気を選んでいても、遊びに演出を足しません。
      </p>`,
  };
}

/** こまったとき。道順は settingsFields.js から作る（画面の見出しと名前のまま）。 */
function troubleSection() {
  const items = [
    ["黄色い枠と、iPad の枠が両方出る", "iPad の「スイッチコントロール」をオフにしてください（「はじめる前に」を見てください）。"],
    [
      "枠が動かない",
      `${path("autoScan")}をオンにします。${path("switchControlMode")}がオンのあいだは、アプリの枠は動きません。`,
    ],
    ["枠が速すぎる・遅すぎる", `${path("scanInterval")}で変えます。`],
    [
      "画面を見続けるのが難しい",
      `${path("scanFeedback")}を「${optionLabel("scanFeedback", "speak")}」にすると、枠が動くたびに遊びの名前を読みます（「${optionLabel("scanFeedback", "tick")}」は音だけ）。`,
    ],
    [
      "光や動きがつらそう・興奮しすぎる",
      `${path("fxLevel")}を「${atmosphereName("subtle")}」か「${atmosphereName("none")}」にします。`,
    ],
    ["音が出ない", `iPad の音量と消音（マナーモード）を確かめます。${path("soundEnabled")}もオンにします。`],
    ["声が出ない・小さい", `${path("speechEnabled")}をオンにします。大きさは${path("speechVolume")}で変えます。`],
    [
      "設定が灰色で変えられない",
      `その行に理由が出ています。「そくていの回は固定です」なら、${path("difficultyMode")}を「れんしゅう」にすると変えられます。`,
    ],
    ["変えた設定を元に戻したい", "くわしい設定の、まとまりごとの「既定に戻す」を押します。"],
    [
      "押しても何も起きない",
      "NeuroNode が iPad につながっているか（キーボードとして）を確かめます。画面を指でさわって動くなら、アプリは動いています。",
    ],
  ];
  return {
    title: "こまったとき",
    html: `
      <dl class="qa">
${items.map(([question, answer]) => `        <dt>${question}</dt>\n        <dd>${answer}</dd>`).join("\n")}
      </dl>`,
  };
}

/**
 * 説明書の本文（見出しから「こまったとき」まで）。
 * @param {{print?: boolean}} [options] print … 印刷用（番号つきの見出し・画面の絵・遊びの表）
 */
export function supporterGuideHtml({ print = false } = {}) {
  const sections = [beforeSection(), stepsSection(print), gamesSection(print), settingsSection(), troubleSection()];
  return sections
    .map((section, index) => {
      const heading = print
        ? `<h2><span class="num">${index + 1}</span>${section.title}</h2>`
        : `<h3 class="guide-heading">${section.title}</h3>`;
      const className = print && section.pageBreak ? ` class="page-break"` : "";
      return `<section${className}>\n      ${heading}${section.html}\n  </section>`;
    })
    .join("\n\n  ");
}
