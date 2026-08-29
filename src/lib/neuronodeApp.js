// =====================================================================
// neuronodeApp.js — アプリのブートストラップ（配線役）
//
// 旧バージョンではこのファイルに全ロジック（約1,100行）が入っていたが、
// 現在は以下のモジュールに分割されている:
//
//   content.js   … 教材・タスク・研究条件の純粋データ（ゲーム追加の起点）
//   state.js     … 状態の初期値・読み込み・保存（保存失敗の通知付き）
//   utils.js     … escapeHtml / escapeCsv / formatTime / formatDuration
//   dom.js       … DOM要素レジストリ
//   audio.js     … 効果音・読み上げ（音バリエーション対応の集約先）
//   scan.js      … 走査エンジン
//   games/*.js   … ゲーム基盤（registry / gameHost / colorLegacy 等）
//   views/*.js   … 各画面（home / matching / voca / letters /
//                  log / settings）
//
// 各モジュールは共有コンテキスト ctx を介して連携する:
//   ctx = { state, elements, save, announce, speak, playTone, audio,
//           scan, logEvent, switchView, renderAll, views, gameHost }
//
// このファイルの責務は「ctx の構築」「ビューの初期化」「画面横断の
// イベント配線（タブ・スイッチ入力・キーボード・タイマー・SW登録）」のみ。
// =====================================================================

import { visibleViews } from "./content.js";
import { resolveTextMode, translate, translateHtml } from "./i18n.js";
import { loadState, createStateSaver, MAX_LOG_ENTRIES } from "./state.js";
import { collectElements } from "./dom.js";
import { createAudio } from "./audio.js";
import { createScanEngine } from "./scan.js";
import { createInputDeduper } from "./utils.js";
import { createGameHost } from "./games/gameHost.js";
import { initHome } from "./views/home.js";
import { initMatching } from "./views/matching.js";
import { initVoca } from "./views/voca.js";
import { initLetters } from "./views/letters.js";
import { initDataExport } from "./dataExport.js";
import { initLog } from "./views/log.js";
import { initSettings } from "./views/settings.js";

// 同一物理入力（pointerdown → click 等）の多重発火を1入力に畳む閾値
// （detailed-design.md §3.3）。根拠は utils.js の createInputDeduper 参照。
const SWITCH_INPUT_DEDUPE_MS = 150;

// 既存ビュー（switcher/matching/...）は currentView の値と .view の id が
// 完全一致するが、P1-1 で追加した4ビューは detailed-design.md §10 の指定で
// id に "View" が付く（例: currentView "home" → id="homeView"）。
// renderAll() の表示切り替えではこのマップで id を解決する。
const VIEW_ELEMENT_IDS = {
  start: "startView",
  home: "homeView",
  game: "gameView",
  result: "resultView",
};

// 支援者の世界（タブ群）を構成するビュー名（basic-design.md §3.2）。
// #homeReturn（「← ホームへ」導線）はこの集合に属するビューでだけ表示する。
// 利用者の世界（start/home/game/result）では、home 自体も含めて非表示にする
// （実機確認2026-07-04：タブビューから戻れない導線欠落の修正、detailed-design.md §10）。
const TAB_WORLD_VIEWS = new Set([
  "matching",
  "voca",
  "letters",
  "log",
  "settings",
]);

// 支援者編集ロックは廃止した（2026-08-17）。
//
// 何を守っていたか: 設定画面の操作子は走査対象なので、支援者が設定を開いて
// いるあいだに利用者がスイッチを押すと、ハイライト中の項目が切り替わる。
// それを防ぐため、既定で全操作子を disabled にし、支援者が明示的に
// 解除する仕組みだった。
//
// なぜやめたか:
//   1. 利用者は自力で支援者の世界へ入れない（#homeSupporterMenu は走査対象外の
//      タップ専用）。入口が閉じているので、中で守る必要が薄い。
//   2. iOS の Switch Control にはポイントスキャン（画面上の任意の座標を指す
//      操作）がある。アプリ側の [data-scan] の輪は、その世界では到達範囲の
//      境界になっていない——解除ボタン自体も押せてしまう。守りとして
//      成立していない仕組みを、支援者の毎回の一手間と引き換えに置いていた。
//
// 代わりに残っているもの: 支援者の世界への入口がタップ専用であること、
// 破壊的な操作（記録の消去・候補値の保存）が走査対象外であること。
const USER_ACTIVITY_VIEWS = new Set(["matching", "voca", "letters"]);

export function initNeuroNodeApp() {
  // --- 状態と要素 ---
  const elements = collectElements();
  const state = loadState();
  // MUST（detailed-design.md §2.1）: 再訪時でも必ず start から始める。
  // AudioContext のアンロックと入力導通確認を毎回保証するため、保存されていた
  // 画面に関わらず無条件で上書きする（旧「visibleViews にない場合 switcher へ」
  // という一部フォールバックの分岐をこれで置換した）。
  state.currentView = "start";

  // --- 共有コンテキストの構築 ---
  const ctx = { state, elements, views: {} };
  let supporterMessageTimer = null;

  /**
   * 利用者向け文言の表記解決（src/lib/i18n.js）。
   *
   * ctx に置いて全モジュールから使えるようにしてある。表記は設定で変わるので
   * 文言を定数として持てない——描画のたびに引き直す必要がある。
   */
  // 文言は2経路ある。取り違えたときの壊れ方が穏やかなほうを既定（t）にする。
  //   t     … プレーン文。textContent・読み上げ・aria-label・announce 用
  //   tHtml … ルビを <ruby> に展開した HTML。画面へ出す用
  ctx.t = (key, values) => translate(key, resolveTextMode(state.settings), values);
  ctx.tHtml = (key, values) => translateHtml(key, resolveTextMode(state.settings), values);
  ctx.textMode = () => resolveTextMode(state.settings);

  ctx.announce = (message) => {
    elements.liveRegion.textContent = message;
  };

  /**
   * 支援者の操作に対する、目に見える返事。
   *
   * announce() の出力先 #liveRegion は .sr-only なので、読み上げを使わない
   * 支援者には何も届かない。データが1件も無い状態で「CSVを書き出す」を押すと
   * announce だけが出て画面は無反応になり、壊れていると受け取られていた。
   *
   * 利用者向けの画面には出さない（支援者の世界の伝達手段。basic-design.md
   * §3.1）。読み上げ側は announce が従来どおり担当する。
   */
  ctx.notifySupporter = (message) => {
    elements.supporterMessage.textContent = message;
    elements.supporterMessage.hidden = false;
    window.clearTimeout(supporterMessageTimer);
    supporterMessageTimer = window.setTimeout(() => {
      elements.supporterMessage.hidden = true;
    }, 6000);
  };

  ctx.save = createStateSaver(state, () =>
    ctx.announce("データの保存に失敗しました。端末の空き容量を確認してください。")
  );

  const audio = createAudio(() => state.settings, ctx.announce);
  ctx.audio = audio;
  ctx.speak = audio.speak;
  ctx.voiceFeedback = audio.speakOrAnnounce;
  ctx.playTone = audio.playTone;

  ctx.scan = createScanEngine(ctx);

  /**
   * 操作ログの追加。直近300件を保持し、効果測定の自動集計、
   * ログ画面・効果測定画面の再描画まで行う。
   */
  ctx.logEvent = function logEvent(entry) {
    state.logs.unshift({
      time: new Date().toISOString(),
      view: state.currentView,
      ...entry,
    });
    state.logs = state.logs.slice(0, MAX_LOG_ENTRIES);
    ctx.save();
    ctx.views.log.render();
  };

  /** 画面の切り替え。visibleViews にない画面は start へフォールバックする。 */
  ctx.switchView = function switchView(viewName) {
    const nextView = visibleViews.has(viewName) ? viewName : "start";
    state.currentView = nextView;
    ctx.save();
    ctx.renderAll();
    ctx.scan.restartIfNeeded();
  };

  // ゲームの起動・入力振り分け・終了処理（detailed-design.md §3.2）。
  // logEvent・save・announce・scan がすでに ctx にあることが前提なので、
  // それらの定義より後に構築する。
  ctx.gameHost = createGameHost(ctx);

  // --- ビューの初期化（各ビューがリスナーを自前で張る） ---
  ctx.views.home = initHome(ctx);
  ctx.views.matching = initMatching(ctx);
  ctx.views.voca = initVoca(ctx);
  ctx.views.letters = initLetters(ctx);
  // 支援者のデータ画面（書き出し・参加者ID・切り替え）は評価ログの中に置く。
  ctx.views.dataExport = initDataExport(ctx);
  ctx.views.log = initLog(ctx);
  ctx.views.settings = initSettings(ctx);

  /**
   * 全ビューの再描画（順序は旧 render() を踏襲）。
   * state.currentView に応じたタブ／ビューの表示切り替えと
   * body.game-mode の同期（detailed-design.md §10）もここで行う。
   * switchView() と gameHost / home の画面遷移の双方から呼ばれる共通経路。
   */
  /**
   * 利用者の世界の固定文言を、いまの表記で描き直す。
   *
   * App.svelte に直に書いてあったぶん（「はじめる」「おわる」「けっか」など）。
   * マークアップに埋めたままだと表記の切り替えが効かず、英語表記を選んでも
   * そこだけ日本語で残る——実際、英語で通しで歩いて見つけた。
   *
   * 読み上げ名（sr-only の見出し）はプレーン文、目で読む文字はルビ付き。
   */
  function renderUserWorldText() {
    const set = (el, key, html = true) => {
      if (!el) return;
      if (html) el.innerHTML = ctx.tHtml(key);
      else el.textContent = ctx.t(key);
    };
    set(elements.startTitle, "start.srTitle", false);
    set(elements.startStageLabel, "start.begin");
    set(elements.startSettingsLink, "start.settings");
    set(elements.gameTitle, "game.srTitle", false);
    set(elements.gameExit, "game.exit");
    set(elements.resultTitle, "result.title");
    set(elements.resultRetry, "result.retry");
    set(elements.resultHome, "result.home");
  }

  ctx.renderAll = function renderAll() {
    renderUserWorldText();
    const nextView = state.currentView;
    const nextViewElementId = VIEW_ELEMENT_IDS[nextView] || nextView;
    elements.tabs.forEach((tab) => {
      const isActive = tab.dataset.view === nextView;
      tab.classList.toggle("is-active", isActive);
      if (isActive) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    elements.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === nextViewElementId);
    });
    document.body.classList.toggle("game-mode", nextView === "game");
    document.body.classList.toggle("home-mode", nextView === "home");
    // リザルトも利用者の世界（start/home/game/result）。支援者のタブバーを
    // 出さない。これまで隠す規則が home にしか無かったので、あそびを終えた
    // 直後の画面にだけ「評価ログ / 設定」が現れていた。
    document.body.classList.toggle("result-mode", nextView === "result");
    document.body.classList.toggle("user-activity-mode", USER_ACTIVITY_VIEWS.has(nextView));
    // スタート画面では支援者向けシェル（ヘッダ・タブバー）を CSS で隠し、
    // 「はじめる」への集中を保つ（styles.css の body.start-mode ルール参照）。
    // 支援者のタップ導線は #startSettingsLink（せってい）が残る。
    document.body.classList.toggle("start-mode", nextView === "start");
    elements.homeReturn.hidden = !TAB_WORLD_VIEWS.has(nextView);
    elements.homeSupporterMenu.hidden = nextView !== "home";
    elements.primarySwitchLabel.textContent = nextView === "home" ? "入力して決定" : "入力";

    ctx.views.home.render();
    ctx.views.matching.render();
    ctx.views.voca.render();
    ctx.views.letters.render();
    ctx.views.dataExport.render();
    ctx.views.settings.render();
    ctx.views.log.render();
    ctx.gameHost.render();
    ctx.views.settings.applyClasses();
  };

  // --- 入力ファネル（シェル側一元計時、detailed-design.md §3.3） ---
  const shouldAcceptSwitchInput = createInputDeduper(SWITCH_INPUT_DEDUPE_MS);

  /** t（シェルが計時した performance.now() 値）を現在の画面に応じて振り分ける。 */
  function onSwitchInput(t, source) {
    if (state.currentView === "game") {
      ctx.gameHost.dispatchInput(t, source);
      return;
    }
    if (state.currentView === "start") {
      ctx.views.home.leaveStart(t);
      return;
    }
    ctx.scan.activate();
  }

  /** 入力イベントの入口。最初の1行で計時し、dedupe を通してから振り分ける（MUST）。 */
  function acceptSwitchEvent(source) {
    const t = performance.now(); // dedupe判定より前に計時（MUST, §3.3）
    if (!shouldAcceptSwitchInput(t)) return;
    onSwitchInput(t, source);
  }

  // --- 画面横断のイベント配線 ---
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => ctx.switchView(tab.dataset.view));
  });

  // 「← ホームへ」: 支援者の世界（タブ群）から利用者の世界（home）へ戻る唯一の
  // 導線。data-scan を付けているため、スイッチ利用者が誤ってタブ世界に入っても
  // 走査で自力到達できる（実機確認2026-07-04で発覚した欠落の修正）。
  elements.homeReturn.addEventListener("click", () => {
    ctx.views.home.showLobby();
    ctx.switchView("home");
    ctx.announce("メニューにもどります");
  });

  // 利用者の走査順には入らない、タップ／キーボード専用の支援者入口。
  elements.homeSupporterMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    ctx.switchView("settings");
    ctx.announce("支援者メニューです");
  });

  // 入力ファネルの対象要素: 通常の入力ボタン、スタート画面のステージ、
  // ゲームステージ（全画面スイッチ）。pointerdown と click の両方を受ける
  // （iOS Switch Control 等では synthetic click のみが届く環境があるため
  // pointerdown 単独に寄せない。§3.3）。同一物理入力からの重複発火は
  // dedupe が吸収する。
  [elements.primarySwitch, elements.startStage, elements.gameStage].forEach((target) => {
    // pointerdown で低遅延に採時しつつ、同じ物理操作から後続する click は
    // 時間差に関係なく1回だけ消費する。click しか送らない Switch Control / AT
    // は pending がないため、そのまま入力として受理される。
    let suppressPairedClick = false;
    let activePointerId = null;
    let clearPairedClickTimer = null;

    const clearPairedClick = () => {
      suppressPairedClick = false;
      activePointerId = null;
      if (clearPairedClickTimer) {
        window.clearTimeout(clearPairedClickTimer);
        clearPairedClickTimer = null;
      }
    };

    target.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressPairedClick = true;
      activePointerId = event.pointerId;
      acceptSwitchEvent("pointer");
    });

    const finishPointerSequence = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      // Native click is dispatched after pointerup and before this timer.
      clearPairedClickTimer = window.setTimeout(() => {
        suppressPairedClick = false;
        clearPairedClickTimer = null;
      }, 0);
    };
    // pointerdown が画面遷移を起こしたり、外へドラッグされた場合でも確実に
    // シーケンスを閉じられるよう、終了イベントは window のcaptureで受ける。
    window.addEventListener("pointerup", finishPointerSequence, true);
    window.addEventListener("pointercancel", finishPointerSequence, true);

    target.addEventListener("click", (event) => {
      // detail=0 はpointerdownを伴わないAT/プログラム由来のclickとして受理する。
      if (suppressPairedClick && event.detail !== 0) {
        if (target === elements.startStage) ctx.views.home.clearStartInputGuard();
        clearPairedClick();
        return;
      }
      clearPairedClick();
      acceptSwitchEvent("pointer");
      // click-only のAT入力はこのclick自体で物理シーケンスが完了しており、
      // 新しいホームへ落ちる後続clickがないためガードを即時解除できる。
      if (target === elements.startStage) ctx.views.home.clearStartInputGuard();
    });
  });

  elements.toggleScan.addEventListener("click", () => ctx.scan.toggle());

  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
    if (event.key === "Escape") {
      // ゲーム中の Esc はホスト側の強制終了（home へ直帰）。
      // それ以外は従来どおり走査停止（detailed-design.md §2.4）。
      if (state.currentView === "game") {
        ctx.gameHost.abort();
      } else {
        ctx.scan.stop();
      }
      return;
    }
    // 走査中は、どのキーでもスイッチ入力として受ける。
    //
    // スイッチ機器はキーボードとして見えることが多く、機種によって送る
    // キーが違う（Space / Enter のほか、F1〜F12 や1文字キーを送るものも
    // ある）。利用者ごとに機器が違う以上、こちらが受けるキーを限ると
    // 「押しているのに何も起きない」が起きる——本人には理由が分からない。
    //
    // 走査中に限る。止まっているあいだは、支援者がキーボードで通常の
    // 操作（Tab移動・Enterでの決定）をしている場面なので、そこまで
    // 奪うと支援者の操作が壊れる。
    //
    // 修飾キー単独（Shift だけ等）と、修飾キー付き（Ctrl+R など）は除く。
    // 前者は「押した」と言えないし、後者はブラウザやOSの操作を潰す。
    // Escape は走査停止として先に処理済み。
    const modifierOnly =
      event.key === "Shift" ||
      event.key === "Control" ||
      event.key === "Alt" ||
      event.key === "Meta" ||
      event.key === "CapsLock" ||
      event.key === "NumLock" ||
      event.key === "ScrollLock" ||
      event.key === "Dead";
    const withModifier = event.ctrlKey || event.metaKey || event.altKey;
    if (
      ctx.scan.isRunning() &&
      !modifierOnly &&
      !withModifier &&
      event.key !== " " &&
      event.key !== "Enter" &&
      event.key !== "ArrowRight" &&
      event.key !== "Tab"
    ) {
      event.preventDefault();
      if (event.repeat) return; // 押しっぱなしの連続 keydown は無視する（§3.3）
      acceptSwitchEvent("keyboard");
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      // Tab移動でフォーカスした通常のボタン等はブラウザ本来の操作に任せる。
      // スタート／ゲーム／画面下部の入力面だけは同じ入力ファネルへ通す。
      const interactive = target?.closest?.("button, a[href], summary, [role='button']");
      const switchSurface =
        interactive === elements.primarySwitch ||
        interactive === elements.startStage ||
        interactive === elements.gameStage;
      if (interactive && !switchSurface) {
        if (event.repeat) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (event.repeat) return; // 押しっぱなしの連続 keydown は無視する（MUST, §3.3）
      acceptSwitchEvent("keyboard");
    }
    if (event.key === "ArrowRight" && state.currentView !== "game") {
      event.preventDefault();
      ctx.scan.step();
    }
  });

  // ゲーム中にタブが非アクティブ化したらセッションを中断して home へ直帰する
  // （detailed-design.md §2.4 終了条件3。計時汚染防止のため再開はしない）。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.currentView === "game") {
      ctx.gameHost.abort();
    }
  });

  window.addEventListener("resize", () => ctx.scan.refresh());

  /**
   * 支援者が文字を入力しているあいだは、入力ドックを画面から外す。
   *
   * ドックは画面下に position:fixed で居座る。スマホでソフトキーボードが
   * 出ると、キーボードの上へ持ち上がって残りの可視領域をさらに削る——
   * 参加者IDや観察メモを打っている支援者にとっては、いま打っている欄が
   * 見えなくなる（iPhone SE ではフォームの可視領域がほぼ消える）。
   *
   * ドックは利用者がスイッチで操作するためのものなので、支援者が
   * キーボードを使っている最中に要る場面がない。外して困る導線は無い。
   *
   * 判定にキーボードの表示状態ではなく「文字入力欄に焦点があるか」を使うのは、
   * 外付けキーボードや音声入力など、ソフトキーボードが出ない入力手段でも
   * 同じことが言えるため。走査エンジンには触れない（見た目だけの退避）。
   */
  const TEXT_ENTRY_SELECTOR = 'input[type="text"], input:not([type]), textarea';
  const syncTextEntryMode = () => {
    const active = document.activeElement;
    const typing = Boolean(active && active.matches?.(TEXT_ENTRY_SELECTOR));
    document.body.classList.toggle("text-entry", typing);
  };
  document.addEventListener("focusin", syncTextEntryMode);
  document.addEventListener("focusout", () => {
    // focusout は次の要素へ焦点が移る前に飛ぶので、確定してから見る。
    window.setTimeout(syncTextEntryMode, 0);
  });


  // --- 初期描画 ---
  ctx.renderAll();
  ctx.switchView(state.currentView);
}
