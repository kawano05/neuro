// =====================================================================
// content.js — 教材・タスク・研究条件などの「中身」の定義（純粋データ）
//
// アプリのロジックには依存しない。教材の追加・差し替え・ゲーム化は
// 原則このファイル（と対応するビュー）だけを触ればよい。
// 打合せ（2026-04-20）で挙がったゲーム（鬼退治・回転寿司・お絵描き音階など）を
// 追加する場合は switchModules に新モジュールを足すのが起点になる。
// =====================================================================

/**
 * localStorage の保存キー。state の構造を壊す変更をしたら次のバージョンへ上げる。
 *
 * v2 → v3（P0-0, detailed-design.md §9.5）: 起動経路を src/lib 分割版に一本化した
 * ことに伴うバンプ。旧キー（v2: "neuronode-prototype-state-v2"、
 * v1: "neuro-trainer-state-v1"）は state.js の loadState() が v3 未保存時にのみ
 * 読み、settings・logs・evaluation を移行する。旧キー自体は削除しない。
 */
export const storageKey = "neuronode-prototype-state-v3";

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
  { id: "color-legacy", title: "いろがかわる", description: "おすと いろと おとが かわるよ", order: 1, enabled: true },
  { id: "rhythm-l1", title: "リズム れんしゅう", description: "おとの あいずに あわせて おそう", order: 2, enabled: true },
  { id: "rhythm-l2", title: "リズム つづけて", description: "おとに あわせて つづけて おそう", order: 3, enabled: true },
  { id: "gonogo", title: "たかいおとだけ", description: "たかいおとのとき だけ おそう", order: 4, enabled: true },
  { id: "calibration", title: "そくてい", description: "しえんしゃと いっしょに つかいます", order: 5, enabled: true },
  { id: "future-slot", title: "じゅんびちゅう", description: "", order: 6, enabled: false },
];

/**
 * リズム系ゲームのプリセット値（bpm・カウントイン拍数・目標ビート数等）。
 * detailed-design.md §4.1 / §7.1。state.settings 側の同名値（null 以外）が
 * 優先される（games/rhythm.js が優先順位を解決する。P2-3 で実装）。
 */
export const rhythmPresets = {
  "rhythm-l1": { bpm: 40, countInBeats: 3, targetBeats: 10, mode: "cued" },
  "rhythm-l2": { bpm: 60, countInBeats: 4, targetBeats: 20, mode: "continuous" },
  gonogo: { bpm: 50, countInBeats: 3, targetBeats: 20, mode: "gonogo", goRatio: 0.6 },
  calibration: { bpm: 50, countInBeats: 4, targetBeats: 12, mode: "cued" },
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
