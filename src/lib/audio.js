// =====================================================================
// audio.js — 効果音と音声読み上げ
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
// =====================================================================

/**
 * @param {() => {speechEnabled: boolean, soundEnabled: boolean}} getSettings
 *   設定の現在値を返す関数（state.settings への遅延参照）
 */
export function createAudio(getSettings) {
  let audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  /** 日本語で読み上げる（speechEnabled が ON のときのみ） */
  function speak(text) {
    if (!getSettings().speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  /** 短い確認音を鳴らす（soundEnabled が ON のときのみ） */
  function playTone(frequency) {
    if (!getSettings().soundEnabled || !AudioContextClass) return;
    try {
      if (!audioContext) audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {
      // 古い組み込みブラウザでは AudioContext が使えない場合がある。
    }
  }

  /**
   * AudioContext をユーザー操作起点でアンロックする（detailed-design.md §6.1）。
   * スタート画面の初回入力で呼ぶ。未生成なら生成し、生成済み／suspended なら
   * resume() のみ行う。P2-1 で BeatScheduler と時計対応付け（audioContext.currentTime）
   * を本格活用するまでは、ここでは生成＋resume 以上のことはしない
   * （BeatScheduler 自体は次フェーズで追加する。§0.2 のP1範囲外）。
   */
  function unlock() {
    if (!AudioContextClass) return;
    try {
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch {
      // 古い組み込みブラウザでは AudioContext が使えない場合がある。
    }
  }

  return { speak, playTone, unlock };
}
