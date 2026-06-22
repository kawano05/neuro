// =====================================================================
// content.js — 教材・タスク・研究条件などの「中身」の定義（純粋データ）
//
// アプリのロジックには依存しない。教材の追加・差し替え・ゲーム化は
// 原則このファイル（と対応するビュー）だけを触ればよい。
// 打合せ（2026-04-20）で挙がったゲーム（鬼退治・回転寿司・お絵描き音階など）を
// 追加する場合は switchModules に新モジュールを足すのが起点になる。
// =====================================================================

/** localStorage の保存キー。state の構造を壊す変更をしたら v3 に上げる。 */
export const storageKey = "neuronode-prototype-state-v2";

/**
 * スイッチ教材モジュールの一覧。
 * ここに { id, name, description, tones } を追加すると、
 * スイッチ教材画面のモジュール選択グリッドに自動で並ぶ。
 * （ゲーム追加時の拡張ポイント。描画ロジックの分岐は views/switcher.js 側）
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
    guide: "スイッチ教材画面で同じ入力を5回行い、支援者が達成を確認したら成功で終了します。",
    view: "switcher",
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
 * 注意: "operation" / "evaluation" / "research" はマークアップ上は存在するが
 * ここに含まれておらず、現状ユーザーからは到達できない（既知の制約）。
 * タブ常設にするか「研究者モード」で出すかはメンバー間で要確認。
 */
export const visibleViews = new Set(["switcher", "matching", "voca", "letters", "log", "settings"]);
