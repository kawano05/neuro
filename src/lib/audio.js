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
/** ノイズ音源の長さ（秒）。使い回すので、いちばん長い効果音より長くする。 */
const NOISE_BUFFER_S = 2;

/**
 * @param {() => {speechEnabled: boolean, soundEnabled: boolean}} getSettings
 *   設定の現在値を返す関数（state.settings への遅延参照）
 */
export function createAudio(getSettings) {
  let audioContext;
  let scheduler;
  let noiseBuffer = null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  /** AudioContext を（未生成なら）生成し、対応する BeatScheduler も用意する。 */
  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!audioContext) {
      try {
        audioContext = new AudioContextClass();
        scheduler = createBeatScheduler(audioContext);
      } catch {
        audioContext = null;
      }
    }
    return audioContext;
  }

  /** 日本語で読み上げる（speechEnabled が ON のときのみ） */
  function speak(text) {
    if (!getSettings().speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // 表記に合わせて読み上げの言語も変える。英語表記のまま日本語音声で
    // 読ませると、意味の通らない発音になる（src/lib/i18n.js）。
    utterance.lang = speechLangFor(resolveTextMode(getSettings()));
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
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
   */
  function playNoise({
    durationS = 0.2,
    gain = 0.02,
    filter = "lowpass",
    frequency = 1200,
    q = 1,
    sweepTo = null,
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
      const at = ctx.currentTime;
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
    stopSpeech,
    playTone,
    playToneAt,
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
