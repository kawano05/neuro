// =====================================================================
// audio.js — 効果音と音声読み上げ、リズム系ゲーム向けの先読みスケジューラ
//
// 打合せ要件メモ: 「押した時の音が『自分が操作した』実感に直結する」
// 「音を変えられる機能（爆発系・ポヨン系など）が望ましい」。
// 音バリエーション対応はここに集約する想定（toneプリセット化、
// 将来的には Web Audio によるサンプル再生）。
//
// iOS化の注意:
//   - AudioContext はユーザー操作後に初期化する必要がある（スタート画面の
//     ひと押し。止まったまま残ったときは、操作のたびに resumeIfSuspended で
//     戻す）。消音（マナーモード）で効果音だけ鳴らなくならないよう、
//     Audio Session を「再生」にする（preferPlaybackSession。実機で確認すること）。
//   - speechSynthesis は iOS では日本語ボイスの取得タイミングに癖がある。
//
// P2-1（detailed-design.md §6.2）: createBeatScheduler を追加。Chris Wilson
// 方式（two clocks / lookahead）で、setInterval はスケジューリングの
// トリガーにのみ使い、実際の発音時刻は必ず AudioContext.currentTime 基準の
// osc.start(atTime) で先読み予約する（setInterval の発火時刻を音の発生
// 時刻に使うのは MUST NOT）。
// =====================================================================

import { resolveTextMode, speechLangForText, toSpeechText } from "./i18n.js";
import { createPartyMusic } from "./partyMusic.js";
import { presentation } from "./presentation.js";
import { pickVoice } from "./speechVoice.js";
import { chunkGapS, planVoiceClips, splitSpeechChunks, voiceLang } from "./voicePack.js";

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

/**
 * 測定の課題ではない場面（はじめの遊び・ボールを打つ・ホームや学ぶ画面）で、
 * 効果音を持ち上げる大きさ（dB）。
 *
 * 2026-09-27 に、iPad の内蔵スピーカー相当（300Hz より下がほとんど出ない）で
 * 測ると、効果音は読み上げの声より 17〜41dB 小さかった（楽器の音 −19、拍手 −26、
 * 笑い声 −31、ボールを投げた音 −41。test-results/probe-loudness.mjs）。
 * 「できた！」で拍手・笑い声と「やったー」が同時に鳴ると、声に隠れてほとんど
 * 聞こえない。打ち合わせでは「読み上げより効果音のほうが反応がよい」と
 * 言われている（docs/design-renewal-2026-09-25.md §1.7, §3.17）。
 *
 * 効果音の上限（EFFECT_GAIN_CEILING）は「測定の合図を覆わない」ための決まりで、
 * 合図のある遊び（profile "task"）では今までどおり守る。合図の無い場面
 * （profile "play"）だけ、1音ごとの出口で持ち上げる。声より 6〜8dB 小さいくらい
 * （楽器の音で）を目安にした。
 */
export const PLAY_EFFECT_BOOST_DB = 12;

/**
 * 効果音の出口の倍率。"task"（合図のある遊び）は常に 1 で、音ごとの持ち上げ
 * （makeupDb）も効かない——測定の遊びの音は、この仕組みを入れる前と同じ。
 */
export function effectOutputGain(profile, makeupDb = 0) {
  if (profile !== "play") return 1;
  const extra =
    typeof makeupDb === "number" && Number.isFinite(makeupDb)
      ? Math.min(Math.max(makeupDb, -24), 24)
      : 0;
  return Math.pow(10, (PLAY_EFFECT_BOOST_DB + extra) / 20);
}

/**
 * 音ごとの持ち上げ（dB、"play" のときだけ効く）。どれも、楽器の音（playChime）と
 * 同じくらいに聞こえるように、iPad のスピーカー相当で測って決めた。短い音や
 * 帯の狭い音は、山の高さが同じでも小さく聞こえる。
 */
const APPLAUSE_MAKEUP_DB = 8;
const LAUGH_MAKEUP_DB = 12;
const CRAB_MAKEUP_DB = 13;
const THROW_MAKEUP_DB = 14;
const SWING_MAKEUP_DB = 13;
const SCAN_TICK_MAKEUP_DB = 13;
const BOOM_MAKEUP_DB = 5;
const BUNT_MAKEUP_DB = 2;

/**
 * 録音（src/assets/sounds/）の大きさ。ファイルは scripts/prepare-sounds.mjs で、
 * iPad のスピーカー相当の「いちばん大きい 100ms」が −18dBFS になるように
 * そろえてある。ここで合成の効果音（楽器の音）と同じ大きさへ下げる。
 * おいわいの音（歓声・拍手・笑い声）だけ 2dB 大きく。
 */
const SAMPLE_LEVEL = 0.158; // −16dB
const CELEBRATION_SAMPLE_LEVEL = 0.2; // −14dB
const CELEBRATION_SAMPLES = new Set(["laugh", "applause", "cheer", "homerun-cheer"]);

/** ノイズ音源の長さ（秒）。使い回すので、いちばん長い効果音より長くする。 */
const NOISE_BUFFER_S = 2;

/** 端末の声の速さ（5巡目から。子どもにも聞き取りやすいよう少しゆっくり）。 */
const DEVICE_SPEECH_RATE = 0.92;
/**
 * ネットの要る声（Edge の Natural、Chrome の Google の声）が、これだけ待っても
 * 話しはじめなければ、鳴らないものとして端末の中の声で言い直す。
 */
const REMOTE_VOICE_START_TIMEOUT_MS = 2500;
/** ネットの要る声が鳴らなかったあと、しばらく使わない（つながり直すまで）。 */
const REMOTE_VOICE_RETRY_AFTER_MS = 60_000;
/** 声のパックから作った音を、いくつまで手元に置いておくか。 */
const VOICE_CLIP_CACHE = 48;

/**
 * @param {() => {speechEnabled: boolean, soundEnabled: boolean}} getSettings
 *   設定の現在値を返す関数（state.settings への遅延参照）
 * @param {(message: string) => void} [announce]
 * @param {{sampleUrls?: Record<string, string>, voicePack?: {index: object, urls: Record<string, string>}|null}} [options]
 *   sampleUrls … 録音の差し替え（名前 → URL、soundAssets.js）。ある名前は
 *   合成の代わりに録音を鳴らす（laugh・boing・creature-dolphin など）。
 *   voicePack … アプリに入れた読み上げの声（voiceAssets.js。src/lib/voicePack.js）。
 *   無ければ、読み上げはいつも端末の声。
 */
export function createAudio(getSettings, announce = () => {}, { sampleUrls = {}, voicePack = null } = {}) {
  let audioContext;
  let scheduler;
  let noiseBuffer = null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  // 録音の差し替え。名前 → 読み込み済みの AudioBuffer（読み込み中は Promise）。
  const samples = new Map();
  // いまの場面。"play"（合図の無い場面）か "task"（合図のある遊び）。
  // gameHost が遊びの開始・終了で切り替える。
  let profile = "play";
  const effectSources = new Set();
  let effectGeneration = 0;
  function ownEffectSource(source) {
    effectSources.add(source);
    source.addEventListener?.("ended", () => {
      effectSources.delete(source);
      presentation.run("audio.disconnect", () => source.disconnect());
    }, { once: true });
    return source;
  }

  function stopAll() {
    // 読み込み待ちの録音にも同じ世代を使い、中断後に新しい音を作らせない。
    effectGeneration += 1;
    presentation.run("audio.voice.stop", stopSpeech);
    presentation.run("audio.music.hush", () => music.hush());
    effectSources.forEach(source => {
      presentation.run("audio.source.stop", () => source.stop());
      presentation.run("audio.source.disconnect", () => source.disconnect());
    });
    effectSources.clear();
  }
  // 少し遅らせて読み上げる文（おいわいの音のあと）。stopSpeech で取り消す。
  let pendingSpeech = null;
  // 読み上げの番号。新しく読む・止めるたびに進む。読み込みや待ちのあとで、
  // もう古くなった読み上げを鳴らさないために見る。
  let speechToken = 0;
  const voiceRetryTimers = new Set();
  function clearVoiceRetry(timer) {
    window.clearTimeout(timer);
    voiceRetryTimers.delete(timer);
  }
  // 鳴っている（鳴る予定の）声のパックの音。
  let voiceSources = [];
  // 声のパック（言語 → 読み込み中の Promise<ArrayBuffer|null>）と、そこから作った音。
  const voicePackData = new Map();
  const voiceClips = new Map();
  // ネットの要る声が鳴らなかった時刻（しばらく端末の中の声だけにする）。
  let remoteVoiceFailedAt = -Infinity;
  // おおさわぎの音楽（partyMusic.js）。効果音と同じ出口を通し、効果音を切れば鳴らない。
  const music = createPartyMusic({
    getContext: () => ensureContext(),
    getOutput: (ctx) => effectOut(ctx),
    enabled: () => getSettings().soundEnabled !== false,
  });

  function setProfile(next) {
    profile = next === "task" ? "task" : "play";
  }

  /**
   * 効果音の出口。1音ごとに作る——場面が切り替わった瞬間に、鳴り終わりかけの
   * 音の大きさが跳ねないように。合図の音（scheduleOscillatorTone）は通さない。
   */
  function effectOut(ctx, makeupDb = 0) {
    const node = ctx.createGain();
    node.gain.value = effectOutputGain(profile, makeupDb);
    node.connect(ctx.destination);
    return node;
  }

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
   *
   * 大きさは、ファイルがそろえてある前提（scripts/prepare-sounds.mjs）で決まった
   * 値にする。以前は圧縮器（DynamicsCompressor）で頭を押さえていたが、圧縮器は
   * 自動で持ち上げ（makeup）も掛けるので、出てくる大きさが読めなかった。
   *
   * @param {string} name
   * @param {{delayS?: number}} [options] delayS … 今からの遅れ（秒、音の時計で予約）
   */
  function trySample(name, { delayS = 0 } = {}) {
    if (!sampleUrls[name]) return false;
    const ctx = ensureContext();
    if (!ctx) return false;
    const level = CELEBRATION_SAMPLES.has(name) ? CELEBRATION_SAMPLE_LEVEL : SAMPLE_LEVEL;
    const requestedAt = ctx.currentTime + Math.max(0, delayS);
    const currentGeneration = effectGeneration;
    const play = (buffer) => {
      if (!buffer || currentGeneration !== effectGeneration) return;
      try {
        const source = ownEffectSource(ctx.createBufferSource());
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = level;
        source.connect(gain);
        gain.connect(effectOut(ctx));
        // 読み込みを待ったぶん遅れたときは、すぐ鳴らす（予約が過去になる）。
        source.start(Math.max(ctx.currentTime, requestedAt));
      } catch {
        // 鳴らせなくても遊びは止めない。
      }
    };
    const entry = samples.get(name);
    if (entry instanceof Promise) entry.then(play);
    else play(entry);
    return true;
  }

  /** 端末にある声の一覧（まだ読み込まれていなければ空）。 */
  function availableVoices(synth) {
    try {
      return typeof synth?.getVoices === "function" ? synth.getVoices() || [] : [];
    } catch {
      return [];
    }
  }
  // 声の一覧は、最初に尋ねたときに読み込みが始まる端末がある。先に一度尋ねておく。
  if (typeof window !== "undefined") availableVoices(window.speechSynthesis);

  /**
   * 読み上げたことを知らせる（テストと、あとから確かめるため）。
   * via … "voice-pack"（アプリに入れた声）か "device"（端末の声）。
   */
  function reportSpeech(detail) {
    try {
      window.dispatchEvent(new CustomEvent("neuronode:speech", { detail }));
    } catch {
      // 知らせられなくても読み上げは止めない。
    }
  }

  /** 声のパックを読み込む（1回だけ。失敗したら null で、端末の声に任せる）。 */
  function loadVoicePack(lang) {
    const key = voiceLang(lang);
    if (voicePackData.has(key)) return voicePackData.get(key);
    const url = voicePack?.urls?.[key];
    const loading =
      url && typeof fetch === "function"
        ? fetch(url)
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .catch(() => null)
        : Promise.resolve(null);
    voicePackData.set(key, loading);
    // 失敗したときは、次に読むときにもう一度試す（いっときの通信の失敗で、
    // その後ずっと端末の声にならないように）。
    loading.then((data) => {
      if (!data && voicePackData.get(key) === loading) voicePackData.delete(key);
    });
    return loading;
  }

  /**
   * 声のパックを先に読み込んでおく（スタートのひと押し。最初の読み上げを待たせない）。
   * 日本語はいつも（英語の表記でも、ことばや文字は日本語で読む）、英語は英語の表記のとき。
   */
  function prefetchVoice() {
    const settings = getSettings();
    if (!voicePack || !settings.speechEnabled || settings.speechVoice === "device") return;
    loadVoicePack("ja");
    if (resolveTextMode(settings) === "en") loadVoicePack("en");
  }

  /** パックの中の1つの音を AudioBuffer にする（作ったものは少しのあいだ取っておく）。 */
  function decodeVoiceClip(ctx, lang, [offset, length]) {
    const key = `${voiceLang(lang)}:${offset}`;
    const cached = voiceClips.get(key);
    if (cached) {
      voiceClips.delete(key);
      voiceClips.set(key, cached);
      return cached;
    }
    const decoding = loadVoicePack(lang)
      .then((data) => (data ? ctx.decodeAudioData(data.slice(offset, offset + length)) : null))
      .catch(() => null);
    voiceClips.set(key, decoding);
    decoding.then((buffer) => {
      if (!buffer) voiceClips.delete(key);
    });
    while (voiceClips.size > VOICE_CLIP_CACHE) voiceClips.delete(voiceClips.keys().next().value);
    return decoding;
  }

  /** 音の出口が動いているか（止まっていれば戻してみて、少しだけ待つ）。 */
  function audioRunning(ctx) {
    if (ctx.state === "running") return Promise.resolve(true);
    if (ctx.state === "closed" || typeof ctx.resume !== "function") return Promise.resolve(false);
    return Promise.race([
      ctx.resume().then(
        () => ctx.state === "running",
        () => false
      ),
      new Promise((resolve) => window.setTimeout(() => resolve(ctx.state === "running"), 300)),
    ]);
  }

  function stopVoiceClips() {
    const sources = voiceSources;
    voiceSources = [];
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 始まる前・終わったあとの stop は無視してよい。
      }
      try {
        source.disconnect();
      } catch {
        /* noop */
      }
    });
  }

  /**
   * いま読んでいるもの（声のパック・端末の声）を止め、番号を進める。
   * 少し遅らせて読む文（おいわいの「やったー」）の待ちは、ここでは取り消さない
   * ——けっかの画面で枠が動いて名前を読んでも、おいわいの声は消さない（前から
   * そうだった）。待ちも取り消すのは stopSpeech。
   */
  function silenceSpeech() {
    speechToken += 1;
    stopVoiceClips();
    try {
      window.speechSynthesis?.cancel?.();
    } catch {
      /* noop */
    }
    return speechToken;
  }

  /**
   * 声のパックの音を、文の切れ目に間を置いて順に鳴らす。読み込めなかったときは
   * fallback（端末の声）で読む。
   */
  function playVoiceClips(ctx, token, lang, plan, chunks, volume, fallback) {
    Promise.all([Promise.all(plan.map((range) => decodeVoiceClip(ctx, lang, range))), audioRunning(ctx)])
      .then(([buffers, running]) => {
        if (token !== speechToken) return;
        // 音の出口が止まったまま（iOS で電話のあとなど。戻せるのは操作の中だけ）なら、
        // 予約しても鳴らない。黙るより、端末の声で読む。
        if (buffers.some((buffer) => !buffer) || !running) {
          fallback();
          return;
        }
        const out = ctx.createGain();
        out.gain.value = volume;
        out.connect(ctx.destination);
        let at = ctx.currentTime + 0.02;
        buffers.forEach((buffer, index) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(out);
          source.start(at);
          voiceSources.push(source);
          at += buffer.duration + (index < buffers.length - 1 ? chunkGapS(chunks[index]) : 0);
        });
        // 声のあいだは音楽を下げる（声が音楽に埋もれないように）。
        music.duck(at - ctx.currentTime);
      })
      .catch(() => {
        if (token !== speechToken) return;
        fallback();
      });
  }

  /**
   * 端末の声で読む。ネットの要る声（Edge の Natural、Chrome の Google の声）を
   * 使ったときは、鳴らなかったら端末の中の声で1回だけ言い直す——病院・施設では
   * ネットにつながらないことがあり、そのまま黙ると伝えたいことが届かない。
   */
  function speakWithDevice(spokenText, lang, volume, token, { localOnly = false, onFailure = () => {} } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.speak !== "function" || typeof globalThis.SpeechSynthesisUtterance !== "function") {
      return false;
    }
    try {
      const online =
        !localOnly &&
        (typeof navigator === "undefined" || navigator.onLine !== false) &&
        Date.now() - remoteVoiceFailedAt > REMOTE_VOICE_RETRY_AFTER_MS;
      const utterance = new SpeechSynthesisUtterance(spokenText);
      // 声を選ぶ（src/lib/speechVoice.js）。選ばないと、iPhone / iPad では機械的な
      // 声になることがあった。合う声が無ければ端末の既定に任せる。
      const voice = pickVoice(availableVoices(synth), lang, { online });
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || lang;
      utterance.rate = DEVICE_SPEECH_RATE;
      // 合図音・効果音を増量せず、相対的に大きかったTTS側を先に調整する。
      utterance.volume = volume;
      if (voice && voice.localService === false) {
        let settled = false;
        const retry = () => {
          if (settled) return;
          settled = true;
          clearVoiceRetry(timer);
          remoteVoiceFailedAt = Date.now();
          if (token !== speechToken) return;
          try {
            synth.cancel();
          } catch {
            /* noop */
          }
          if (!speakWithDevice(spokenText, lang, volume, token, { localOnly: true, onFailure })) onFailure();
        };
        const timer = window.setTimeout(retry, REMOTE_VOICE_START_TIMEOUT_MS);
        voiceRetryTimers.add(timer);
        utterance.onstart = () => {
          settled = true;
          clearVoiceRetry(timer);
        };
        utterance.onerror = (event) => {
          // 止めた（cancel）ときの知らせは、鳴らなかったことではない。
          if (event?.error === "interrupted" || event?.error === "canceled") {
            settled = true;
            clearVoiceRetry(timer);
            return;
          }
          if (settled) {
            if (token === speechToken) onFailure();
          } else {
            retry();
          }
        };
      }
      if (!voice || voice.localService !== false) {
        utterance.onerror = (event) => {
          if (token !== speechToken || ["interrupted", "canceled"].includes(event?.error)) return;
          onFailure();
        };
      }
      synth.speak(utterance);
      return true;
    } catch {
      // 一部のWKWebViewはAPIを公開していても初期化直後に例外を返す。
      // その場合は所有権をlive regionへ戻し、通知自体を失わない。
      return false;
    }
  }

  /**
   * 読み上げる（speechEnabled が ON のときのみ）。
   *
   * アプリに入れた声（声のパック）にその文の音があれば、それを鳴らす。無ければ
   * （または設定で「端末の声」を選んでいれば）端末の読み上げで読む。
   * どちらでも、前の読み上げは止めてから読む。
   */
  function speak(text, onFailure = () => announce(text)) {
    const speechSettings = getSettings();
    if (!speechSettings.speechEnabled) return false;
    // 表記に合わせて読み上げの言語も変える。英語表記のまま日本語音声で
    // 読ませると、意味の通らない発音になる（src/lib/i18n.js）。英語表記でも
    // 文が日本語なら日本語の声で読む（speechLangForText）。
    const lang = speechLangForText(text, resolveTextMode(speechSettings));
    // 画面の文（分かち書き・かなの助数詞）を、声で読む文に整える（toSpeechText）。
    const spokenText = toSpeechText(text, lang);
    if (!spokenText) return false;
    const volume = clampSpeechVolume(speechSettings.speechVolume);
    if (voicePack && speechSettings.speechVoice !== "device") {
      const chunks = splitSpeechChunks(spokenText, lang);
      const plan = planVoiceClips(voicePack.index, lang, chunks);
      const ctx = plan ? ensureContext() : null;
      if (plan && ctx) {
        const token = silenceSpeech();
        playVoiceClips(ctx, token, lang, plan, chunks, volume, () => {
          if (speakWithDevice(spokenText, lang, volume, token, { onFailure })) {
            reportSpeech({ text: spokenText, lang, via: "device", fallback: true });
          } else {
            // パックの予約は成功ではない。非同期の二重障害でも文字へ所有権を戻す。
            onFailure();
          }
        });
        reportSpeech({ text: spokenText, lang, via: "voice-pack", chunks, volume });
        return true;
      }
    }
    const token = silenceSpeech();
    if (!speakWithDevice(spokenText, lang, volume, token, { onFailure })) return false;
    // 端末の声は長さが分からないので、短い文ぶん下げる。
    music.duck(1.8);
    reportSpeech({ text: spokenText, lang, via: "device", volume });
    return true;
  }

  /** アプリTTSかlive regionの一方だけに、その回の音声所有権を与える。 */
  function speakOrAnnounce(spokenText, announcementText = spokenText) {
    if (speak(spokenText, () => announce(announcementText))) return "app-tts";
    announce(announcementText);
    return "live-region";
  }

  function cancelPendingSpeech() {
    if (pendingSpeech !== null) {
      window.clearTimeout(pendingSpeech);
      pendingSpeech = null;
    }
  }

  /**
   * 少し間をおいて読み上げる（speakOrAnnounce と同じ振り分け）。
   *
   * できたときに、歓声・拍手・笑い声と「やったー」を同時に鳴らすと、声に
   * 隠れておいわいの音がほとんど聞こえなかった。音を先に聞かせてから声にする
   * （games/beginnerKit.js の celebrate）。遊びが終わってリザルトへ移っても
   * 取り消さない。ホームへ戻る・次の遊びが始まる（stopSpeech）と取り消す。
   */
  function speakOrAnnounceLater(spokenText, delayMs, announcementText = spokenText) {
    cancelPendingSpeech();
    if (!(delayMs > 0)) return speakOrAnnounce(spokenText, announcementText);
    pendingSpeech = window.setTimeout(() => {
      pendingSpeech = null;
      speakOrAnnounce(spokenText, announcementText);
    }, delayMs);
    return "scheduled";
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
    voiceRetryTimers.forEach(timer => window.clearTimeout(timer));
    voiceRetryTimers.clear();
    cancelPendingSpeech();
    silenceSpeech();
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
    const tone = scheduleOscillatorTone(ctx, frequency, atTimeS, gain);
    if (tone) ownEffectSource(tone.oscillator);
    return tone;
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
   * @param {number} [options.makeupDb] 合図の無い場面だけの持ち上げ（effectOutputGain）
   */
  function playNoise({
    durationS = 0.2,
    gain = 0.02,
    filter = "lowpass",
    frequency = 1200,
    q = 1,
    sweepTo = null,
    delayS = 0,
    makeupDb = 0,
  } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const source = ownEffectSource(ctx.createBufferSource());
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
      envelope.connect(effectOut(ctx, makeupDb));
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
  function playSweep({ fromHz = 220, toHz = 660, durationS = 0.25, gain = 0.03, makeupDb = 0 } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const oscillator = ownEffectSource(ctx.createOscillator());
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
      envelope.connect(effectOut(ctx, makeupDb));
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
   * @param {{delayS?: number, durationS?: number, level?: number}} [options]
   *   delayS は今からの遅れ（和音を順に鳴らすとき用）。level は 0〜1 の倍率
   */
  function playChime(frequency, { delayS = 0, durationS = 0.9, level = 1 } = {}) {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime + Math.max(0, delayS);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, at);
      // level … 和音で重ねるときに下げる（重ねた山が上限を越えないように）。1 より上にはしない。
      out.gain.exponentialRampToValueAtTime(DEFAULT_TONE_GAIN * Math.min(Math.max(level, 0.05), 1), at + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
      out.connect(effectOut(ctx));
      [
        { ratio: 1, level: 1, decayS: durationS },
        { ratio: 4, level: 0.28, decayS: 0.18 },
      ].forEach(({ ratio, level, decayS }) => {
        const oscillator = ownEffectSource(ctx.createOscillator());
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
   * びっくりする音（ボカーン）。落ちていく「ボ」に、はじける「カーン」を重ねる。
   *
   * 強い音なので、はじめの遊びの設定で選んだときだけ鳴らす（既定にはしない）。
   * 打ち合わせで「爆発音ばかりだと発作を起こす人もいる」と言われている
   * （docs/design-renewal-2026-09-25.md §1.7）。大きさはほかの効果音と同じで、
   * 驚かせるのは音色。
   *
   * 以前は 150→42Hz のサイン波と、こもった雑音だけだった。音の大半が 300Hz より
   * 下にあり、iPad の内蔵スピーカーでは 11dB 落ちて、ほとんど鳴らなかった
   * （2026-09-27 に測った）。「ボ」は三角波にして倍音を持たせ、耳にいちばん
   * 届く帯（1〜2kHz）の「カーン」を足した。
   */
  function playBoom() {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      const oscillator = ownEffectSource(ctx.createOscillator());
      const body = ctx.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(220, at);
      oscillator.frequency.exponentialRampToValueAtTime(55, at + 0.5);
      body.gain.setValueAtTime(0.0001, at);
      body.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING, at + 0.01);
      body.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      oscillator.connect(body);
      body.connect(effectOut(ctx, BOOM_MAKEUP_DB));
      oscillator.start(at);
      oscillator.stop(at + 0.65);
      playNoise({ durationS: 0.45, gain: EFFECT_GAIN_CEILING, filter: "bandpass", frequency: 1600, q: 0.7, sweepTo: 280, makeupDb: BOOM_MAKEUP_DB });
      playNoise({ durationS: 0.35, gain: EFFECT_GAIN_CEILING, filter: "lowpass", frequency: 900, sweepTo: 120, makeupDb: BOOM_MAKEUP_DB });
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
   *
   * 録音があればそちら（sample: できたときは "cheer"＝子どもの「イエーイ」と拍手、
   * ホームランは "homerun-cheer"）。
   *
   * @param {{durationS?: number, sample?: string}} [options]
   */
  function playApplause({ durationS = 1.8, sample = "applause" } = {}) {
    if (!getSettings().soundEnabled) return null;
    if (trySample(sample)) return true;
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
      out.connect(effectOut(ctx, APPLAUSE_MAKEUP_DB));

      const crowd = ownEffectSource(ctx.createBufferSource());
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
        const clap = ownEffectSource(ctx.createBufferSource());
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
      const oscillator = ownEffectSource(ctx.createOscillator());
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(150, at);
      oscillator.frequency.exponentialRampToValueAtTime(330, at + 0.07);
      oscillator.frequency.exponentialRampToValueAtTime(210, at + 0.7);
      // ばねのゆれ: 11Hz のゆれが、だんだん小さくなる。
      const wobble = ownEffectSource(ctx.createOscillator());
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
      out.connect(effectOut(ctx));
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
    const source = ownEffectSource(ctx.createOscillator());
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
    const breath = ownEffectSource(ctx.createBufferSource());
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
  function playLaugh({ delayS = 0 } = {}) {
    if (!getSettings().soundEnabled) return null;
    if (trySample("laugh", { delayS })) return true;
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
      soften.connect(effectOut(ctx, LAUGH_MAKEUP_DB));
      const start = ctx.currentTime + 0.04 + Math.max(0, delayS);
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
  function whistle(ctx, at, fromHz, toHz, durationS, gain, makeupDb = 0) {
    const oscillator = ownEffectSource(ctx.createOscillator());
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(fromHz, at);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, at + durationS);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    envelope.gain.setValueAtTime(gain, at + durationS * 0.7);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
    oscillator.connect(envelope);
    envelope.connect(effectOut(ctx, makeupDb));
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
        const oscillator = ownEffectSource(ctx.createOscillator());
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(230, at);
        oscillator.frequency.exponentialRampToValueAtTime(300, at + 0.35);
        oscillator.frequency.exponentialRampToValueAtTime(170, at + 1.1);
        const sway = ownEffectSource(ctx.createOscillator());
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
        hum.connect(effectOut(ctx));
        oscillator.start(at);
        sway.start(at);
        oscillator.stop(at + 1.2);
        sway.stop(at + 1.2);
      } else if (id === "turtle") {
        [0, 0.12, 0.25].forEach((delay, index) => {
          whistle(ctx, at + delay, 380 + index * 60, 900 + index * 120, 0.07, peak * 0.9);
        });
      } else if (id === "octopus") {
        const oscillator = ownEffectSource(ctx.createOscillator());
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(620, at);
        oscillator.frequency.exponentialRampToValueAtTime(190, at + 0.45);
        const wobble = ownEffectSource(ctx.createOscillator());
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
        envelope.connect(effectOut(ctx));
        oscillator.start(at);
        wobble.start(at);
        oscillator.stop(at + 0.52);
        wobble.stop(at + 0.52);
      } else if (id === "crab") {
        [0, 0.07, 0.24, 0.31].forEach((delay) => {
          playNoise({ durationS: 0.035, gain: peak * 0.35, filter: "bandpass", frequency: 2800, q: 2, delayS: delay, makeupDb: CRAB_MAKEUP_DB });
          whistle(ctx, at + delay, 1500, 1100, 0.03, peak * 0.3, CRAB_MAKEUP_DB);
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
   *
   * 画面を見られない人には、これが「ボールが来るよ」の知らせになる。以前は
   * 帯の狭い雑音で、読み上げより 41dB 小さく、ほとんど聞こえなかった
   * （2026-09-27 に測った）。帯を広げ、少し長くした。
   */
  function playThrow() {
    return playNoise({ durationS: 0.24, gain: EFFECT_GAIN_CEILING, filter: "bandpass", frequency: 700, q: 0.8, sweepTo: 3200, makeupDb: THROW_MAKEUP_DB });
  }

  /** 枠が次へ動いたときの小さな音（設定の「枠が動いたときの音」）。 */
  function playScanTick() {
    if (!getSettings().soundEnabled) return null;
    const ctx = ensureContext();
    if (!ctx) return null;
    try {
      const at = ctx.currentTime;
      const oscillator = ownEffectSource(ctx.createOscillator());
      oscillator.type = "triangle";
      oscillator.frequency.value = 1320;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * 0.5, at + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      oscillator.connect(envelope);
      envelope.connect(effectOut(ctx, SCAN_TICK_MAKEUP_DB));
      oscillator.start(at);
      oscillator.stop(at + 0.08);
      return envelope;
    } catch {
      return null;
    }
  }

  /** 素振りの音（「ブン」）。ボールが来ていないときに振った。 */
  function playSwing() {
    return playNoise({ durationS: 0.16, gain: EFFECT_GAIN_CEILING, filter: "bandpass", frequency: 1200, q: 0.7, sweepTo: 400, makeupDb: SWING_MAKEUP_DB });
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
        playNoise({ durationS: 0.05, gain: EFFECT_GAIN_CEILING * 0.8, filter: "lowpass", frequency: 900, makeupDb: BUNT_MAKEUP_DB });
        whistle(ctx, at, 720, 560, 0.08, EFFECT_GAIN_CEILING * 0.6, BUNT_MAKEUP_DB);
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
        const oscillator = ownEffectSource(ctx.createOscillator());
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(EFFECT_GAIN_CEILING * level, at + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + ring);
        oscillator.connect(envelope);
        envelope.connect(effectOut(ctx));
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
    preferPlaybackSession();
    prefetchVoice();
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * 音が止まったままなら戻す（ユーザー操作の中で呼ぶ。neuronodeApp.js）。
   *
   * iOS では、スリープ・ほかのアプリ・着信のあと、AudioContext が "suspended" や
   * "interrupted" のまま残ることがある。戻せるのはユーザー操作の中だけで、以前は
   * スタート画面の最初のひと押し（unlock）でしか戻していなかった——ホームへ戻った
   * あとは、効果音が鳴らないままになりえた。まだ作っていない（スタート前）なら
   * 何もしない。
   */
  function resumeIfSuspended() {
    if (!audioContext) return;
    preferPlaybackSession();
    if (audioContext.state !== "running" && audioContext.state !== "closed") {
      audioContext.resume().catch(() => {});
    }
  }

  /**
   * 消音（マナーモード）でも効果音を鳴らす（Audio Session API。iOS 17 以降の Safari
   * と WKWebView）。
   *
   * Web Audio は既定で「まわりの音」の扱いになり、iPhone の消音スイッチや iPad の
   * 消音で鳴らなくなる。読み上げは聞こえるのに効果音だけ鳴らない、ということが
   * 起きうる。このアプリでは音が「押した手応え」そのもの（§1.7）なので、動画や
   * 音楽と同じ「再生」の扱いにする。対応していない環境では何もしない。
   * アプリ版（Capacitor）は、ネイティブ側の AVAudioSession も .playback にする
   * （docs/design-renewal-2026-09-25.md §3.17）。
   */
  function preferPlaybackSession() {
    try {
      const session = typeof navigator !== "undefined" ? navigator.audioSession : null;
      if (session && session.type !== "playback") session.type = "playback";
    } catch {
      // 変えられなくても、音そのものは止めない。
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
    /** おおさわぎの音楽（partyMusic.js）。 */
    music,
    speakOrAnnounce,
    speakOrAnnounceLater,
    stopSpeech,
    stopAll,
    prefetchVoice,
    setProfile,
    /** いまの場面（テスト・記録用）。 */
    profile: () => profile,
    resumeIfSuspended,
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
