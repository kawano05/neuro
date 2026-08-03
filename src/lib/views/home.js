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
import {
  activityTiles,
  cueTones,
  fishingCornerTile,
  learningCornerTile,
  rhythmCornerTile,
} from "../content.js";

export function initHome(ctx) {
  const { state, elements, save, announce, logEvent, scan } = ctx;
  let activeCorner = null;
  let blockNextHomeClick = false;
  let homeClickGuardTimer = null;
  let postStartClickListenerAttached = false;

  function gameById(id) {
    return gameModules.find((game) => game.id === id);
  }

  /** 走査順が視覚的にも分かる、横長アクティビティ行を生成する。 */
  function createTileButton(tile, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "module-button game-tile";
    button.dataset.scan = "";
    button.dataset.tileId = tile.id || tile.view;
    if (tile.view) button.dataset.view = tile.view;
    button.setAttribute("aria-label", tile.title);
    const icon = tile.iconClass
      ? `<span class="tile-icon" aria-hidden="true"><i class="${tile.iconClass}"></i></span>`
      : "";
    button.innerHTML = `
      <span class="scan-order" aria-hidden="true">${index + 1}</span>
      ${icon}
      <strong>${tile.title}</strong>
      <span class="scan-current-label" aria-hidden="true">いま えらんでいます</span>
    `;
    return button;
  }

  function homeClickIsGuarded(event) {
    if (!blockNextHomeClick) return false;
    clearStartInputGuard();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function armStartInputGuard() {
    blockNextHomeClick = true;
    if (!postStartClickListenerAttached) {
      window.addEventListener("click", interceptPostStartClick, true);
      postStartClickListenerAttached = true;
    }
    if (homeClickGuardTimer) window.clearTimeout(homeClickGuardTimer);
    homeClickGuardTimer = window.setTimeout(clearStartInputGuard, 500);
  }

  function interceptPostStartClick(event) {
    if (!blockNextHomeClick) return;
    const fellThroughToHome = event.target instanceof Element
      ? event.target.closest("#gameTileGrid .game-tile")
      : null;
    clearStartInputGuard();
    if (!fellThroughToHome) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function clearStartInputGuard() {
    blockNextHomeClick = false;
    if (postStartClickListenerAttached) {
      window.removeEventListener("click", interceptPostStartClick, true);
      postStartClickListenerAttached = false;
    }
    if (homeClickGuardTimer) {
      window.clearTimeout(homeClickGuardTimer);
      homeClickGuardTimer = null;
    }
  }

  function cornerBackTile() {
    return {
      id: "home-back",
      title: "アクティビティへ もどる",
      iconClass: "fa-solid fa-arrow-left",
    };
  }

  /** 利用者ホームまたは二階層目を、同じ5項目以内の走査リストで描画する。 */
  function renderTiles() {
    elements.gameTileGrid.innerHTML = "";

    if (activeCorner === "rhythm") {
      elements.homeEyebrow.textContent = "Rhythm";
      elements.homeTitle.textContent = "リズム";
      elements.homeGuide.textContent = "おとの アクティビティを えらびます";
      const cornerGames = ["rhythm-l1", "rhythm-l2", "gonogo"]
        .map(gameById)
        .filter(Boolean);
      [...cornerGames, cornerBackTile()].forEach((game, index) => {
        const button = createTileButton(game, index);
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          if (game.id === "home-back") {
            showLobby();
            renderTiles();
            scan.restartIfNeeded();
          } else {
            ctx.gameHost.launch(game.id);
          }
        });
        elements.gameTileGrid.append(button);
      });
      return;
    }

    if (activeCorner === "fishing") {
      elements.homeEyebrow.textContent = "Fishing";
      elements.homeTitle.textContent = "さかなつり";
      elements.homeGuide.textContent = "つりかたを えらびます";
      const cornerGames = ["fishing", "fishing-gonogo"].map(gameById).filter(Boolean);
      [...cornerGames, cornerBackTile()].forEach((game, index) => {
        const button = createTileButton(game, index);
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          if (game.id === "home-back") {
            showLobby();
            renderTiles();
            scan.restartIfNeeded();
          } else {
            ctx.gameHost.launch(game.id);
          }
        });
        elements.gameTileGrid.append(button);
      });
      return;
    }

    if (activeCorner === "learning") {
      elements.homeEyebrow.textContent = "Learn & communicate";
      elements.homeTitle.textContent = "まなぶ・つたえる";
      elements.homeGuide.textContent = "アクティビティを えらびます";
      [...activityTiles, cornerBackTile()].forEach((tile, index) => {
        const button = createTileButton(tile, index);
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          if (tile.id === "home-back") {
            showLobby();
            renderTiles();
            scan.restartIfNeeded();
          } else {
            ctx.switchView(tile.view);
          }
        });
        elements.gameTileGrid.append(button);
      });
      return;
    }

    elements.homeEyebrow.textContent = "Home";
    elements.homeTitle.textContent = "アクティビティ";
    elements.homeGuide.textContent = "やりたいことを えらびます";
    const homeTiles = [
      gameById("color-legacy"),
      rhythmCornerTile,
      !state.settings.hideVisualTasks ? gameById("crane") : null,
      fishingCornerTile,
      learningCornerTile,
    ].filter(Boolean);

    homeTiles.forEach((game, index) => {
      const button = createTileButton(game, index);
      if (game.id === "rhythm-corner") {
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          activeCorner = "rhythm";
          renderTiles();
          scan.restartIfNeeded();
          announce("リズムを えらびます");
        });
      } else if (game.id === "fishing-corner") {
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          activeCorner = "fishing";
          renderTiles();
          scan.restartIfNeeded();
          announce("さかなつりを えらびます");
        });
      } else if (game.id === "learning-corner") {
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          activeCorner = "learning";
          renderTiles();
          scan.restartIfNeeded();
          announce("まなぶ・つたえるを えらびます");
        });
      } else {
        button.addEventListener("click", (event) => {
          if (homeClickIsGuarded(event)) return;
          ctx.gameHost.launch(game.id);
        });
      }
      elements.gameTileGrid.append(button);
    });
  }

  /**
   * スタート画面の1押し処理（detailed-design.md §2.2）。
   * AudioContext アンロック＋確認音（880Hz）＋ログ記録＋home 遷移＋announce。
   * この1押しは L0（反応確認）を兼ねるため logEvent({type:"switch"}) を記録する。
   */
  function leaveStart(/* t */) {
    if (state.currentView !== "start") return;
    // pointerdown で画面が切り替わった直後、同じ物理操作の pointerup/click が
    // 新しく現れたホーム行へ落ちるのを防ぐ。入力ファネルのdedupeを通らない
    // 通常ボタンのclickにも効く、画面遷移側のガード。
    armStartInputGuard();
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

  function showLobby() {
    activeCorner = null;
  }

  return {
    render() {
      renderTiles();
    },
    leaveStart,
    clearStartInputGuard,
    showLobby,
  };
}
