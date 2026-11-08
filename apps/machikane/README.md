# まちかね（発売日・更新日カウントダウン通知）

漫画・ラノベの新刊、アニメの放送・配信、マンガアプリ・ゲームのコイン回復やリセットを「あと◯日」で数えて、
ローカル通知・iPhone カレンダー・ウィジェットで知らせる iPhone アプリです。サーバー不要・アカウント不要・広告なし。

- Bundle ID：`com.yosiken0421.machikane`（ウィジェット `com.yosiken0421.machikane.widget`）
- App Group：`group.com.yosiken0421.machikane`
- iOS 17 以上 / SwiftUI / SwiftData / UserNotifications / EventKit / WidgetKit / ActivityKit
- ビルドと TestFlight 配信：`.github/workflows/machikane-testflight.yml`（PadGuide・トントン☆パレードと同じ方式）

## カテゴリとデータの取得元

| カテゴリ | 色 | 取得元 | 主な日付 |
|---|---|---|---|
| 漫画・ラノベ新刊 | オレンジ | 国立国会図書館サーチ API（JPRO 近刊情報）＋手入力 | 紙の発売日／電子の配信日（別々に保持） |
| アニメ | パープル | Annict API（要・個人用アクセストークン）＋手入力 | 毎週◯曜◯時の放送・配信、または 1 回の日時 |
| コイン・ゲーム | グリーン | 手入力のみ | 待てば無料の回復、デイリーリセット、イベント期間 |

表示する日付には必ず「出典（国立国会図書館サーチ／Annict／手入力）」と「最終取得日時」を添えます。

### 日付の扱い（推測しない）
- 取得した文字列が日まで確定しているもの（例 `2026-12-01`、`2026年12月01日`）だけを日付として扱います。
- `2026年12月`、`2026-12`、`2026.9`、`上旬`、`中旬`、`下旬`、`頃` などは「予定（日付未確定）」と表示し、
  日単位のカウントダウンや通知の対象にしません（`MachikaneCore/Sources/MachikaneCore/DateParsing.swift`）。
- 未確定 → 確定になったら「発売日が確定しました」、確定日が変わったら「旧日付 → 新日付」を通知し、
  カレンダーも更新します（フルアクセス時。後述）。
- 自動取得した日付はいつでも手で上書きでき、上書きした項目は出典が「手入力」になります。

### ダブルチェック
同じ本について複数のデータ源で日付が取れた場合に比較します（`DoubleCheck.swift`）。
- 一致 →「2つのデータで確認済み」
- 不一致 →「日付が一致しません」＋両方の日付と出典を並べてユーザーが選択。選ぶまでは早い方の日付で通知し、
  通知文に「日付未確定の可能性あり」と付けます。
- 片方のみ →「1つのデータのみ」

> 現在のデータ源は国立国会図書館サーチだけのため、実際の表示は「1つのデータのみ」になります。
> 楽天ブックス対応（下記）が入ると比較が働きます。ロジックとテストは実装済みです。

## 確認した公式ドキュメント

### 国立国会図書館サーチ（確認日 2026-11-09）
- 「国立国会図書館サーチ 外部提供インタフェース仕様書（第1.5版, 2026.9.25）」4. OpenSearch
  - `https://ndlsearch.ndl.go.jp/api/opensearch?dpid=…&title=…`／`isbn`／`cnt`（既定 200・最大 500）
  - 返戻は RSS 2.0 の拡張。`dc:date`（W3CDTF）・`dcterms:issued`・`dcndl:volume`・`dc:identifier xsi:type="dcndl:ISBN"` を使用
- 附録1（2026.6.24）：`jpro-book`＝JPRO（紙書籍）、`jpro-online`＝JPRO（電子書籍）。JPRO のレコード ID は `R100000137`
- 書影 API は仕様書第1.4版（2026.3.31）で削除されているため、漫画の表紙画像は表示しません（SF Symbols で代替）
- 利用条件（https://ndlsearch.ndl.go.jp/help/api ）
  - データの利用で収益を得ない場合は営利目的にあたらず、利用申請は不要（このアプリは広告なし・無料のため該当）
  - API を利用するアプリには「NDLサーチの API を用いていること」を明記 → 設定画面「データの出典」に表示
  - 同時リクエスト数に制限あり → 1 件ずつ・最低 1 秒間隔で送信、自動取得は 1 日 1 回程度
  - JPRO データは非営利 ○（申請不要）、営利 △（要申請）。近刊情報は実際に刊行される図書と内容が異なる可能性がある旨も表示

### Annict（確認日 2026-11-09）
- https://docs.annict.com/docs/ja/api/v1 （overview / authentication / works / episodes / me-programs）
- ベース URI `https://api.annict.com`、`Authorization: Bearer <トークン>`、日付は ISO 8601（UTC）
- すべての API でアクセストークンが必要。トークン未設定時は手入力モードのみ
- `/v1/me/programs` は「自分が Annict で見てる作品」の放送予定のみ取得できる
- 公式ドキュメントにレート制限の数値は記載なし → 1 日 1 回程度の取得に限定

### Apple
- EventKit「Accessing the event store」：書き込み専用アクセスでは、自分のアプリが作ったイベントも含めて読めない
  → 既定は書き込み専用（登録のみ）。設定でフルアクセスを許可した場合のみ、日付変更時に予定を自動更新・削除します。
  書き込み専用のまま日付が変わった場合は、項目に「カレンダーの予定が古い日付のまま」と表示します。
- App Store Connect API：`POST /v1/bundleIds`（Bundle ID 登録）、`POST /v1/bundleIdCapabilities`（`APP_GROUPS` 有効化）。
  App Group ID（`group.…`）の作成と Bundle ID への割り当てを行う公開 API は無いため、
  PadGuide と同じく Apple Developer サイトで 1 回だけ手作業で行います（下記「最初に 1 回だけ行う作業」）。

## 最初に 1 回だけ行う作業
1. App Group を作成：https://developer.apple.com/account/resources/identifiers/list/applicationGroup →「＋」→ App Groups →
   Identifier に `group.com.yosiken0421.machikane`
2. 割り当て：https://developer.apple.com/account/resources/identifiers/list で `com.yosiken0421.machikane` と
   `com.yosiken0421.machikane.widget` をそれぞれ開き、App Groups の「Configure」で上のグループにチェック → Save
   （Bundle ID 2 つと App Groups 機能の有効化はワークフローが自動で済ませています）
3. App Store Connect でアプリを作成：https://appstoreconnect.apple.com/apps →「＋」→「新規App」→ バンドル ID `com.yosiken0421.machikane`
4. GitHub の Actions →「まちかね iOS / TestFlight」→「Run workflow」

## 未確認のため未実装（TODO）

| 項目 | 理由 |
|---|---|
| 楽天ブックス書籍検索 API | 公式ドキュメント（webservice.rakuten.co.jp）が 2026-11-09 時点で HTTP 503 となり、エンドポイント・必須パラメータ・認証方式（2026 年の仕様変更の有無を含む）を確認できなかったため。GitHub secret `RAKUTEN_APP_ID` の注入も、使われないキーをアプリに埋め込まないよう、実装と同時に追加します。 |
| 予約開始日の自動取得 | 国立国会図書館サーチの返戻に予約開始日の項目が無いため。予約開始日は手入力で設定でき、設定した場合のみ「予約開始日／発売日のどちらで知らせるか」を選べます。 |
| ウィジェット更新時の通知再予約 | ウィジェット拡張から通知を予約できるかを公式ドキュメントで確認できなかったため。再予約はアプリ起動時・フォアグラウンド復帰時・BGAppRefreshTask・項目の変更時に行います。 |

使わないもの（仕様どおり）：Amazon（PA-API／Creators API）、openBD、ピッコマ等のスクレイピング。

## 機能
- カウントダウン：「あと◯日」、当日は「あと◯時間◯分」。今日・明日・今週（7日以内）・それ以降・日付未確定でセクション分け
- 複数リマインダー：7日前・3日前・前日・当日朝・時刻ちょうど・◯分前のプリセット＋自由追加
- 毎日カウントダウン通知（◯日前から毎朝「あと◯日」）
- 漫画：所持巻の記録、次巻の自動追跡（シリーズ名で「所持巻＋1」を毎日検索）、検索結果に「所持済み」表示、抜け巻の警告、紙／電子どちらで数えるかの選択
- アニメ：見た話数の記録、視聴ページ URL を 1 タップで開く、Annict の放送予定から曜日・時刻を自動入力
- コイン・ゲーム：待てば無料タイマー（既定 23 時間）、デイリーリセット通知、やり忘れ通知（「今日やった」で当日分を停止）、イベント開始・終了前通知
- iPhone カレンダー登録（カレンダー側アラームの有無を選択）
- ウィジェット：小（直近 1 件）、中（直近 4 件）、ロック画面（次の 1 件）／Live Activity（24 時間以内の放送の残り時間）
- 今日タブ、月カレンダー（カテゴリ色のドット）、JSON バックアップの書き出し・読み込み
- ダークモード・Dynamic Type・ハプティクス対応

## iOS の制約への対応
- ローカル通知の予約は 64 件まで → `NotificationPlanner` が「繰り返し（毎日・毎週）を先に 1 件ずつ」「残りを近い順」に詰め、
  漏れた件数を設定画面に表示。起動時・フォアグラウンド復帰時・BGAppRefreshTask・変更時に再予約します。
- 毎日・毎週は `UNCalendarNotificationTrigger(repeats: true)` の 1 件で予約します。
- 通知・カレンダーが拒否されている場合は、理由と「設定アプリを開く」ボタンを表示します。

## 開発
- `MachikaneCore/`：UI に依存しない処理（日付解釈・カウントダウン・通知計画・ダブルチェック・API 解析）。`swift test` でテスト
- `App/`：アプリ本体、`Widget/`：ウィジェットと Live Activity、`Shared/`：両方で使うもの
- Xcode プロジェクトは `project.yml`（XcodeGen）から GitHub Actions 上で生成します。手元でのコマンド作業は不要です。
