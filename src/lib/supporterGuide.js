// =====================================================================
// supporterGuide.js — 支援者向けの説明書の中身（ただ1つ）
//
// 同じ説明を2か所で見せる:
//   - 設定画面の「はじめての方へ：つかいかた」（views/SettingsGuide.svelte）
//   - 印刷して渡す説明書 public/guide.html（scripts/generate-guide.mjs がこのファイルから作る）
// 以前は2か所に手で書いていて、設定画面を「よく使う6項目＋くわしい設定」に作り直したあとも、
// 印刷用だけが消えた4つのタブ（スイッチ／見え方・音／むずかしさ／そくてい）で説明していた。
// 設定の名前と道順（「よく使う設定」→「枠が動く速さ」）は settingsFields.js から、遊びと雰囲気の
// 名前と説明は i18n の辞書から引くので、画面を直せば説明書も一緒に変わる
// （tests/supporter-guide.test.mjs が、印刷用のファイルが古いままになっていないかを見る）。
//
// 文は支援者向け。設定画面では支援者の画面の言語（日本語か英語。supporterText.js）で出し、
// 印刷用は日本語。「小学校高学年が読んで分かる」くらいの言葉。
// 返すのは HTML の文字列。ここに書いた文と、escapeHtml を通した定義の値だけでできている。
// =====================================================================

import { ATMOSPHERE_LEVELS, ATMOSPHERES } from "./atmosphere.js";
import { translate } from "./i18n.js";
import { PLAY_DETAILS, settingPath, settingsField, settingsGroup } from "./settingsFields.js";
import { say } from "./supporterText.js";
import { escapeHtml } from "./utils.js";

export const GUIDE_TITLE = "かんたん説明書";
export const GUIDE_LEAD =
  "ご家族・先生・支援者の方へ。NeuroNode（ニューロノード）のスイッチで「押す」練習を、遊びながらするアプリです。" +
  "はじめは、いつ押しても必ず何かが起きる遊びから始めます。";

/** この言語の文の道具（説明書を1回作るあいだ使う）。 */
function wordsFor(lang) {
  const en = lang === "en";
  const pick = (ja, enText) => (en ? enText : ja);
  const dict = (key) => translate(key, en ? "en" : "kanji");
  return {
    en,
    pick,
    dict,
    path: (key) => escapeHtml(settingPath(key, lang)),
    label: (key) => escapeHtml(say(settingsField(key).label, lang)),
    optionLabel: (key, value) => escapeHtml(say(settingsField(key).options.find(([option]) => option === value)[1], lang)),
    atmosphereName: (level) => escapeHtml(dict(ATMOSPHERES[level].label)),
    // 引用の かっこ（日本語は「」、英語は “”）。
    quote: (text) => (en ? `“${text}”` : `「${text}」`),
  };
}

/** はじめる前に（1回だけ）。 */
function beforeSection(w) {
  return {
    title: w.pick("はじめる前に（1回だけ）", "Before you start (once)"),
    html: w.en
      ? `
      <ul>
        <li><strong>Connect NeuroNode to the iPad as a keyboard</strong>. Pressing the switch moves the games forward.</li>
        <li>Leave the iPad's Settings → Accessibility → Switch Control <strong>off</strong>.
          Choices are made with the app's yellow highlight (nothing needs to change inside the app).</li>
        <li>Sound matters in these games. Turn the iPad's <strong>volume</strong> up and turn <strong>silent mode</strong> off.</li>
      </ul>
      <p class="note">
        Only if you want to use the iPad's own Switch Control, turn on <strong>both</strong> the iPad's setting and the app's
        ${w.path("switchControlMode")} in the supporter settings.
        If only the iPad's setting is on, the yellow highlight (app) and the iPad's highlight both appear and choosing becomes hard.
      </p>`
      : `
      <ul>
        <li>NeuroNode を iPad に<strong>キーボードとしてつなぎます</strong>。スイッチを押すと、アプリの遊びが進みます。</li>
        <li>iPad の「設定」→「アクセシビリティ」→「スイッチコントロール」は<strong>オフのまま</strong>にします。
          アプリの黄色い枠で選びます（アプリの中の設定を変える必要はありません）。</li>
        <li>音が大事な遊びです。iPad の<strong>音量</strong>を上げ、<strong>消音（マナーモード）</strong>を切っておきます。</li>
      </ul>
      <p class="note">
        iPad 本体のスイッチコントロールで操作したいときだけ、iPad とアプリ（支援者の設定の
        ${w.path("switchControlMode")}）の<strong>両方をオン</strong>にします。
        iPad だけをオンにすると、黄色い枠（アプリ）と iPad の枠が両方出て、うまく選べません。
      </p>`,
  };
}

/** 画面の見本（印刷用だけ。アプリの画面を簡単にした絵）。印刷用は日本語。 */
const STEP_PICTURES = {
  start: `<div class="screen light" aria-hidden="true"><div class="big-button">はじめる</div></div>`,
  choose: `<div class="screen light" aria-hidden="true"><span class="corner">支援者の設定</span><div class="tiles"><span>①</span><span>②</span><span>③</span><span>④</span><span>⑤</span><span>⑥</span><span>⑦</span><span>⑧</span><span>…</span></div></div>`,
  play: `<div class="screen" aria-hidden="true"><div class="bar"><span>この遊びの設定</span><span>× おわる</span></div><svg class="animal" viewBox="0 0 300 240"><path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path><path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path><circle cx="222" cy="104" r="8" fill="#10222E"></circle></svg></div>`,
  done: `<div class="screen light" aria-hidden="true"><div class="done">できた！</div><div class="buttons"><span>もういちど</span><span>遊びを選ぶ</span></div></div>`,
};

function steps(w) {
  return [
    {
      id: "start",
      title: w.pick("① はじめる", "① Start"),
      text: w.pick(
        "最初の画面は「はじめる」だけです。スイッチを1回押すと、遊びを選ぶ画面になります。",
        `The first screen only has ${w.quote(w.dict("start.begin"))}. Press the switch once to reach the screen for choosing a game.`
      ),
    },
    {
      id: "choose",
      title: w.pick("② 遊びを選ぶ", "② Choose a game"),
      text: w.pick(
        "黄色い枠が順番に動きます。遊びたい絵に枠が来たら押します。" +
          "①がいちばんかんたんで、番号が大きいほどむずかしくなります。画面を指でさわっても選べます。",
        "The yellow highlight moves from item to item. Press when it reaches the game you want. " +
          "① is the easiest, and higher numbers are harder. You can also choose by touching the screen."
      ),
    },
    {
      id: "play",
      title: w.pick("③ 遊ぶ", "③ Play"),
      text: w.pick(
        "押すと絵や音が出ます。右上の「この遊びの設定」で、音や速さ、タイミングの遊びの「絵の かんじ」（えほんみたい／シンプル）を" +
          "その場で変えられます（支援者がさわるボタンです。変えられる遊びだけ）。やめるときは「おわる」です。",
        `Pressing brings out pictures and sounds. With ${w.quote(w.dict("game.settings"))} at the top right you can change the sounds, ` +
          "the speed, and the picture style of the timing games (Picture book / Simple) on the spot " +
          `(a button for supporters, only in games that have settings). To stop, use ${w.quote(w.dict("game.exit"))}.`
      ),
    },
    {
      id: "done",
      title: w.pick("④ できた！", "④ Done!"),
      text: w.pick(
        "終わると「できた！」の画面になります。「もういちど」か「遊びを選ぶ」を選びます。",
        `At the end, the “Done!” screen appears. Choose ${w.quote(w.dict("result.retry"))} or ${w.quote(w.dict("result.home"))}.`
      ),
    },
  ];
}

function stepsSection(w, print) {
  const cards = steps(w)
    .map(
      (step) => `
        <div class="step">
          ${print ? STEP_PICTURES[step.id] : ""}
          <p><strong>${step.title}</strong><br />${step.text}</p>
        </div>`
    )
    .join("");
  return { title: w.pick("つかいかた", "How to use"), html: `\n      <div class="steps">${cards}\n      </div>` };
}

/** 遊びの順番。名前とむずかしさの札は、ホームと同じ辞書の文。 */
function games(w) {
  const row = (no, titleKey, levelKey, ja, en) => [no, escapeHtml(w.dict(titleKey)), w.pick(ja, en), escapeHtml(w.dict(levelKey))];
  return [
    row("①", "tile.color-legacy.title", "level.first", "押すたびに、真っ暗な画面から生きものが出てきます。いつ押しても大丈夫。", "Each press brings an animal out of the dark screen. Pressing at any time is fine."),
    row("②", "tile.balloon.title", "level.easy", "押すたびに、ふうせんが1つずつ割れます。5回で全部割れます。", "Each press pops one balloon. Five presses pop them all."),
    row("③", "tile.coloring.title", "level.easy", "押すたびに、絵に色がついていきます。5回でできあがり。", "Each press adds colour to the picture. Five presses finish it."),
    row("④", "tile.baseball.title", "level.used", "転がってくるボールを、押してバットで打ちます。振れば必ず当たり、ぴったりだとホームラン。", "Press to swing the bat at the rolling ball. Every swing hits, and perfect timing is a home run."),
    row("⑤", "tile.slot-corner.title", "level.used", "くるくる回る絵が、目標の絵になったときに押します（タイミングの練習）。", "Press when the spinning picture matches the target picture (timing practice)."),
    row("⑥", "tile.gonogo.title", "level.used", "高い音のときだけ押し、低い音では待ちます。", "Press only on high notes and wait on low notes."),
    row("⑦", "tile.crane-corner.title", "level.challenge", "動くアームが ぬいぐるみの上に来たときに押します。", "Press when the moving claw is above a plush toy."),
    row("⑧", "tile.fishing-corner.title", "level.challenge", "「アタリ」の音（れんしゅうでは大きな「！」も）が出たら、すぐ押します。", "Press as soon as the bite sound plays (in practice, a big “!” also appears)."),
  ];
}

function gamesSection(w, print) {
  const list = print
    ? `\n      <table>
        <thead>
          <tr><th>番号</th><th>遊び</th><th>どんな遊び？</th><th>むずかしさ</th></tr>
        </thead>
        <tbody>
${games(w).map(([no, name, text, level]) => `          <tr><td class="no">${no}</td><td>${name}</td><td>${text}</td><td><span class="badge">${level}</span></td></tr>`).join("\n")}
        </tbody>
      </table>`
    : `\n      <ol class="guide-games">
${games(w).map(([no, name, text, level]) => `        <li><strong>${no} ${name}</strong>${w.en ? ` (${level}) ` : `（${level}）`}${text}</li>`).join("\n")}
      </ol>`;
  return {
    title: w.pick("遊びの順番（おすすめ）", "Suggested order of the games"),
    pageBreak: true,
    html: `${list}
      <p class="note">${w.pick(
        "①〜③は失敗がありません。「押したら何かが起きる」ことが分かったら、④（振れば必ず当たる、タイミングの入り口）へ。そのあと⑤からのタイミングの遊びへ進みます。",
        "There is no failing in ① to ③. Once “pressing makes something happen” is understood, move on to ④ (every swing hits; the first step into timing), and then to the timing games from ⑤."
      )}</p>`,
  };
}

/** 支援者の設定。並び・名前・説明は settingsFields.js から引く（画面と同じもの）。 */
function settingsSection(w, lang) {
  const common = settingsGroup("common");
  const commonItems = common.fields
    .map((field) => `<li><strong>${escapeHtml(say(field.label, lang))}</strong> … ${escapeHtml(say(field.hint, lang))}</li>`)
    .join("\n          ");
  const fieldNames = (groupId) => settingsGroup(groupId).fields.map((field) => escapeHtml(say(field.label, lang))).join(w.pick("、", ", "));
  const playNames = PLAY_DETAILS.groups.map((id) => escapeHtml(say(settingsGroup(id).title, lang))).join(w.pick("、", ", "));
  const atmospheres = ATMOSPHERE_LEVELS.map(
    (level) => `<li><strong>${w.atmosphereName(level)}</strong> … ${escapeHtml(w.dict(ATMOSPHERES[level].description))}</li>`
  ).join("\n          ");
  const count = common.fields.length;
  if (w.en) {
    return {
      title: "Supporter settings",
      html: `
      <p>
        Open it by touching “<strong>Supporter settings</strong>” at the top right of the game-choosing screen (it does not open with the switch,
        so the player cannot open it by mistake, and the yellow highlight stops on the settings screen). To go back, use “← Home”.
        Changes are saved automatically. With a keyboard, move with Tab and open or close headings with Enter / Space.
      </p>
      <p><strong>“${escapeHtml(say(common.title, lang))}”</strong> (the ${count} shown from the start)</p>
      <ul>
          ${commonItems}
      </ul>
      <p><strong>Detailed settings</strong> (tap a heading to open it; any number can be open at once)</p>
      <ul>
        <li><strong>${escapeHtml(say(settingsGroup("switch").title, lang))}</strong> … ${fieldNames("switch")}</li>
        <li><strong>${escapeHtml(say(settingsGroup("senses").title, lang))}</strong> … ${fieldNames("senses")}</li>
        <li><strong>${escapeHtml(say(PLAY_DETAILS.title, lang))}</strong> … speed, rounds and more for ${playNames} (also changeable from “${escapeHtml(w.dict("game.settings"))}” during play)</li>
        <li><strong>Sound credits</strong> … authors and sources of the voice and sound materials</li>
        <li><strong>${escapeHtml(say(settingsGroup("research").title, lang))}</strong> … only for research measurements. Normally leave it on “Practice”.
          In measured runs, the speed, rounds and cues of the games are fixed. The press timing baseline is also here.</li>
      </ul>
      <p class="note">
        Each group of detailed settings has a “<strong>Reset</strong>” button. After pressing it, what was reset appears just below.
        A greyed-out item shows the reason on its row (in measured runs, the value used for measuring is also shown).
      </p>
      <p><strong>${w.label("fxLevel")}</strong> (in the common settings; choose one of four)</p>
      <ul>
          ${atmospheres}
      </ul>
      <p class="note">
        For people sensitive to light or sound, choose “${w.atmosphereName("subtle")}” or “${w.atmosphereName("none")}”. Flashes are limited to 3 per second in every atmosphere.
        In measured runs, no effects are added to the games whichever atmosphere is chosen.
      </p>`,
    };
  }
  return {
    title: "支援者の設定",
    html: `
      <p>
        遊びを選ぶ画面の右上「<strong>支援者の設定</strong>」を、指でさわると開きます（スイッチでは開きません。
        ご本人が誤って開かないようにしてあり、設定の画面では黄色い枠も止まります）。戻るときは「← ホームへ」です。
        変更は自動で保存されます。キーボードでは Tab で移動し、Enter／Space で見出しを開閉します。
      </p>
      <p><strong>「${escapeHtml(say(common.title))}」</strong>（最初から出ている${count}つ）</p>
      <ul>
          ${commonItems}
      </ul>
      <p><strong>くわしい設定</strong>（見出しを押すと開きます。いくつでも同時に開けます）</p>
      <ul>
        <li><strong>${escapeHtml(say(settingsGroup("switch").title))}</strong> … ${fieldNames("switch")}</li>
        <li><strong>${escapeHtml(say(settingsGroup("senses").title))}</strong> … ${fieldNames("senses")}</li>
        <li><strong>${escapeHtml(say(PLAY_DETAILS.title))}</strong> … ${playNames}の速さ・回数など（遊びの中の「この遊びの設定」からも変えられます）</li>
        <li><strong>音の素材</strong> … 声と効果音の素材の作者と出典</li>
        <li><strong>${escapeHtml(say(settingsGroup("research").title))}</strong> … 研究で測るときだけ使います。ふだんは「れんしゅう」のままさわりません。
          「そくてい」の回は、遊びの速さ・回数・手がかりが決まった値に固定されます。押すタイミングの基準をとる手順もここにあります。</li>
      </ul>
      <p class="note">
        くわしい設定には、まとまりごとに「<strong>既定に戻す</strong>」があります。押すと、何を戻したかがすぐ下に出ます。
        灰色で変えられない項目には、その行に理由が出ます（そくていの回は、そくていで使う値も出ます）。
      </p>
      <p><strong>${w.label("fxLevel")}</strong>（よく使う設定にあります。4つから選びます）</p>
      <ul>
          ${atmospheres}
      </ul>
      <p class="note">
        光や音に敏感な人は「${w.atmosphereName("subtle")}」か「${w.atmosphereName("none")}」に。光の点滅は、どの雰囲気でも1秒に3回までです。
        そくていの回は、どの雰囲気を選んでいても、遊びに演出を足しません。
      </p>`,
  };
}

/** こまったとき。道順は settingsFields.js から作る（画面の見出しと名前のまま）。 */
function troubleSection(w) {
  const q = w.quote;
  const items = w.en
    ? [
        ["Both the yellow highlight and the iPad's highlight appear", "Turn the iPad's Switch Control off (see “Before you start”)."],
        ["The highlight does not move", `Turn on ${w.path("autoScan")}. While ${w.path("switchControlMode")} is on, the app's highlight does not move.`],
        ["The highlight is too fast or too slow", `Change it with ${w.path("scanInterval")}.`],
        [
          "Watching the screen is hard",
          `Set ${w.path("scanFeedback")} to ${q(w.optionLabel("scanFeedback", "speak"))} to hear the name at each move (${q(w.optionLabel("scanFeedback", "tick"))} plays a sound only).`,
        ],
        ["Light or motion seems too much, or the player gets overexcited", `Set ${w.path("fxLevel")} to ${q(w.atmosphereName("subtle"))} or ${q(w.atmosphereName("none"))}.`],
        ["No sound", `Check the iPad's volume and silent mode. Also turn on ${w.path("soundEnabled")}.`],
        ["No voice, or the voice is quiet", `Turn on ${w.path("speechEnabled")}. Change the volume with ${w.path("speechVolume")}.`],
        [
          "A setting is greyed out",
          `The reason is shown on that row. If it says “Fixed in measured runs”, switch ${w.path("difficultyMode")} to “Practice” to change it.`,
        ],
        ["I want to undo changed settings", "Press “Reset” in that group of detailed settings."],
        ["Nothing happens when pressing", "Check that NeuroNode is connected to the iPad (as a keyboard). If touching the screen works, the app is working."],
        ["I want to change the language", `Choose it with ${w.path("textMode")}. The games and these supporter screens switch together.`],
      ]
    : [
        ["黄色い枠と、iPad の枠が両方出る", "iPad の「スイッチコントロール」をオフにしてください（「はじめる前に」を見てください）。"],
        ["枠が動かない", `${w.path("autoScan")}をオンにします。${w.path("switchControlMode")}がオンのあいだは、アプリの枠は動きません。`],
        ["枠が速すぎる・遅すぎる", `${w.path("scanInterval")}で変えます。`],
        [
          "画面を見続けるのが難しい",
          `${w.path("scanFeedback")}を${q(w.optionLabel("scanFeedback", "speak"))}にすると、枠が動くたびに遊びの名前を読みます（${q(w.optionLabel("scanFeedback", "tick"))}は音だけ）。`,
        ],
        ["光や動きがつらそう・興奮しすぎる", `${w.path("fxLevel")}を${q(w.atmosphereName("subtle"))}か${q(w.atmosphereName("none"))}にします。`],
        ["音が出ない", `iPad の音量と消音（マナーモード）を確かめます。${w.path("soundEnabled")}もオンにします。`],
        ["声が出ない・小さい", `${w.path("speechEnabled")}をオンにします。大きさは${w.path("speechVolume")}で変えます。`],
        [
          "設定が灰色で変えられない",
          `その行に理由が出ています。「そくていの回は固定です」なら、${w.path("difficultyMode")}を「れんしゅう」にすると変えられます。`,
        ],
        ["変えた設定を元に戻したい", "くわしい設定の、まとまりごとの「既定に戻す」を押します。"],
        [
          "押しても何も起きない",
          "NeuroNode が iPad につながっているか（キーボードとして）を確かめます。画面を指でさわって動くなら、アプリは動いています。",
        ],
        ["言葉（日本語・英語）を変えたい", `${w.path("textMode")}で選びます。遊びと支援者の画面が一緒に変わります。`],
      ];
  return {
    title: w.pick("こまったとき", "Troubleshooting"),
    html: `
      <dl class="qa">
${items.map(([question, answer]) => `        <dt>${question}</dt>\n        <dd>${answer}</dd>`).join("\n")}
      </dl>`,
  };
}

/**
 * 説明書の本文（見出しから「こまったとき」まで）。
 * @param {{print?: boolean, lang?: "ja"|"en"}} [options]
 *   print … 印刷用（番号つきの見出し・画面の絵・遊びの表。日本語）
 *   lang  … 設定画面に出すときの言語（支援者の画面の言語）
 */
export function supporterGuideHtml({ print = false, lang = "ja" } = {}) {
  const language = print ? "ja" : lang;
  const w = wordsFor(language);
  const sections = [beforeSection(w), stepsSection(w, print), gamesSection(w, print), settingsSection(w, language), troubleSection(w)];
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
