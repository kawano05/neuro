<script>
  // はじめての支援者向けの「つかいかた」。ふだんは畳んでおく。
  // 中身は印刷用の説明書（public/guide.html）と同じ src/lib/supporterGuide.js から作る
  // （2か所に手で書くと、片方だけ古くなる）。文はリポジトリの中で書いた固定の HTML と、
  // escapeHtml を通した設定の名前だけなので、そのまま差し込む。
  // 言葉は支援者の画面の言語。印刷用の説明書も、その言語のもの（locales/index.js の guideFileName）。
  import { guideFileName } from "../locales/index.js";
  import { supporterGuideHtml } from "../supporterGuide.js";
  import { say, supporterLanguage } from "../supporterText.js";

  $: lang = $supporterLanguage;
  $: body = supporterGuideHtml({ lang });
</script>

<details class="settings-guide" id="settingsGuide">
  <summary>{say({ ja: "はじめての方へ：つかいかた", en: "Getting started: how to use" }, lang)}</summary>
  <div class="settings-guide-body">
    {@html body}
  </div>
  <!-- 同じ中身を絵つきで、印刷して渡せる形にしたもの（public/guide.html）。
       iPad のアプリ版では別の画面を開けないので、settings.js が隠す。 -->
  <p class="settings-guide-print" id="settingsGuidePrint">
    <a href={`./${guideFileName(lang)}`} target="_blank" rel="noopener"
      >{say({ ja: "印刷用の説明書（A4・絵つき）を開く", en: "Open the printable guide (A4, with pictures)" }, lang)}</a
    >
  </p>
</details>
