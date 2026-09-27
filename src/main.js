import { mount } from "svelte";
import App from "./App.svelte";
import { isPreviewBuild } from "./lib/content.js";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles.css";
// 利用者の世界のデザイン（はっきりした色）。styles.css より後に読む。
import "./theme-hakkiri.css";

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
