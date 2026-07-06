// =====================================================================
// views/home.js — スタート画面＋アプリ選択（旧 views/switcher.js の後継）
//
// detailed-design.md §2.2（スタート画面）・§2.3（アプリ選択画面）。
// 旧 views/switcher.js の「色変化」ゲーム本体は games/colorLegacy.js へ
// ゲーム契約（§3.1）としてラップして移植した（別コミット）。本ファイルは
// スタート導線（AudioContext アンロック・確認音・home 遷移）と
// アプリ選択（ゲームタイル＋「まなぶ・つたえる」タイルの描画）だけを担う。
// =====================================================================

import { gameModules } from "../games/registry.js";
import { activityTiles, cueTones } from "../content.js";

export function initHome(ctx) {
  const { state, elements, save, announce, logEvent, scan } = ctx;

  /** タイルボタンの共通生成（ゲーム・アクティビティ兼用）。装飾（アイコン・
      アクセント色）は content.js の純粋データを CSS 変数経由で styles.css の
      .game-tile に渡す。 */
  function createTileButton(tile) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "module-button game-tile";
    button.dataset.scan = "";
    if (tile.accent) button.style.setProperty("--tile-accent", tile.accent);
    if (tile.accentSoft) button.style.setProperty("--tile-accent-soft", tile.accentSoft);
    const icon = tile.icon ? `<span class="tile-icon" aria-hidden="true">${tile.icon}</span>` : "";
    button.innerHTML = `${icon}<strong>${tile.title}</strong><span>${tile.description}</span>`;
    return button;
  }

  /** ゲームタイルグリッドの描画（§2.3）。enabled:false は「じゅんびちゅう」表示＋走査除外。 */
  function renderTiles() {
    elements.gameTileGrid.innerHTML = "";
    gameModules.forEach((game) => {
      const button = createTileButton(game);

      if (game.enabled === false) {
        // disabled 属性を立てると scan.refresh() のフィルタ（!target.disabled）から
        // 自動的に除外される（detailed-design.md §2.3）。
        button.disabled = true;
        button.innerHTML = `${button.querySelector(".tile-icon")?.outerHTML || ""}<strong>${game.title || "じゅんびちゅう"}</strong><span>じゅんびちゅう</span>`;
      } else {
        button.addEventListener("click", () => {
          ctx.gameHost.launch(game.id);
        });
      }

      elements.gameTileGrid.append(button);
    });
  }

  /** 「まなぶ・つたえる」タイルの描画。旧タブのマッチング/VOCA/文字学習は
      利用者向けアクティビティなのでホームから入る（タブバーは支援者機能のみ）。
      ゲーム契約には乗せず、既存ビューへ switchView() で遷移するだけ。 */
  function renderActivityTiles() {
    elements.activityTileGrid.innerHTML = "";
    activityTiles.forEach((tile) => {
      const button = createTileButton(tile);
      button.dataset.view = tile.view;
      button.addEventListener("click", () => {
        ctx.switchView(tile.view);
      });
      elements.activityTileGrid.append(button);
    });
  }

  /**
   * スタート画面の1押し処理（detailed-design.md §2.2）。
   * AudioContext アンロック＋確認音（880Hz）＋ログ記録＋home 遷移＋announce。
   * この1押しは L0（反応確認）を兼ねるため logEvent({type:"switch"}) を記録する。
   */
  function leaveStart(/* t */) {
    if (state.currentView !== "start") return;
    ctx.audio.unlock();
    ctx.audio.playTone(cueTones.high);
    logEvent({ type: "switch", label: "スタート" });
    state.currentView = "home";
    save();
    ctx.renderAll();
    announce("はじめます");
    scan.restartIfNeeded();
  }

  elements.startSettingsLink.addEventListener("click", (event) => {
    event.stopPropagation(); // ファネルに入れない（走査対象外・タップ専用、§2.2）
    ctx.switchView("settings");
  });

  return {
    render() {
      renderTiles();
      renderActivityTiles();
    },
    leaveStart,
  };
}
