<script>
  // 1つのまとまりの項目を描く。名前・入力型は settingsFields.js、値の読み書きは settings.js。
  // ネイティブ入力と明示的なラベルで、タップ・キーボード・読み上げに同じ操作を渡す。
  // aria-describedby と「変えられない理由」は、いまの設定で変わるので settings.js が書く。
  // 言葉は支援者の画面の言語（supporterText.js）。言語を変えると、その場で描き直す。
  import { describedByIds } from "../settingsFields.js";
  import { say, supporterLanguage } from "../supporterText.js";

  export let group;
</script>

<div class="settings-grid">
  {#each group.fields as field (field.id)}
    <div class:toggle-row={field.type === "checkbox"} class="setting-row">
      <span>
        <label for={field.id}><strong>{say(field.label, $supporterLanguage)}</strong></label>
        <small id={`${field.id}Hint`}>
          {say(field.hint, $supporterLanguage)}
          {#if field.inGame}
            <!-- 同じ値を遊びの中の「この遊びの設定」でも変えられる（settingDefinitions.js の inGame）。 -->
            <span class="setting-in-game"
              >{say(
                { ja: "遊びの中の「この遊びの設定」でも変えられます。", en: "Can also be changed from “Game settings” during play." },
                $supporterLanguage
              )}</span
            >
          {/if}
        </small>
      </span>
      {#if field.type === "checkbox"}
        <input id={field.id} type="checkbox" role="switch" aria-describedby={describedByIds(field)} />
      {:else if field.type === "range"}
        <input id={field.id} type="range" min={field.min} max={field.max} step={field.step} aria-describedby={describedByIds(field)} />
        <output id={`${field.id}Value`} for={field.id}></output>
      {:else}
        <select id={field.id} aria-describedby={describedByIds(field)}>
          {#each field.options as [value, label]}
            <option {value}>{say(label, $supporterLanguage)}</option>
          {/each}
        </select>
        {#if field.description}
          <small class="setting-option-description" id={`${field.id}Description`} aria-live="polite"></small>
        {/if}
      {/if}
      <!-- いま変えられない理由（settingsFields.js の unavailableReason）。行の中に字で出す。 -->
      <small class="setting-reason" id={`${field.id}Reason`} hidden></small>
    </div>
  {/each}
</div>

<style>
  .setting-option-description {
    grid-column: 1 / -1;
  }

  .setting-in-game {
    display: block;
    margin-top: 2px;
  }
</style>
