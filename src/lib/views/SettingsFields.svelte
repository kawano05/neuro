<script>
  // 項目のラベル・入力型は settingsFields.js から受け取る。値の管理は settings.js。
  // ネイティブ入力と明示的なラベルで、タップ・キーボード・読み上げに同じ操作を渡す。
  export let fields;
</script>

<div class="settings-grid">
  {#each fields as field (field.id)}
    <div class:toggle-row={field.type === 'checkbox'} class="setting-row">
      <span>
        <label for={field.id}><strong>{field.label}</strong></label>
        <small id={`${field.id}Hint`}>{field.hint}</small>
      </span>
      {#if field.type === 'checkbox'}
        <input id={field.id} type="checkbox" role="switch" aria-describedby={`${field.id}Hint${field.describedBy ? ` ${field.describedBy}` : ''}`} />
      {:else if field.type === 'range'}
        <input id={field.id} type="range" min={field.min} max={field.max} step={field.step} aria-describedby={`${field.id}Hint`} />
        <output id={`${field.id}Value`} for={field.id}></output>
      {:else}
        <select id={field.id} aria-describedby={`${field.id}Hint`}>
          {#each field.options as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/each}
</div>
