// =====================================================================
// content.js — 教材・タスク・研究条件などの「中身」の定義（純粋データ）
//
// アプリのロジックには依存しない。教材の追加・差し替え・ゲーム化は
// 原則このファイル（と対応するビュー）だけを触ればよい。
// 打合せ（2026-04-20）で挙がったゲーム（鬼退治・回転寿司・お絵描き音階など）を
// 追加する場合は switchModules に新モジュールを足すのが起点になる。
// =====================================================================

/**
 * localStorage の保存キー。取得済みv3研究データを孤立させないため、ゲーム拡張時も
 * キーは据え置き、state.js 内で rhythm.sessions → sessions を移送する。
 *
 * v2 → v3（P0-0, detailed-design.md §9.5）: 起動経路を src/lib 分割版に一本化した
 * ことに伴うバンプ。旧キー（v2: "neuronode-prototype-state-v2"、
 * v1: "neuro-trainer-state-v1"）は state.js の loadState() が v3 未保存時にのみ
 * 読み、settings・logs・evaluation を移行する。旧キー自体は削除しない。
 */
export const storageKey = "neuronode-prototype-state-v4";

/**
 * スイッチ教材モジュールの一覧（現状 "color" の1件のみ）。
 * 旧 views/switcher.js の選択UIはゲーム基盤への移行に伴い削除し、
 * この "color" データは games/colorLegacy.js（アプリ選択の「いろがかわる」
 * タイル、content.js の gameTiles 参照）が読み込む。
 */
export const switchModules = [
  {
    id: "color",
    name: "色変化",
    description: "入力すると画面の色が変わります。",
    tones: [392, 440, 494, 523],
  },
];

/** スイッチ教材ステージの背景色サイクル */
export const stageColors = ["#0f8b8d", "#2f8f5b", "#315c9c", "#7a8f1f", "#c04747"];

/** 色と音の通常セッション。効果測定の「スイッチ教材を5回入力」と同じ長さ。 */
export const colorLegacyPreset = {
  targetPresses: 5,
};

/**
 * ゲームタイル（アプリ選択画面の表示に使う純粋データ）。detailed-design.md §4.1。
 *
 * ロジックを持つ create はここには置かない。games/registry.js が
 * このタイル情報と各ゲームの create(ctx) を結合して GameModule（契約は
 * detailed-design.md §3.1）の配列を組み立てる。
 *
 * 将来のテーマスキン（寿司・鬼等。基本設計書 §2.2 の非スコープ）用の口として、
 * 各タイルへ `skin`（例: "sushi" | "oni" | null）フィールドを追加できる構造に
 * してある。本リファクタでは skin フィールド自体を追加しない（未実装）。
 */
export const gameTiles = [
  // iconClass は Font Awesome Free の統一アイコン。製品アイコンに絵文字を
  // 使わず、年齢を限定しない視覚言語に揃える。
  { id: "color-legacy", taskType: null, resultType: "completion", title: "いろと おと", description: "5かい おして いろと おとを かえよう", order: 1, enabled: true, iconClass: "fa-solid fa-palette" },
  { id: "slot-l1", taskType: "slot", title: "ひとつ とめる", description: "おなじ えが まんなかに きたら おそう", order: 2, enabled: true, visualRequired: true, iconClass: "fa-solid fa-circle-stop" },
  { id: "slot-l2", taskType: "slot", title: "3つ とめる", description: "3つの リールを じゅんばんに とめよう", order: 3, enabled: true, visualRequired: true, iconClass: "fa-solid fa-bars-staggered" },
  { id: "gonogo", taskType: "gonogo", title: "たかいおとだけ", description: "たかいおとのとき だけ おそう", order: 4, enabled: true, iconClass: "fa-solid fa-bell" },
  { id: "crane", taskType: "scan", title: "アームを とめる", description: "がめんを みて アームを とめよう", order: 5, enabled: true, visualRequired: true, iconClass: "fa-solid fa-hand" },
  // さかなつりは2種類ある。どちらも反応時間を測るが、測っているものが違う:
  //   fishing        … 純粋な単純反応時間。アタリ音は1種類だけで、迷う要素がない
  //   fishing-gonogo … そこに No-Go（長靴の低音）を混ぜた抑制つきの反応時間
  // 以前は1つのゲームに fakeRatio を持たせていたため、taskType は "rt"
  // （単純反応時間）なのに実体は Go/No-Go 課題という食い違いがあり、
  // 「この課題で何を測ったか」を書けなかった。ロビーでは「さかなつり」の
  // コーナー（fishingCornerTile）にまとめ、二階層目でどちらかを選ぶ。
  { id: "fishing", taskType: "rt", title: "アタリで つる", description: "おとが なったら すぐ おそう", order: 6, enabled: true, iconClass: "fa-solid fa-fish" },
  { id: "fishing-gonogo", taskType: "rt", title: "さかなだけ つる", description: "ながぐつの ときは おさない", order: 7, enabled: true, iconClass: "fa-solid fa-fish-fins" },
  { id: "calibration", taskType: "sms", title: "そくてい", description: "しえんしゃと いっしょに つかいます", order: 8, enabled: true, iconClass: "fa-solid fa-stopwatch" },
];

/** 視覚タイミング課題2種をまとめる二階層目への入口。 */
export const slotCornerTile = {
  id: "slot-corner",
  title: "リールを とめる",
  description: "ひとつ または 3つの えを とめよう",
  iconClass: "fa-solid fa-circle-stop",
};

/** UFOキャッチャー（ふつう / エンドレス）をまとめる二階層目への入口。 */
export const craneCornerTile = {
  id: "crane-corner",
  title: "アームで つかむ",
  description: "2つの あそびかたから えらぶ",
  iconClass: "fa-solid fa-hand",
};

/**
 * エンドレスの選択肢。
 *
 * gameTiles とは別に持つ。エンドレスは**遊び方**であって別の課題ではない
 * ——同じ gameId・同じ taskType で走り、記録は session.config.endless で
 * 区別する。ここに新しい gameId を足すと、taskType の判定・成立確認の材料・
 * そくていの protocol まで枝分かれし、「同じ課題の別の遊び方」という事実が
 * コードから消える。
 *
 * launch は gameId と { endless: true } を渡す（games/gameHost.js）。
 */
export const endlessTiles = [
  {
    id: "crane-endless",
    gameId: "crane",
    title: "ずっと とめる",
    description: "つづけるほど むずかしくなる",
    iconClass: "fa-solid fa-infinity",
    visualRequired: true,
  },
  {
    id: "fishing-endless",
    gameId: "fishing",
    title: "ずっと つる",
    description: "つづけるほど むずかしくなる",
    iconClass: "fa-solid fa-infinity",
  },
];

/** さかなつり2種（純粋な反応時間 / 抑制つき）をまとめる二階層目への入口。 */
export const fishingCornerTile = {
  id: "fishing-corner",
  title: "さかなつり",
  description: "2つの つりかたから えらぶ",
  iconClass: "fa-solid fa-fish",
};

/** 学習・コミュニケーション系を1つの走査項目へまとめる入口。 */
export const learningCornerTile = {
  id: "learning-corner",
  title: "まなぶ・つたえる",
  description: "3つの アクティビティから えらぶ",
  iconClass: "fa-solid fa-book-open-reader",
};

/**
 * 学習・コミュニケーション系タイル（ホームの「まなぶ・つたえる」セクション）。
 * 旧タブのマッチング/VOCA/文字学習は利用者向けアクティビティなので、支援者
 * 機能のタブバーからホームのタイルへ移した。ゲーム契約（§3.1）には乗せず、
 * view は既存の .view セクション id（switchView() の引数）をそのまま指す。
 * 見た目のフィールド構成は gameTiles と同じ（views/home.js が共通処理で描画）。
 */
export const activityTiles = [
  { view: "matching", title: "マッチング", description: "おだいに あうものを えらぼう", iconClass: "fa-solid fa-puzzle-piece" },
  { view: "voca", title: "VOCA", description: "ことばを えらんで つたえよう", iconClass: "fa-solid fa-comments" },
  { view: "letters", title: "文字学習", description: "もじを よんで えらぼう", iconClass: "fa-solid fa-pen" },
];

/**
 * リズム系ゲームのプリセット値（bpm・カウントイン拍数・目標ビート数等）。
 * detailed-design.md §4.1 / §7.1。state.settings 側の同名値（null 以外）が
 * 優先される（games/rhythm.js が優先順位を解決する。P2-3 で実装）。
 *
 * mode: "cued"（L1・キャリブレーション、時報→高音1回）/
 *       "continuous"（L2、カウントインは最初の1回のみで以後は毎拍が高音）/
 *       "gonogo"（高音Go・低音No-GoをgoRatioで擬似乱数配列、P4-1〜P4-2）。
 * excludedTrialCount: キャリブレーション専用（detailed-design.md §8.2）。
 * 最初のN試行を集計から除外する（記録はする）。games/rhythm.js の
 * resolveParams() がここから読み、gameId 分岐をエンジン側に持ち込まずに
 * 済ませている（データ駆動、P4-3）。他ゲームは undefined（=0扱い）。
 */
/**
 * ここは**れんしゅう（訓練）の既定値**。そくていの回は
 * src/lib/difficultyMode.js の MEASUREMENT_PROTOCOL が優先し、この値は使わない。
 * 訓練の都合で調整しても、測定の条件は動かない——2つを分けてある理由がこれ。
 *
 * 経緯（実測で分かったこと）:
 *   旧値は l1=40bpm/3/10、l2=60bpm/4/20 で、段階になっていなかった。
 *     - l1 は 10回押すのに 68秒（入力密度 0.148回/秒）
 *     - l2 は 20回を 24秒（0.833回/秒）——**隣の段で密度が5.6倍**に跳ぶ
 *     - gonogo は 0.435回/秒 で、l2 より運動負荷が**低い**（0.52倍）
 *   これは1本の階段ではなく、負荷軸の違う課題を順番に置いただけだった。
 *
 * 直し方:
 *   テンポを 50 に揃えて、段のあいだで変わるのを**課題の構造だけ**にした。
 *   テンポが段ごとに違うと、難しくなったのが構造のせいかテンポのせいか
 *   分からない。そのうえで l1 を短くし（68秒→34秒）、密度の跳ねを
 *   5.6倍から2.8倍へ縮めた。
 *
 * 段の意味（軸が違うことを明示しておく。1本の軸ではない）:
 *   l1     … 予告のある1回を当てる。運動負荷いちばん低い（0.24回/秒）
 *   l2     … 連続する拍に合わせつづける。**運動軸**を上げる（0.67回/秒）
 *   gonogo … 押す/見送るを分ける。**認知軸**を上げる。運動負荷は l2 より
 *            低い（0.43回/秒）——押さない試行があるので当然で、
 *            2つの軸を同時に上げないための設計でもある
 */
export const rhythmPresets = {
  "rhythm-l1": { bpm: 50, countInBeats: 2, targetBeats: 8, mode: "cued" },
  "rhythm-l2": { bpm: 50, countInBeats: 4, targetBeats: 16, mode: "continuous" },
  gonogo: { bpm: 50, countInBeats: 3, targetBeats: 20, mode: "gonogo", goRatio: 0.6 },
  // キャリブレーションは測定手順そのもので、訓練の都合では動かさない
  // （games/rhythm.js の PROTOCOL_LOCKED_GAME_IDS）。
  //
  // mode="continuous" である理由（cued から変更。scripts/probes/probe-calibration-mode.mjs）:
  //
  //   cued は毎回カウントインでリセットするので、連続同期の中心である位相修正の
  //   連鎖が試行ごとに切れる。切れると各試行は独立になり、「拍を予測して押した
  //   試行」と「高音を聞いてから反応した試行」が同じ分布に混ざる——両者は
  //   平均で 300ms 以上違うので、混合比が変わるだけで中央値が動く。
  //
  //   推定量の偏り（真値 μ=-60ms、運動SD 45ms、有効試行10のモデル）:
  //     反応押し 10% → +7ms / 20% → +20ms / 30% → +46ms / 50% → +146ms
  //   10試行では二峰性を検定できないので、**データを見ても気づけない**。
  //   そしてこの値は baselineOffsetMs として全セッションの判定窓中心に効く。
  //
  //   continuous は連鎖が切れないため予測押しの一様な状態に落ち着き、混合が
  //   起きない（上のモデルで偏り 0.2ms）。代償は位相修正過程の自己相関ぶんの
  //   分散増（sd 16.7ms → 28.1ms）だが、これは拍数で減らせる（有効24拍で
  //   23.7ms）。偏りは検出も補正もできず、分散は増やせば減る。
  //
  //   ついでに1回が短くなる: cued 12試行 = 93.6秒 → continuous 24拍 = 33.6秒。
  //   有効試行はむしろ 10 → 20 に増える。
  //
  // excludedTrialCount=4 は、位相修正が定常に落ち着くまでの立ち上がりを
  // 捨てるため（cued の 2 は「最初の数試行は手順に慣れていない」という別の
  // 理由だった）。カウントイン直後の数拍は初期偏差を引きずる。
  calibration: { bpm: 50, countInBeats: 4, targetBeats: 24, mode: "continuous", excludedTrialCount: 4 },
};

/**
 * スロット型逐次停止課題 slot-v1 の既定値。
 * L1/L2で周期と許容幅を揃え、難度差をリール数（入力系列）だけに限定する。
 */
export const slotPresets = {
  "slot-l1": {
    reelCount: 1,
    symbolCount: 6,
    cycleMs: 3200,
    toleranceMs: 220,
    rounds: 8,
    maxCyclesPerReel: 4,
    seed: "slot-measure-01",
  },
  "slot-l2": {
    reelCount: 3,
    symbolCount: 6,
    cycleMs: 3200,
    toleranceMs: 220,
    rounds: 4,
    maxCyclesPerReel: 4,
    seed: "slot-measure-01",
  },
};

/**
 * UFOキャッチャーのパラメータ。
 *
 * 床は 0..100 × 0..100 の正方形として定義し、games/crane.js が透視投影して
 * 台形に描く。x と y が床の上で同じ長さを表すので、toleranceR は
 * 「床の一辺の何％ぶんの半径か」という等方な量になる（以前は盤面が横長の
 * 長方形で、x の1%と y の1%が別の長さだったため、許容円が画面上では
 * 横に潰れた楕円になっていた）。
 *
 * graspAnimMs は state.js の scan スキーマが持つ値なので残しているが、
 * 掴みの演出は降下・把持・上昇・搬送に分かれていて、その内訳は
 * games/crane.js の定数側にある。
 */
export const cranePresets = {
  /**
   * 既定の難度。支援者は設定画面から変えられる（state.settings の
   * craneSweepMs / craneToleranceR が null 以外ならそちらが優先。
   * games/crane.js の resolveCraneConfig）。
   *
   * 床の1目盛は sweepMs/100 ミリ秒にあたるので、要求する時間精度は
   * 「grip 圏の半径 × sweepMs/100」。既定では各軸 ±165ms になる。
   *
   * 経緯: もとは 2400ms / 12（±144ms）。狙いの手がかり——床に描いた走査線、
   * 掴める範囲のリング、目標を通過したときの音——を入れたぶん素の難度が
   * 下がったと見て 2000ms / 10（±100ms）まで詰めたが、実際に遊ぶときつすぎた。
   * 11 でも 13 でもまだ狭く、この 15 で落ち着いている。手がかりを足したことは
   * 「狙いを定めやすくなった」であって「押す時刻を合わせやすくなった」では
   * なかった、というのがずれの中身。
   *
   * toleranceR 15 は grip 圏の半径が 7.5 で、画面上のリングが景品より
   * ひとまわり大きくなる（床の中央あたりで景品81pxに対しリング97px）。
   * 「景品に乗せられたら取れる」が絵のまま成り立つので、数値としてだけでなく
   * 手がかりとしても分かりやすい。
   *
   * 走査を速くするのと許容を狭くするのは要求精度としては等価だが、速くすると
   * 視覚追従そのものが辛くなり、訓練したい「狙って押す」以外のところで詰まる。
   * だから難度は許容側で決める。速度を 2400 から下げているのは難度ではなく、
   * 片道2.4秒＝往復4.8秒という待ちの長さを縮めるため。
   */
  sweepMs: 2200,
  toleranceR: 15,
  targetTrials: 5,
  graspAnimMs: 1200,
  /**
   * 続けて掴めなかったときに許容半径を一時的に広げる段数と、1段あたりの
   * 増分（games/craneGeometry.js の assistedToleranceR）。掴めたら 0 に戻る。
   *
   * 既定では toleranceR が 15 → 20.25 → 25.5 と広がり、要求精度は各軸
   * ±165ms → ±223ms → ±281ms。狙って押すこと自体が訓練の対象である
   * 利用者にとって、0/5 が続くと「何をしても同じ」になって課題として
   * 成立しないので、外した回数ぶんだけ一時的に緩める。
   *
   * 実際に適用した値は各試行の toleranceR として記録され、走査CSV にも
   * 出る（views/evaluation.js）。素の難度で測りたいときは
   * assistMaxSteps を 0 にする（state.js の scan スキーマは既定の5キーしか
   * 保持しないので、セッションの config には残らない。効いたかどうかは
   * 試行ごとの toleranceR を見る）。
   */
  assistMaxSteps: 2,
  assistStepRatio: 0.35,
};

/**
 * 取れる景品。asset は src/assets/crane/<asset>.png に対応する。
 * label は読み上げにもそのまま渡すので、ひらがな主体で記号を入れない。
 */
export const cranePrizes = [
  { id: "bear", asset: "prize-bear", label: "くまさん" },
  { id: "rabbit", asset: "prize-rabbit", label: "うさぎさん" },
  { id: "star", asset: "prize-star", label: "おほしさま" },
];

/**
 * さかなつりのパラメータ。
 *
 * 課題としては従来どおり「変動前刺激間隔つき単純反応時間課題」で、測るのは
 * アタリ音から入力までの反応時間（taskType: "rt"）。見た目を釣りゲームに
 * したあとも、判定と記録の仕組み（games/reaction.js の judgeReaction /
 * generateForeperiods）は変えていない。
 *
 * 魚は「アタリ音が鳴る瞬間にちょうど糸の真下へ来る」ように泳ぐ。つまり
 * 画面は音のキューを目でも追えるようにした表現であって、判定は音の時刻
 * （cueMs）基準のまま。音を聴かずに画面だけを見ても遊べるが、画面を見ずに
 * 音だけでも遊べる——という両立を崩さないための設計。
 *
 * sessionMs: 1ゲームの長さ。試行数ではなく時間で区切る（1分）。実際の
 * 試行数は mount() 時に前刺激間隔の乱数から決まり、config.targetTrials へ
 * 実数を書き込む（state.js の sanitizeReactionSession が
 * trials.length === targetTrials を完走判定に使うため、ここがずれると
 * 全セッションが中断扱いになる）。
 */
export const fishingPresets = {
  // 純粋な単純反応時間。アタリ音は1種類だけで、押すか押さないかの判断は無い。
  fishing: {
    foreperiodMinMs: 1800,
    foreperiodMaxMs: 4200,
    limitMs: 2000,
    sessionMs: 60_000,
    fakeRatio: 0,
    approachMs: 1800,
    exitMs: 700,
  },
  // 抑制つき。低音（長靴）では押さずに待つ必要がある。
  "fishing-gonogo": {
    foreperiodMinMs: 1800,
    foreperiodMaxMs: 4200,
    limitMs: 2000,
    sessionMs: 60_000,
    fakeRatio: 0.22,
    approachMs: 1800,
    exitMs: 700,
  },
};

/**
 * 釣れる魚の種類。lengthCm の範囲は見た目の大きさと釣り合わせてある。
 * weight は出現比。asset は src/assets/fishing/fish-<asset>.png に対応する。
 */
export const fishingSpecies = [
  { id: "small", asset: "small", label: "こざかな", minCm: 8, maxCm: 16, weight: 0.45 },
  { id: "medium", asset: "medium", label: "さかな", minCm: 18, maxCm: 30, weight: 0.38 },
  { id: "large", asset: "large", label: "おおもの", minCm: 32, maxCm: 48, weight: 0.17 },
];

/**
 * 各あそびの「やりかた」。ゲーム開始前に出す説明（views は持たず、
 * games/gameHost.js のレディ画面が読む純粋データ）。
 *
 * なぜ要るか: タイルを押すと即座に音が鳴りはじめ、何をする課題なのかを
 * 説明する場所がどこにも無かった。とくに gonogo（高音は押す・低音は
 * 見送る）は、ルールを知らなければ音だけから推測できない。
 *
 * なぜ画面内ではなく開始前なのか: 課題の最中に視覚で手順を出すと、それが
 * 拍のキューとして働いて聴覚キューに対する入力という測定の前提を崩す
 * （basic-design.md §6・§1.2）。開始前なら計測は始まっていないので、
 * 視覚をいくら使っても測定に影響しない。
 *
 * ここに id が無いゲームはレディ画面を出さず、従来どおり即開始する
 * （gameHost.js renderReady の呼び分け）。
 *
 * 中身は文言そのものではなく src/lib/i18n.js のキー。表記（漢字／ひらがな／
 * 英語）は設定で変わるので、文字列をここに置くと表記の切り替えが効かない。
 * 実際の文言と、その書き方の決まり（ひらがな主体・1行1動作・記号や英字を
 * 入れない。読み上げにもそのまま渡すため）は i18n.js 側に置いてある。
 */
export const gameHowTo = {
  "color-legacy": ["howto.color-legacy.1", "howto.color-legacy.2"],
  "slot-l1": ["howto.slot-l1.1", "howto.slot-l1.2", "howto.slot-l1.3"],
  "slot-l2": ["howto.slot-l2.1", "howto.slot-l2.2", "howto.slot-l2.3"],
  gonogo: ["howto.gonogo.1", "howto.gonogo.2"],
  calibration: ["howto.calibration.1", "howto.calibration.2", "howto.calibration.3"],
  crane: ["howto.crane.1", "howto.crane.2", "howto.crane.3", "howto.crane.4"],
  fishing: ["howto.fishing.1", "howto.fishing.2", "howto.fishing.3", "howto.fishing.4"],
  "fishing-gonogo": [
    "howto.fishing-gonogo.1",
    "howto.fishing-gonogo.2",
    "howto.fishing-gonogo.3",
    "howto.fishing-gonogo.4",
    "howto.fishing-gonogo.5",
  ],
};

/** 聴覚キューの周波数（Hz）。detailed-design.md §4.1 / §6.4。 */
export const cueTones = { low: 440, high: 880, noGo: 330, hit: 660, miss: 220 };

/** マッチング教材の出題 */
export const matchingTasks = [
  {
    prompt: "赤いものを選んでください",
    answer: "りんご",
    options: [
      { label: "りんご", visual: "circle red" },
      { label: "そら", visual: "square blue" },
      { label: "はっぱ", visual: "triangle green" },
      { label: "ゆき", visual: "circle white" },
    ],
  },
  {
    prompt: "丸い形を選んでください",
    answer: "まる",
    options: [
      { label: "しかく", visual: "square teal" },
      { label: "さんかく", visual: "triangle yellow" },
      { label: "まる", visual: "circle blue" },
      { label: "ながしかく", visual: "bar green" },
    ],
  },
  {
    prompt: "食べものを選んでください",
    answer: "パン",
    options: [
      { label: "くつ", visual: "bar teal" },
      { label: "パン", visual: "circle yellow" },
      { label: "ほん", visual: "square blue" },
      { label: "いす", visual: "square green" },
    ],
  },
];

/** 文字学習の出題 */
export const letterTasks = [
  { prompt: "「あめ」の最初の文字を選んでください", answer: "あ", options: ["あ", "い", "う", "え"] },
  { prompt: "「からだ」の最初の文字を選んでください", answer: "か", options: ["さ", "た", "か", "な"] },
  { prompt: "「みず」の最初の文字を選んでください", answer: "み", options: ["に", "み", "し", "り"] },
  { prompt: "「ありがとう」の最初の文字を選んでください", answer: "あ", options: ["お", "あ", "ま", "や"] },
];

/** 操作訓練のモード一覧（iOS Switch Control の模擬） */
export const operationModes = [
  {
    id: "item",
    name: "項目スキャン",
    description: "順番にハイライトされる項目から目的のボタンを選ぶ練習です。",
  },
  {
    id: "point",
    name: "ポイントスキャン",
    description: "縦横のカーソルを止めて、画面上の一点を指定する練習です。",
  },
  {
    id: "tap",
    name: "タップ",
    description: "目的の場所をタップする操作を確認します。",
  },
  {
    id: "drag",
    name: "ドラッグ",
    description: "開始点から終了点へ動かす操作を段階的に練習します。",
  },
];

/** 項目スキャン訓練の出題 */
export const operationItemTasks = [
  { prompt: "「水」を選んでください", answer: "水", options: ["はい", "水", "休む", "戻る"] },
  { prompt: "「戻る」を選んでください", answer: "戻る", options: ["痛い", "寒い", "戻る", "ありがとう"] },
  { prompt: "「ナースコール」を選んでください", answer: "ナースコール", options: ["水", "ナースコール", "暑い", "眠い"] },
];

/** ポイントスキャン／タップ訓練の目標座標（%指定） */
export const operationPointTargets = [
  { x: 30, y: 34, label: "左上の目標" },
  { x: 72, y: 38, label: "右上の目標" },
  { x: 44, y: 72, label: "下側の目標" },
];

/** 定型句VOCAのカテゴリと定型句 */
export const phraseCategories = {
  基本: ["はい", "いいえ", "もう一度", "わかりません", "ありがとう", "大丈夫です"],
  体調: ["痛いです", "寒いです", "暑いです", "眠いです", "休みたいです", "水がほしいです"],
  介助: ["姿勢を変えてください", "トイレに行きたいです", "吸引してください", "家族に連絡してください", "ナースコール", "待ってください"],
  気持ち: ["うれしいです", "不安です", "楽しいです", "静かにしたいです", "外に出たいです", "話したいです"],
};

/** 効果測定セッションの標準タスク列 */
export const evaluationTasks = [
  {
    id: "switch-5",
    title: "スイッチ教材を5回入力",
    guide: "アプリ選択から「いろがかわる」を開き、同じ入力を5回行い、支援者が達成を確認したら成功で終了します。",
    // 旧 "switcher" 画面は削除済み（P1-2/P1-3）。「タスク画面へ」ボタンは
    // アプリ選択（home）へ遷移し、そこから色変化タイルを選ぶ動線にする。
    view: "home",
  },
  {
    id: "matching-1",
    title: "マッチング問題を1問正解",
    guide: "マッチング画面でお題に合う選択肢を選びます。誤選択は自動で記録されます。",
    view: "matching",
  },
  {
    id: "voca-pain",
    title: "VOCAで「痛いです」を選択",
    guide: "VOCA画面で体調カテゴリから「痛いです」を選びます。必要に応じて誤選択を手動で加算します。",
    view: "voca",
  },
  {
    id: "letter-1",
    title: "文字学習を1問正解",
    guide: "文字学習画面で提示された単語の最初の文字を選びます。誤選択は自動で記録されます。",
    view: "letters",
  },
  {
    id: "operation-point",
    title: "ポイントスキャンで目標を選択",
    guide: "操作訓練画面でポイントスキャンを選び、縦横カーソルを止めて目標を指定します。",
    view: "operation",
  },
];

/** 研究条件プロファイル（効果測定の条件欄と連動） */
export const researchConditionProfiles = [
  {
    id: "web",
    name: "Web版",
    description: "iPad Safariで動かし、試作と先行Web教材との比較を行う条件です。",
    focus: "試作速度、ブラウザ互換、オフライン配信",
    evaluationValue: "web",
  },
  {
    id: "native",
    name: "iOS版",
    description: "Capacitorで変換した公開候補版として、Switch ControlとGuided Accessを確認します。",
    focus: "単一アプリ運用、署名、App Store公開準備",
    evaluationValue: "native",
  },
  {
    id: "reference",
    name: "参照構成",
    description: "先行Web教材に近い配置・画面遷移で測り、比較の基準にします。",
    focus: "従来構成との差分、誤操作、戻り操作",
    evaluationValue: "reference",
  },
  {
    id: "optimized",
    name: "最適化構成",
    description: "ニューロノードとSwitch Control向けに、走査順・ボタンサイズ・復帰導線を調整します。",
    focus: "操作負担、見逃し、支援者介助の減少",
    evaluationValue: "optimized",
  },
];

/** 公開候補チェックリスト */
export const readinessItems = [
  {
    id: "localRun",
    label: "ローカル動作",
    detail: "通信が不安定な病院・施設でも主要機能が使える。",
  },
  {
    id: "switchControl",
    label: "Switch Control検証",
    detail: "項目スキャン/ポイントスキャンで主要タスクを実施できる。",
  },
  {
    id: "guidedAccess",
    label: "Guided Access想定",
    detail: "共有iPadで単一アプリ運用し、誤終了を防ぐ導線を確認する。",
  },
  {
    id: "sharedIpad",
    label: "共有端末運用",
    detail: "利用者ID、観察メモ、ログ削除の扱いを支援者が管理できる。",
  },
  {
    id: "appStoreAssets",
    label: "公開素材",
    detail: "説明文、スクリーンショット、アイコン、運用説明を準備する。",
  },
];

/** 利用場面のラベル */
export const environmentLabels = {
  hospital: "病院",
  facility: "施設",
  home: "在宅",
};

/**
 * タブから到達できる画面の集合。
 *
 * P0-0 で "operation" / "evaluation" / "research" を追加し、
 * リファクタリングノート（2026-06-10）記載のP1課題「導線がない」を解消した。
 * この3画面は支援者向けのため、タブ自体の表示/非表示は
 * settings.researcherMode（設定画面「研究者モード」トグル、既定OFF）で
 * 出し分ける（App.svelte の .researcher-tab クラス + styles.css）。
 * switchView() のフォールバック判定にはこのSetをそのまま使うため、
 * 研究者モードがOFFでも（既にそのビューにいた場合等は）到達自体は可能。
 *
 * P1-2（detailed-design.md §2.1）: 利用者向けフロー "start" / "home" /
 * "game" / "result" を追加する。この4画面はタブを持たず、スタート導線・
 * アプリ選択・ゲーム実行・リザルトの各遷移でのみ到達する。旧 "switcher"
 * （スイッチ教材ソフト画面）は games/colorLegacy.js への移植に伴い削除した
 * （views/switcher.js 削除、detailed-design.md §12 の作業順）。
 */
export const visibleViews = new Set([
  "start",
  "home",
  "game",
  "result",
  "matching",
  "voca",
  "letters",
  "operation",
  "evaluation",
  "research",
  "log",
  "settings",
]);
