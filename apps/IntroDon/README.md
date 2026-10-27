# イントロどんぴしゃ（イントロクイズ）

イントロを聴いて曲名を当てる iPhone アプリ。SwiftUI ネイティブ。

## 遊び方
1. 曲の出どころ・ジャンル・年代・有名/マイナー・イントロの長さ・問題数を選んで「スタート！」
2. 「ドン！」でイントロ再生 → 4択から答える（「+1秒で聴く」で少し長く、「答えを見る」で答えだけ表示）
3. 正解/不正解は音声で読み上げ、◯（紙吹雪）／✕（揺れる）のモーションで表示

## 曲の出どころ
| モード | 中身 | イントロ |
|---|---|---|
| iPhoneのミュージック | 端末のライブラリ（MPMediaQuery） | 曲の頭から |
| Apple Music | iTunes Search API で曲を探し、MPMusicPlayerController（storeID）で再生。加入者のみ | 曲の頭から |
| 試聴音源（無料） | iTunes Search API の previewUrl（30秒）をストリーミング再生 | 途中から始まる曲あり |

## 絞り込みのルール（すべて Apple の曲データで判定）
- ジャンル：`primaryGenreName`（ライブラリは `genre`）が各ジャンルの別名と完全一致
- 年代：`releaseDate` の年（再発盤・ベスト盤はずれることがある）
- 有名：収録曲数（`trackCount` / `albumTrackCount`）4曲以下＝シングル作品
- マイナー：収録曲数5曲以上＝アルバム収録曲

## ビルド
`main` に `apps/IntroDon/**` の変更を push すると「イントロどんぴしゃ iOS / TestFlight」ワークフローが動きます。
Bundle ID: `com.yosiken0421.introdon`
