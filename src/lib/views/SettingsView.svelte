<script>
  // よく使う7項目（言語を含む）だけを常設し、目的別の詳細は複数同時に開ける形にする。
  // 開閉は保存状態に影響しない。設計と項目表: docs/rules/supporter-settings.md、
  // 見直し: docs/reports/2026-10-01/settings-polish.md。
  // 言葉は支援者の画面の言語（supporterText.js）。言語を変えると、その場で描き直す。
  import { PLAY_DETAILS, settingsGroup as group } from "../settingsFields.js";
  import { say, supporterLanguage } from "../supporterText.js";
  import SettingsFields from "./SettingsFields.svelte";
  import SettingsGuide from "./SettingsGuide.svelte";
  import SettingsReset from "./SettingsReset.svelte";

  const playGroups = PLAY_DETAILS.groups.map(group);
  $: lang = $supporterLanguage;
  $: t = (text) => say(text, lang);
</script>

<section class="view" id="settings" aria-labelledby="settings-title">
  <div class="section-head">
    <div>
      <p class="eyebrow">{t({ ja: "支援者の方へ", en: "For supporters" })}</p>
      <h2 id="settings-title">{t({ ja: "設定", en: "Settings" })}</h2>
    </div>
  </div>
  <!-- そくていの回のときだけ出す注意（views/settings.js の updateModeStatus が、いまの言語で書く）。 -->
  <p class="settings-status" id="settingsModeStatus" hidden></p>
  <SettingsGuide />
  <h3 class="settings-group-title">{t(group("common").title)}</h3>
  <SettingsFields group={group("common")} />

  <div class="settings-details-list">
    <details class="settings-details" id="settingsSwitch">
      <summary>{t(group("switch").title)}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("switch")} />
        <p class="settings-mode-notice" id="switchControlModeNotice" hidden>
          {t({
            ja: "iPad 本体の「設定」→「アクセシビリティ」→「スイッチコントロール」もオンにしてください。アプリの枠と読み上げはいったん止まります。声は上の「声で読み上げる」で戻せます。",
            en: "Also turn on Switch Control on the iPad (Settings → Accessibility → Switch Control). The app's highlight and voice stop for now. Turn the voice back on with “Read aloud” above.",
          })}
        </p>
        <SettingsReset group={group("switch")} />
      </div>
    </details>
    <details class="settings-details" id="settingsSenses">
      <summary>{t(group("senses").title)}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("senses")} />
        <p class="settings-group-note">
          {t({
            ja: "アプリの声はネットが無くても使えます。端末の声は iPad の読み上げ設定で選びます。",
            en: "The app voice works without the internet. The device voice is chosen in the iPad's speech settings.",
          })}
        </p>
        <p class="settings-group-note">
          {t({
            ja: "刺激に弱い人は、遊びの雰囲気を「すっきり」か「なし」に。光の点滅はどの雰囲気も1秒に3回までです。",
            en: "For people sensitive to stimulation, set the play atmosphere to “Simple” or “None”. Flashes are limited to 3 per second in every atmosphere.",
          })}
        </p>
        <SettingsReset group={group("senses")} />
      </div>
    </details>
    <details class="settings-details" id="settingsPlay">
      <summary>{t(PLAY_DETAILS.title)}</summary>
      <div class="settings-details-body">
        <p class="measure-mode-notice" id="measureModeNotice" hidden>
          {t({
            ja: "そくていの回は、遊びごとの難しさが固定されます。行ごとに、そくていで使う値を出しています。「研究（れんしゅう／そくてい）」で「れんしゅう」にすると調整できます。",
            en: "In measured runs, the difficulty of each game is fixed. Each row shows the value used in measured runs. Switch to “Practice” under “Research (practice / measure)” to adjust them.",
          })}
        </p>
        {#each playGroups as playGroup (playGroup.id)}
          <h3 class="settings-group-title">{t(playGroup.title)}</h3>
          <SettingsFields group={playGroup} />
          <SettingsReset group={playGroup} />
        {/each}
      </div>
    </details>
    <details class="settings-details" id="soundCredits">
      <summary>{t({ ja: "音の素材", en: "Sound credits" })}</summary>
      <div class="settings-details-body">
        <p class="settings-credits-note">
          {t({
            ja: "アプリの読み上げの声も、この素材で作っています。ほかの効果音はアプリ内で作っています。",
            en: "The app's voices were also made with these. All other sound effects are made inside the app.",
          })}
        </p>
        <ul class="settings-credits-list" id="soundCreditsList"></ul>
      </div>
    </details>
    <details class="settings-details" id="settingsResearch">
      <summary>{t(group("research").title)}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("research")} />
        <p class="settings-group-note">
          {t({
            ja: "ふだんは れんしゅうのままで大丈夫です。どちらの回かは記録に残ります。",
            en: "Leave this on practice for everyday use. Which kind of run it was is kept in the records.",
          })}
        </p>
        <div class="readiness-check" id="readinessCheck" hidden>
          <h3 class="settings-group-title">{t({ ja: "そくていの前に（成立確認）", en: "Before measuring (readiness check)" })}</h3>
          <p class="readiness-lead" id="readinessLead"></p>
          <ul class="readiness-list" id="readinessList"></ul>
        </div>
        <!-- れんしゅう／そくていの選択とは別のもの（キャリブレーション）。同じ「そくてい」で
             呼ぶと取り違えるので、見出しで区切り、ボタンの言葉も変える（2026-10-01）。
             遊びの画面の題名（i18n の tile.calibration.title）は声のパックに入っているので変えず、
             ここで「そくてい」と出ることを先に伝える。 -->
        <h3 class="settings-group-title">{t({ ja: "押すタイミングの基準", en: "Press timing baseline" })}</h3>
        <div class="supporter-actions">
          <div>
            <strong>{t({ ja: "押すタイミングの基準をとる（研究用）", en: "Measure the press timing baseline (research)" })}</strong>
            <span>
              {t({
                ja: "音に合わせて続けて押し、判定の基準にするタイミングを調べます。れんしゅう／そくていの切り替えとは別のものです。始めると、遊びの画面に「そくてい」と出ます。ホームには出しません。支援者と一緒に行います。",
                en: "Press along with the sounds to find the timing used as the judging baseline. This is separate from switching between practice and measure. Once started, the game screen shows “Timing check”. It is not shown on the home screen. Do it together with a supporter.",
              })}
            </span>
          </div>
          <button class="secondary" id="startCalibration" type="button">{t({ ja: "基準をとり始める", en: "Start the baseline" })}</button>
        </div>
      </div>
    </details>
  </div>
</section>
