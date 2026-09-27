// =====================================================================
// audio.js — 効果音と音声読み上げ、リズム系ゲーム向けの先読みスケジューラ
//
// 打合せ要件メモ: 「押した時の音が『自分が操作した』実感に直結する」
// 「音を変えられる機能（爆発系・ポヨン系など）が望ましい」。
// 音バリエーション対応はここに集約する想定（toneプリセット化、
// 将来的には Web Audio によるサンプル再生）。
//
// iOS化の注意:
//   - AudioContext はユーザー操作後に初期化する必要がある（現状クリック
//     起点なのでOK。サイレントスイッチONだと WKWebView では音が出ない
//     場合があるので実機確認すること）。
//   - speechSynthesis は iOS では日本語ボイスの取得タイミングに癖がある。
//
// P2-1（detailed-design.md §6.2）: createBeatScheduler を追加。Chris Wilson
// 方式（two clocks / lookahead）で、setInterval はスケジューリングの
// トリガーにのみ使い、実際の発音時刻は必ず AudioContext.currentTime 基準の
// osc.start(atTime) で先読み予約する（setInterval の発火時刻を音の発生
// 時刻に使うのは MUST NOT）。
// =====================================================================

import { resolveTextMode, speechLangFor } from "./i18n.js";

/** ビート予約の既定包絡（sine, gain 0.05, 約0.18秒で減衰）。detailed-design.md §6.2。 */
export const DEFAULT_TONE_GAIN = 0.05;
/** 既存利用者の通常時音量を変えない。Switch ControlモードはTTS自体を既定OFFにする。 */
export const DEFAULT_SPEECH_VOLUME = 1;

/** SpeechSynthesisUtterance.volume に渡せる安全な範囲へ正規化する。 */
export function clampSpeechVolume(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SPEECH_VOLUME;
  }
  // 0は speechEnabled=false と役割が重なる。比較試験で「ONなのに無音」を
  // 作らないよう、設定UIと同じ 0.2〜1.0 に限定する。
  const clamped = Math.min(Math.max(value, 0.2), 1);
  return Math.round(clamped * 10) / 10;
}
const TONE_DECAY_S = 0.18;
const TONE_STOP_MARGIN_S = 0.02;

/** Chris Wilson方式 lookahead スケジューラの定数（detailed-design.md §6.2）。 */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const START_DELAY_S = 0.3;

/**
 * 単一のオシレータ音を指定の AudioContext 時刻に予約する（playTone/playToneAt と
 * createBeatScheduler の両方から使う共通実装。envelope は既存 playTone と同型）。
 * @returns {{oscillator: OscillatorNode, gainNode: GainNode}|null}
 */
function scheduleOscillatorTone(audioContext, frequency, atTimeS, gain = DEFAULT_TONE_GAIN) {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gainNode.gain.value = gain;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(atTimeS);
    gainNode.gain.exponentialRampToValueAtTime(0.001, atTimeS + TONE_DECAY_S);
    oscillator.stop(atTimeS + TONE_DECAY_S + TONE_STOP_MARGIN_S);
    return { oscillator, gainNode };
  } catch {
    // 古い組み込みブラウザでは AudioContext が使えない場合がある。
    return null;
  }
}

/**
 * Chris Wilson方式（https://www.html5rocks.com/en/tutorials/audio/scheduling/ 系）の
 * 先読みビートスケジューラ（detailed-design.md §6.2）。
 *
 * @param {AudioContext} audioContext
 * @returns {{
 *   start: (plan: {beats: Array<{index:number, timeS:number, tone:number, gain?:number}>}) => number,
 *   stop: () => void,
 *   now: () => number,
 * }}
 */
export function createBeatScheduler(audioContext) {
  let timerId = null;
  let plan = null;
  let nextIndex = 0;
  let activeNodes = [];

  function now() {
    return audioContext.currentTime;
  }

  /** setInterval のティック。ここでは「予約するかどうか」を決めるだけで、
   * 実際の発音時刻は常に startAt + beat.timeS（AudioContext時刻）で予約する
   * （setInterval の発火時刻そのものを発音時刻にしてはならない、MUST NOT）。
   */
  function scheduleDue() {
    if (!plan) return;
    const horizon = now() + SCHEDULE_AHEAD_S;
    while (nextIndex < plan.beats.length) {
      const beat = plan.beats[nextIndex];
      const atTime = plan.startAt + beat.timeS;
      if (atTime >= horizon) break;
      const node = scheduleOscillatorTone(audioContext, beat.tone, atTime, beat.gain ?? DEFAULT_TONE_GAIN);
      if (node) activeNodes.push(node);
      nextIndex += 1;
    }
  }

  /**
   * ビート計画の再生を開始する。現在時刻 + 0.3s を plan.startAt として
   * 与えられた plan オブジェクトへ書き込む（呼び出し側が startAt を
   * 読み返せるようにするため、コピーではなく同じ参照へ書く）。
   * @returns {number} plan.startAt（AudioContext時刻、秒）
   */
  function start(inputPlan) {
    stop();
    plan = inputPlan;
    plan.startAt = now() + START_DELAY_S;
    nextIndex = 0;
    activeNodes = [];
    scheduleDue();
    timerId = window.setInterval(scheduleDue, LOOKAHEAD_MS);
    return plan.startAt;
  }

  /** 予約済みオシレータの解放を含めて停止する（detailed-design.md §6.2）。 */
  function stop() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    activeNodes.forEach(({ oscillator, gainNode }) => {
      try {
        oscillator.stop(0);
      } catch {
        // 既に停止済み、または未開始のオシレータへの stop() は無視してよい。
      }
      try {
        oscillator.disconnect();
      } catch {
        /* noop */
      }
      try {
        gainNode.disconnect();
      } catch {
        /* noop */
      }
    });
    activeNodes = [];
    plan = null;
    nextIndex = 0;
  }

  return { start, stop, now };
}

// ---------------------------------------------------------------------
// 効果音（クレーン・さかなつり）の合成に使う定数
//
// このアプリの音は長らく「約0.18秒のサイン波」1種類しかなかった。合図として
// はそれで足りるが、押した結果として何が起きたのかは何も伝わらない——
// アームが降りたのか、掴んだのか、滑ったのか、魚が掛かったのかが、音では
// 区別できなかった。画面を見つづけるのが難しい利用者にとって、これは
// 「結果が届かない」ということそのものになる。
//
// 守る条件は1つ。**測定の合図音を覆わないこと**。
//   - 音量は合図音（DEFAULT_TONE_GAIN = 0.05）より下に置く。
//   - 帯域を分ける。合図は 440Hz / 880Hz の純音なので、効果音は
//     ノイズ（広帯域）と低い帯に寄せて、同じ高さで competing させない。
//   - 鳴らすのは「入力より後」の出来事だけにする。さかなつりのアタリ音
//     （測定刺激）より前に鳴る音は足さない。
//   - soundEnabled が OFF ならすべて鳴らない（合図音は別扱いで、
//     basic-design.md §6 によりミュート不可）。
// ---------------------------------------------------------------------

/** 効果音の音量上限。合図音（DEFAULT_TONE_GAIN = 0.05）より下に置く。 */
export const EFFECT_GAIN_CEILING = 0.04;

/**
 * 効果音の音量を、合図音を覆わない範囲へ丸める。
 *
 * ここがこの機能の安全弁。効果音は「押した結果」を伝えるためのもので、
 * 測定の合図（440Hz/880Hz の純音）より目立ってはいけない——合図が聴き取り
 * にくくなると、聴覚キューへの同期/反応という測定そのものが変わる。
 * 呼び出し側が大きな値を渡しても、ここで必ず頭を押さえる。
 */
export function clampEffectGain(gain) {
  if (typeof gain !== "number" || !Number.isFinite(gain)) return 0;
  return Math.min(Math.max(gain, 0), EFFECT_GAIN_CEILING);
}
/**
 * 合成した笑い声の出口の大きさ。「は」の声はフォルマントの帯で大半が削られる
 * ので、ここで持ち上げる。値は、描いた波形の山が効果音の上限（EFFECT_GAIN_CEILING）
 * に収まるように測って決めた（test-results/probe-sounds.mjs）。
 */
const LAUGH_OUTPUT_GAIN = 0.12;

/** 拍手の出口の大きさ（LAUGH_OUTPUT_GAIN と同じ決め方）。 */
const APPLAUSE_OUTPUT_GAIN = 2.6;

/** ノイズ音源の長さ（秒）。使い回すので、いちばん長い効果音より長くする。 */
const NOISE_BUFFER_S = 2;

/**
 * @param {() => {speechEnabled: boolean, soundEnabled: boolean}} getSettings
 *   設定の現在値を返す関数（state.settings への遅延参照）
 * @param {(message: string) => void} [announce]
 * @param {{sampleUrls?: Record<string, string>}} [options]
 *   sampleUrls … 録音の差し替え（名前 → URL、soundAssets.js）。ある名前は
 *   合成の代わりに録音を鳴らす（laugh・boing・creature-dolphin など）。
 */
export function createAudio(getSettings, announce = () => {}, { sampleUrls = {} } = {}) {
  let audioContext;
  let scheduler;
  let noiseBuffer = null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  // 録音の差し替え。名前 → 読み込み済みの AudioBuffer（読み込み中は Promise）。
  const samples = new Map();

  /** AudioContext を（未生成なら）生成し、対応する BeatScheduler も用意する。 */
  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!audioContext) {
      try {
        audioContext = new AudioContextClass();
        scheduler = createBeatScheduler(audioContext);
        preloadSamples(audioContext);
      } catch {
        audioContext = null;
      }
    }
    return audioContext;
  }

  /** 録音を先に読み込んでおく（最初のひと押しで鳴らすときに待たせない）。 */
  function preloadSamples(ctx) {
    Object.entries(sampleUrls).forEach(([name, url]) => {
      if (samples.has(name) || typeof fetch !== "function") return;
      const loading = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          samples.set(name, buffer);
          return buffer;
        })
        .catch(() => {
          samples.delete(name);
          return null;
        });
      samples.set(name, loading);
    });
  }

  /**
   * 録音があれば鳴らす。無ければ false（呼び出し側が合成で鳴らす）。
   * 録音の音量も効果音の上限の中に置く（録音は大きめに作られていることが多い）。
   */
  function trySample(name) {
    if (!sampleUrls[name]) return false;
    const ctx = ensureContext();
    if (!ctx) return false;
    const play = (buffer) => {
      if (!buffer) return;
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = EFFECT_GAIN_CEILING * 10;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -20;
        limiter.ratio.value = 20;
        const out = ctx.createGain();
        out.gain.value = EFFECT_GAIN_CEILING * 2.5;
        source.connect(gain);
        gain.connect(limiter);
        limiter.connect(out);
        out.connect(ctx.destination);
        source.start();
      } catch {
        // 鳴らせなくても遊びは止めない。
      }
    };
    const entry = samples.get(name);
    if (entry instanceof Promise) entry.then(play);
    else play(entry);
    return true;
  }

  /** 日本語で読み上げる（speechEnabled が ON のときのみ） */
  function speak(text) {
    const speechSettings = getSettings();
    const synth = window.speechSynthesis;
    if (
      !speechSettings.speechEnabled ||
      !synth ||
      typeof synth.speak !== "function" ||
      typeof globalThis.SpeechSynthesisUtterance !== "function"
    ) {
      return false;
    }
    try {
      if (typeof synth.cancel === "function") synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      // 表記に合わせて読み上げの言語も変える。英語表記のまま日本語音声で
      // 読ませると、意味の通らない発音になる（src/lib/i18n.js）。
      utterance.lang = speechLangFor(resolveTextMode(speechSettings));
      utterance.rate = 0.92;
      // 合図音・効果音を増量せず、相対的に大きかったTTS側を先に調整する。
      utterance.volume = clampSpeechVolume(speechSettings.speechVolume);
      synth.speak(utterance);
      return true;
    } catch {
      // 一部のWKWebViewはAPIを公開していても初期化直後に例外を返す。
      // その場合は所有権をlive regionへ戻し、通知自体を失わない。
      return false;
    }
  }

  /** アプリTTSかlive regionの一方だけに、その回の音声所有権を与える。 */
  function speakOrAnnounce(spokenText, announcementText = spokenText) {
    if (speak(spokenText)) return "app-tts";
    announce(announcementText);
    return "live-region";
  }

  /**
   * 読み上げ中の発話を打ち切る。
   *
   * speak() は次の発話の直前に cancel() するので、読み上げが「次の speak()
   * まで止まらない」区間ができる。ゲームが始まったあとも案内の音声が続くと、
   * 課題の合図音（低音・高音）に人の声が重なり、聴覚キューを聴き取る妨げに
   * なる。このアプリでは合図音がそのまま測定・訓練の対象なので、
   * 始まった時点で確実に黙らせる必要がある（games/gameHost.js から呼ぶ）。
   *
   * speechEnabled の判定は掛けない。設定を切った直後に発話が残っている
   * 場合も含め、「止める」は常に効くべきなので。
   */
  function stopSpeech() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }

  /**
   * 時刻指定版の単発音（detailed-design.md §6.2）。既存 playTone と同型の
   * 包絡（sine、既定 gain 0.05、~0.18秒減衰）を、指定の AudioContext 時刻
   * （秒）で鳴らす。ビート予約（先読み）とゲーム内フィードバック音
   * （即時再生 = atTimeS に scheduler.now() を渡す）の両方から使う。
   *
   * 既存 playTone の「効果音オフで鳴らさない」というガードはここでは掛けない
   * （リズム系ゲームの合図音は基本設計書 §6「音優先の明示的判断」により
   * ミュート不可とする。効果音トグルは既存呼び出し元 playTone() 側にのみ適用する）。
   */
  function playToneAt(frequency, atTimeS, gain = DEFAULT_TONE_GAIN) {
    const ctx = ensureContext();
    if (!ctx) return null;
    return scheduleOscillatorTone(ctx, frequency, atTimeS, gain);
  }

  /**
   * ホワイトノイズの音源を1本だけ作って使い回す。
   * 呼ばれるたびに作ると、掴みの瞬間など連続で鳴らす場面で無駄が大きい。
   */
  function ensureNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * NOISE_BUFFER_S);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  /**
   * 濾したノイズをひと吹き鳴らす。水音・モーター・金属の当たりの素になる。
   *
   * @param {object} options
   * @param {number} options.durationS 長さ（秒）
   * @param {number} [options.gain] 0〜EFFECT_GAIN_CEILING に丸める
   * @param {"lowpass"|"highpass"|"bandpass"} [options.filter]
   * @param {number} [options.frequency] フィルタの中心/カットオフ
   * @param {number} [options.q] バンドパスの鋭さ
   * @param {number} [options.sweepTo] 指定すると frequency からここへ滑らす
   * @param {number} [options.delayS] 今からの遅れ（続けて鳴らすとき用）
   */
  function playNoise({
    durationS = 0.2,
    gain = 0.02,
    filter = "lowpass",
    frequency = 1200,
    q = 1,
    sweepTo = null,
    delayS = 0,
  } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const source = ctx.createBufferSource();
      source.buffer = ensureNoiseBuffer(ctx);
      const band = ctx.createBiquadFilter();
      band.type = filter;
      band.frequency.value = frequency;
      band.Q.value = q;
      const envelope = ctx.createGain();
      const at = ctx.currentTime + Math.max(0, delayS);
      const peak = clampEffectGain(gain);
      // 立ち上がりを 0 から作る。いきなり値を入れるとプチッと鳴る。
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, durationS / 3));
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
      if (typeof sweepTo === "number") {
        band.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + durationS);
      }
      source.connect(band);
      band.connect(envelope);
      envelope.connect(ctx.destination);
      source.start(at);
      source.stop(at + durationS + 0.02);
      return { source, envelope };
    } catch {
      return null;
    }
  }

  /**
   * 高さの変わる音をひと吹き鳴らす。アームの上下、リールの巻き上げなど、
   * 「動いている」ことを伝える用。
   *
   * 合図音と同じ純音（sine）は使わない。合図と紛れると、聴覚キューへの
   * 反応という測定の前提が濁る——三角波にして倍音の出かたを変えてある。
   */
  function playSweep({ fromHz = 220, toHz = 660, durationS = 0.25, gain = 0.03 } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const at = ctx.currentTime;
      const peak = clampEffectGain(gain);
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(Math.max(40, fromHz), at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), at + durationS);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.03, durationS / 3));
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
      oscillator.connect(envelope);
      envelope.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + durationS + 0.02);
      return { oscillator, envelope };
    } catch {
      return null;
    }
  }

  /**
   * 楽器の音（木琴に近い、やわらかい音）。「おすと でてくる」の押したときの音。
   *
   * 基音（sine）に、すぐ消える4倍音を少し重ねる。純音1本だと測定の合図
   * （440/880Hz の sine）と同じ音色になる——この遊びは測定の課題ではないが、
   * 同じ耳で聞く音なので紛らわしくしない。
   * 音量は旧「色と音」の playTone と同じ（DEFAULT_TONE_GAIN）。強すぎる音は
   * 発作につながりうる、と打ち合わせで言われている
   * （docs/design-renewal-2026-09-25.md §1.7）。
   *
   * @param {number} frequency 基音（Hz）
   * @param {{delayS?: number, durationS?: number}} [options]
   *   delayS は今からの遅れ（和音を順に鳴らすとき用）
   */
  function playChime(frequency, { delayS = 0, durationS = 0.9 } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime + Math.max(0, delayS);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, at);
      out.gain.exponentialRampToValueAtTime(DEFAULT_TONE_GAIN, at + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
      out.connect(ctx.destination);
      [
        { ratio: 1, level: 1, decayS: durationS },
        { ratio: 4, level: 0.28, decayS: 0.18 },
      ].forEach(({ ratio, level, decayS }) => {
        const oscillator = ctx.createOscillator();
        const partial = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency * ratio;
        partial.gain.setValueAtTime(level, at);
        partial.gain.exponentialRampToValueAtTime(0.0001, at + decayS);
        oscillator.connect(partial);
        partial.connect(out);
        oscillator.start(at);
        oscillator.stop(at + durationS + 0.02);
      });
      return out;
    } catch {
      return null;
    }
  }

  /**
   * びっくりする音（ドカーン）。落ちていく低い「ボン」に、こもった破裂音を重ねる。
   *
   * 強い音なので、はじめの遊びの設定で選んだときだけ鳴らす（既定にはしない）。
   * 打ち合わせで「爆発音ばかりだと発作を起こす人もいる」と言われている
   * （docs/design-renewal-2026-09-25.md §1.7）。大きさは効果音の上限の中。
   */
  function playBoom() {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const body = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(150, at);
      oscillator.frequency.exponentialRampToValueAtTime(42, at + 0.45);
      body.gain.setValueAtTime(0.0001, at);
      body.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING, at + 0.01);
      body.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      oscillator.connect(body);
      body.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.6);
      playNoise({ durationS: 0.35, gain: EFFECT_GAIN_CEILING, filter: "lowpass", frequency: 900, sweepTo: 120 });
      return body;
    } catch {
      return null;
    }
  }

  /**
   * 拍手と歓声（できたときのおいわい）。
   *
   * 録音は使わない。短いノイズの「パチ」をばらばらの間隔で重ね、下に
   * こもったノイズの「わー」を敷く。打ち合わせで「できたー！のときに笑い声や
   * 歓声があると、周りが家族だけでも盛り上がって、もう少し頑張ろうという気に
   * なる」と言われた（docs/design-renewal-2026-09-25.md §1.7）。本物の笑い声には
   * 録音素材が要る。
   *
   * 1つ1つの「パチ」は効果音の上限の半分ほどにして、重なっても上限を大きく
   * 超えないようにしてある。
   */
  function playApplause({ durationS = 1.8 } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const buffer = ensureNoiseBuffer(ctx);
      const start = ctx.currentTime + 0.05;
      const length = Math.min(durationS, NOISE_BUFFER_S - 0.1);
      const out = ctx.createGain();
      // 帯で削られるぶん持ち上げる。山が効果音の上限に収まる値を測って決めた
      // （test-results/probe-sounds.mjs。0.8 のときは他の効果音より約19dB小さかった）。
      out.gain.value = APPLAUSE_OUTPUT_GAIN;
      out.connect(ctx.destination);

      const crowd = ctx.createBufferSource();
      crowd.buffer = buffer;
      const crowdBand = ctx.createBiquadFilter();
      crowdBand.type = "bandpass";
      crowdBand.frequency.value = 800;
      crowdBand.Q.value = 0.6;
      const crowdGain = ctx.createGain();
      crowdGain.gain.setValueAtTime(0.0001, start);
      crowdGain.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * 0.5, start + 0.25);
      crowdGain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      crowd.connect(crowdBand);
      crowdBand.connect(crowdGain);
      crowdGain.connect(out);
      crowd.start(start, 0, length);

      for (let index = 0; index < 26; index += 1) {
        // 前半に多く、後半はまばらに（拍手が鳴りやんでいく感じ）。
        const at = start + Math.pow(Math.random(), 1.6) * (length - 0.1);
        const clap = ctx.createBufferSource();
        clap.buffer = buffer;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 1400 + Math.random() * 1200;
        band.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * (0.35 + Math.random() * 0.25), at + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
        clap.connect(band);
        band.connect(gain);
        gain.connect(out);
        clap.start(at, Math.random() * (NOISE_BUFFER_S - 0.2), 0.06);
      }
      return out;
    } catch {
      return null;
    }
  }

  /**
   * ボヨーン（ばねの音）。びよっと上がって、ゆれながら落ちる。
   *
   * 打ち合わせで、力を入れたら「ボカーン」「ボヨーン」と音がするのがよい、
   * と例に出た（docs/design-renewal-2026-09-25.md §1.7）。ボカーンは playBoom。
   */
  function playBoing() {
    if (!getSettings().soundEnabled) return null;
    if (trySample("boing")) return true;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(150, at);
      oscillator.frequency.exponentialRampToValueAtTime(330, at + 0.07);
      oscillator.frequency.exponentialRampToValueAtTime(210, at + 0.7);
      // ばねのゆれ: 11Hz のゆれが、だんだん小さくなる。
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 11;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(70, at + 0.05);
      depth.gain.exponentialRampToValueAtTime(2, at + 0.7);
      wobble.connect(depth);
      depth.connect(oscillator.frequency);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, at);
      out.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING, at + 0.02);
      out.gain.setValueAtTime(EFFECT_GAIN_CEILING, at + 0.22);
      out.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
      oscillator.connect(out);
      out.connect(ctx.destination);
      oscillator.start(at);
      wobble.start(at);
      oscillator.stop(at + 0.8);
      wobble.stop(at + 0.8);
      return out;
    } catch {
      return null;
    }
  }

  /**
   * 「は」ひとつ（笑い声の1音）。息（ノイズ）で始まり、「あ」の響きの声が続く。
   * 声の源はのこぎり波で、「あ」らしさは3つの山（フォルマント 800・1200・2600Hz）
   * を通して作る。
   */
  function laughSyllable(ctx, destination, noise, at, pitch, level) {
    const voicedS = 0.085;
    const source = ctx.createOscillator();
    source.type = "sawtooth";
    source.frequency.setValueAtTime(pitch * 1.08, at + 0.02);
    source.frequency.exponentialRampToValueAtTime(pitch * 0.88, at + 0.05 + voicedS);
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0.0001, at + 0.02);
    voice.gain.exponentialRampToValueAtTime(level, at + 0.045);
    voice.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + voicedS);
    source.connect(voice);
    [
      [800, 5, 1],
      [1200, 7, 0.55],
      [2600, 9, 0.22],
    ].forEach(([frequency, q, gain]) => {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = frequency;
      band.Q.value = q;
      const weight = ctx.createGain();
      weight.gain.value = gain;
      voice.connect(band);
      band.connect(weight);
      weight.connect(destination);
    });
    const breath = ctx.createBufferSource();
    breath.buffer = noise;
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = "bandpass";
    breathBand.frequency.value = 1600;
    breathBand.Q.value = 0.7;
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(0.0001, at);
    breathGain.gain.exponentialRampToValueAtTime(level * 0.12, at + 0.012);
    breathGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    breath.connect(breathBand);
    breathBand.connect(breathGain);
    breathGain.connect(destination);
    source.start(at + 0.02);
    source.stop(at + 0.1 + voicedS);
    breath.start(at, Math.random() * (NOISE_BUFFER_S - 0.2), 0.09);
  }

  /**
   * 笑い声（「あはは」）。できたときのおいわい。
   *
   * 打ち合わせで「できたー！ハハハーみたいな笑い声があると、周りが家族だけでも
   * 盛り上がって、もうちょっと頑張ろうという気になる」と言われた（§1.7）。
   * 録音（sampleUrls の laugh）があればそれを鳴らす。無ければ合成する: 高さと
   * 間の違う3人ぶんの「はは…」を、少しずつ低く・弱くしながら重ねる。
   */
  function playLaugh() {
    if (!getSettings().soundEnabled) return null;
    if (trySample("laugh")) return true;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const noise = ensureNoiseBuffer(ctx);
      const out = ctx.createGain();
      out.gain.value = LAUGH_OUTPUT_GAIN;
      // のこぎり波の高い倍音を落として、ブザーっぽさを減らす。
      const soften = ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 3800;
      out.connect(soften);
      soften.connect(ctx.destination);
      const start = ctx.currentTime + 0.04;
      // 主に笑う人1人と、少し遅れてつられる人1人。重ねすぎると「は」の区切りが
      // 埋もれて、ざわざわした音になる（描いた波形で見た）。
      [
        { f0: 300, count: 6, gap: 0.17, offset: 0, level: 1 },
        { f0: 400, count: 4, gap: 0.2, offset: 0.26, level: 0.45 },
      ].forEach((person) => {
        let at = start + person.offset;
        for (let index = 0; index < person.count; index += 1) {
          const pitch = person.f0 * (1.1 - index * 0.035) * (1 + (Math.random() - 0.5) * 0.05);
          laughSyllable(ctx, out, noise, at, pitch, person.level * Math.pow(0.84, index));
          at += person.gap * (1 + (Math.random() - 0.5) * 0.2);
        }
      });
      return out;
    } catch {
      return null;
    }
  }

  /** 短い上がる口笛（イルカの「キュイ」）。 */
  function whistle(ctx, at, fromHz, toHz, durationS, gain) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(fromHz, at);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, at + durationS);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    envelope.gain.setValueAtTime(gain, at + durationS * 0.7);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
    oscillator.connect(envelope);
    envelope.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + durationS + 0.02);
  }

  /**
   * 生きものの声（「おすと でてくる」「ぬりえ」の音の1つ）。
   *
   * 打ち合わせで「動物の鳴き声とかがいい」と例に出た（§1.7）。出てくるのは
   * 海の生きもの（イルカ・カメ・タコ・カニ・クジラ）なので、鳴き声のあるものは
   * それらしく、無いものは動きの音にした。録音（creature-<id>）があればそちら。
   *
   *   dolphin … キュイキュイ（上がる口笛2つ）
   *   whale   … ブォーン（低くゆれる長い声）
   *   turtle  … ぷくぷく（泡が3つ）
   *   octopus … にゅるん（ゆれながら下がる）
   *   crab    … チョキチョキ（はさみの音が2回ずつ）
   */
  function playCreature(id) {
    if (!getSettings().soundEnabled) return null;
    if (trySample(`creature-${id}`)) return true;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime + 0.01;
      const peak = EFFECT_GAIN_CEILING;
      if (id === "dolphin") {
        whistle(ctx, at, 1500, 2900, 0.13, peak * 0.8);
        whistle(ctx, at + 0.17, 1700, 3300, 0.13, peak * 0.8);
      } else if (id === "whale") {
        const oscillator = ctx.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(230, at);
        oscillator.frequency.exponentialRampToValueAtTime(300, at + 0.35);
        oscillator.frequency.exponentialRampToValueAtTime(170, at + 1.1);
        const sway = ctx.createOscillator();
        sway.frequency.value = 5;
        const swayDepth = ctx.createGain();
        swayDepth.gain.value = 7;
        sway.connect(swayDepth);
        swayDepth.connect(oscillator.frequency);
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(peak, at + 0.18);
        envelope.gain.setValueAtTime(peak, at + 0.7);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.15);
        const hum = ctx.createBiquadFilter();
        hum.type = "lowpass";
        hum.frequency.value = 1400;
        oscillator.connect(envelope);
        envelope.connect(hum);
        hum.connect(ctx.destination);
        oscillator.start(at);
        sway.start(at);
        oscillator.stop(at + 1.2);
        sway.stop(at + 1.2);
      } else if (id === "turtle") {
        [0, 0.12, 0.25].forEach((delay, index) => {
          whistle(ctx, at + delay, 380 + index * 60, 900 + index * 120, 0.07, peak * 0.9);
        });
      } else if (id === "octopus") {
        const oscillator = ctx.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(620, at);
        oscillator.frequency.exponentialRampToValueAtTime(190, at + 0.45);
        const wobble = ctx.createOscillator();
        wobble.frequency.value = 16;
        const depth = ctx.createGain();
        depth.gain.value = 45;
        wobble.connect(depth);
        depth.connect(oscillator.frequency);
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(peak, at + 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        oscillator.connect(envelope);
        envelope.connect(ctx.destination);
        oscillator.start(at);
        wobble.start(at);
        oscillator.stop(at + 0.52);
        wobble.stop(at + 0.52);
      } else if (id === "crab") {
        [0, 0.07, 0.24, 0.31].forEach((delay) => {
          playNoise({ durationS: 0.035, gain: peak * 0.35, filter: "bandpass", frequency: 2800, q: 2, delayS: delay });
          whistle(ctx, at + delay, 1500, 1100, 0.03, peak * 0.3);
        });
      } else {
        return playChime(660);
      }
      return true;
    } catch {
      return null;
    }
  }

  /**
   * ボールを投げた音（「シュッ」）。ボールを打つ遊び（games/baseball.js）。
   * 合図ではなく、投げた出来事を伝えるだけの小さい音。
   */
  function playThrow() {
    return playNoise({ durationS: 0.16, gain: EFFECT_GAIN_CEILING * 0.6, filter: "bandpass", frequency: 900, q: 1.2, sweepTo: 2600 });
  }

  /** 枠が次へ動いたときの小さな音（設定の「枠が動いたときの音」）。 */
  function playScanTick() {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = 1320;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * 0.5, at + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      oscillator.connect(envelope);
      envelope.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.08);
      return envelope;
    } catch {
      return null;
    }
  }

  /** 素振りの音（「ブン」）。ボールが来ていないときに振った。 */
  function playSwing() {
    return playNoise({ durationS: 0.12, gain: EFFECT_GAIN_CEILING * 0.5, filter: "bandpass", frequency: 500, q: 1, sweepTo: 180 });
  }

  /**
   * 打った音。当たり方（ホームラン・ヒット・ころころ）で響きを変える。
   *
   * @param {"homerun"|"hit"|"bunt"} quality
   * @param {string} [style] この遊びの設定の「打ったときの音」。"bat"（カキーン）|
   *   "instrument"（楽器の音）| "boing"（ボヨーン）| "none"
   */
  function playBatHit(quality, style = "bat") {
    if (style === "none") return null;
    if (style === "boing") return playBoing();
    if (style === "instrument") {
      const notes = { homerun: [523.25, 659.25, 783.99, 1046.5], hit: [523.25, 783.99], bunt: [392] };
      (notes[quality] || notes.bunt).forEach((frequency, index) => {
        playChime(frequency, { delayS: index * 0.08, durationS: 0.8 });
      });
      return true;
    }
    if (!getSettings().soundEnabled) return null;
    if (trySample(`bat-${quality}`)) return true;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      if (quality === "bunt") {
        // コツン: こもった短い音。
        playNoise({ durationS: 0.05, gain: EFFECT_GAIN_CEILING * 0.8, filter: "lowpass", frequency: 900 });
        whistle(ctx, at, 720, 560, 0.08, EFFECT_GAIN_CEILING * 0.6);
        return true;
      }
      // カキーン: 金属の高い響き2つ（倍音が整数倍でないので「金属」に聞こえる）と、
      // 当たった瞬間の「カッ」。ホームランは長く響かせる。
      const ring = quality === "homerun" ? 0.55 : 0.3;
      playNoise({ durationS: 0.03, gain: EFFECT_GAIN_CEILING, filter: "bandpass", frequency: 3200, q: 1.5 });
      [
        { frequency: 1860, level: 0.8 },
        { frequency: 2730, level: 0.5 },
        { frequency: 4120, level: 0.25 },
      ].forEach(({ frequency, level }) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * level, at + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + ring);
        oscillator.connect(envelope);
        envelope.connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + ring + 0.02);
      });
      return true;
    } catch {
      return null;
    }
  }

  /** 短い確認音を即時に鳴らす（soundEnabled が ON のときのみ、既存呼び出し互換）。 */
  function playTone(frequency) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    return playToneAt(frequency, ctx.currentTime);
  }

  /**
   * AudioContext をユーザー操作起点でアンロックする（detailed-design.md §6.1）。
   * スタート画面の初回入力で呼ぶ。未生成なら生成し、生成済み／suspended なら
   * resume() のみ行う。
   */
  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * デバイス側の出力遅延の参考値（detailed-design.md §6.3・§9.2）。
   * 補正には使わない（記録のみ。基準オフセットの役割分担は §8.3）。
   */
  function getDeviceInfo() {
    const ctx = ensureContext();
    return {
      outputLatencyS: ctx && typeof ctx.outputLatency === "number" ? ctx.outputLatency : null,
      baseLatencyS: ctx && typeof ctx.baseLatency === "number" ? ctx.baseLatency : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      // 画面の大きさ。スマホでも動くようにした以上、同じ課題を iPad と
      // スマホの両方で回せる——そのとき変わるのは画面だけではない。
      // 視距離・視角・刺激の実寸（crane の景品、rhythm の円は vmin 基準）、
      // スピーカーの特性と音の出方までまとめて変わる。iPad の回とスマホの
      // 回を混ぜて集計すると、差が利用者のものか端末のものか言えなくなる。
      //
      // 端末を禁じるのではなく、条件として残して解析側で分けられるように
      // する（visualGuidance / audioGuidance と同じ扱い）。userAgent だけ
      // では画面の大きさも向きも分からないので、実寸を持つ。
      viewportWidth: typeof window !== "undefined" ? Math.round(window.innerWidth) : null,
      viewportHeight: typeof window !== "undefined" ? Math.round(window.innerHeight) : null,
      devicePixelRatio:
        typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
          ? window.devicePixelRatio
          : null,
    };
  }

  return {
    speak,
    speakOrAnnounce,
    stopSpeech,
    playTone,
    playToneAt,
    playChime,
    playBoom,
    playBoing,
    playLaugh,
    playCreature,
    playThrow,
    playSwing,
    playBatHit,
    playScanTick,
    playApplause,
    playNoise,
    playSweep,
    unlock,
    getDeviceInfo,
    /**
     * リズム系ゲーム用の先読みスケジューラ（detailed-design.md §6.2）。
     * AudioContext がまだ無ければ ensureContext() で生成してから委譲する
     * （スタート画面の unlock() で通常は既に生成済み）。
     */
    scheduler: {
      /**
       * 合図が鳴らせる状態か。
       *
       * AudioContext が「ある」ことと「鳴る」ことは別。iOS では、他アプリの
       * 割り込みや着信で state が "interrupted" になり、自動再生の制限を
       * 解除しそこねると "suspended" のまま残る。どちらも context 自体は
       * 存在するので、有無だけを見るガードは素通りする——合図が一度も
       * 鳴らないまま、押した分だけがデータになる。
       *
       * この状態はヘッドレスでは再現しないので CI では絶対に出ない。
       * 実機でだけ起きる silent failure なので、コード側で明示的に見る。
       */
      canSound() {
        const ctx = ensureContext();
        return Boolean(ctx) && ctx.state === "running";
      },
      /** いまの AudioContext の状態（表示・記録用。無ければ null）。 */
      state() {
        const ctx = ensureContext();
        return ctx ? ctx.state : null;
      },
      start(beatPlan) {
        const ctx = ensureContext();
        return ctx ? scheduler.start(beatPlan) : null;
      },
      stop() {
        scheduler?.stop();
      },
      now() {
        const ctx = ensureContext();
        return ctx ? scheduler.now() : 0;
      },
    },
  };
}
