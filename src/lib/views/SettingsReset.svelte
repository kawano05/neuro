<script>
  // くわしい設定のまとまりを既定に戻すボタン（確かめ表 B3「設定を変えたら元に戻せる」）。
  // 何を戻すかは settingsFields.js の resetPlan、押したときの動きは views/settings.js。
  // 押したあと、何を戻して何を残したかを、ボタンのすぐ下に字で出す（画面の上の知らせは、
  // 下のほうで押したときに見えない）。読み上げには同じ文を announce で渡す。
  import { say, supporterLanguage } from "../supporterText.js";

  export let group;
</script>

<div class="settings-reset">
  <button
    type="button"
    class="secondary settings-reset-button"
    id={`${group.id}Reset`}
    aria-describedby={`${group.id}ResetStatus`}
  >
    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
    <span>{say(group.reset, $supporterLanguage)}</span>
  </button>
  <p class="settings-reset-status" id={`${group.id}ResetStatus`} hidden></p>
</div>
