# ミチナビ（iPhone・個人用の地図＆カーナビ）

渋滞を避けるルート案内・音声ナビ・高速道路の渋滞・一時停止／踏切／オービスの注意をまとめたカーナビアプリです。
データはすべて無料のものだけを使います。

- アプリ名：ミチナビ ／ Bundle ID：com.yosiken0421.michinavi ／ iOS 17 以上
- 一般公開はしません（TestFlight の内部テストのみ）

## できること
**地図・目的地**
- Apple マップの地図（昼／夜：iPhone の設定・時刻・固定から選択）
- 施設名・住所の検索（入力中の候補表示）、マイクボタンで声で入力
- 自宅・職場・お気に入り・履歴（最新20件）
- 経由地の追加・並べ替え・削除
- 目的地に着いたら駐車位置を自動記録（手動記録、マップAppでの徒歩案内も）

**ルート案内**
- ルート候補を最大3本表示（所要時間・距離・有料の有無）
- 有料道路を使わない／高速を使わない
- 音声のターンバイターン案内（速度に応じて 2km／700m／300m 手前などから）
- 自車位置を追従。指で地図を動かしても 8 秒後に戻る
- ルートを外れたら自動で再検索（GPS のぶれでは再検索しない）
- 到着予定時刻・残り時間・残り距離・速度

**渋滞回避・進路変更**
- 地図に渋滞状況を表示（Apple マップ）
- 案内中は 4 分ごとにルートを再確認し、3 分以上かつ 8% 以上早いルートがあれば声と画面で提案（設定で自動切替も可）
- 案内開始時に、ルート上の高速道路（外環・首都高・東名など）の渋滞・事故を読み上げ（渋滞ナビと同じ JARTIC のデータ）
- 高速道路の渋滞一覧と読み上げ

**安全**
- 「オービス警報」（WAC.com）をワンタップで起動（`orbis://`）。案内の声は他のアプリの音と重ねて鳴らし、話す間だけ音楽を小さくする
- OpenStreetMap に登録された一時停止・踏切・オービスを地図に表示し、手前で読み上げ

**Siri**
- 「ミチナビで家に帰る」「ミチナビで職場へ」「ミチナビで外環の渋滞」「ミチナビで駐車位置」「ミチナビで目的地を探す」

## 入れなかったもの（理由）
- 国土交通省の交通量 API：渋滞ではなく「通った台数」のデータで、利用前に規約への同意が必要なため
- JARTIC の交通規制オープンデータ（一時停止など）：都道府県ごとの大きな CSV のため。代わりに OpenStreetMap の一時停止・踏切を使用
- 狭い道の回避・車線案内・駐車場の満空・移動式オービスの投稿共有・CarPlay：無料データがない／Apple の承認が必要なため

## データ
- 地図・ルート・渋滞表示：Apple MapKit（無料。回数制限があるため、ルートの再検索は必要なときだけ）
- 高速道路：JARTIC「道路交通情報Now!!」（公式 API ではないため、サイト変更で読めなくなることがあります）
- 一時停止・踏切・オービス：OpenStreetMap（Overpass API、© OpenStreetMap contributors、ODbL）。登録漏れが多いので参考程度

## 構成
- `ios-native/MichiNavi/NaviCore.swift` … ルートへの当てはめ・案内のタイミングと文章・ルート外れ・早いルートの判定・地図データの読み取り（テスト対象）
- `ios-native/MichiNavi/NavEngine.swift` … ルート検索と案内の中心
- `ios-native/MichiNavi/TrafficCore.swift` / `TrafficService.swift` … 高速道路の情報（渋滞ナビから流用）
- `ios-native/MichiNavi/ContentView.swift` / `Sheets.swift` … 画面
- `ios-native/MichiNavi/SiriIntents.swift` … Siri
- `tests/` … ロジックのテスト（GitHub Actions の macOS で実行）

## TestFlight に入れる
1. App Store Connect で「新規App」を作る（Bundle ID は com.yosiken0421.michinavi）
2. https://github.com/yosiken-0421/DEMOApplication/actions/workflows/michinavi-release.yml →「Run workflow」
3. App Store Connect →「ミチナビ」→「TestFlight」→「内部テスト」に自分を追加
4. iPhone の TestFlight アプリからインストール

`apps/MichiNavi` を変更して main に push すると、自動で TestFlight まで実行されます。
