// =====================================================================
// soundCredits.js — アプリに入れた録音の出典と、使ってよい権利
//
// src/assets/sounds/ の録音（scripts/prepare-sounds.mjs で切り出したもの）の
// クレジット。CC BY の素材は、作者・出典・ライセンス・手を入れたことを、
// アプリの中で見られるところに出す（支援者の設定「見え方・音」のいちばん下。
// views/settings.js が描く）。App Store で配る版でも、アプリの中にこの表示が
// あることが使う条件になる。
//
// 選んだのは、公開のリポジトリに置いてよい（再配布してよい）ライセンスだけ。
// このリポジトリは公開なので、音のファイルは誰でも取り出せる。「再配布禁止」の
// 素材サイト（効果音ラボなど）は、音は良くても使えない（docs §3.17）。
// =====================================================================

const CC_BY_4 = { license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja" };
const CC0 = { license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.ja" };

export const SOUND_CREDITS = [
  {
    use: "できたときの歓声と拍手、ボールを打つ遊びのバットの音とホームランの歓声",
    title: "歓声 イェイ02、SNES 野球01",
    author: "OtoLogic",
    source: "https://otologic.jp",
    ...CC_BY_4,
    changes: "短く切り、音の大きさをそろえた",
  },
  {
    use: "押したときの音「ボヨーン」",
    title: "Boing raw",
    author: "cfork",
    source: "https://commons.wikimedia.org/wiki/File:Boing_raw.ogg",
    ...CC_BY_4,
    changes: "短く切り、雑音を減らし、音の大きさをそろえた",
  },
  {
    use: "押したときの音「生きものの声」のクジラ",
    title: "Humpbackwhale2",
    author: "Spyrogumas",
    source: "https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg",
    ...CC0,
    changes: "短く切り、雑音を減らし、音の大きさをそろえた",
  },
  {
    use: "押したときの音「生きものの声」のイルカ",
    title: "dolphin screaming underwater in caribbean sea mexico",
    author: "Felix Blume",
    source:
      "https://commons.wikimedia.org/wiki/File:161691_felixblume_dolphin-screaming-underwater-in-caribbean-sea-mexico.wav",
    ...CC0,
    changes: "短く切り、雑音を減らし、音の大きさをそろえた",
  },
];
