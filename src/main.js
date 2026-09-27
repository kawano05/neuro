import { mount } from "svelte";
import App from "./App.svelte";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles.css";
// 利用者の世界のデザイン（はっきりした色）。styles.css より後に読む。
import "./theme-hakkiri.css";

const app = mount(App, {
  target: document.getElementById("app"),
});

export default app;
