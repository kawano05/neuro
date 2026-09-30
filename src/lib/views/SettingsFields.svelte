<script>
  // 1つのまとまりの項目を描く。名前・入力型は settingsFields.js、値の読み書きは settings.js。
  // ネイティブ入力と明示的なラベルで、タップ・キーボード・読み上げに同じ操作を渡す。
  export let group;
</script>

<div class="settings-grid">
  {#each group.fields as field (field.id)}
    <div class:toggle-row={field.type === "checkbox"} class="setting-row">
      <span>
        <label for={field.id}><strong>{field.label}</strong></label>
        <small id={`${field.id}Hint`}>
          {field.hint}
          {#if field.inGame}
            <!-- 同じ値を遊びの中の「この遊びの設定」でも変えられる（settingDefinitions.js の inGame）。 -->
            <span class="setting-in-game">遊びの中の「この遊びの設定」でも変えられます。</span>
          {/if}
        </small>
      </span>
      {#if field.type === "checkbox"}
        <input id={field.id} type="checkbox" role="switch" aria-describedby={`${field.id}Hint${field.key === "switchControlMode" ? " switchControlModeNotice" : ""}`} />
      {:else if field.type === "range"}
        <input id={field.id} type="range" min={field.min} max={field.max} step={field.step} aria-describedby={`${field.id}Hint`} />
        <output id={`${field.id}Value`} for={field.id}></output>
      {:else}
        <select id={field.id} aria-describedby={`${field.id}Hint${field.description ? ` ${field.id}Description` : ""}`}>
          {#each field.options as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </select>
        {#if field.description}
          <small class="setting-option-description" id={`${field.id}Description`} aria-live="polite"></small>
        {/if}
      {/if}
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
