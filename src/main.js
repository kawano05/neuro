import { mount } from "svelte";
import App from "./App.svelte";
import { isPreviewBuild } from "./lib/content.js";
// アイコンの書体は、使っている2種（solid・regular）だけ読む。all.min.css にすると
// 使わないブランドのロゴ用の書体（約100KB）も配布物と事前キャッシュに入る。
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "@fortawesome/fontawesome-free/css/regular.min.css";
import "./styles.css";
// 利用者の世界のデザイン（はっきりした色）。styles.css より後に読む。
import "./theme-hakkiri.css";
// タイミングの遊びの、れんしゅうの回の世界。theme-hakkiri.css の後に読む。
// リールを 止める（昼の ゆうえんち）。
import "./world-slot.css";
// アームで つかむ（おもちゃ屋さん）。
import "./world-crane.css";
// さかなつり（押すと 出てくる とつながる海）。
import "./world-fishing.css";
// 高い音だけ（夕方の丘の音楽会）。
import "./world-gonogo.css";
// 説明・けっか・れんしゅうの割り付けを、画面の大きさに合わせる。
import "./responsive.css";
// 装飾の動きを止める決まり（雰囲気・そくてい）。どの動きより
// 後から効かせたいので、いちばん最後に読む。
import "./decoration-motion.css";

const app = mount(App, {
  target: document.getElementById("app"),
});

// プレビュー版（本番サイトの /preview/ に同居させる版。src/lib/content.js の
// isPreviewBuild）だけの目印。同じ端末で本番と取り違えないように、記録が本番と
// 別であることも書いておく。押せない飾りなので、走査にも読み上げにも乗せない。
if (isPreviewBuild) {
  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = "プレビュー版（記録は本番と別）";
  document.body.append(badge);
}

export default app;
