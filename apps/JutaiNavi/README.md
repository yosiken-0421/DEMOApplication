# 渋滞ナビ（iPhone・個人用）

高速道路の渋滞・事故・車線規制を、画面と Siri の声で確認するアプリです。

- アプリ名：渋滞ナビ ／ Bundle ID：com.yosiken0421.jutainavi ／ iOS 17 以上
- 一般公開はしません（TestFlight の内部テストのみ）

## できること
- 路線ごとの渋滞（区間・長さ・抜けるまでの目安時間）、事故・故障車、通行止め、出入口閉鎖、SA/PA の混雑
- 規制がどの車線か（第1走行車線＝一番左、追越車線＝一番右 など）を文章と図で表示
- 「Hey Siri、渋滞ナビで外環の渋滞情報を教えて」でアプリを開かずに読み上げ
- 「Hey Siri、渋滞ナビの渋滞情報」で、設定の「いつもの道路」をまとめて読み上げ

## データ
日本道路交通情報センター（JARTIC）「道路交通情報Now!!」の高速道路データ（簡易図 `s` の 301/801/1101、5分更新）。
- `https://www.jartic.or.jp/d/traffic_info/r1/target.json` → 最新の時刻
- `.../r1/{時刻}/s/301/{A01〜A10, C01〜C05}.json` → 渋滞（`j` に長さ）と規制（`c` 原因、`rd` 規制内容）
- `.../s/801/C0x.json` → 出入口閉鎖、`.../s/1101/Axx.json` → SA/PA 混雑

公式の API ではないため、サイト側の変更で読めなくなることがあります。ワークフローの「実データの確認」で形式を毎回チェックしています。
通過時間は「渋滞（時速40km以下）を平均時速20kmで走る」として計算した目安です。

## 構成
- `ios-native/JutaiNavi/TrafficCore.swift` … データの読み取り・路線判定・読み上げ文（テスト対象）
- `ios-native/JutaiNavi/TrafficService.swift` … JARTIC からの取得
- `ios-native/JutaiNavi/SiriIntents.swift` … Siri（App Intents / App Shortcuts）
- `ios-native/JutaiNavi/JutaiNaviApp.swift` … 画面
- `tests/` … 固定データでのロジックテスト（GitHub Actions の macOS で実行）

## TestFlight に入れる
1. https://github.com/yosiken-0421/DEMOApplication/actions/workflows/jutainavi-release.yml を開く
2. 「Run workflow」→ `release_mode` は `testflight` のまま → 緑の「Run workflow」
3. 完了後、App Store Connect →「渋滞ナビ」→「TestFlight」→「内部テスト」に自分を追加
4. iPhone の TestFlight アプリからインストール

`apps/JutaiNavi` を変更して main に push すると、自動で TestFlight まで実行されます。
