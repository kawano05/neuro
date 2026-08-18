// =====================================================================
// i18n.js — 利用者向け文言の表記モード（漢字 / ひらがな / 英語）
//
// なぜ要るか: この利用者集団は読字能力の幅が大きい。アプリはこれまで
// 利用者向けの文言をすべて分かち書きのひらがなで書いていたが、
// **ひらがなだけが常にやさしいわけではない**。日本語は漢字が語の境界を
// 作るので、漢字を読める人にとっては
//   「おすと いろと おとが かわるよ」より「押すと色と音が変わるよ」
// のほうが速く読める。逆に漢字が読めない利用者にはひらがなが要る。
// どちらか一方に決め打ちするのは、どちらかの利用者を締め出すことになる。
//
// 範囲は**利用者の世界（スタート/ホーム/ゲーム/リザルト）だけ**。
// 支援者の世界（設定・評価ログ・研究・効果測定）は日本語のままにしてある。
// あちらは日本語の支援者・研究者が使う業務画面で、対象利用者は見ない。
// 訳す量が数倍になるわりに、読字能力が問題になる場所ではない。
//
// 表記は測定条件でもある。手順の説明が読めるかどうかは成績に効きうるので、
// どの表記で回したかは session.config.textMode に残す（visualGuidance などと
// 同じ扱い）。
//
// DOM に触れない純粋関数として置いてある。文言の取り違えは画面を見れば
// 分かるが、「キーが無いときに何が出るか」は見ても分からない。
// =====================================================================

import { escapeHtml } from "./utils.js";

/**
 * 記録として妥当な表記の値。
 *
 * kanji / kana は**もう選べない**が、ここには残す。textMode は測定条件として
 * session.config に記録されるので（この回はどの表記で回したか）、過去の記録を
 * 復元するときに知らない値として捨ててしまうと、その回の条件が消える。
 * 選べる値（SELECTABLE_TEXT_MODES）と、記録として妥当な値は別物。
 */
export const TEXT_MODES = new Set(["ruby", "kanji", "kana", "en"]);

/**
 * いま設定画面で選べる表記。
 *
 * 漢字とかなを別モードにするのをやめ、**ルビ付き漢字**ひとつに畳んだ。
 *
 * なぜ: 漢字は語の境界を作るので、読める利用者には漢字のほうが速く読める。
 * 一方で漢字が読めない利用者にはかなが要る。以前はどちらかを支援者が
 * 当てにいく必要があり、外すと読めない画面になっていた。総ルビなら
 * 両方が同じ画面で成り立つ（特別支援教育の教材で標準的な作り）。
 *
 * 条件が1つ減るという利点もある。表記は測定条件なので、モードが多いほど
 * 層別すべきセルが分散する。
 */
export const SELECTABLE_TEXT_MODES = new Set(["ruby", "en"]);

/**
 * 既定はルビ付き漢字。
 *
 * 以前の既定（かな）で回した記録は textMode="kana" として残っているので、
 * 既定を変えても過去の条件は書き換わらない。
 */
export const DEFAULT_TEXT_MODE = "ruby";

/** 読み上げに渡す言語（audio.js の speak）。 */
export const SPEECH_LANG = { ruby: "ja-JP", kanji: "ja-JP", kana: "ja-JP", en: "en-US" };

/**
 * ルビの書き方: `漢字[よみ]`。
 *
 * 形態素解析器は使わない。オフライン動作が要件（病院・施設）なので辞書を
 * 積みたくないうえ、「音」が おと か おん かのような文脈依存は結局人が
 * 確かめることになる。対象は100文字列・異なり漢字82字しかないので、手で書く。
 *
 * 表示用の HTML と、読み上げ用のプレーン文を同じ1つの記法から作る。
 * 2つを別々に持つと、片方だけ直して食い違う（このリポジトリで繰り返し
 * 出ている「2箇所に同じことを書く」型の欠陥）。
 */
// ルビが乗るのは `[` の直前にある**漢字の連なりだけ**。
//
// 最初は「直前の `]` から `[` まで」を本文にしていたが、それだと
// `色[いろ]と音[おと]` の2つ目が `と音` を本文にしてしまい、ふりがな「おと」が
// 「と音」の2文字にまたがって乗った（実測。画面で見て気づいた）。
// 送りがなや助詞の上にふりがなが乗るのは、ふりがなとして誤り。
//
// 々（同の字点）と ヶ を含めるのは、「人々[ひとびと]」「一ヶ月[いっかげつ]」の
// ように漢字の連なりの中に現れるため。
const RUBY_PATTERN = /([一-龠々ヶ]+)\[([^\[\]]+)\]/g;

/** `低[ひく]い` → `<ruby>低<rt>ひく</rt></ruby>い`。HTML を組み立てる側で使う。 */
export function rubyToHtml(text) {
  return String(text).replace(
    RUBY_PATTERN,
    // rt は読み上げから外す。VoiceOver は ruby の本文と rt の両方を読むことが
    // あり、そのままだと「ひくいひくい」のように二重に聞こえる。読み上げは
    // 本文（漢字）を ja-JP の音声に任せるほうが自然に読まれる。
    (_, base, reading) => `<ruby>${base}<rt aria-hidden="true">${reading}</rt></ruby>`
  );
}

/** `低[ひく]い` → `低い`。textContent と読み上げに渡す側で使う。 */
export function rubyToPlain(text) {
  return String(text).replace(RUBY_PATTERN, (_, base) => base);
}

/**
 * 利用者向けの文言表。
 *
 * kana は既存の文言をそのまま持ってきている（見え方を変えないため）。
 * kanji は同じ意味を通常の日本語表記で。en は同じ意味の英語で、
 * 直訳ではなく「その画面で何をすればよいか」が伝わる短さを優先している。
 */
const STRINGS = {
  // --- ホームの見出し ---
  "home.eyebrow": { ruby: "ホーム", kanji: "ホーム", kana: "ホーム", en: "Home" },
  "home.title": { ruby: "アクティビティ", kanji: "アクティビティ", kana: "アクティビティ", en: "Activities" },
  "home.guide": { ruby: "やりたいことを選[えら]びます",
    kanji: "やりたいことを選びます",
    kana: "やりたいことを えらびます",
    en: "Choose what to do",
  },
  "home.back": { ruby: "アクティビティへ戻[もど]る",
    kanji: "アクティビティへ戻る",
    kana: "アクティビティへ もどる",
    en: "Back to activities",
  },
  "home.nextPage": { ruby: "次[つぎ]のページ", kanji: "次のページ", kana: "つぎの ページ", en: "Next page" },
  "home.pageOf": { ruby: "{n} / {total} ページ目[め]", kanji: "{n} / {total} ページ目", kana: "{n} / {total} ページ目", en: "Page {n} of {total}" },
  "home.scanning": { ruby: "いま選[えら]んでいます",
    kanji: "いま選んでいます",
    kana: "いま えらんでいます",
    en: "Selected now",
  },

  // --- あそびの名前と説明（content.js の gameTiles と対応） ---
  "tile.color-legacy.title": { ruby: "色[いろ]と音[おと]", kanji: "色と音", kana: "いろと おと", en: "Colour & Sound" },
  "tile.color-legacy.desc": { ruby: "押[お]すと色[いろ]と音[おと]が変[か]わるよ",
    kanji: "押すと色と音が変わるよ",
    kana: "おすと いろと おとが かわるよ",
    en: "Press to change the colour and sound",
  },
  "tile.rhythm-l1.title": { ruby: "リズム 練習[れんしゅう]", kanji: "リズム 練習", kana: "リズム れんしゅう", en: "Rhythm: practice" },
  "tile.rhythm-l1.desc": { ruby: "音[おと]の合図[あいず]に合[あ]わせて押[お]そう",
    kanji: "音の合図に合わせて押そう",
    kana: "おとの あいずに あわせて おそう",
    en: "Press in time with the cue",
  },
  "tile.rhythm-l2.title": { ruby: "リズム 続[つづ]けて", kanji: "リズム 続けて", kana: "リズム つづけて", en: "Rhythm: keep going" },
  "tile.rhythm-l2.desc": { ruby: "音[おと]に合[あ]わせて続[つづ]けて押[お]そう",
    kanji: "音に合わせて続けて押そう",
    kana: "おとに あわせて つづけて おそう",
    en: "Keep pressing with every beat",
  },
  "tile.gonogo.title": { ruby: "高[たか]い音[おと]だけ", kanji: "高い音だけ", kana: "たかいおとだけ", en: "High notes only" },
  "tile.gonogo.desc": { ruby: "高[たか]い音[おと]のときだけ押[お]す",
    kanji: "高い音のときだけ押す",
    kana: "たかいおとのとき だけ おそう",
    en: "Press only on the high note",
  },
  "tile.crane.title": { ruby: "アームを止[と]める", kanji: "アームを止める", kana: "アームを とめる", en: "Stop the claw" },
  "tile.crane.desc": { ruby: "画面[がめん]を見[み]てアームを止[と]めよう",
    kanji: "画面を見てアームを止めよう",
    kana: "がめんを みて アームを とめよう",
    en: "Watch the screen and stop the claw",
  },
  "tile.fishing.title": { ruby: "アタリで釣[つ]る", kanji: "アタリで釣る", kana: "アタリで つる", en: "Catch on the bite" },
  "tile.fishing.desc": { ruby: "音[おと]が鳴[な]ったらすぐ押[お]そう",
    kanji: "音が鳴ったらすぐ押そう",
    kana: "おとが なったら すぐ おそう",
    en: "Press as soon as you hear it",
  },
  "tile.fishing-gonogo.title": { ruby: "魚[さかな]だけ釣[つ]る",
    kanji: "魚だけ釣る",
    kana: "さかなだけ つる",
    en: "Fish only",
  },
  "tile.fishing-gonogo.desc": { ruby: "長靴[ながぐつ]のときは押[お]さない",
    kanji: "長靴のときは押さない",
    kana: "ながぐつの ときは おさない",
    en: "Do not press for the boot",
  },
  "tile.calibration.title": { ruby: "そくてい", kanji: "そくてい", kana: "そくてい", en: "Timing check" },
  "tile.calibration.desc": { ruby: "支援者[しえんしゃ]と一緒[いっしょ]に使[つか]います",
    kanji: "支援者と一緒に使います",
    kana: "しえんしゃと いっしょに つかいます",
    en: "Run this together with your supporter",
  },
  "tile.rhythm-corner.title": { ruby: "リズム", kanji: "リズム", kana: "リズム", en: "Rhythm" },
  "tile.rhythm-corner.desc": { ruby: "3つの音[おと]のあそびから選[えら]ぼう",
    kanji: "3つの音のあそびから選ぼう",
    kana: "3つの おとの あそびから えらぼう",
    en: "Three sound activities",
  },
  "tile.fishing-corner.title": { ruby: "さかなつり", kanji: "さかなつり", kana: "さかなつり", en: "Fishing" },
  "tile.fishing-corner.desc": { ruby: "2つの釣[つ]りかたから選[えら]ぶ",
    kanji: "2つの釣りかたから選ぶ",
    kana: "2つの つりかたから えらぶ",
    en: "Two ways to fish",
  },
  "tile.learning-corner.title": { ruby: "学[まな]ぶ・伝[つた]える",
    kanji: "学ぶ・伝える",
    kana: "まなぶ・つたえる",
    en: "Learn & tell",
  },
  "tile.learning-corner.desc": { ruby: "3つのアクティビティから選[えら]ぶ",
    kanji: "3つのアクティビティから選ぶ",
    kana: "3つの アクティビティから えらぶ",
    en: "Three activities",
  },
  "tile.matching.title": { ruby: "マッチング", kanji: "マッチング", kana: "マッチング", en: "Matching" },
  "tile.matching.desc": { ruby: "お題[だい]に合[あ]うものを選[えら]ぼう",
    kanji: "お題に合うものを選ぼう",
    kana: "おだいに あうものを えらぼう",
    en: "Pick the one that matches",
  },
  "tile.voca.title": { ruby: "VOCA", kanji: "VOCA", kana: "VOCA", en: "VOCA" },
  "tile.voca.desc": { ruby: "ことばを選[えら]んで伝[つた]えよう",
    kanji: "ことばを選んで伝えよう",
    kana: "ことばを えらんで つたえよう",
    en: "Choose a phrase to say",
  },
  "tile.letters.title": { ruby: "文字[もじ]学習[がくしゅう]", kanji: "文字学習", kana: "文字学習", en: "Letters" },
  "tile.letters.desc": { ruby: "文字[もじ]を読[よ]んで選[えら]ぼう",
    kanji: "文字を読んで選ぼう",
    kana: "もじを よんで えらぼう",
    en: "Read and pick the letter",
  },

  // --- ゲーム中の案内 ---
  // L1 は cued（低音のカウントイン → 高音1回が押しどころ）。
  //
  // 以前は l2 と同じ「おとに あわせて おそう」で、毎拍押す課題と区別が
  // つかなかった。レディ画面では規則を3行で説明しているのに、始まった
  // 瞬間その情報が画面から消えていた——そして画面に出ている円は低音でも
  // 高音でも同じ動きなので、どの拍で押すのかを読める手がかりがどこにも
  // 無い状態になっていた。
  //
  // 規則の説明は拍の予告ではない（いつ来るかは書いていない）ので、
  // 手がかりの設定に関わらず常に出してよい。gonogo が最初からそうしている。
  "stage.rhythm-l1": { ruby: "低[ひく]い音[おと]のあと、高[たか]い音[おと]で押[お]そう",
    kanji: "低い音のあと、高い音で押そう",
    kana: "ひくい おとの あと、たかい おとで おそう",
    en: "After the low notes, press on the high one",
  },
  "stage.rhythm-l2": { ruby: "音[おと]に合[あ]わせて続[つづ]けて押[お]そう",
    kanji: "音に合わせて続けて押そう",
    kana: "おとに あわせて つづけて おそう",
    en: "Keep pressing with the sound",
  },
  "stage.gonogo": { ruby: "高[たか]い音[おと]のときだけ押[お]そう",
    kanji: "高い音のときだけ押そう",
    kana: "たかい おとの ときだけ おそう",
    en: "Press only on the high note",
  },
  // そくていは continuous（毎拍が押しどころ）なので、rhythm-l2 と同じ案内。
  // 別のキーのまま置いてあるのは、あとで文言を分けたくなったときに
  // 呼び出し側を触らずに済ませるため。
  "stage.calibration": { ruby: "音[おと]に合[あ]わせて続[つづ]けて押[お]そう",
    kanji: "音に合わせて続けて押そう",
    kana: "おとに あわせて つづけて おそう",
    en: "Keep pressing with the sound",
  },

  // --- レディ画面の「やりかた」（content.js の gameHowTo が並びだけを持つ）---
  //
  // 書き方の決まり: 利用者向けにひらがな主体・1行1動作。読み上げ
  // （audio.speak）にもそのまま渡すので、記号や英字を入れない。
  "howto.color-legacy.1": { ruby: "画面[がめん]を押[お]すと、色[いろ]と音[おと]が変[か]わります。",
    kanji: "画面を押すと、色と音が変わります。",
    kana: "がめんを おすと、いろと おとが かわります。",
    en: "Press the screen to change the colour and sound.",
  },
  "howto.color-legacy.2": { ruby: "好[す]きなだけ押[お]してみましょう。",
    kanji: "好きなだけ押してみましょう。",
    kana: "すきなだけ おしてみましょう。",
    en: "Press as much as you like.",
  },
  // 「2かい」は rhythmPresets["rhythm-l1"].countInBeats と揃えてある。
  // 以前は 3かい と書いてあり、実際に鳴る回数と食い違っていた。
  "howto.rhythm-l1.1": { ruby: "低[ひく]い音[おと]が2回[かい]鳴[な]ります。",
    kanji: "低い音が2回鳴ります。",
    kana: "ひくい おとが 2かい なります。",
    en: "You will hear two low notes.",
  },
  "howto.rhythm-l1.2": { ruby: "そのあと、高[たか]い音[おと]が1回[かい]鳴[な]ります。",
    kanji: "そのあと、高い音が1回鳴ります。",
    kana: "そのあと、たかい おとが 1かい なります。",
    en: "Then one high note follows.",
  },
  "howto.rhythm-l1.3": { ruby: "高[たか]い音[おと]に合[あ]わせて押[お]します。",
    kanji: "高い音に合わせて押します。",
    kana: "たかい おとに あわせて おします。",
    en: "Press together with the high note.",
  },
  "howto.rhythm-l2.1": { ruby: "最初[さいしょ]に低[ひく]い音[おと]が鳴[な]ります。",
    kanji: "最初に低い音が鳴ります。",
    kana: "さいしょに ひくい おとが なります。",
    en: "Low notes come first.",
  },
  "howto.rhythm-l2.2": { ruby: "そのあとは、音[おと]が鳴[な]るたびに押[お]します。",
    kanji: "そのあとは、音が鳴るたびに押します。",
    kana: "そのあとは、おとが なるたびに おします。",
    en: "After that, press on every note.",
  },
  "howto.gonogo.1": { ruby: "高[たか]い音[おと]のときだけ押[お]します。",
    kanji: "高い音のときだけ押します。",
    kana: "たかい おとの ときだけ おします。",
    en: "Press only on the high note.",
  },
  "howto.gonogo.2": { ruby: "低[ひく]い音[おと]のときは、押[お]さずに待[ま]ちます。",
    kanji: "低い音のときは、押さずに待ちます。",
    kana: "ひくい おとの ときは、おさずに まちます。",
    en: "On the low note, wait without pressing.",
  },
  // そくていは continuous（毎拍が押しどころ）。cued だった頃の
  // 「高い音に合わせて1回」ではないので、rhythm-l2 と同じ手順になる。
  "howto.calibration.1": { ruby: "最初[さいしょ]に低[ひく]い音[おと]が鳴[な]ります。",
    kanji: "最初に低い音が鳴ります。",
    kana: "さいしょに ひくい おとが なります。",
    en: "Low notes come first.",
  },
  "howto.calibration.2": { ruby: "そのあとは、音[おと]が鳴[な]るたびに押[お]します。",
    kanji: "そのあとは、音が鳴るたびに押します。",
    kana: "そのあとは、おとが なるたびに おします。",
    en: "After that, press on every note.",
  },
  "howto.calibration.3": { ruby: "支援者[しえんしゃ]と一緒[いっしょ]に使[つか]う測定[そくてい]です。",
    kanji: "支援者と一緒に使う測定です。",
    kana: "しえんしゃと いっしょに つかう そくていです。",
    en: "This is a timing check to run with your supporter.",
  },
  "howto.crane.1": { ruby: "アームが横[よこ]に動[うご]きます。景品[けいひん]のところで押[お]します。",
    kanji: "アームが横に動きます。景品のところで押します。",
    kana: "アームが よこに うごきます。けいひんの ところで おします。",
    en: "The claw moves across. Press when it reaches the prize.",
  },
  "howto.crane.2": { ruby: "次[つぎ]は奥[おく]に動[うご]きます。もう一度[いちど]押[お]します。",
    kanji: "次は奥に動きます。もう一度押します。",
    kana: "つぎは おくに うごきます。もういちど おします。",
    en: "Next it moves back. Press once more.",
  },
  "howto.crane.3": { ruby: "アームが下[お]りて、つかめたら景品口[けいひんぐち]へ運[はこ]びます。",
    kanji: "アームが下りて、つかめたら景品口へ運びます。",
    kana: "アームが おりて、つかめたら けいひんぐちへ はこびます。",
    en: "The claw comes down and carries the prize to the chute.",
  },
  "howto.crane.4": { ruby: "床[ゆか]の光[ひか]る輪[わ]の中[なか]で止[と]めるとつかめます。",
    kanji: "床の光る輪の中で止めるとつかめます。",
    kana: "ゆかの ひかる わの なかで とめると つかめます。",
    en: "Stop inside the glowing ring on the floor to grab it.",
  },
  "howto.fishing.1": { ruby: "魚[さかな]が右[みぎ]から泳[およ]いできます。",
    kanji: "魚が右から泳いできます。",
    kana: "さかなが みぎから およいで きます。",
    en: "A fish swims in from the right.",
  },
  "howto.fishing.2": { ruby: "「アタリ」の音[おと]が鳴[な]ったらすぐ押[お]します。",
    kanji: "「アタリ」の音が鳴ったらすぐ押します。",
    kana: "「アタリ」の おとが なったら すぐ おします。",
    en: "Press as soon as you hear the bite.",
  },
  "howto.fishing.3": { ruby: "早[はや]く押[お]せるとボーナスがつきます。",
    kanji: "早く押せるとボーナスがつきます。",
    kana: "はやく おせると ボーナスが つきます。",
    en: "A quick press earns a bonus.",
  },
  "howto.fishing.4": { ruby: "1分間[ぷんかん]、たくさん釣[つ]りましょう。",
    kanji: "1分間、たくさん釣りましょう。",
    kana: "1ぷんかん、たくさん つりましょう。",
    en: "Catch as many as you can in one minute.",
  },
  "howto.fishing-gonogo.1": { ruby: "魚[さかな]が右[みぎ]から泳[およ]いできます。",
    kanji: "魚が右から泳いできます。",
    kana: "さかなが みぎから およいで きます。",
    en: "A fish swims in from the right.",
  },
  "howto.fishing-gonogo.2": { ruby: "「アタリ」の高[たか]い音[おと]で押[お]すと釣[つ]れます。",
    kanji: "「アタリ」の高い音で押すと釣れます。",
    kana: "「アタリ」の たかい おとで おすと つれます。",
    en: "Press on the high bite note to reel it in.",
  },
  "howto.fishing-gonogo.3": { ruby: "低[ひく]い音[おと]は長靴[ながぐつ]です。押[お]さずに待[ま]ちます。",
    kanji: "低い音は長靴です。押さずに待ちます。",
    kana: "ひくい おとは ながぐつです。おさずに まちます。",
    en: "A low note is a boot. Wait without pressing.",
  },
  "howto.fishing-gonogo.4": { ruby: "早[はや]く押[お]せるとボーナスがつきます。",
    kanji: "早く押せるとボーナスがつきます。",
    kana: "はやく おせると ボーナスが つきます。",
    en: "A quick press earns a bonus.",
  },
  "howto.fishing-gonogo.5": { ruby: "1分間[ぷんかん]、たくさん釣[つ]りましょう。",
    kanji: "1分間、たくさん釣りましょう。",
    kana: "1ぷんかん、たくさん つりましょう。",
    en: "Catch as many as you can in one minute.",
  },


  // --- 進捗と連続記録（ゲーム中に出しつづける） ---
  "progress.remainingCount": {
    ruby: "のこり {n}かい",
    kanji: "のこり {n}かい",
    kana: "のこり {n}かい",
    en: "{n} left",
  },
  "progress.remainingTime": {
    ruby: "のこり {time}",
    kanji: "のこり {time}",
    kana: "のこり {time}",
    en: "{time} left",
  },
  "progress.streak": {
    ruby: "{n} 連続[れんぞく]",
    kanji: "{n} 連続",
    kana: "{n} れんぞく",
    en: "{n} in a row",
  },

  // --- 景品の名前 ---
  //
  // content.js の label は日本語のままなので、そこを直に差し込むと英語表記でも
  // 「Got the くまさん!」になる。名前そのものを辞書へ移す（外側だけ訳しても
  // 埋め込むデータが日本語なら直らない）。
  //
  // 魚（fishingSpecies）の label は画面にも音声にも出ていないので足していない
  // ——使われない辞書を増やすと、どれが生きているのか分からなくなる。
  "prize.bear": { ruby: "くまさん", kanji: "くまさん", kana: "くまさん", en: "the bear" },
  "prize.rabbit": { ruby: "うさぎさん", kanji: "うさぎさん", kana: "うさぎさん", en: "the rabbit" },
  "prize.star": { ruby: "おほしさま", kanji: "おほしさま", kana: "おほしさま", en: "the star" },

  // --- UFOキャッチャーの音声（成功・失敗をその場で返す） ---
  "crane.voice.grip": {
    ruby: "{name}を つかみました",
    kanji: "{name}を つかみました",
    kana: "{name}を つかみました",
    en: "You got {name}",
  },
  "crane.voice.gripAnnounce": {
    ruby: "{name}を しっかり つかみました",
    kanji: "{name}を しっかり つかみました",
    kana: "{name}を しっかり つかみました",
    en: "You got {name} firmly",
  },
  "crane.voice.slip": {
    ruby: "惜[お]しい。つかんだけど すべりました",
    kanji: "惜しい。つかんだけど すべりました",
    kana: "おしい。つかんだけど すべりました",
    en: "So close. You had it but it slipped",
  },
  "crane.voice.slipAnnounce": {
    ruby: "つかみましたが すべりました",
    kanji: "つかみましたが すべりました",
    kana: "つかみましたが すべりました",
    en: "Gripped it, but it slipped",
  },
  "crane.voice.miss": {
    ruby: "つぎは だいじょうぶ",
    kanji: "つぎは だいじょうぶ",
    kana: "つぎは だいじょうぶ",
    en: "Next one will be fine",
  },
  "crane.voice.missAnnounce": {
    ruby: "アームが 景品[けいひん]から はずれました",
    kanji: "アームが 景品から はずれました",
    kana: "アームが けいひんから はずれました",
    en: "The claw missed the prize",
  },
  "crane.voice.finish": {
    ruby: "おわりました。{n}こ とれました",
    kanji: "おわりました。{n}こ とれました",
    kana: "おわりました。{n}こ とれました",
    en: "Finished. You caught {n}",
  },
  "crane.voice.finishAnnounce": {
    ruby: "アームを 止[と]めるが おわりました。{n}こ とれました",
    kanji: "アームを 止めるが おわりました。{n}こ とれました",
    kana: "アームを とめるが おわりました。{n}こ とれました",
    en: "Stop the claw is finished. You caught {n}",
  },
  "crane.voice.wait": {
    ruby: "待[ま]ってね",
    kanji: "待ってね",
    kana: "まってね",
    en: "Wait a moment",
  },

  // --- さかなつりの音声 ---
  "fishing.voice.caught": {
    ruby: "{n}センチの 魚[さかな]が つれました",
    kanji: "{n}センチの 魚が つれました",
    kana: "{n}センチの さかなが つれました",
    en: "You caught a {n} centimetre fish",
  },
  "fishing.voice.caughtFast": {
    ruby: "すばやい。{n}センチの 魚[さかな]が つれました",
    kanji: "すばやい。{n}センチの 魚が つれました",
    kana: "すばやい。{n}センチの さかなが つれました",
    en: "Quick! You caught a {n} centimetre fish",
  },
  "fishing.voice.goodWait": {
    ruby: "にせアタリを 見分[みわ]けました",
    kanji: "にせアタリを 見分けました",
    kana: "にせアタリを みわけました",
    en: "You spotted the false bite",
  },
  "fishing.voice.tooEarly": {
    ruby: "まだ アタリではありません",
    kanji: "まだ アタリではありません",
    kana: "まだ アタリではありません",
    en: "Not a bite yet",
  },
  "fishing.voice.boot": {
    ruby: "長靴[ながぐつ]が かかりました",
    kanji: "長靴が かかりました",
    kana: "ながぐつが かかりました",
    en: "You hooked a boot",
  },
  "fishing.voice.lost": {
    ruby: "魚[さかな]に にげられました",
    kanji: "魚に にげられました",
    kana: "さかなに にげられました",
    en: "The fish got away",
  },
  "fishing.voice.finish": {
    ruby: "おわりました。{n}ひき、あわせて {cm}センチでした",
    kanji: "おわりました。{n}ひき、あわせて {cm}センチでした",
    kana: "おわりました。{n}ひき、あわせて {cm}センチでした",
    en: "Finished. {n} fish, {cm} centimetres in total",
  },
  "fishing.voice.finishAnnounce": {
    ruby: "さかなつりが おわりました。{n}ひき、あわせて {cm}センチ",
    kanji: "さかなつりが おわりました。{n}ひき、あわせて {cm}センチ",
    kana: "さかなつりが おわりました。{n}ひき、あわせて {cm}センチ",
    en: "Fishing is finished. {n} fish, {cm} centimetres",
  },

  // --- リズム系の音声 ---
  "rhythm.voice.start": {
    ruby: "リズムの 練習[れんしゅう]を はじめます",
    kanji: "リズムの 練習を はじめます",
    kana: "リズムの れんしゅうを はじめます",
    en: "Starting the rhythm practice",
  },
  "rhythm.voice.finish": {
    ruby: "おわりました。達成率[たっせいりつ] {n}パーセント",
    kanji: "おわりました。達成率 {n}パーセント",
    kana: "おわりました。たっせいりつ {n}パーセント",
    en: "Finished. {n} percent",
  },


  // --- リザルトの見出し（課題ごと） ---
  "result.gonogo.goHit": { ruby: "Go せいこう", kanji: "Go せいこう", kana: "Go せいこう", en: "Go correct" },
  "result.gonogo.commission": { ruby: "No-Go まちがい", kanji: "No-Go まちがい", kana: "No-Go まちがい", en: "No-Go errors" },
  "result.gonogo.missed": { ruby: "みのがし", kanji: "みのがし", kana: "みのがし", en: "Missed" },
  "result.gonogo.extras": { ruby: "よぶんな入力[にゅうりょく]", kanji: "よぶんな入力", kana: "よぶんな入力", en: "Extra presses" },

  "result.scan.caught": { ruby: "とれた", kanji: "とれた", kana: "とれた", en: "Caught" },
  "result.scan.pieces": { ruby: "こ", kanji: "こ", kana: "こ", en: "" },
  "result.scan.outOf": { ruby: "{n}かい ちゅう", kanji: "{n}かい ちゅう", kana: "{n}かい ちゅう", en: "out of {n}" },
  "result.scan.slips": { ruby: "おしかった（すべった）", kanji: "おしかった（すべった）", kana: "おしかった（すべった）", en: "So close (slipped)" },
  "result.scan.distance": { ruby: "ねらいの ずれ", kanji: "ねらいの ずれ", kana: "ねらいの ずれ", en: "Aim error" },
  "result.scan.prizes": { ruby: "とれた けいひん {n}こ", kanji: "とれた けいひん {n}こ", kana: "とれた けいひん {n}こ", en: "{n} prizes won" },

  "result.rt.score": { ruby: "スコア", kanji: "スコア", kana: "スコア", en: "Score" },
  "result.rt.longest": { ruby: "いちばん おおきい", kanji: "いちばん おおきい", kana: "いちばん おおきい", en: "Biggest" },
  "result.rt.caughtRate": { ruby: "つれた", kanji: "つれた", kana: "つれた", en: "Caught" },
  "result.rt.meanRt": { ruby: "へいきん はんのう", kanji: "へいきん はんのう", kana: "へいきん はんのう", en: "Mean reaction" },
  "result.rt.falseStarts": { ruby: "フライング", kanji: "フライング", kana: "フライング", en: "False starts" },
  "result.rt.commission": { ruby: "にせアタリで入力[にゅうりょく]", kanji: "にせアタリで入力", kana: "にせアタリで入力", en: "Pressed on a false bite" },
  "result.rt.catchSummary": { ruby: "{n}ひき / {cm}cm ぶん", kanji: "{n}ひき / {cm}cm ぶん", kana: "{n}ひき / {cm}cm ぶん", en: "{n} fish / {cm}cm total" },
  "result.rt.fastCatch": { ruby: "すばやい キャッチ", kanji: "すばやい キャッチ", kana: "すばやい キャッチ", en: "Quick catches" },

  "result.bestStreak": { ruby: "れんぞく さいこう", kanji: "れんぞく さいこう", kana: "れんぞく さいこう", en: "Best streak" },
  "result.none": { ruby: "このあそびには せいせき表示[ひょうじ]がありません。", kanji: "このあそびには せいせき表示がありません。", kana: "このあそびには せいせき表示がありません。", en: "This activity has no score screen." },
  "result.empty": { ruby: "まだ けっかがありません。", kanji: "まだ けっかがありません。", kana: "まだ けっかがありません。", en: "No results yet." },
  "best.new": { ruby: "じぶんの さいこう記録[きろく]！", kanji: "じぶんの さいこう記録！", kana: "じぶんの さいこう記録！", en: "Your best yet!" },
  "best.previous": { ruby: "これまでの さいこう {n}こ", kanji: "これまでの さいこう {n}こ", kana: "これまでの さいこう {n}こ", en: "Best so far: {n}" },

  // --- コーナー（二階層目）の見出し ---
  "corner.rhythm.eyebrow": { ruby: "Rhythm", kanji: "Rhythm", kana: "Rhythm", en: "Rhythm" },
  "corner.rhythm.title": { ruby: "リズム", kanji: "リズム", kana: "リズム", en: "Rhythm" },
  "corner.rhythm.guide": { ruby: "おとの アクティビティを えらびます", kanji: "おとの アクティビティを えらびます", kana: "おとの アクティビティを えらびます", en: "Choose a sound activity" },
  "corner.fishing.eyebrow": { ruby: "Fishing", kanji: "Fishing", kana: "Fishing", en: "Fishing" },
  "corner.fishing.title": { ruby: "さかなつり", kanji: "さかなつり", kana: "さかなつり", en: "Fishing" },
  "corner.fishing.guide": { ruby: "つりかたを えらびます", kanji: "つりかたを えらびます", kana: "つりかたを えらびます", en: "Choose how to fish" },
  "corner.learning.eyebrow": { ruby: "Learn", kanji: "Learn", kana: "Learn", en: "Learn" },
  "corner.learning.title": { ruby: "学[まな]ぶ・伝[つた]える", kanji: "学ぶ・伝える", kana: "まなぶ・つたえる", en: "Learn & tell" },
  "corner.learning.guide": { ruby: "アクティビティを えらびます", kanji: "アクティビティを えらびます", kana: "アクティビティを えらびます", en: "Choose an activity" },

  // --- 画面の切り替えを伝える読み上げ ---
  "voice.start": { ruby: "はじめます", kanji: "はじめます", kana: "はじめます", en: "Starting" },
  "voice.enterCorner": { ruby: "{name}を えらびます", kanji: "{name}を えらびます", kana: "{name}を えらびます", en: "Choosing {name}" },
  "voice.pageOf": { ruby: "{n}ページ目[め]です", kanji: "{n}ページ目です", kana: "{n}ページ目です", en: "Page {n}" },
  "voice.gameStart": { ruby: "{name}を はじめます", kanji: "{name}を はじめます", kana: "{name}を はじめます", en: "Starting {name}" },
  "voice.pressed": { ruby: "{name}に入力[にゅうりょく]しました", kanji: "{name}に入力しました", kana: "{name}に入力しました", en: "Pressed {name}" },


  // --- スタート画面・ゲーム画面・リザルトの固定文言 ---
  //
  // これまで App.svelte に直に書いてあった。英語表記を選んでも
  // 「はじめる」「おわる」「けっか」だけ日本語のまま残っていた
  // （画面を英語で通しで歩いて見つけた。スモークは文言を見ていない）。
  "start.srTitle": { ruby: "スタート画面[がめん]", kanji: "スタート画面", kana: "スタートがめん", en: "Start screen" },
  "start.begin": { ruby: "はじめる", kanji: "はじめる", kana: "はじめる", en: "Start" },
  "start.settings": { ruby: "せってい", kanji: "せってい", kana: "せってい", en: "Settings" },
  "game.srTitle": { ruby: "ゲーム画面[がめん]", kanji: "ゲーム画面", kana: "ゲームがめん", en: "Activity screen" },
  "game.exit": { ruby: "おわる", kanji: "おわる", kana: "おわる", en: "Finish" },
  "result.title": { ruby: "けっか", kanji: "けっか", kana: "けっか", en: "Result" },
  "result.retry": { ruby: "もういちど", kanji: "もういちど", kana: "もういちど", en: "Again" },
  "result.home": { ruby: "メニューへ", kanji: "メニューへ", kana: "メニューへ", en: "Back to menu" },

  // ずれの目盛り
  "scale.early": { ruby: "はやい", kanji: "はやい", kana: "はやい", en: "Early" },
  "scale.onTime": { ruby: "ぴったり", kanji: "ぴったり", kana: "ぴったり", en: "On time" },
  "scale.late": { ruby: "おそい", kanji: "おそい", kana: "おそい", en: "Late" },

  // レディ画面
  "ready.go": { ruby: "画面[がめん]のどこでも押[お]すと始[はじ]まります",
    kanji: "画面のどこでも押すと始まります",
    kana: "がめんの どこでも おすと はじまります",
    en: "Press anywhere to start",
  },

  // 音が鳴らせないとき
  "audio.unavailable.title": { ruby: "音[おと]が鳴[な]らせません",
    kanji: "音が鳴らせません",
    kana: "おとが ならせません",
    en: "Sound is not available",
  },

  // --- UFOキャッチャーの状態表示 ---
  "crane.ready": { ruby: "準備[じゅんび]", kanji: "準備", kana: "じゅんび", en: "Get ready" },
  "crane.movingX": { ruby: "横[よこ]に動[うご]きます", kanji: "横に動きます", kana: "よこに うごきます", en: "Moving across" },
  "crane.movingY": { ruby: "奥[おく]に動[うご]きます", kanji: "奥に動きます", kana: "おくに うごきます", en: "Moving back" },
  "crane.dropping": { ruby: "アームが下[お]りるよ", kanji: "アームが下りるよ", kana: "アームが おりるよ", en: "The claw is coming down" },
  "crane.slip": { ruby: "惜[お]しい！ すべった", kanji: "惜しい！ すべった", kana: "おしい！ すべった", en: "So close — it slipped" },
  "crane.miss": { ruby: "届[とど]かなかった", kanji: "届かなかった", kana: "とどかなかった", en: "Just missed" },
  "crane.lifted": { ruby: "持[も]ち上[あ]げた", kanji: "持ち上げた", kana: "もちあげた", en: "Lifted it" },
  "crane.carrying": { ruby: "景品口[けいひんぐち]へ", kanji: "景品口へ", kana: "けいひんぐちへ", en: "To the chute" },
  "crane.got": { ruby: "取[と]れた！", kanji: "取れた！", kana: "とれた！", en: "Got it!" },
  "crane.wait": { ruby: "待[ま]ってね", kanji: "待ってね", kana: "まってね", en: "Wait a moment" },
  "crane.tray": { ruby: "取[と]れた景品[けいひん]", kanji: "取れた景品", kana: "とれた けいひん", en: "Prizes won" },
  "crane.score": { ruby: "つかんだ {n}", kanji: "つかんだ {n}", kana: "つかんだ {n}", en: "Caught {n}" },
  // 景品の名前は content.js のプリセット（日本語）をそのまま差し込む。
  // 英語表記でも品名だけは日本語のまま出るが、名前を訳し分ける仕組みは
  // 景品側に無いので、ここで無理に英語へ寄せない。
  "crane.gotPrize": { ruby: "{name}を つかんだ！",
    kanji: "{name}を つかんだ！",
    kana: "{name}を つかんだ！",
    en: "Got the {name}!",
  },

  // --- さかなつりの状態表示 ---
  "fishing.wait": { ruby: "静[しず]かに待[ま]とう", kanji: "静かに待とう", kana: "しずかに まとう", en: "Wait quietly" },
  "fishing.bite": { ruby: "アタリ！", kanji: "アタリ！", kana: "アタリ！", en: "Bite!" },
  "fishing.tooEarly": { ruby: "まだ待[ま]とう", kanji: "まだ待とう", kana: "まだ まとう", en: "Not yet" },
  "fishing.goodWait": { ruby: "よく待[ま]てたね", kanji: "よく待てたね", kana: "よく まてたね", en: "Well held" },
  "fishing.boot": { ruby: "長靴[ながぐつ]だった", kanji: "長靴だった", kana: "ながぐつ だった", en: "It was a boot" },
  "fishing.lost": { ruby: "逃[に]げられた", kanji: "逃げられた", kana: "にげられた", en: "It got away" },
  // 釣れたときの表示。長さ（cm）を差し込む。
  "fishing.caught": { ruby: "{n}cm 釣[つ]れた！", kanji: "{n}cm 釣れた！", kana: "{n}cm つれた！", en: "Caught {n}cm!" },
  "fishing.fast": { ruby: "すばやい！ {n}cm", kanji: "すばやい！ {n}cm", kana: "すばやい！ {n}cm", en: "Quick! {n}cm" },

  // --- リザルト ---
  "result.hitRate": { ruby: "達成率[たっせいりつ]", kanji: "達成率", kana: "たっせいりつ", en: "On-target" },
  "result.meanOffset": { ruby: "平均[へいきん]オフセット（生値[なまち]）",
    kanji: "平均オフセット（生値）",
    kana: "へいきんオフセット（生値）",
    en: "Mean offset (raw)",
  },
  "result.sd": { ruby: "ばらつき（SD）", kanji: "ばらつき（SD）", kana: "ばらつき（SD）", en: "Variability (SD)" },
  "result.extras": { ruby: "余分[よぶん]な入力[にゅうりょく]", kanji: "余分な入力", kana: "よぶんな入力", en: "Extra presses" },
  "result.spread": { ruby: "押[お]したタイミング（{n}回[かい]ぶん）",
    kanji: "押したタイミング（{n}回ぶん）",
    kana: "おした タイミング（{n}かいぶん）",
    en: "Press timing ({n} presses)",
  },
  "result.early": { ruby: "（早[はや]めに押[お]せたよ）", kanji: "（早めに押せたよ）", kana: "（はやめに おせたよ）", en: "(a little early)" },
  "result.late": { ruby: "（遅[おそ]めに押[お]せたよ）", kanji: "（遅めに押せたよ）", kana: "（おそめに おせたよ）", en: "(a little late)" },
  "result.exact": { ruby: "（ぴったり！）", kanji: "（ぴったり！）", kana: "（ぴったり！）", en: "(right on!)" },
  "result.caught": { ruby: "取[と]れた", kanji: "取れた", kana: "とれた", en: "Caught" },
  "result.pieces": { ruby: "こ", kanji: "こ", kana: "こ", en: "" },
};

/** 設定値から表記モードを決める。知らない値は既定へ倒す。 */
export function resolveTextMode(settings) {
  const mode = settings?.textMode;
  // いま選べる表記へ倒す。以前の kanji / kana が保存された端末はここを通って
  // ルビ付き漢字になる——どちらの利用者も読める表記なので、勝手に読めない
  // 画面へ落とすことにはならない。
  //
  // 過去の**セッション記録**の textMode は別物で、そちらは当時の値のまま
  // 残す（state.js の sanitize が TEXT_MODES で受ける）。設定は「いまどう
  // 表示するか」、記録は「そのときどう表示していたか」。
  return SELECTABLE_TEXT_MODES.has(mode) ? mode : DEFAULT_TEXT_MODE;
}

/**
 * 文言を引く。
 *
 * @param {string} key STRINGS のキー
 * @param {string} mode "kanji" | "kana" | "en"
 * @param {object} [values] {n: 3} のような差し込み値（"{n}" を置換する）
 * @returns {string} 見つからなければキーそのものを返す
 *
 * 見つからないときにキーを返すのは、空文字を返すと「文言が消えた」ことに
 * 気づけないから。画面にキーが出れば、抜けている場所がその場で分かる。
 */
/**
 * 差し込み。
 *
 * 置換文字列ではなく**関数**を渡す。`replaceAll` に文字列を渡すと、その中の
 * `$&` `$'` `` $` `` が特別扱いされる（実測: `"{n}".replaceAll("{n}", "$&x")`
 * は `"{n}x"` になる）。差し込む値は文字どおり入れたいので、関数にして
 * 解釈を止める。
 */
function fill(text, values, transform = (value) => String(value)) {
  if (!values) return text;
  return Object.entries(values).reduce(
    (out, [name, value]) => out.replaceAll(`{${name}}`, () => transform(value)),
    text
  );
}

/**
 * 文言をプレーン文で引く（ルビの記法は落とす）。
 *
 * これが既定なのは、取り違えたときの壊れ方が穏やかだから。textContent へ
 * 渡す場所でうっかり HTML 版を使うと `<ruby>` がそのまま画面に出るが、
 * 逆（HTML の場所でプレーンを使う）はルビが出ないだけで読める。
 * 読み上げ・aria-label・announce は必ずこちら。
 *
 * **ルビを外してから差し込む**。順序が逆だと、差し込む値に `[` `]` が
 * 含まれたときにルビの記法として解釈される——値は辞書の一部ではないので、
 * 加工の対象にしてはいけない。
 */
export function translate(key, mode, values) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const text = entry[mode] ?? entry[DEFAULT_TEXT_MODE] ?? key;
  return fill(rubyToPlain(text), values);
}

/**
 * 文言を HTML で引く（ルビを `<ruby>` に展開する）。画面へ出す側で使う。
 *
 * これも**ルビを展開してから差し込む**。逆にすると、値の中の `[...]` が
 * ルビになったり、値が本文として `<ruby>` に巻き込まれたりする。
 *
 * 差し込む値は HTML エスケープする。いま渡している値は数値とプリセットの
 * 品名だけだが、「辞書の固定部分だけが HTML で、値は常にただの文字」という
 * 境界を最初から引いておく。あとから値の出どころが増えたときに、ここを
 * 見直さなくて済む。
 */
export function translateHtml(key, mode, values) {
  const entry = STRINGS[key];
  if (!entry) return escapeHtml(key);
  const text = entry[mode] ?? entry[DEFAULT_TEXT_MODE] ?? key;
  return fill(rubyToHtml(text), values, (value) => escapeHtml(value));
}

/** 読み上げに渡す言語コード。 */
export function speechLangFor(mode) {
  return SPEECH_LANG[mode] ?? SPEECH_LANG[DEFAULT_TEXT_MODE];
}

/** テストと点検のために、表の中身を読めるようにしておく。 */
export function allStringKeys() {
  return Object.keys(STRINGS);
}

export function entryFor(key) {
  return STRINGS[key];
}
