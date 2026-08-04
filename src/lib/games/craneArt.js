// UFOキャッチャーの画像素材の URL。
//
// games/crane.js（プレイ画面）と games/gameHost.js（リザルトに取れた景品を
// 並べる）の両方から使うので、片方に置いて import し合うより独立させる。
//
// import ではなく new URL(..., import.meta.url) を使うのは games/fishing.js と
// 同じ理由。素の Node は .png を import できず、単体テストが起動しなくなる。

export const clawOpenUrl = new URL("../../assets/crane/claw-open.png", import.meta.url).href;
export const clawClosedUrl = new URL("../../assets/crane/claw-closed.png", import.meta.url).href;

/** content.js の cranePrizes[].asset → 画像URL。 */
export const PRIZE_ART = {
  "prize-bear": new URL("../../assets/crane/prize-bear.png", import.meta.url).href,
  "prize-rabbit": new URL("../../assets/crane/prize-rabbit.png", import.meta.url).href,
  "prize-star": new URL("../../assets/crane/prize-star.png", import.meta.url).href,
};
