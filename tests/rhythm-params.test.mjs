// リズム系の難易度をどこまで支援者に開放するか、の線引き。
//
// bpm・カウントイン拍数・目標拍数は設定画面から変えられる（訓練の3課題）。
// キャリブレーションだけは変えられない——基準オフセットの測定手順そのもので、
// ここで得た中央値は判定窓の中心補正として全セッションに効くため
// （basic-design.md §7.3）。支援者が「リズムを遅くした」つもりで測定手順まで
// 変えてしまえる状態にはしない。
//
// この線引きはコードを読んでも一目では分からず、壊しても画面上は普通に動く。
// だからテストで固定する。

import assert from "node:assert/strict";
import {
  beatPulseScale,
  buildPlan,
  computeExcludedBoundaryRelMs,
  displayOffsetMs,
  resolveParams,
  resolveVisualGuidance,
  scheduledBeatPulseScale,
} from "../src/lib/games/rhythm.js";
import { rhythmPresets } from "../src/lib/content.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

/** 支援者が全部いじった状態の設定。 */
const OVERRIDES = { rhythmBpm: 33, countInBeats: 7, targetBeats: 44 };
/** 何も触っていない状態（既定）。 */
const UNTOUCHED = { rhythmBpm: null, countInBeats: null, targetBeats: null };

const TRAINING_GAME_IDS = ["rhythm-l1", "rhythm-l2", "gonogo"];

test("training tasks follow the supporter's difficulty settings", () => {
  TRAINING_GAME_IDS.forEach((gameId) => {
    const params = resolveParams(gameId, OVERRIDES);
    assert.equal(params.bpm, 33, `${gameId}: bpm must follow the setting`);
    assert.equal(params.countInBeats, 7, `${gameId}: countInBeats must follow the setting`);
    assert.equal(params.targetBeats, 44, `${gameId}: targetBeats must follow the setting`);
  });
});

test("calibration ignores every difficulty setting", () => {
  const preset = rhythmPresets.calibration;
  const params = resolveParams("calibration", OVERRIDES);
  assert.equal(params.bpm, preset.bpm, "calibration bpm is part of the measurement protocol");
  assert.equal(params.countInBeats, preset.countInBeats);
  assert.equal(params.targetBeats, preset.targetBeats);
  // 元から守られていた値も、引き続き守られること。
  assert.equal(params.excludedTrialCount, preset.excludedTrialCount);
  assert.ok(preset.excludedTrialCount > 0, "the calibration preset must still exclude warm-up trials");
});

// ---------------------------------------------------------------------
// キャリブレーションが continuous であること
//
// cued は毎回カウントインで位相修正の連鎖を切るので、試行が独立になり、
// 「予測して押した試行」と「高音を聞いてから反応した試行」が同じ分布へ
// 混ざる。両者は平均で 300ms 以上違うため、混合比が変わるだけで中央値が
// 動く（反応押し30%で +46ms、50%で +146ms。
// scripts/probes/probe-calibration-mode.mjs）。10試行では二峰性を検定できず、
// データを見ても気づけない。そしてその値は baselineOffsetMs として
// 全セッションの判定窓中心に効く。
//
// 画面上は cued でも continuous でも「音に合わせて押す課題」で、どちらでも
// 普通に遊べて普通に数字が出る。だからテストで固定する。
// ---------------------------------------------------------------------

test("calibration measures continuous synchronisation, not cued trials", () => {
  const preset = rhythmPresets.calibration;
  assert.equal(
    preset.mode,
    "continuous",
    "cued に戻すと、位相修正の連鎖が試行ごとに切れて予測押しと反応押しが混ざる"
  );
  assert.equal(
    resolveParams("calibration", OVERRIDES).mode,
    "continuous",
    "支援者の設定でモードが動いてはいけない"
  );
  // 立ち上がりを捨てたあとに残る有効拍数。中央値の推定精度がここで決まる
  // （有効10拍で sd 33.6ms、20拍で 25ms 前後）。減らすと基準値が甘くなる。
  const usable = preset.targetBeats - preset.excludedTrialCount;
  assert.ok(usable >= 16, `有効拍数が ${usable} では基準オフセットの推定が粗すぎる`);
});

// ---------------------------------------------------------------------
// 除外区間の境界（computeExcludedBoundaryRelMs）
//
// beatIndex を持たない extra（どの拍にも結び付かない余分な入力）を集計から
// 外すかどうかの判定。旧実装は cued だけが返す trialPeriodS を掛けていたので、
// continuous では -Infinity ＝ **extra が一度も除外されない**。
// キャリブレーションを continuous にした時点で、これは実際に効く経路になった。
// ---------------------------------------------------------------------

test("each mode's plan says how much time belongs to a beat", () => {
  const cued = buildPlan({ mode: "cued", bpm: 50, countInBeats: 4, targetBeats: 24 });
  const continuous = buildPlan({ mode: "continuous", bpm: 50, countInBeats: 4, targetBeats: 24 });
  const gonogo = buildPlan({ mode: "gonogo", bpm: 50, countInBeats: 3, targetBeats: 20, goRatio: 0.6 });

  // cued は「自分のカウントイン → 高音 → 休止」の並びなので、その試行に
  // 属する区間は高音の countInBeats 拍前から。
  assert.equal(cued.excludedLeadS, 4 * (60 / 50));
  // 連続系は拍が切れ目なく続くので、隣り合う拍のちょうど中間で分ける。
  assert.equal(continuous.excludedLeadS, 60 / 50 / 2);
  assert.equal(gonogo.excludedLeadS, 60 / 50 / 2);
});

test("extras land on the excluded side of the boundary in continuous mode", () => {
  const preset = rhythmPresets.calibration;
  const plan = buildPlan({ ...preset });
  const beatIntervalMs = (60 / preset.bpm) * 1000;
  // 最初の非除外拍の予定時刻（セッション相対ms）。mount() は同じものを
  // scheduledMsByIndex から引く。
  const firstIncludedMs = (preset.countInBeats + preset.excludedTrialCount) * beatIntervalMs;

  const boundary = computeExcludedBoundaryRelMs(
    preset.excludedTrialCount,
    firstIncludedMs,
    plan.excludedLeadS * 1000
  );

  assert.ok(Number.isFinite(boundary), "continuous でも境界が定まること（旧実装は -Infinity）");
  // 除外拍のまっただ中で押した余分な入力は除外側。
  assert.ok(boundary > (preset.countInBeats + 1) * beatIntervalMs, "除外拍の途中はまだ境界の手前");
  // 最初の有効拍で押した入力は、境界より後＝集計に入る側。
  assert.ok(firstIncludedMs > boundary, "最初の有効拍は集計に入る");
  // 境界は最初の有効拍の半拍手前ちょうど。
  assert.equal(boundary, firstIncludedMs - beatIntervalMs / 2);
});

test("the boundary refuses to silently include everything", () => {
  // 除外なしの課題（rhythm-l1/l2/gonogo）は、すべての extra が集計に入る。
  assert.equal(computeExcludedBoundaryRelMs(0, 1000, 600), -Infinity);
  // 除外数が拍数以上（設定ミス）。非除外の拍が1つも無いのだから、
  // 「全部が有効試行」へ倒してはいけない。
  assert.equal(computeExcludedBoundaryRelMs(4, undefined, 600), Infinity);
});

test("untouched settings leave every task on its preset", () => {
  [...TRAINING_GAME_IDS, "calibration"].forEach((gameId) => {
    const preset = rhythmPresets[gameId];
    const params = resolveParams(gameId, UNTOUCHED);
    assert.equal(params.bpm, preset.bpm, `${gameId}: bpm`);
    assert.equal(params.countInBeats, preset.countInBeats, `${gameId}: countInBeats`);
    assert.equal(params.targetBeats, preset.targetBeats, `${gameId}: targetBeats`);
  });
});

test("the practice ladder steps in structure, not in tempo", () => {
  // 段のあいだで変わるのを「課題の構造」だけにする。
  //
  // 以前は l1=40bpm / l2=60bpm とテンポも違っていた。そうすると、難しく
  // なったのが構造のせいかテンポのせいか分からない。しかも実測すると
  // 段になっていなかった——l1 は10回押すのに68秒（0.148回/秒）、l2 は
  // 20回を24秒（0.833回/秒）で、隣の段で入力密度が5.6倍に跳んでいた。
  const l1 = resolveParams("rhythm-l1", UNTOUCHED);
  const l2 = resolveParams("rhythm-l2", UNTOUCHED);
  const gonogo = resolveParams("gonogo", UNTOUCHED);
  assert.equal(l1.bpm, l2.bpm, "練習の段はテンポを揃える");
  assert.equal(l2.bpm, gonogo.bpm);

  /** 1秒あたり何回押すか。課題の運動負荷そのもの。 */
  const density = (params) => {
    const beat = 60000 / params.bpm;
    const durationS =
      params.mode === "cued"
        ? (params.targetBeats * (params.countInBeats + 1.5) * beat) / 1000
        : ((params.countInBeats + params.targetBeats) * beat) / 1000;
    const presses =
      params.mode === "gonogo"
        ? Math.round(params.targetBeats * params.goRatio)
        : params.targetBeats;
    return presses / durationS;
  };

  // 運動軸は l1 < gonogo < l2。gonogo が l2 より低いのは、押さない試行が
  // あるので当然で、運動と認知の2軸を同時に上げないための設計でもある。
  assert.ok(density(l1) < density(gonogo), "l1 は gonogo より運動負荷が低い");
  assert.ok(density(gonogo) < density(l2), "gonogo は l2 より運動負荷が低い");

  // 隣の段で密度が跳ねすぎないこと。ここが緩むと「段」ではなく崖になる。
  const jump = density(l2) / density(l1);
  assert.ok(jump < 3.5, `l1 から l2 への入力密度の跳ねが大きすぎる（${jump.toFixed(1)}倍）`);

  // 1回の長さ。長すぎると注意が保たない。
  [l1, l2, gonogo].forEach((params) => {
    const beat = 60000 / params.bpm;
    const durationS =
      params.mode === "cued"
        ? (params.targetBeats * (params.countInBeats + 1.5) * beat) / 1000
        : ((params.countInBeats + params.targetBeats) * beat) / 1000;
    assert.ok(durationS <= 45, `1回が長すぎる（${Math.round(durationS)}秒）`);
  });
});

test("the tempo setting applies to every rhythm task at once", () => {
  // 設定は課題ごとではなく1つなので、上書きすると3つとも同じテンポになる。
  // 「この利用者のテンポ」を一律に当てる仕様であることを、意図として固定する。
  const overriddenL1 = resolveParams("rhythm-l1", OVERRIDES);
  const overriddenL2 = resolveParams("rhythm-l2", OVERRIDES);
  assert.equal(overriddenL1.bpm, overriddenL2.bpm);
});

test("mode and goRatio never come from settings", () => {
  // 課題の種類そのものは設定で変わらない。
  const gonogo = resolveParams("gonogo", { ...OVERRIDES, mode: "cued", goRatio: 1 });
  assert.equal(gonogo.mode, rhythmPresets.gonogo.mode);
  assert.equal(gonogo.goRatio, rhythmPresets.gonogo.goRatio);
});

// ---------------------------------------------------------------------
// 画面から拍の手がかりを出す条件（visualGuidance）
//
// この線引きは研究の構成概念そのものに効く。ONだと円が次の拍を予告し、
// 押したあとにずれが出る——どちらも視覚から拍の情報を足すので、rawOffsetMs は
// 「聴覚キューへの同期」ではなくなる。壊しても画面は普通に動くので、
// テストで固定する。
// ---------------------------------------------------------------------

test("visual guidance stays off unless the supporter turns it on", () => {
  // 既定は「手がかりは音だけ」。測定がこちらなので、既定を訓練側に倒さない。
  assert.equal(resolveVisualGuidance("rhythm-l1", {}), false);
  assert.equal(resolveVisualGuidance("rhythm-l1", { visualGuidance: false }), false);
  assert.equal(resolveVisualGuidance("rhythm-l1", { visualGuidance: true }), true);
  assert.equal(resolveVisualGuidance("rhythm-l2", { visualGuidance: true }), true);
  assert.equal(resolveVisualGuidance("gonogo", { visualGuidance: true }), true);
});

test("calibration refuses visual guidance even when the setting is on", () => {
  // 基準オフセットの測定手順そのもの。ここで得た中央値は判定窓の中心補正と
  // して全セッションに効くので、測る条件が支援者の設定で動いてはいけない
  // （bpm・拍数を拒むのと同じ線引き）。
  assert.equal(resolveVisualGuidance("calibration", { visualGuidance: true }), false);
});

test("the pulse only predicts the next beat when guidance is on", () => {
  // 拍の予告になるのは「溜め」だけ。着地と沈みは拍が起きたことを伝えるので
  // 予告にならず、条件によらず同じでよい。
  assert.equal(beatPulseScale(0, false), beatPulseScale(0, true), "着地は同じ");
  assert.equal(beatPulseScale(0.2, false), beatPulseScale(0.2, true), "沈みは同じ");
  assert.equal(beatPulseScale(0.5, false), beatPulseScale(0.5, true), "待ちは同じ");

  // 拍の直前。手がかりありでは膨らみはじめ、なしでは静止したまま。
  const restingScale = beatPulseScale(0.5, false);
  assert.equal(beatPulseScale(0.95, false), restingScale, "手がかりなしでは溜めない");
  assert.ok(
    beatPulseScale(0.95, true) > restingScale,
    "手がかりありでは、拍の直前に膨らんで「つぎ来るぞ」を伝える"
  );
});

test("the pulse lands on the actual cued schedule after the inter-trial rest", () => {
  const plan = buildPlan({ mode: "cued", bpm: 60, countInBeats: 1, targetBeats: 2 });
  // 実際の音は 0s(low), 1s(high), 2.5s(low), 3.5s(high)。
  // 単純な1秒modだと2.5sは位相0.5になり、2試行目から音と半拍ずれる。
  assert.deepEqual(
    plan.audioBeats.map((beat) => beat.timeS),
    [0, 1, 2.5, 3.5]
  );
  assert.equal(
    scheduledBeatPulseScale(12.5, 10, plan.audioBeats, plan.beatIntervalS, true),
    beatPulseScale(0, true),
    "2試行目の低音時刻でも円が着地する"
  );
  assert.equal(
    scheduledBeatPulseScale(12, 10, plan.audioBeats, plan.beatIntervalS, true),
    beatPulseScale(2 / 3, true),
    "音の無い単純mod境界を拍として描かない"
  );
});

test("the pulse never anticipates a beat that does not exist after the schedule", () => {
  const beats = [{ timeS: 0 }, { timeS: 1 }];
  const restingScale = beatPulseScale(0.5, false);
  assert.equal(
    scheduledBeatPulseScale(11.95, 10, beats, 1, true),
    restingScale,
    "最後の音から1拍近く経っても架空の次拍へ溜めない"
  );
});

// ---------------------------------------------------------------------
// 画面に出すずれ（displayOffsetMs）
//
// 記録する rawOffsetMs とは別物。生値をそのまま出すと、基準オフセットが
// 効いている利用者では「判定は当たりなのに画面はおそいと言う」状態になる。
// ---------------------------------------------------------------------

test("the shown offset is measured from the corrected window centre", () => {
  // 基準が +80ms の利用者が +80ms で押した = 補正後の中心ぴったり。
  assert.equal(displayOffsetMs(80, 80), 0);
  // 基準が無ければ生値と同じ（ふだんの回はここ）。
  assert.equal(displayOffsetMs(-40, 0), -40);
  assert.equal(displayOffsetMs(-40, undefined), -40);
  // 押していない試行（miss / correctRejection）は出しようがない。
  assert.equal(displayOffsetMs(null, 0), null);
  assert.equal(displayOffsetMs(Number.NaN, 0), null);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("rhythm params tests passed");
