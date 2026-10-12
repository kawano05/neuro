// =====================================================================
// games/gameSettings.js — この遊びの設定（遊んでいる最中に、支援者がその場で変える）
//
// docs/design-renewal-2026-09-25.md §1.8, §3.2。
//
// 打ち合わせで「遊んでいる最中に『速いね』と思ったら、その場で変えたい。
// ホームへ戻るのが手間」と言われた。ゲーム画面の右上に「この遊びの設定」を
// 置き、その遊びで意味のある項目だけを出す。
//
// 遊びによって、変えたあとの扱いが2通りある:
//
//   live    … 回数だけで進む遊び（おすと でてくる）。変えても、そのまま続ける。
//             開いているあいだは、スイッチを押しても遊びは進まない。
//   restart … 時間で進む遊び（リール・アーム）。設定を開いた時点でその回を
//             止め（中断として記録に残る）、閉じたら はじめから やり直す。
//             1回の記録は1つの条件で行われた、が解析の前提になっている
//             （session.config に速さを書く）。途中で速さが変わった回は、
//             どちらの条件の記録なのか書けない。開いているあいだもリールは
//             回り続けるので、止めずに待たせると、選んでいるあいだの
//             「押さなかった」が記録に入る。
//
// そくていの回（difficultyMode: "measure"）では速さを変えられない
// （difficultyMode.js が protocol の値を使う）。変えられる項目が1つも
// 無い遊びではボタンそのものを出さない——効かない操作子を置かない
// （引き継ぎ書 §3）。開いただけで回が止まる、も起きない。
//
// 文言は支援者向け。支援者の画面の言語（利用者の「言語」に合わせた日本語か英語。
// src/lib/supporterText.js）で出す。文は {ja, en} の組。i18n の辞書（ふりがな・声）は通さない。
// 「小学校高学年が読んで分かる」くらいの言葉で書く（打ち合わせ §1.8）。
// =====================================================================

import { isMeasurementMode } from "../difficultyMode.js";
import { ART_FAMILIES } from "../artVersion.js";
import { SETTING_DEFINITIONS } from "../settingDefinitions.js";
import { PLAY_BACKGROUNDS_BY_GAME, PLAY_SOUNDS_BY_GAME } from "../state.js";
import { say, supporterLang } from "../supporterText.js";

const NONE = { ja: "なし", en: "None" };

/** 音の選択肢の名前（支援者の画面の言葉）。 */
const SOUND_LABELS = {
  instrument: { ja: "楽器の音", en: "Instrument" },
  pop: { ja: "明るい効果音", en: "Bright pop" },
  boing: { ja: "ボヨーン", en: "Boing" },
  creature: { ja: "生きものの声", en: "Animal voices" },
  boom: { ja: "びっくりする音", en: "Surprise sound" },
  bat: { ja: "カキーン（バット）", en: "Crack (bat)" },
  none: NONE,
};

/** できたときのおいわい（歓声と拍手・笑い声。「なし」以外なら「やったー」の声つき）。 */
function cheerGroup(gameId) {
  return {
    key: `playPrefs.${gameId}.cheer`,
    kind: "cheer",
    label: { ja: "できたときのおいわい（「やったー」の声つき）", en: "Celebration when done (with a “Yay!” voice)" },
    options: [
      ["both", { ja: "歓声と拍手、笑い声", en: "Cheers, applause and laughter" }],
      ["applause", { ja: "歓声と拍手", en: "Cheers and applause" }],
      ["laugh", { ja: "笑い声", en: "Laughter" }],
      ["none", NONE],
    ],
  };
}

function soundGroup(gameId, label) {
  return {
    key: `playPrefs.${gameId}.sound`,
    kind: "sound",
    label,
    options: PLAY_SOUNDS_BY_GAME[gameId].map((value) => [value, SOUND_LABELS[value]]),
  };
}

/**
 * はじめの遊び（失敗の無い遊び）の設定。遊びごとに持つ（settings.playPrefs、state.js）。
 * 音は遊びごとに選べる、と打ち合わせで言われた（docs/design-renewal-2026-09-25.md §1.7）。
 * key は settings の中の場所（"playPrefs.balloon.sound" のような点つなぎ）。
 */
// 海は「押すと 出てくる」だけ（state.js の PLAY_BACKGROUNDS_BY_GAME）。
const BACKGROUND_LABELS = {
  sea: { ja: "海", en: "Sea" },
  dark: { ja: "暗い", en: "Dark" },
  light: { ja: "明るい", en: "Light" },
};

function beginnerGroups(gameId) {
  return [
    {
      key: `playPrefs.${gameId}.background`,
      label: { ja: "遊ぶ画面の背景", en: "Background" },
      options: PLAY_BACKGROUNDS_BY_GAME[gameId].map((value) => [value, BACKGROUND_LABELS[value]]),
    },
    soundGroup(gameId, { ja: "押したときの音", en: "Press sound" }),
    cheerGroup(gameId),
  ];
}

/** ボールを打つ遊び。速さは次の1球から効くので、その場で続けられる（live）。 */
function baseballGroups() {
  return [
    {
      key: "playPrefs.baseball.speed",
      label: { ja: "ボールの速さ", en: "Ball speed" },
      options: [
        ["slow", { ja: "ゆっくり", en: "Slow" }],
        ["normal", { ja: "ふつう", en: "Normal" }],
        ["fast", { ja: "はやい", en: "Fast" }],
      ],
    },
    soundGroup("baseball", { ja: "打ったときの音", en: "Hit sound" }),
    cheerGroup("baseball"),
  ];
}

/**
 * タイミングの遊びの、遊びの中だけの選択肢（ゆっくり／ふつう／はやい）。
 *
 * 名前・「そくていで固定されるか」・どの遊びに出すか（inGame）は、設定画面と共有する表
 * （settingDefinitions.js）から引く。以前はここにも名前と measured を書いていて、片方だけ
 * 直すと2つの画面で食い違った。選択肢の値は、表の範囲と sanitize の中にあること
 * （tests/settings-definitions.test.mjs）。null は「ふつう」＝ content.js のプリセット。
 */
const IN_GAME_CHOICES = {
  // リールが1周する時間（ミリ秒）。大きいほど ゆっくり。ふつう＝slotPresets.cycleMs。
  slotCycleMs: [
    [4800, { ja: "ゆっくり", en: "Slow" }],
    [3200, { ja: "ふつう", en: "Normal" }],
    [2800, { ja: "はやい", en: "Fast" }],
  ],
  // 「合った」にする広さ（目標の真ん中から前後何ミリ秒まで）。既定の 220 がいちばん広い。
  // 打ち合わせで、ほかのソフトの「遊びの中でボールの大きさをボンと変えられる」のが使いやすいと
  // 言われた（docs/design-renewal-2026-09-25.md §1.8）。速さと並べて置く。
  slotToleranceMs: [
    [220, { ja: "ひろい", en: "Wide" }],
    [160, { ja: "すこし せまい", en: "A bit narrow" }],
    [100, { ja: "せまい", en: "Narrow" }],
  ],
  // 「高い音だけ」の音の速さ（1分あたりの拍数）。ふつう＝rhythmPresets（50）。
  rhythmBpm: [
    [40, { ja: "ゆっくり", en: "Slow" }],
    [null, { ja: "ふつう", en: "Normal" }],
    [60, { ja: "はやい", en: "Fast" }],
  ],
  // アームが端から端まで動く時間。ふつう＝cranePresets（2200ms）。速くしすぎると「狙って押す」
  // より前に目で追うことが辛くなる（cranePresets のコメント）ので、はやいも控えめにしてある。
  craneSweepMs: [
    [3200, { ja: "ゆっくり", en: "Slow" }],
    [null, { ja: "ふつう", en: "Normal" }],
    [1700, { ja: "はやい", en: "Fast" }],
  ],
  // アームで「つかめる」広さ（床の上の半径）。ふつう＝cranePresets（15）。
  craneToleranceR: [
    [24, { ja: "ひろい", en: "Wide" }],
    [null, { ja: "ふつう", en: "Normal" }],
    [9, { ja: "せまい", en: "Narrow" }],
  ],
  // さかなつりの、アタリが続く長さ（食いついてから逃げるまで）。ふつう＝fishingPresets（2000ms）。
  // 長いほど、ゆっくり押しても釣れる。
  fishingLimitMs: [
    [3000, { ja: "ながい", en: "Long" }],
    [null, { ja: "ふつう", en: "Normal" }],
    [1400, { ja: "みじかい", en: "Short" }],
  ],
};

/**
 * れんしゅうの回の絵（artVersion.js）。同じ絵を使う遊び（ひとつ止める・3つ止める など）は
 * 一緒に変わる。そくていの回は いつも前の絵なので、そくていでは変えられない（measured）。
 * 遊びの中だけの設定なので、支援者の設定画面（settingDefinitions.js）には置かない。
 */
function artGroup(gameId) {
  return {
    key: `practiceArts.${ART_FAMILIES[gameId]}`,
    label: { ja: "絵の かんじ", en: "Picture style" },
    measured: true,
    // 版の新旧ではなく、見た目で言う（2026-10-02、「前の絵、新しい絵じゃなくて適切な表現で」）。
    // 選ぶ札は短い1語にする（かっこの補足があると読む量が増える、と言われて外した）。
    //   world   … えほんみたい: 顔のある絵と、まわりの けしき（ゆうえんち・おもちゃ屋・海・音楽会）
    //   classic … シンプル: 形の はっきりした絵（記号の形・色の地）。そくていの回と同じ組み立て
    options: [
      ["world", { ja: "えほんみたい", en: "Picture book" }],
      ["classic", { ja: "シンプル", en: "Simple" }],
    ],
  };
}

/** タイミングの遊び1つに出す項目（表の inGame にその遊びがあるもの。表の順）と、絵。 */
function timingGroups(gameId) {
  return [
    ...Object.entries(SETTING_DEFINITIONS)
      .filter(([, definition]) => definition.inGame?.includes(gameId))
      .map(([key, definition]) => ({
        key,
        label: definition.label,
        measured: definition.measured === true,
        options: IN_GAME_CHOICES[key],
      })),
    artGroup(gameId),
  ];
}

/** 遊びごとの設定。ここに無い遊びにはボタンを出さない。 */
export const GAME_SETTINGS = {
  "color-legacy": { mode: "live", groups: beginnerGroups("color-legacy") },
  balloon: { mode: "live", groups: beginnerGroups("balloon") },
  coloring: { mode: "live", groups: beginnerGroups("coloring") },
  baseball: { mode: "live", groups: baseballGroups() },
  "slot-l1": { mode: "restart", groups: timingGroups("slot-l1") },
  "slot-l2": { mode: "restart", groups: timingGroups("slot-l2") },
  gonogo: { mode: "restart", groups: timingGroups("gonogo") },
  crane: { mode: "restart", groups: timingGroups("crane") },
  fishing: { mode: "restart", groups: timingGroups("fishing") },
  "fishing-gonogo": { mode: "restart", groups: timingGroups("fishing-gonogo") },
};

/** settings の中の値を、点つなぎの場所で読む（"playPrefs.balloon.sound"）。 */
export function readSetting(settings, key) {
  return key.split(".").reduce((value, part) => (value == null ? undefined : value[part]), settings);
}

/** settings の中の値を、点つなぎの場所へ書く。途中の入れ物は作る。 */
export function writeSetting(settings, key, value) {
  const parts = key.split(".");
  const last = parts.pop();
  const holder = parts.reduce((object, part) => {
    if (!object[part] || typeof object[part] !== "object") object[part] = {};
    return object[part];
  }, settings);
  holder[last] = value;
}

/**
 * いまの設定で、この遊びに変えられる項目があるか。
 * そくていの回では measured な項目が固定されるので、それしか無い遊びは false。
 */
export function gameSettingsAvailable(gameId, settings) {
  const definition = GAME_SETTINGS[gameId];
  if (!definition) return false;
  const measuring = isMeasurementMode(settings);
  return definition.groups.some((group) => !(group.measured && measuring));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {object} ctx アプリ共有コンテキスト（state / elements / save / announce）
 * @param {object} host gameHost から渡す操作
 * @param {() => string|null} host.activeGameId
 * @param {() => boolean} host.sessionRunning いま回が進んでいるか（レディ画面では false）
 * @param {() => void} host.abortSession その回を中断として閉じる
 * @param {() => void} host.relaunch 同じ遊びを はじめから（レディ画面から）
 * @param {() => void} host.applyLive live な遊びへ、変えた設定を伝える
 * @param {() => boolean} [host.canOpen] いま開いてよいか（遊び終えたあとの待ちなどでは false）
 */
export function createGameSettings(ctx, host) {
  const { state, elements, save, announce } = ctx;
  const dialog = elements.gameSettingsDialog;
  let openFor = null;
  let draft = null;
  let stoppedSession = false;

  function isOpen() {
    return openFor !== null;
  }

  function notesFor(definition, measuring) {
    const notes = [];
    if (definition.mode === "live") {
      notes.push({
        text: {
          ja: "設定を開いているあいだは、スイッチを押しても遊びは進みません。ここまでの回数は、そのまま残ります。",
          en: "While the settings are open, pressing the switch does not move the game forward. The presses so far are kept.",
        },
      });
    } else if (stoppedSession) {
      notes.push({
        text: {
          ja: "設定を開いたので、この回はここで止めました。閉じると、はじめから やり直します。",
          en: "Opening the settings stopped this round. When closed, it starts again from the beginning.",
        },
      });
    } else {
      notes.push({ text: { ja: "閉じると、この設定で はじめます。", en: "When closed, the game starts with these settings." } });
    }
    if (measuring && definition.groups.some((group) => group.measured)) {
      notes.push({
        lock: true,
        text: {
          ja: "いまは「そくてい」の回なので、速さや広さ・長さは変えられません。記録の条件をそろえるためです。",
          en: "This is a measured run, so speed, range and length cannot be changed. This keeps the recording conditions the same.",
        },
      });
    }
    const soundGroup = definition.groups.find((group) => group.kind === "sound");
    if (soundGroup && !state.settings.soundEnabled) {
      notes.push({
        lock: true,
        text: {
          ja: "支援者の設定で「効果音」が切ってあるので、押したときの音・拍手・笑い声は出ません。",
          en: "“Sound effects” is off in the supporter settings, so press sounds, applause and laughter do not play.",
        },
      });
    }
    if (soundGroup && draft[soundGroup.key] === "boom") {
      // 打ち合わせで「爆発音ばかりだと発作が起きることもある」と言われた音。
      // 選べるようにはするが、選んだ人にはその場で注意を出す。
      notes.push({
        lock: true,
        text: {
          ja: "「びっくりする音」は強い音です。音に驚きやすい人や、発作のある人には使わないでください。",
          en: "“Surprise sound” is a strong sound. Do not use it for people who startle easily or who have seizures.",
        },
      });
    }
    if (definition.groups.some((group) => group.kind === "cheer") && !state.settings.speechEnabled) {
      notes.push({
        lock: true,
        text: {
          ja: "支援者の設定で「読み上げ」が切ってあるので、「やったー」の声は出ません（歓声と拍手、笑い声は出ます）。",
          en: "“Read aloud” is off in the supporter settings, so the “Yay!” voice does not play (cheers, applause and laughter still do).",
        },
      });
    }
    return notes;
  }

  function render() {
    const definition = GAME_SETTINGS[openFor];
    if (!definition || !dialog) return;
    const measuring = isMeasurementMode(state.settings);
    const lang = supporterLang(state.settings);
    const tr = (text) => escapeHtml(say(text, lang));
    const notes = notesFor(definition, measuring)
      .map((note) => `<p class="gs-note${note.lock ? " is-lock" : ""}">${tr(note.text)}</p>`)
      .join("");
    const groups = definition.groups
      .map((group) => {
        const locked = Boolean(group.measured && measuring);
        const options = group.options
          .map(([value, label]) => {
            const pressed = draft[group.key] === value;
            return `<button type="button" class="gs-option" data-gs-key="${group.key}" data-gs-value="${escapeHtml(JSON.stringify(value))}" aria-pressed="${pressed}"${locked ? " disabled" : ""}>${tr(label)}</button>`;
          })
          .join("");
        return `<fieldset class="gs-group"><legend>${tr(group.label)}</legend><div class="gs-options">${options}</div></fieldset>`;
      })
      .join("");
    const applyLabel =
      definition.mode === "restart"
        ? tr({ ja: "この設定で はじめる", en: "Start with these settings" })
        : tr({ ja: "この設定で戻る", en: "Back with these settings" });
    dialog.innerHTML = `
      <div class="gs-panel">
        <div class="gs-head">
          <div>
            <span class="gs-eyebrow">${tr({ ja: "支援者の方へ", en: "For supporters" })}</span>
            <h2 class="gs-title" id="gameSettingsTitle">${tr({ ja: "この遊びの設定", en: "Game settings" })}</h2>
          </div>
          <button type="button" class="gs-close" data-gs-action="cancel" aria-label="${tr({ ja: "閉じる", en: "Close" })}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        ${notes}
        ${groups}
        <div class="gs-actions">
          <button type="button" class="gs-cancel" data-gs-action="cancel">${tr({ ja: "変えずに戻る", en: "Back without changes" })}</button>
          <button type="button" class="gs-apply" data-gs-action="apply">${applyLabel}</button>
        </div>
      </div>
    `;
  }

  function open() {
    const gameId = host.activeGameId();
    // 遊び終えたあとのお祝いの待ち・エンドレスの「もういちど／おわる」では開かない
    // （開くと回を止めて、けっかを飛ばしてしまう。gameHost の段階）。
    if (isOpen() || !gameSettingsAvailable(gameId, state.settings) || host.canOpen?.() === false) return;
    const definition = GAME_SETTINGS[gameId];
    openFor = gameId;
    draft = Object.fromEntries(
      definition.groups.map((group) => [group.key, readSetting(state.settings, group.key)])
    );
    stoppedSession = false;
    // 時間で進む遊びは、開いた時点でその回を止める（上のコメント）。
    if (definition.mode === "restart" && host.sessionRunning()) {
      host.abortSession();
      stoppedSession = true;
    }
    ctx.audio?.stopSpeech?.();
    render();
    dialog.hidden = false;
    elements.gameSettings?.setAttribute("aria-expanded", "true");
    // フォーカスはダイアログの中へ移さない。スイッチ機器の多くは Space /
    // Enter を送るので、フォーカスが「明るい」や「この設定で戻る」に乗って
    // いると、支援者が選んでいるあいだの利用者のひと押しが、その項目を
    // 押してしまう。項目は支援者がタップで選ぶ。
  }

  /**
   * 閉じる。apply=true なら下書きを設定へ書き戻す。
   * @returns {boolean} 開いていたか（Esc の処理で使う）
   */
  function close({ apply = false } = {}) {
    if (!isOpen()) return false;
    const definition = GAME_SETTINGS[openFor];
    const changed = [];
    if (apply) {
      definition.groups.forEach((group) => {
        if (readSetting(state.settings, group.key) !== draft[group.key]) {
          writeSetting(state.settings, group.key, draft[group.key]);
          changed.push(say(group.label, supporterLang(state.settings)));
        }
      });
      if (changed.length) save();
    }
    openFor = null;
    draft = null;
    dialog.hidden = true;
    dialog.innerHTML = "";
    elements.gameSettings?.setAttribute("aria-expanded", "false");
    if (changed.length) {
      announce(
        supporterLang(state.settings) === "en" ? `Changed ${changed.join(" and ")}` : `${changed.join("と")}を変えました`
      );
    }

    if (definition.mode === "restart") {
      // 止めた回は戻せないので、変えても変えなくても はじめから。
      // レディ画面で開いただけなら、新しい設定でレディ画面を描き直す。
      if (stoppedSession || changed.length) host.relaunch();
    } else if (changed.length) {
      host.applyLive();
    }
    stoppedSession = false;
    // フォーカスは遊びの面へ返す。設定ボタンに返すと、次のひと押し
    // （Space / Enter）がゲームではなく設定ボタンを押して、また開いてしまう
    // ——実際に撮影スクリプトで踏んだ。
    elements.gameStage?.focus({ preventScroll: true });
    return true;
  }

  if (dialog) {
    // ダイアログは #gameStage の外（兄弟）にあるので入力ファネルには入らない。
    // それでも pointerdown を止めておくのは、入れ子へ戻したときに黙って
    // 1入力が混ざるのを防ぐため（「おわる」と同じ理由。gameHost.js）。
    dialog.addEventListener("pointerdown", (event) => event.stopPropagation());
    dialog.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target instanceof Element ? event.target : null;
      const option = target?.closest(".gs-option");
      if (option && !option.disabled) {
        draft[option.dataset.gsKey] = JSON.parse(option.dataset.gsValue);
        render();
        return;
      }
      const action = target?.closest("[data-gs-action]")?.dataset.gsAction;
      if (action === "apply") close({ apply: true });
      else if (action === "cancel") close({ apply: false });
    });
  }

  if (elements.gameSettings) {
    elements.gameSettings.setAttribute("aria-haspopup", "dialog");
    elements.gameSettings.setAttribute("aria-expanded", "false");
    elements.gameSettings.addEventListener("pointerdown", (event) => event.stopPropagation());
    elements.gameSettings.addEventListener("click", (event) => {
      event.stopPropagation();
      open();
    });
  }

  return {
    isOpen,
    open,
    close,
    /** ゲームを離れるとき（おわる・Esc・画面が隠れた）。変更は捨てる。 */
    dismiss() {
      if (!isOpen()) return;
      openFor = null;
      draft = null;
      stoppedSession = false;
      dialog.hidden = true;
      dialog.innerHTML = "";
    },
    /** 設定ボタンを出すか。 */
    available(gameId) {
      return gameSettingsAvailable(gameId, state.settings);
    },
  };
}
