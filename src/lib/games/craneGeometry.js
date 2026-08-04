// =====================================================================
// games/craneGeometry.js — UFOキャッチャーの床の幾何（純粋関数）
//
// games/pointing.js と同じ方針で、DOM や描画から切り離してある。
// crane.js が持っていると「画面を出さないと確かめられない」ものになり、
// 判定の公平性という一番落としてはいけない性質をテストで固定できない。
//
// 床は 0..100 × 0..100 の正方形。y=0 が奥、y=100 が手前。これを透視投影して
// 台形に描く。x の 1 と y の 1 が床の上で同じ長さを表すので、
// hypot(dx, dy)（pointing.js の evaluatePick）が床上の実距離になる。
// 盤面を横長の長方形として描いていた頃は x と y で 1 の長さが違い、
// 判定の許容円が画面上では横に潰れた楕円になっていた。
// =====================================================================

/**
 * 透視投影のパラメータ。すべて .crane-stage に対する％
 * （left/half は幅、top は高さ）。
 *
 * この値は styles.css からも使う。二重管理を避けるため、CSS 側は
 * floorCssVars() が吐くカスタムプロパティを読む（.crane-floor の
 * clip-path と .crane-chute の位置）。ここを変えれば CSS も追従する。
 */
export const CRANE_GEOM = {
  /** 床の奥端の画面上の位置。 */
  farTop: 30,
  /** 床の手前端の画面上の位置。 */
  nearTop: 84,
  /** 奥端での床の半幅。 */
  farHalf: 25,
  /** 手前端での床の半幅。 */
  nearHalf: 45,
  /** 奥に置いたものの縮小率。 */
  farScale: 0.6,
  /** 手前に置いたものの縮小率（＝原寸）。 */
  nearScale: 1,
  /** アームの待機高度（床からステージ高さの何％ぶん上か）。 */
  altitude: 40,
};

/** 景品口の中心（ステージに対する％）。 */
export const CRANE_CHUTE = { left: 19, top: 78 };

/**
 * 床の一点 (x, y) を画面上の位置へ落とす。
 * @returns {{left:number, top:number, half:number, scale:number}}
 *   left/top はステージに対する％、half はその奥行きでの床の半幅、
 *   scale はその奥行きに置いたものの縮小率。
 */
export function project(x, y, geom = CRANE_GEOM) {
  const depth = y / 100;
  const scale = geom.farScale + (geom.nearScale - geom.farScale) * depth;
  const half = geom.farHalf + (geom.nearHalf - geom.farHalf) * depth;
  return {
    left: 50 + ((x - 50) / 50) * half,
    top: geom.farTop + (geom.nearTop - geom.farTop) * depth,
    half,
    scale,
  };
}

/**
 * 床の上の半径 r の円を、画面上の楕円の寸法（ステージに対する％）へ写す。
 *
 * 横は「その奥行きでの床の半幅」に、縦は「床の奥行き方向の画面上の長さ」に
 * 比例する。床が台形に見えるのと同じ比率なので、描いた楕円の中に入って
 * いれば必ず判定にも入る——これがこのゲームの公平性そのもの。
 *
 * @returns {{width:number, height:number}} 直径（半径ではない）
 */
export function floorCircleSize(r, y, geom = CRANE_GEOM) {
  const { half } = project(0, y, geom);
  return {
    width: (r / 50) * half * 2,
    height: (r / 100) * (geom.nearTop - geom.farTop) * 2,
  };
}

/**
 * 床の台形を styles.css へ渡すためのカスタムプロパティ。
 * clip-path のパーセントは要素自身の箱に対する比なので、床の div が
 * ステージの全幅を占めていることが前提（.crane-floor は left/right: 0）。
 */
export function floorCssVars(geom = CRANE_GEOM, chute = CRANE_CHUTE) {
  return {
    "--crane-far-top": `${geom.farTop}%`,
    "--crane-floor-height": `${geom.nearTop - geom.farTop}%`,
    "--crane-far-left": `${50 - geom.farHalf}%`,
    "--crane-far-right": `${50 + geom.farHalf}%`,
    "--crane-near-left": `${50 - geom.nearHalf}%`,
    "--crane-near-right": `${50 + geom.nearHalf}%`,
    "--crane-chute-left": `${chute.left}%`,
    "--crane-chute-top": `${chute.top}%`,
  };
}

/**
 * 掴める範囲を、続けて外したぶんだけ広げる。
 *
 * なぜ要るか: 床の1目盛は sweepMs/100 ミリ秒にあたるので、要求する時間精度は
 * 「grip 圏の半径 × sweepMs/100」。既定（content.js の cranePresets、
 * sweepMs 2200 / toleranceR 11）では各軸 ±121ms になる。狙って押すこと自体が
 * 訓練の対象である利用者にとってこれは厳しく、0/5 が続くと「何をしても
 * 同じ」になって課題として成立しない。
 *
 * なぜこの形か: 難しさを下げるのではなく、外した回数ぶんだけ一時的に
 * 広げて、掴めたら元に戻す。うまくなれば元の難度に戻るので、
 * 上達の余地は残る。広がったことは床のリングが大きくなることで見える
 * （「やさしくしました」とは言わない。言われて嬉しい情報ではない）。
 *
 * 測定への影響: 実際に適用した値は各試行の toleranceR として記録され、
 * 走査CSV にも列として出る（views/evaluation.js）。judgment は
 * pointing.js の graspOutcome(distance, toleranceR) と必ず一致するので、
 * state.js の sanitizeScanTrial の検算もそのまま通る。素の難度で測りたい
 * ときは content.js の cranePresets.assistMaxSteps を 0 にする。
 *
 * @param {number} baseR 既定の許容半径
 * @param {number} failures 直近で連続して掴めなかった回数
 * @param {number} maxSteps 広げる上限段数（0 で無効）
 * @param {number} stepRatio 1段あたりの倍率の増分
 */
export function assistedToleranceR(baseR, failures, maxSteps, stepRatio) {
  if (!(baseR > 0)) return baseR;
  if (!(maxSteps > 0) || !(stepRatio > 0) || !(failures > 0)) return baseR;
  const steps = Math.min(failures, maxSteps);
  return baseR * (1 + stepRatio * steps);
}

/**
 * 目標位置を引き直す。
 *
 * 端に寄りすぎると景品が筐体の枠や景品口に重なるため内側に寄せ、直前と
 * 近すぎる場所は引き直す（同じ狙いを2回続けて出さない）。以前は5点の
 * 固定配列を固定順で回していたので、繰り返すほど位置を覚えてしまい、
 * 遊びとしても測定としても弱かった。
 *
 * random を差し替えられるようにしてあるのはテストのため。
 */
export function pickTarget(previous, random = Math.random) {
  const draw = () => ({ x: 20 + random() * 60, y: 22 + random() * 56 });
  const farEnough = (candidate) =>
    !previous || Math.hypot(candidate.x - previous.x, candidate.y - previous.y) > 22;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = draw();
    if (farEnough(candidate)) return candidate;
  }
  return draw();
}
