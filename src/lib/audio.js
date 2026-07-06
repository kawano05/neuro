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

/** ビート予約の既定包絡（sine, gain 0.05, 約0.18秒で減衰）。detailed-design.md §6.2。 */
const DEFAULT_TONE_GAIN = 0.05;
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

/**
 * @param {() => {speechEnabled: boolean, soundEnabled: boolean}} getSettings
 *   設定の現在値を返す関数（state.settings への遅延参照）
 */
export function createAudio(getSettings) {
  let audioContext;
  let scheduler;
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
    utterance.lang = "ja-JP";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
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
    };
  }

  return {
    speak,
    playTone,
    playToneAt,
    unlock,
    getDeviceInfo,
    /**
     * リズム系ゲーム用の先読みスケジューラ（detailed-design.md §6.2）。
     * AudioContext がまだ無ければ ensureContext() で生成してから委譲する
     * （スタート画面の unlock() で通常は既に生成済み）。
     */
    scheduler: {
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
