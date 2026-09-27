# 効果音の録音

ここにある音のファイルは、アプリの合成音の代わりに鳴ります（`src/lib/soundAssets.js`、
`src/lib/audio.js` の `trySample`）。ファイルが無い音は合成音のままです。

| ファイル名 | 鳴る場面 | 元の音（クレジットは `src/lib/soundCredits.js`） |
|---|---|---|
| `cheer.mp3` | はじめの遊び・ボールを打つ遊びができたときの歓声と拍手 | OtoLogic「歓声 イェイ02」（CC BY 4.0） |
| `boing.wav` | 押したときの音「ボヨーン」 | cfork「Boing raw」（CC BY 4.0） |
| `creature-whale.wav` | 押したときの音「生きものの声」のクジラ | Spyrogumas「Humpbackwhale2」（CC0） |
| `creature-dolphin.wav` | 押したときの音「生きものの声」のイルカ | Felix Blume（CC0） |
| `bat-homerun.wav` / `bat-hit.wav` | ボールを打つ遊びの「カキーン」 | OtoLogic「SNES 野球01」（CC BY 4.0） |
| `homerun-cheer.mp3` | ホームランの歓声 | OtoLogic「SNES 野球01」（CC BY 4.0） |

笑い声（`laugh`）、カメ・タコ・カニは、まだ合成音です。

## 足す・替えるとき

1. **公開のリポジトリに置いてよい（再配布してよい）ライセンスの音だけ**を使う。
   このリポジトリは公開なので、ここに置いた音は誰でも取り出せる。CC0・CC BY は可。
   「再配布禁止」の素材サイトは、音が良くても使えない。
2. 元の音を `test-results/sounds-src/` に置き、`scripts/prepare-sounds.mjs` の表に
   切り出す区間を書いて `node scripts/prepare-sounds.mjs` を走らせる。
   短く切り、頭の無音を削り、**大きさをそろえる**（iPad のスピーカー相当で −18dBFS）。
   アプリはこの大きさを前提に鳴らすので、そろえずに置くと大きすぎたり小さすぎたりする。
3. CC BY の音は `src/lib/soundCredits.js` に作者・出典・ライセンスを書く
   （アプリの設定「見え方・音」のいちばん下に出る。これが使う条件）。

- 押した瞬間に鳴らす短い音は WAV（mp3 は頭に数十ms の無音が入る）。長い音は mp3。
- 測定の遊び（リール・高い音だけ・アーム・さかなつり）の音は、録音に替えない。
  合図や手がかりの聞こえ方が変わると、記録どうしを比べられなくなる。
