// =====================================================================
// voiceAssets.js — アプリに入れた読み上げの声（声のパック）の読み込み口
//
// src/assets/voice/ の ja.bin / en.bin（文ごとの mp3 をつないだもの）と、
// 文 → 位置の表 index.json。作るのは scripts/voice/generate.py。
// 引き方は src/lib/voicePack.js、鳴らすのは audio.js の speak。
//
// import.meta.glob は Vite の機能なので、node で動く単体テストからは読まない
// （audio.js には neuronodeApp.js がこの表を渡す。soundAssets.js と同じ形）。
// =====================================================================

import voiceIndex from "../assets/voice/index.json";

const packs = import.meta.glob("../assets/voice/*.bin", {
  eager: true,
  query: "?url",
  import: "default",
});

/** 言語 → パックの URL。 */
const urls = Object.fromEntries(
  Object.entries(packs).map(([path, url]) => [path.split("/").pop().replace(/\.bin$/, ""), url])
);

export const VOICE_PACK = { index: voiceIndex, urls };
