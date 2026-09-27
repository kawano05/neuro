// =====================================================================
// soundAssets.js — 効果音の録音の差し替え口
//
// src/assets/sounds/ に音のファイルを置くと、合成の代わりにその録音が鳴る
// （audio.js の trySample）。名前はファイル名から拡張子を除いたもの:
//
//   cheer          … できたときの歓声と拍手（playApplause({ sample: "cheer" })）
//   laugh          … できたときの笑い声（playLaugh）
//   boing          … ボヨーン（playBoing）
//   creature-<id>  … 生きものの声（playCreature(id)。dolphin / whale / turtle / octopus / crab）
//   bat-<quality>  … バットの音（playBatHit。homerun / hit / bunt）
//   homerun-cheer  … ホームランの歓声
//
// 打ち合わせで「笑い声」「動物の鳴き声」と言われた音は、合成ではそれらしさに
// 限りがある。置けば効く形にしてあり、置かなければ合成のまま。置く前に
// scripts/prepare-sounds.mjs で大きさをそろえる（src/assets/sounds/README.md）。
//
// import.meta.glob は Vite の機能なので、node で動く単体テストからは読まない
// （audio.js には neuronodeApp.js が URL の表だけを渡す）。
// =====================================================================

const files = import.meta.glob("../assets/sounds/*.{mp3,m4a,aac,wav,ogg}", {
  eager: true,
  query: "?url",
  import: "default",
});

/** 名前 → URL。 */
export const SOUND_SAMPLE_URLS = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split("/").pop().replace(/\.[^.]+$/, ""), url])
);
