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
// 文は支援者向け。設定画面では支援者の画面の言語（supporterText.js）で出し、
// 印刷用も言語ごとに作る。「小学校高学年が読んで分かる」くらいの言葉。
// 文は どれも {ja, en} の組で書き、say で選ぶ（3つ目からの言語は、英語の文を鍵にして訳を引く）。
// だから英語は決まった文字列で書き、道順や名前は {name} の穴に入れる（穴の名前は日本語と英語で同じ）。
// 返すのは HTML の文字列。ここに書いた文と、escapeHtml を通した定義の値だけでできている。
// =====================================================================

import { ATMOSPHERE_LEVELS, ATMOSPHERES } from "./atmosphere.js";
import { translate } from "./i18n.js";
import { languageInfo } from "./locales/index.js";
import { PLAY_DETAILS, settingPath, settingsField, settingsGroup } from "./settingsFields.js";
import { say } from "./supporterText.js";
import { escapeHtml } from "./utils.js";

export const GUIDE_TITLE = "かんたん説明書";

/**
 * 印刷用の説明書の、本文の外の字（題・前書き・印刷のボタン・末尾の一言）。言語ごと。
 * 日本語は GUIDE_TITLE・GUIDE_LEAD と同じ文（public/guide.html が1字も変わらないように）。
 */
export function printableGuideWords(lang = "ja") {
  const text = (pair) => say(pair, lang);
  return {
    htmlLang: languageInfo(lang).htmlLang,
    title: text({ ja: GUIDE_TITLE, en: "Quick guide" }),
    titleSuffix: text({ ja: "（ご家族・先生・支援者の方へ）", en: " (for families, teachers and supporters)" }),
    lead: text({
      ja: GUIDE_LEAD,
      en:
        "For families, teachers and supporters. This app is for practising “pressing” with the NeuroNode switch through play. " +
        "It starts with games where something always happens whenever you press.",
    }),
    print: text({ ja: "印刷する（A4）", en: "Print (A4)" }),
    foot: text({
      ja: "この説明書は、アプリの設定画面の「はじめての方へ：つかいかた」と同じ中身です。",
      en: "This guide has the same content as “Getting started: how to use” on the app’s settings screen.",
    }),
  };
}
export const GUIDE_LEAD =
  "ご家族・先生・支援者の方へ。NeuroNode（ニューロノード）のスイッチで「押す」練習を、遊びながらするアプリです。" +
  "はじめは、いつ押しても必ず何かが起きる遊びから始めます。";

/** 引用の かっこ（日本語は「」、英語は “”）。 */
const QUOTE = { ja: "「{text}」", en: "“{text}”" };

/** この言語の文の道具（説明書を1回作るあいだ使う）。 */
function wordsFor(lang) {
  // 利用者の世界の辞書の文。日本語は、支援者が読む漢字かな混じりで引く。
  const dict = (key) => translate(key, lang === "ja" ? "kanji" : languageInfo(lang).mode);
  return {
    // {ja, en} の組から、この言語の文。values は穴（{name}）に入れる値。
    text: (pair, values) => say(pair, lang, values),
    dict,
    path: (key) => escapeHtml(settingPath(key, lang)),
    label: (key) => escapeHtml(say(settingsField(key).label, lang)),
    optionLabel: (key, value) => escapeHtml(say(settingsField(key).options.find(([option]) => option === value)[1], lang)),
    atmosphereName: (level) => escapeHtml(dict(ATMOSPHERES[level].label)),
    quote: (text) => say(QUOTE, lang, { text }),
  };
}

/** はじめる前に（1回だけ）。 */
function beforeSection(w) {
  return {
    title: w.text({ ja: "はじめる前に（1回だけ）", en: "Before you start (once)" }),
    html: w.text(
      {
        ja: `
      <ul>
        <li>NeuroNode を iPad に<strong>キーボードとしてつなぎます</strong>。スイッチを押すと、アプリの遊びが進みます。</li>
        <li>iPad の「設定」→「アクセシビリティ」→「スイッチコントロール」は<strong>オフのまま</strong>にします。
          アプリの黄色い枠で選びます（アプリの中の設定を変える必要はありません）。</li>
        <li>音が大事な遊びです。iPad の<strong>音量</strong>を上げ、<strong>消音（マナーモード）</strong>を切っておきます。</li>
      </ul>
      <p class="note">
        iPad 本体のスイッチコントロールで操作したいときだけ、iPad とアプリ（支援者の設定の
        {path}）の<strong>両方をオン</strong>にします。
        iPad だけをオンにすると、黄色い枠（アプリ）と iPad の枠が両方出て、うまく選べません。
      </p>`,
        en: `
      <ul>
        <li><strong>Connect NeuroNode to the iPad as a keyboard</strong>. Pressing the switch moves the games forward.</li>
        <li>Leave the iPad's Settings → Accessibility → Switch Control <strong>off</strong>.
          Choices are made with the app's yellow highlight (nothing needs to change inside the app).</li>
        <li>Sound matters in these games. Turn the iPad's <strong>volume</strong> up and turn <strong>silent mode</strong> off.</li>
      </ul>
      <p class="note">
        Only if you want to use the iPad's own Switch Control, turn on <strong>both</strong> the iPad's setting and the app's
        {path} in the supporter settings.
        If only the iPad's setting is on, the yellow highlight (app) and the iPad's highlight both appear and choosing becomes hard.
      </p>`,
      },
      { path: w.path("switchControlMode") }
    ),
  };
}

/**
 * 画面の見本（印刷用だけ。アプリの画面を簡単にした絵）。絵の中の字は、アプリのその言語の字と同じに
 * なるよう、ボタンの名前は画面と同じ辞書から引く。
 */
const stepPictures = (w) => ({
  start: `<div class="screen light" aria-hidden="true"><div class="big-button">${escapeHtml(w.dict("start.begin"))}</div></div>`,
  choose: `<div class="screen light" aria-hidden="true"><span class="corner">${w.text({ ja: "支援者の設定", en: "Supporter settings" })}</span><div class="tiles"><span>①</span><span>②</span><span>③</span><span>④</span><span>⑤</span><span>⑥</span><span>⑦</span><span>⑧</span><span>…</span></div></div>`,
  play: `<div class="screen" aria-hidden="true"><div class="bar"><span>${escapeHtml(w.dict("game.settings"))}</span><span>× ${escapeHtml(w.dict("game.exit"))}</span></div><svg class="animal" viewBox="0 0 300 240"><path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path><path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path><circle cx="222" cy="104" r="8" fill="#10222E"></circle></svg></div>`,
  done: `<div class="screen light" aria-hidden="true"><div class="done">${w.text({ ja: "できた！", en: "You did it!" })}</div><div class="buttons"><span>${escapeHtml(w.dict("result.retry"))}</span><span>${escapeHtml(w.dict("result.home"))}</span></div></div>`,
});

/** 文の中のボタンの名前は、画面と同じ辞書の文を かっこに入れて穴へ入れる。 */
function steps(w) {
  const button = (key) => w.quote(w.dict(key));
  return [
    {
      id: "start",
      title: w.text({ ja: "① はじめる", en: "① Start" }),
      text: w.text(
        {
          ja: "最初の画面は{start}だけです。スイッチを1回押すと、遊びを選ぶ画面になります。",
          en: "The first screen only has {start}. Press the switch once to reach the screen for choosing a game.",
        },
        { start: button("start.begin") }
      ),
    },
    {
      id: "choose",
      title: w.text({ ja: "② 遊びを選ぶ", en: "② Choose a game" }),
      text: w.text({
        ja:
          "黄色い枠が順番に動きます。遊びたい絵に枠が来たら押します。" +
          "①がいちばんかんたんで、番号が大きいほどむずかしくなります。画面を指でさわっても選べます。",
        en:
          "The yellow highlight moves from item to item. Press when it reaches the game you want. " +
          "① is the easiest, and higher numbers are harder. You can also choose by touching the screen.",
      }),
    },
    {
      id: "play",
      title: w.text({ ja: "③ 遊ぶ", en: "③ Play" }),
      text: w.text(
        {
          ja:
            "押すと絵や音が出ます。右上の{settings}で、音や速さ、タイミングの遊びの「絵の かんじ」（えほんみたい／シンプル）を" +
            "その場で変えられます（支援者がさわるボタンです。変えられる遊びだけ）。やめるときは{exit}です。",
          en:
            "Pressing brings out pictures and sounds. With {settings} at the top right you can change the sounds, " +
            "the speed, and the picture style of the timing games (Picture book / Simple) on the spot " +
            "(a button for supporters, only in games that have settings). To stop, use {exit}.",
        },
        { settings: button("game.settings"), exit: button("game.exit") }
      ),
    },
    {
      id: "done",
      title: w.text({ ja: "④ できた！", en: "④ Done!" }),
      text: w.text(
        {
          ja: "終わると「できた！」の画面になります。{retry}か{home}を選びます。",
          en: "At the end, the “Done!” screen appears. Choose {retry} or {home}.",
        },
        { retry: button("result.retry"), home: button("result.home") }
      ),
    },
  ];
}

function stepsSection(w, print) {
  const cards = steps(w)
    .map(
      (step) => `
        <div class="step">
          ${print ? stepPictures(w)[step.id] : ""}
          <p><strong>${step.title}</strong><br />${step.text}</p>
        </div>`
    )
    .join("");
  return { title: w.text({ ja: "つかいかた", en: "How to use" }), html: `\n      <div class="steps">${cards}\n      </div>` };
}

/** 遊びの順番。名前とむずかしさの札は、ホームと同じ辞書の文。 */
function games(w) {
  const row = (no, titleKey, levelKey, text) => [no, escapeHtml(w.dict(titleKey)), w.text(text), escapeHtml(w.dict(levelKey))];
  return [
    row("①", "tile.color-legacy.title", "level.first", {
      ja: "押すたびに、真っ暗な画面から生きものが出てきます。いつ押しても大丈夫。",
      en: "Each press brings an animal out of the dark screen. Pressing at any time is fine.",
    }),
    row("②", "tile.balloon.title", "level.easy", {
      ja: "押すたびに、ふうせんが1つずつ割れます。5回で全部割れます。",
      en: "Each press pops one balloon. Five presses pop them all.",
    }),
    row("③", "tile.coloring.title", "level.easy", {
      ja: "押すたびに、絵に色がついていきます。5回でできあがり。",
      en: "Each press adds colour to the picture. Five presses finish it.",
    }),
    row("④", "tile.baseball.title", "level.used", {
      ja: "転がってくるボールを、押してバットで打ちます。振れば必ず当たり、ぴったりだとホームラン。",
      en: "Press to swing the bat at the rolling ball. Every swing hits, and perfect timing is a home run.",
    }),
    row("⑤", "tile.slot-corner.title", "level.used", {
      ja: "くるくる回る絵が、目標の絵になったときに押します（タイミングの練習）。",
      en: "Press when the spinning picture matches the target picture (timing practice).",
    }),
    row("⑥", "tile.music-corner.title", "level.easy", {
      ja: "音楽室に楽器が6つ並び、黄色い枠が順に回ります。「すきな がっき」は押すと枠の楽器が鳴ります（10回）。「せんせいと」は、先生が言った楽器に枠が来たら押します（5問。ちがう楽器で押しても、その楽器が鳴るだけ）。そくていの回は、高い音のときだけ押す遊びになります。",
      en: "Six instruments sit in a music room and a yellow frame moves across them. In “Any instrument”, each press plays the one in the frame (10 presses). In “With the teacher”, press when the frame reaches the instrument the teacher names (5 rounds; another instrument just plays itself). In measured runs, this becomes the game of pressing only on high notes.",
    }),
    row("⑦", "tile.crane-corner.title", "level.challenge", {
      ja: "動くアームが ぬいぐるみの上に来たときに押します。",
      en: "Press when the moving claw is above a plush toy.",
    }),
    row("⑧", "tile.fishing-corner.title", "level.challenge", {
      ja: "「アタリ」の音（れんしゅうでは大きな「！」も）が出たら、すぐ押します。",
      en: "Press as soon as the bite sound plays (in practice, a big “!” also appears).",
    }),
  ];
}

function gamesSection(w, print) {
  const list = print
    ? `\n      <table>
        <thead>
          <tr><th>${w.text({ ja: "番号", en: "No." })}</th><th>${w.text({ ja: "遊び", en: "Game" })}</th><th>${w.text({ ja: "どんな遊び？", en: "What is it like?" })}</th><th>${w.text({ ja: "むずかしさ", en: "Level" })}</th></tr>
        </thead>
        <tbody>
${games(w).map(([no, name, text, level]) => `          <tr><td class="no">${no}</td><td>${name}</td><td>${text}</td><td><span class="badge">${level}</span></td></tr>`).join("\n")}
        </tbody>
      </table>`
    : `\n      <ol class="guide-games">
${games(w).map(([no, name, text, level]) => `        <li><strong>${no} ${name}</strong>${w.text({ ja: "（{level}）", en: " ({level}) " }, { level })}${text}</li>`).join("\n")}
      </ol>`;
  return {
    title: w.text({ ja: "遊びの順番（おすすめ）", en: "Suggested order of the games" }),
    pageBreak: true,
    html: `${list}
      <p class="note">${w.text({
        ja: "①〜③は失敗がありません。「押したら何かが起きる」ことが分かったら、④（振れば必ず当たる、タイミングの入り口）へ。そのあと⑤からのタイミングの遊びへ進みます。",
        en: "There is no failing in ① to ③. Once “pressing makes something happen” is understood, move on to ④ (every swing hits; the first step into timing), and then to the timing games from ⑤.",
      })}</p>`,
  };
}

/** 支援者の設定。並び・名前・説明は settingsFields.js から引く（画面と同じもの）。 */
function settingsSection(w, lang) {
  const common = settingsGroup("common");
  const commonItems = common.fields
    .map((field) => `<li><strong>${escapeHtml(say(field.label, lang))}</strong> … ${escapeHtml(say(field.hint, lang))}</li>`)
    .join("\n          ");
  const comma = w.text({ ja: "、", en: ", " });
  const groupTitle = (groupId) => escapeHtml(say(settingsGroup(groupId).title, lang));
  const fieldNames = (groupId) => settingsGroup(groupId).fields.map((field) => escapeHtml(say(field.label, lang))).join(comma);
  const playNames = PLAY_DETAILS.groups.map(groupTitle).join(comma);
  const atmospheres = ATMOSPHERE_LEVELS.map(
    (level) => `<li><strong>${w.atmosphereName(level)}</strong> … ${escapeHtml(w.dict(ATMOSPHERES[level].description))}</li>`
  ).join("\n          ");
  return {
    title: w.text({ ja: "支援者の設定", en: "Supporter settings" }),
    html: w.text(
      {
        ja: `
      <p>
        遊びを選ぶ画面の右上「<strong>支援者の設定</strong>」を、指でさわると開きます（スイッチでは開きません。
        ご本人が誤って開かないようにしてあり、設定の画面では黄色い枠も止まります）。戻るときは「← ホームへもどる」です。
        変更は自動で保存されます。キーボードでは Tab で移動し、Enter／Space で見出しを開閉します。
      </p>
      <p><strong>「{commonTitle}」</strong>（最初から出ている{count}つ）</p>
      <ul>
          {commonItems}
      </ul>
      <p><strong>くわしい設定</strong>（見出しを押すと開きます。いくつでも同時に開けます）</p>
      <ul>
        <li><strong>{switchTitle}</strong> … {switchFields}</li>
        <li><strong>{sensesTitle}</strong> … {sensesFields}</li>
        <li><strong>{playTitle}</strong> … {playNames}の速さ・回数など（遊びの中の「{gameSettings}」からも変えられます）</li>
        <li><strong>音の素材</strong> … 声と効果音の素材の作者と出典</li>
        <li><strong>{researchTitle}</strong> … 研究で測るときだけ使います。ふだんは「れんしゅう」のままさわりません。
          「そくてい」の回は、遊びの速さ・回数・手がかりが決まった値に固定されます。押すタイミングの基準をとる手順もここにあります。</li>
      </ul>
      <p class="note">
        くわしい設定には、まとまりごとに「<strong>既定に戻す</strong>」があります。押すと、何を戻したかがすぐ下に出ます。
        灰色で変えられない項目には、その行に理由が出ます（そくていの回は、そくていで使う値も出ます）。
      </p>
      <p><strong>{fxLevel}</strong>（よく使う設定にあります。4つから選びます）</p>
      <ul>
          {atmospheres}
      </ul>
      <p class="note">
        光や音に敏感な人は「{subtle}」か「{none}」に。光の点滅は、どの雰囲気でも1秒に3回までです。
        そくていの回は、どの雰囲気を選んでいても、遊びに演出を足しません。
      </p>`,
        en: `
      <p>
        Open it by touching “<strong>Supporter settings</strong>” at the top right of the game-choosing screen (it does not open with the switch,
        so the player cannot open it by mistake, and the yellow highlight stops on the settings screen). To go back, use “← Back to home”.
        Changes are saved automatically. With a keyboard, move with Tab and open or close headings with Enter / Space.
      </p>
      <p><strong>“{commonTitle}”</strong> (the {count} shown from the start)</p>
      <ul>
          {commonItems}
      </ul>
      <p><strong>Detailed settings</strong> (tap a heading to open it; any number can be open at once)</p>
      <ul>
        <li><strong>{switchTitle}</strong> … {switchFields}</li>
        <li><strong>{sensesTitle}</strong> … {sensesFields}</li>
        <li><strong>{playTitle}</strong> … speed, rounds and more for {playNames} (also changeable from “{gameSettings}” during play)</li>
        <li><strong>Sound credits</strong> … authors and sources of the voice and sound materials</li>
        <li><strong>{researchTitle}</strong> … only for research measurements. Normally leave it on “Practice”.
          In measured runs, the speed, rounds and cues of the games are fixed. The press timing baseline is also here.</li>
      </ul>
      <p class="note">
        Each group of detailed settings has a “<strong>Reset</strong>” button. After pressing it, what was reset appears just below.
        A greyed-out item shows the reason on its row (in measured runs, the value used for measuring is also shown).
      </p>
      <p><strong>{fxLevel}</strong> (in the common settings; choose one of four)</p>
      <ul>
          {atmospheres}
      </ul>
      <p class="note">
        For people sensitive to light or sound, choose “{subtle}” or “{none}”. Flashes are limited to 3 per second in every atmosphere.
        In measured runs, no effects are added to the games whichever atmosphere is chosen.
      </p>`,
      },
      {
        commonTitle: escapeHtml(say(common.title, lang)),
        count: common.fields.length,
        commonItems,
        switchTitle: groupTitle("switch"),
        switchFields: fieldNames("switch"),
        sensesTitle: groupTitle("senses"),
        sensesFields: fieldNames("senses"),
        playTitle: escapeHtml(say(PLAY_DETAILS.title, lang)),
        playNames,
        gameSettings: escapeHtml(w.dict("game.settings")),
        researchTitle: groupTitle("research"),
        fxLevel: w.label("fxLevel"),
        atmospheres,
        subtle: w.atmosphereName("subtle"),
        none: w.atmosphereName("none"),
      }
    ),
  };
}

/**
 * こまったとき。道順は settingsFields.js から作る（画面の見出しと名前のまま）。
 * 並びは [聞かれること, 答え, 答えの穴に入れる値]。
 */
function troubleSection(w) {
  const q = w.quote;
  const items = [
    [
      { ja: "黄色い枠と、iPad の枠が両方出る", en: "Both the yellow highlight and the iPad's highlight appear" },
      {
        ja: "iPad の「スイッチコントロール」をオフにしてください（「はじめる前に」を見てください）。",
        en: "Turn the iPad's Switch Control off (see “Before you start”).",
      },
    ],
    [
      { ja: "枠が動かない", en: "The highlight does not move" },
      {
        ja: "{autoScan}をオンにします。{switchControl}がオンのあいだは、アプリの枠は動きません。",
        en: "Turn on {autoScan}. While {switchControl} is on, the app's highlight does not move.",
      },
      { autoScan: w.path("autoScan"), switchControl: w.path("switchControlMode") },
    ],
    [
      { ja: "枠が速すぎる・遅すぎる", en: "The highlight is too fast or too slow" },
      { ja: "{path}で変えます。", en: "Change it with {path}." },
      { path: w.path("scanInterval") },
    ],
    [
      { ja: "画面を見続けるのが難しい", en: "Watching the screen is hard" },
      {
        ja: "{path}を{speak}にすると、枠が動くたびに遊びの名前を読みます（{tick}は音だけ）。",
        en: "Set {path} to {speak} to hear the name at each move ({tick} plays a sound only).",
      },
      {
        path: w.path("scanFeedback"),
        speak: q(w.optionLabel("scanFeedback", "speak")),
        tick: q(w.optionLabel("scanFeedback", "tick")),
      },
    ],
    [
      { ja: "枠が動くたびに名前を読むのが多すぎる", en: "The name is read at every move, and it is too much" },
      { ja: "{path}を{tick}か{none}にします。", en: "Set {path} to {tick} or {none}." },
      {
        path: w.path("scanFeedback"),
        tick: q(w.optionLabel("scanFeedback", "tick")),
        none: q(w.optionLabel("scanFeedback", "none")),
      },
    ],
    [
      { ja: "光や動きがつらそう・興奮しすぎる", en: "Light or motion seems too much, or the player gets overexcited" },
      { ja: "{path}を{subtle}か{none}にします。", en: "Set {path} to {subtle} or {none}." },
      { path: w.path("fxLevel"), subtle: q(w.atmosphereName("subtle")), none: q(w.atmosphereName("none")) },
    ],
    [
      { ja: "音が出ない", en: "No sound" },
      {
        ja: "iPad の音量と消音（マナーモード）を確かめます。{path}もオンにします。",
        en: "Check the iPad's volume and silent mode. Also turn on {path}.",
      },
      { path: w.path("soundEnabled") },
    ],
    [
      { ja: "声が出ない・小さい", en: "No voice, or the voice is quiet" },
      { ja: "{speech}をオンにします。大きさは{volume}で変えます。", en: "Turn on {speech}. Change the volume with {volume}." },
      { speech: w.path("speechEnabled"), volume: w.path("speechVolume") },
    ],
    [
      { ja: "設定が灰色で変えられない", en: "A setting is greyed out" },
      {
        ja: "その行に理由が出ています。「そくていの回は固定です」なら、{path}を「れんしゅう」にすると変えられます。",
        en: "The reason is shown on that row. If it says “Fixed in measured runs”, switch {path} to “Practice” to change it.",
      },
      { path: w.path("difficultyMode") },
    ],
    [
      { ja: "変えた設定を元に戻したい", en: "I want to undo changed settings" },
      { ja: "くわしい設定の、まとまりごとの「既定に戻す」を押します。", en: "Press “Reset” in that group of detailed settings." },
    ],
    [
      { ja: "押しても何も起きない", en: "Nothing happens when pressing" },
      {
        ja: "NeuroNode が iPad につながっているか（キーボードとして）を確かめます。画面を指でさわって動くなら、アプリは動いています。",
        en: "Check that NeuroNode is connected to the iPad (as a keyboard). If touching the screen works, the app is working.",
      },
    ],
    [
      { ja: "言葉（日本語・英語）を変えたい", en: "I want to change the language" },
      {
        ja: "{path}で選びます。遊びと支援者の画面が一緒に変わります。",
        en: "Choose it with {path}. The games and these supporter screens switch together.",
      },
      { path: w.path("textMode") },
    ],
  ];
  return {
    title: w.text({ ja: "こまったとき", en: "Troubleshooting" }),
    html: `
      <dl class="qa">
${items.map(([question, answer, values]) => `        <dt>${w.text(question)}</dt>\n        <dd>${w.text(answer, values)}</dd>`).join("\n")}
      </dl>`,
  };
}

/**
 * 説明書の本文（見出しから「こまったとき」まで）。
 * @param {{print?: boolean, lang?: string}} [options]
 *   print … 印刷用（番号つきの見出し・画面の絵・遊びの表）
 *   lang  … 設定画面に出すときの言語（支援者の画面の言語。足した言語の名前でもよい）
 */
export function supporterGuideHtml({ print = false, lang = "ja" } = {}) {
  const language = lang;
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
