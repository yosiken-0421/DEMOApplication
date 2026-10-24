# トントン☆パレード（iPhone アプリ）

リズム天国風のオリジナル音ゲーです。ゲーム本体は `Resources/index.html`（HTML5 Canvas + Web Audio）で、
アプリは それを全画面で表示する Swift の入れ物です（セーブ・振動・LINE などへの共有をアプリ側で担当）。

## TestFlight に入れる（PadGuide と同じ手順）
1. Safari でこのリポジトリを開き「**Actions**」
2. 左の一覧から「**トントン☆パレード iOS / TestFlight**」
3. 「**Run workflow**」→ `release_mode` は `testflight` のまま → 緑の「**Run workflow**」
4. 20〜40 分ほどで緑のチェック。いちばん下に日本語の結果の要約が出ます
5. App Store Connect →「トントン☆パレード」→「TestFlight」→「内部テスト」の「＋」でグループを作り、自分を追加
6. iPhone の TestFlight アプリからインストール

`apps/TontonParade` を変更して main に push すると、自動で TestFlight まで実行されます。
API キー（ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 / APPLE_TEAM_ID）は PadGuide 用に登録済みのものを使います。

## 事前に 1 回だけ
App Store Connect の「マイApp」→「＋」→「新規App」で、Bundle ID `com.yosiken0421.tontonparade` のアプリを作っておく。
（Bundle ID の登録はワークフローが自動で行います）

## ゲーム本体の更新
ゲームのソースは別に管理しています。新しい `index.html` を `Resources/` に置き換えて push すれば、そのまま TestFlight に届きます。
