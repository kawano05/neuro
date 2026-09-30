<script>
  // よく使う6項目だけを常設し、目的別の詳細は複数同時に開ける形にする。
  // 開閉は保存状態に影響しない。設計と項目表: docs/settings-simple-2026-09-30.md。
  import { SETTINGS_GROUPS } from '../settingsFields.js';
  import SettingsFields from './SettingsFields.svelte';
  import SettingsGuide from './SettingsGuide.svelte';
  const group = id => SETTINGS_GROUPS.find(item => item.id === id);
</script>

<section class="view" id="settings" aria-labelledby="settings-title">
  <div class="section-head">
    <div><p class="eyebrow">支援者の方へ</p><h2 id="settings-title">設定</h2></div>
  </div>
  <p class="settings-status" id="settingsModeStatus">練習の回です。変更は自動で保存されます。</p>
  <SettingsGuide />
  <h3 class="settings-group-title">よく使う設定</h3>
  <SettingsFields fields={group('common').fields} />

  <div class="settings-details-list">
    <details class="settings-details" id="settingsSwitch">
      <summary>{group('switch').title}</summary>
      <div class="settings-details-body">
        <SettingsFields fields={group('switch').fields} />
        <p class="settings-mode-notice" id="switchControlModeNotice" hidden>
          iPad 本体の「設定」→「アクセシビリティ」→「スイッチコントロール」もオンにしてください。
          アプリの枠と読み上げはいったん止まります。声は上の「声で読み上げる」で戻せます。
        </p>
      </div>
    </details>
    <details class="settings-details" id="settingsSenses">
      <summary>{group('senses').title}</summary>
      <div class="settings-details-body">
        <SettingsFields fields={group('senses').fields} />
        <p class="settings-group-note">アプリの声はネットが無くても使えます。端末の声は iPad の読み上げ設定で選びます。</p>
        <p class="settings-group-note">刺激に弱い人は、遊びの雰囲気を「すっきり」か「なし」に。光の点滅はどの雰囲気も1秒に3回までです。</p>
      </div>
    </details>
    <details class="settings-details" id="settingsPlay">
      <summary>遊びごとの難しさ</summary>
      <div class="settings-details-body">
        <p class="settings-group-note">速さや広さは、遊びの中の「この遊びの設定」でも変えられます。</p>
        <p class="measure-mode-notice" id="measureModeNotice" hidden>
          測定の回は難しさが固定されます。「研究」の練習／測定で「練習」にすると調整できます。
        </p>
        {#each ['slot', 'rhythm', 'crane', 'fishing'] as id}
          <h3 class="settings-group-title">{group(id).title}</h3>
          <SettingsFields fields={group(id).fields} />
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
      <summary>{group('research').title}</summary>
      <div class="settings-details-body">
        <SettingsFields fields={group('research').fields} />
        <p class="settings-group-note">ふだんは練習のままで大丈夫です。どちらの回かは記録に残ります。</p>
        <div class="readiness-check" id="readinessCheck" hidden>
          <h3 class="settings-group-title">測定の前に（成立確認）</h3>
          <p class="readiness-lead" id="readinessLead"></p>
          <ul class="readiness-list" id="readinessList"></ul>
        </div>
        <div class="supporter-actions">
          <div><strong>押すタイミングの測定（研究用）</strong><span>ホームには出しません。支援者と一緒に行います。</span></div>
          <button class="secondary" id="startCalibration" type="button">そくていを始める</button>
        </div>
      </div>
    </details>
  </div>
</section>
