# 空まとめ（iPhone 天気アプリ・個人用）

開発の本体は https://github.com/yosiken-0421/SoraMatome-iOS です。ここは TestFlight 配布用のコピーで、
このリポジトリに登録済みの API キー（ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 / APPLE_TEAM_ID）で署名します。
変更は SoraMatome-iOS で行い、同じ内容をここへ反映してください（www / tests / ios-native / tools を丸ごと上書き）。

- アプリ名：空まとめ ／ Bundle ID：com.yosiken0421.soramatome ／ iOS 17 以上
- 一般公開はしません（TestFlight の内部テストのみ）

## TestFlight に入れる
1. https://github.com/yosiken-0421/DEMOApplication/actions/workflows/soramatome-release.yml を開く
2. 「Run workflow」→ `release_mode` は `testflight` のまま → 緑の「Run workflow」
3. 完了後、App Store Connect →「空まとめ」→「TestFlight」→「内部テスト」に自分を追加
4. iPhone の TestFlight アプリからインストール

`apps/SoraMatome` を変更して main に push すると、自動で TestFlight まで実行されます。
