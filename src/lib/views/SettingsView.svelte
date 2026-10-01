<script>
  // よく使う6項目だけを常設し、目的別の詳細は複数同時に開ける形にする。
  // 開閉は保存状態に影響しない。設計と項目表: docs/settings-simple-2026-09-30.md、
  // 見直し: docs/settings-polish-2026-10-01.md。
  import { PLAY_DETAILS, settingsGroup as group } from "../settingsFields.js";
  import SettingsFields from "./SettingsFields.svelte";
  import SettingsGuide from "./SettingsGuide.svelte";
  import SettingsReset from "./SettingsReset.svelte";

  const playGroups = PLAY_DETAILS.groups.map(group);
</script>

<section class="view" id="settings" aria-labelledby="settings-title">
  <div class="section-head">
    <div><p class="eyebrow">支援者の方へ</p><h2 id="settings-title">設定</h2></div>
  </div>
  <p class="settings-status" id="settingsModeStatus">れんしゅうの回です。変更は自動で保存されます。</p>
  <SettingsGuide />
  <h3 class="settings-group-title">{group("common").title}</h3>
  <SettingsFields group={group("common")} />

  <div class="settings-details-list">
    <details class="settings-details" id="settingsSwitch">
      <summary>{group("switch").title}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("switch")} />
        <p class="settings-mode-notice" id="switchControlModeNotice" hidden>
          iPad 本体の「設定」→「アクセシビリティ」→「スイッチコントロール」もオンにしてください。
          アプリの枠と読み上げはいったん止まります。声は上の「声で読み上げる」で戻せます。
        </p>
        <SettingsReset group={group("switch")} />
      </div>
    </details>
    <details class="settings-details" id="settingsSenses">
      <summary>{group("senses").title}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("senses")} />
        <p class="settings-group-note">アプリの声はネットが無くても使えます。端末の声は iPad の読み上げ設定で選びます。</p>
        <p class="settings-group-note">刺激に弱い人は、遊びの雰囲気を「すっきり」か「なし」に。光の点滅はどの雰囲気も1秒に3回までです。</p>
        <SettingsReset group={group("senses")} />
      </div>
    </details>
    <details class="settings-details" id="settingsPlay">
      <summary>{PLAY_DETAILS.title}</summary>
      <div class="settings-details-body">
        <p class="measure-mode-notice" id="measureModeNotice" hidden>
          そくていの回は、遊びごとの難しさが固定されます。行ごとに、そくていで使う値を出しています。「研究（れんしゅう／そくてい）」で「れんしゅう」にすると調整できます。
        </p>
        {#each playGroups as playGroup (playGroup.id)}
          <h3 class="settings-group-title">{playGroup.title}</h3>
          <SettingsFields group={playGroup} />
          <SettingsReset group={playGroup} />
        {/each}
      </div>
    </details>
    <details class="settings-details" id="soundCredits">
      <summary>音の素材</summary>
      <div class="settings-details-body">
        <p class="settings-credits-note">アプリの読み上げの声も、この素材で作っています。ほかの効果音はアプリ内で作っています。</p>
        <ul class="settings-credits-list" id="soundCreditsList"></ul>
      </div>
    </details>
    <details class="settings-details" id="settingsResearch">
      <summary>{group("research").title}</summary>
      <div class="settings-details-body">
        <SettingsFields group={group("research")} />
        <p class="settings-group-note">ふだんは れんしゅうのままで大丈夫です。どちらの回かは記録に残ります。</p>
        <div class="readiness-check" id="readinessCheck" hidden>
          <h3 class="settings-group-title">そくていの前に（成立確認）</h3>
          <p class="readiness-lead" id="readinessLead"></p>
          <ul class="readiness-list" id="readinessList"></ul>
        </div>
        <!-- れんしゅう／そくていの選択とは別のもの（キャリブレーション）。同じ「そくてい」で
             呼ぶと取り違えるので、見出しで区切り、ボタンの言葉も変える（2026-10-01）。
             遊びの画面の題名（i18n の tile.calibration.title）は声のパックに入っているので変えず、
             ここで「そくてい」と出ることを先に伝える。 -->
        <h3 class="settings-group-title">押すタイミングの基準</h3>
        <div class="supporter-actions">
          <div>
            <strong>押すタイミングの基準をとる（研究用）</strong>
            <span>音に合わせて続けて押し、判定の基準にするタイミングを調べます。れんしゅう／そくていの切り替えとは別のものです。始めると、遊びの画面に「そくてい」と出ます。ホームには出しません。支援者と一緒に行います。</span>
          </div>
          <button class="secondary" id="startCalibration" type="button">基準をとり始める</button>
        </div>
      </div>
    </details>
  </div>
</section>
