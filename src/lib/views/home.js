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
  SCAN_OVERLAP_TOLERANCE_PX,
  SCAN_PAGE_SIZE,
  SCAN_PAGE_SIZE_MIN,
  pageSlice,
  shouldPaginate,
} from "../scanPaging.js";
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
  // いま見せているページ（scanPaging.js）。画面が短いときだけ効く。
  // コーナーを移ったときと、ロビーへ戻ったときに 0 へ戻す——別の一覧の
  // ページ番号を持ち越すと、開いた瞬間に2ページ目が出る。
  let pageIndex = 0;
  // 実際に描いてみて入りきらなかった一覧は、以後この画面ではページに分ける。
  //
  // 画面高さのしきい値（scanPaging.js）は先読みの当てでしかない。タイルの
  // 高さは文言の折り返しで変わる（実測 80〜128px）ので、「この高さなら入る」
  // を定数で当てるのは無理がある——実際 iPhone 14 の 664px は分割されるのに、
  // 812px の縦長では分割されず、下2枚がドックの裏に隠れていた。
  // 当てが外れたら、描いた結果を見て直す。
  let overflowPaginate = false;
  // 1ページの件数。既定より減らすのは、ページ送りを入れてもなお入らない
  // 画面だけ（実測: 390x812 では3項目は入るが「つぎのページ」がはみ出した）。
  let pageSizeOverride = null;
  // 描き直しの回数。減らしても入らない画面で無限に回さないための止め。
  let refitPasses = 0;
  // 版面が落ち着いたか（Webフォントの読み込み待ち）。
  //
  // フォントが差し替わる前に測ると、そのときだけ数px高い値が出る。判定は
  // 一方向（分ける側）へしか倒さないので、その一瞬の値で latch すると
  // **本当は5枚入る iPad でも3枚に減ったまま**になる（実測で踏んだ:
  // 定常状態では 5px 余っているのに分割されていた）。
  // 落ち着くまでは判定しない。
  let layoutSettled = true;
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
    // 表示名は表記モードから引く（src/lib/i18n.js）。content.js の title は
    // 辞書に無いタイル（将来の追加）への保険として残す。
    const tileKey = tile.id || tile.view;
    const title = ctx.t(`tile.${tileKey}.title`);
    const hasEntry = title !== `tile.${tileKey}.title`;
    // 名前（読み上げ・aria-label）はプレーン文、画面はルビ付き。
    // ルビの記法をそのまま読み上げると「低ひくい」のように二重になる。
    const shown = hasEntry ? title : tile.title;
    const shownHtml = hasEntry ? ctx.tHtml(`tile.${tileKey}.title`) : tile.titleHtml || tile.title;
    button.setAttribute("aria-label", shown);
    const icon = tile.iconClass
      ? `<span class="tile-icon" aria-hidden="true"><i class="${tile.iconClass}"></i></span>`
      : "";
    // content.js の description（「おすと いろと おとが かわるよ」等）は
    // 利用者向けの言葉で書かれているのに、これまでどこからも読まれていなかった。
    //
    // 名前（aria-label）には混ぜない。名前は識別子なので短く保つべきで、
    // 走査のたびに説明まで読み上げると、選ぶための手がかりが埋もれる。
    // 説明は aria-describedby で別に渡す（VoiceOver は名前の後に少し置いてから
    // 読む）。
    //
    // 画面にも出す。以前は .sr-only で読み上げ経路にだけ流していたが、
    // 目で見て選ぶ利用者と、隣で見ている支援者には何も届いていなかった
    // （タイルは高さ145pxあって、名前1行だけで大半が空いていた）。
    // 出す先は同じ要素のままにしてある——文言の出どころを2つに割ると、
    // 画面と読み上げが食い違う。
    const translatedDesc = ctx.t(`tile.${tileKey}.desc`);
    const hasDescEntry = translatedDesc !== `tile.${tileKey}.desc`;
    const descText = hasDescEntry ? translatedDesc : tile.description;
    const descHtml = hasDescEntry
      ? ctx.tHtml(`tile.${tileKey}.desc`)
      : tile.descriptionHtml || tile.description;
    const descriptionId = descText ? `tile-desc-${tileKey}` : "";
    if (descriptionId) button.setAttribute("aria-describedby", descriptionId);
    const description = descriptionId
      ? `<span class="tile-description" id="${descriptionId}">${descHtml}</span>`
      : "";
    button.innerHTML = `
      <span class="scan-order" aria-hidden="true">${index + 1}</span>
      ${icon}
      <span class="tile-text">
        <strong>${shownHtml}</strong>
        ${description}
      </span>
      <span class="scan-current-label" aria-hidden="true">${ctx.t("home.scanning")}</span>
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
      title: ctx.t("home.back"),
      titleHtml: ctx.tHtml("home.back"),
      iconClass: "fa-solid fa-arrow-left",
    };
  }

  function nextPageTile(pageIndexShown, pageCount) {
    return {
      id: "scan-next-page",
      title: ctx.t("home.nextPage"),
      titleHtml: ctx.tHtml("home.nextPage"),
      description: ctx.t("home.pageOf", { n: pageIndexShown + 1, total: pageCount }),
      descriptionHtml: ctx.tHtml("home.pageOf", { n: pageIndexShown + 1, total: pageCount }),
      iconClass: "fa-solid fa-chevron-right",
    };
  }

  /**
   * 走査で選ぶ一覧を1つ描く。画面が短いときはページに分ける。
   *
   * ページに分ける理由は scanPaging.js に書いた——短い画面で全項目を並べると
   * 走査のたびに画面がスクロールし、「選ぶ」課題が「選ぶ＋動く画面を追う」
   * 課題に変わるため。利用者はスクロールを止められない。
   *
   * 4つの一覧（ロビー・リズム・さかなつり・まなぶ）が同じ規則で動くように、
   * 描画をここへ1本化してある。分岐ごとに forEach を書いていた頃は、
   * ページ分割を入れるとどこか1つ入れ忘れる形だった。
   */
  function renderScanList(items, onSelect) {
    const pageSize = pageSizeOverride ?? SCAN_PAGE_SIZE;
    const paginate =
      overflowPaginate ||
      shouldPaginate(
        typeof window !== "undefined" ? window.innerHeight : null,
        items.length,
        pageSize
      );
    const slice = paginate
      ? pageSlice(items, pageIndex, pageSize)
      : { visible: items, pageIndex: 0, pageCount: 1, nextPageIndex: 0 };
    // 範囲外だったページ番号は pageSlice が循環させて正規化する。持ち帰って
    // おかないと、次の描画でまた範囲外の値から始まる。
    pageIndex = slice.pageIndex;

    slice.visible.forEach((item, index) => {
      const button = createTileButton(item, index);
      button.addEventListener("click", (event) => {
        if (homeClickIsGuarded(event)) return;
        onSelect(item);
      });
      elements.gameTileGrid.append(button);
    });

    // 描いた結果が入りきらなかったら、ページに分けて描き直す。
    //
    // 走査対象がドックの裏に隠れると、利用者はそこへ到達できない（スクロールを
    // 自分で戻せないので、隠れた項目は選べないのと同じ）。しきい値の当てが
    // 外れる帯が実際にあった（390x812 で下2枚が隠れていた）ので、当てに頼らず
    // 現物で確かめる。分けた側は SCAN_PAGE_SIZE(3) 件なので、二度目は必ず入る
    // ——再帰は1回で止まる。
    if (slice.pageCount <= 1) {
      if (refitIfOverflowing(paginate, items.length, pageSize)) return;
      return;
    }

    // ページ送りは走査の輪の最後に置く。先頭に置くと、目的の項目より先に
    // 必ずページ送りが来て、1周のたびに送ってしまう危険がある。
    const pager = createTileButton(
      nextPageTile(slice.pageIndex, slice.pageCount),
      slice.visible.length
    );
    pager.classList.add("scan-pager");
    pager.addEventListener("click", (event) => {
      if (homeClickIsGuarded(event)) return;
      pageIndex = slice.nextPageIndex;
      renderTiles();
      scan.restartIfNeeded();
      announce(ctx.t("voice.pageOf", { n: slice.nextPageIndex + 1 }));
    });
    elements.gameTileGrid.append(pager);

    // ページ送りを足したあとで測る。実測では本体3項目は入るのに
    // 「つぎのページ」が 63px はみ出していた——送り自身も走査対象なので、
    // それが届かなければページを繰れない。
    refitIfOverflowing(paginate, items.length, pageSize);
  }

  /**
   * 描いた結果が入りきらなければ、条件を1段きつくして描き直す。
   *
   * 1段目: ページ分割していなければ分割する。
   * 2段目: 分割してもはみ出すなら、1ページの件数を1つ減らす（下限2件）。
   *
   * 走査対象がドックの裏に隠れると、利用者はそこへ到達できない
   * （スクロールを自分で戻せないので、隠れた項目は選べないのと同じ）。
   * @returns {boolean} 描き直したか
   */
  function refitIfOverflowing(paginate, itemCount, pageSize) {
    // フォント差し替え前の値で決めない（上の layoutSettled のコメント参照）。
    if (!layoutSettled) return false;
    if (!listOverflowsDock()) {
      refitPasses = 0;
      return false;
    }
    // 減らせる回数には限りがある。ここを無制限にすると、どうやっても
    // 入らない画面で描画が止まらなくなる。
    if (refitPasses >= 4) return false;

    if (!paginate && itemCount > SCAN_PAGE_SIZE_MIN) {
      refitPasses += 1;
      overflowPaginate = true;
      renderTiles();
      return true;
    }
    if (paginate && pageSize > SCAN_PAGE_SIZE_MIN) {
      refitPasses += 1;
      pageSizeOverride = pageSize - 1;
      renderTiles();
      return true;
    }
    return false;
  }

  /**
   * いま描いた走査対象が、入力ドックの裏へはみ出しているか。
   *
   * ドックは画面下に固定されているので、その上端より下にある項目は
   * 隠れている。利用者はスクロールを戻せないため、隠れた項目は
   * 「選べない項目が走査の輪に居る」ことになる。
   */
  function listOverflowsDock() {
    if (typeof document === "undefined") return false;
    const dock = document.querySelector(".switch-dock");
    const tiles = [...elements.gameTileGrid.querySelectorAll(".game-tile")];
    if (!dock || !tiles.length) return false;
    const dockRect = dock.getBoundingClientRect();
    // ドックが出ていない画面（高さ0）では判定材料にならない。
    if (dockRect.height <= 0) return false;
    // 数pxの重なりは「届かない」ではない。実測で 2px だけ重なる実寸があり
    // （スマホ横 844x390）、そこでページを分けると1周が伸びるだけだった。
    return tiles.some(
      (tile) => tile.getBoundingClientRect().bottom - dockRect.top > SCAN_OVERLAP_TOLERANCE_PX
    );
  }


  /**
   * 二階層目（コーナー）の見出し。
   *
   * ロビー側は最初から i18n を通していたのに、ここだけ日本語を直に書いて
   * いた——英語表記を選んでも見出しだけ日本語のまま、ルビも乗らない。
   * 3コーナーで同じことを3回書いていたのが、揃っていない原因でもある。
   */
  function renderCornerHeadings(corner) {
    elements.homeEyebrow.innerHTML = ctx.tHtml(`corner.${corner}.eyebrow`);
    elements.homeTitle.innerHTML = ctx.tHtml(`corner.${corner}.title`);
    elements.homeGuide.innerHTML = ctx.tHtml(`corner.${corner}.guide`);
  }

  /** 利用者ホームまたは二階層目を、同じ5項目以内の走査リストで描画する。 */
  function renderTiles() {
    elements.gameTileGrid.innerHTML = "";

    /** 二階層目から一覧へ戻る（コーナー共通）。 */
    function leaveCorner() {
      showLobby();
      renderTiles();
      scan.restartIfNeeded();
    }

    if (activeCorner === "rhythm") {
      renderCornerHeadings("rhythm");
      const cornerGames = ["rhythm-l1", "rhythm-l2", "gonogo"]
        .map(gameById)
        .filter(Boolean);
      renderScanList([...cornerGames, cornerBackTile()], (game) => {
        if (game.id === "home-back") leaveCorner();
        else ctx.gameHost.launch(game.id);
      });
      return;
    }

    if (activeCorner === "fishing") {
      renderCornerHeadings("fishing");
      const cornerGames = ["fishing", "fishing-gonogo"].map(gameById).filter(Boolean);
      renderScanList([...cornerGames, cornerBackTile()], (game) => {
        if (game.id === "home-back") leaveCorner();
        else ctx.gameHost.launch(game.id);
      });
      return;
    }

    if (activeCorner === "learning") {
      renderCornerHeadings("learning");
      renderScanList([...activityTiles, cornerBackTile()], (tile) => {
        if (tile.id === "home-back") leaveCorner();
        else ctx.switchView(tile.view);
      });
      return;
    }

    elements.homeEyebrow.innerHTML = ctx.tHtml("home.eyebrow");
    elements.homeTitle.innerHTML = ctx.tHtml("home.title");
    elements.homeGuide.innerHTML = ctx.tHtml("home.guide");
    const homeTiles = [
      gameById("color-legacy"),
      rhythmCornerTile,
      !state.settings.hideVisualTasks ? gameById("crane") : null,
      fishingCornerTile,
      learningCornerTile,
    ].filter(Boolean);

    /** 二階層目のコーナーへ入る。ページ番号は持ち越さない。 */
    function enterCorner(corner, spoken) {
      activeCorner = corner;
      pageIndex = 0;
      // 一覧が変われば入る枚数も変わる。前の一覧の判定を持ち越さない。
      overflowPaginate = false;
      pageSizeOverride = null;
      renderTiles();
      scan.restartIfNeeded();
      announce(spoken);
    }

    renderScanList(homeTiles, (game) => {
      if (game.id === "rhythm-corner") enterCorner("rhythm", ctx.t("voice.enterCorner", { name: ctx.t("corner.rhythm.title") }));
      else if (game.id === "fishing-corner") enterCorner("fishing", ctx.t("voice.enterCorner", { name: ctx.t("corner.fishing.title") }));
      else if (game.id === "learning-corner") enterCorner("learning", ctx.t("voice.enterCorner", { name: ctx.t("corner.learning.title") }));
      else ctx.gameHost.launch(game.id);
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
    announce(ctx.t("voice.start"));
    scan.restartIfNeeded();
  }

  elements.startSettingsLink.addEventListener("click", (event) => {
    event.stopPropagation(); // ファネルに入れない（走査対象外・タップ専用、§2.2）
    ctx.switchView("settings");
  });

  function showLobby() {
    activeCorner = null;
    overflowPaginate = false;
    pageSizeOverride = null;
    // ロビーへ戻るときもページ番号を落とす。持ち越すと、あそびを終えて
    // 戻ってきた瞬間に2ページ目が出ていて「さっき選んだものが無い」ことになる。
    pageIndex = 0;
  }

  // 画面の高さが変わるとページ分割の要否も変わる（横向きへの回転、
  // iOS Safari のツールバー伸縮、ソフトキーボードの表示）。分割が要る状態と
  // 要らない状態をまたいだときだけ描き直す——毎回描き直すと、走査中に
  // 現在位置が消える。
  // Webフォントが差し替わると行の高さが変わる。差し替わってから測り直す。
  if (typeof document !== "undefined" && document.fonts && document.fonts.status !== "loaded") {
    layoutSettled = false;
    document.fonts.ready.then(() => {
      layoutSettled = true;
      if (state.currentView !== "home") return;
      // **収まっているなら描き直さない。**
      //
      // 無条件に描き直していたときは、利用者が押そうとしているタイルが
      // その瞬間に差し替わって、押下が宙に浮いた（掴んだ要素が DOM から
      // 外れる）。フォントが温まっている2回目以降の読み込みでは起きず、
      // 初回だけ起きるので、単体で試すと再現しない——スモークが実寸を
      // 変えるたびに新しいコンテキストを作るので、そこで捕まった。
      //
      // ここで描き直す必要があるのは、フォントが変わって入らなくなった
      // ときだけ。
      if (!listOverflowsDock()) return;
      renderTiles();
      scan.restartIfNeeded();
    });
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const shortScreen = window.matchMedia("(max-height: 740px)");
    const onChange = () => {
      if (state.currentView !== "home") return;
      pageIndex = 0;
      // 画面の高さが変わったら入る枚数も変わる。判定をやり直す。
      overflowPaginate = false;
      pageSizeOverride = null;
      renderTiles();
      scan.restartIfNeeded();
    };
    if (typeof shortScreen.addEventListener === "function") {
      shortScreen.addEventListener("change", onChange);
    }
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
