import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import MachikaneCore

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Query private var items: [TrackedItem]
    @Query private var timers: [GameTimer]

    @State private var token = ""
    @State private var hasToken = KeychainStore.annictToken?.isEmpty == false
    @State private var exportDoc: BackupDocument?
    @State private var showExporter = false
    @State private var showImporter = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                notificationSection
                calendarSection
                dataSection
                annictSection
                backupSection
                creditSection
            }
            .navigationTitle("設定")
            .task { await model.refreshNotificationStatus() }
            .fileExporter(isPresented: $showExporter, document: exportDoc, contentType: .json,
                          defaultFilename: "machikane-backup-\(Date().formatted(.iso8601.year().month().day()))") { result in
                if case let .failure(e) = result { message = "書き出せませんでした：\(e.localizedDescription)" } else { message = "書き出しました" }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
                importBackup(result)
            }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK") { message = nil }
            }
        }
    }

    // MARK: 通知

    private var notificationSection: some View {
        Section {
            LabeledContent("通知の許可", value: statusText)
            if model.notificationStatus == .denied {
                PermissionBanner(title: "通知が拒否されています",
                                 reason: "発売日・放送・回復を知らせるために通知を使います。設定アプリで許可してください。") {
                    model.openSystemSettings()
                }
            } else if model.notificationStatus == .notDetermined {
                Button("通知を許可する") { Task { await model.requestNotificationPermissionIfNeeded() } }
            }
            LabeledContent("予約中の通知", value: "\(model.scheduledCount)件")
            if model.droppedCount > 0 {
                Label("iOS の上限（64件）のため \(model.droppedCount) 件の通知はまだ予約されていません。近いものから順に予約し、アプリを開いたときや1日1回の自動更新で残りを予約し直します。",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundStyle(.orange)
            }
            Button("通知を予約し直す") { Task { await model.rescheduleAll(); message = "予約し直しました（\(model.scheduledCount)件）" } }
        } header: { Text("通知") }
    }

    private var statusText: String {
        switch model.notificationStatus {
        case .authorized: return "許可"
        case .denied: return "拒否"
        case .notDetermined: return "未設定"
        case .provisional: return "仮許可"
        case .ephemeral: return "一時的"
        @unknown default: return "不明"
        }
    }

    // MARK: カレンダー

    private var calendarSection: some View {
        Section {
            let _ = model.calendarStatusTick
            LabeledContent("カレンダー", value: model.calendar.statusText)
            if model.calendar.isDenied {
                PermissionBanner(title: "カレンダーが拒否されています",
                                 reason: "作品の日付を iPhone のカレンダーに登録するには、設定アプリで許可してください。") {
                    model.openSystemSettings()
                }
            } else {
                if !model.calendar.canWrite {
                    Button("書き込みを許可する（登録のみ）") {
                        Task { _ = await model.calendar.requestWriteOnly(); model.calendarStatusTick += 1 }
                    }
                }
                if !model.calendar.hasFullAccess {
                    Button("フルアクセスを許可する（更新・削除も同期）") {
                        Task { _ = await model.calendar.requestFullAccess(); model.calendarStatusTick += 1 }
                    }
                }
            }
        } header: { Text("iPhone カレンダー") } footer: {
            Text("「書き込みのみ」では、iOS の仕様で登録済みの予定を読み取れないため、発売日が変わっても自動で更新・削除できません。自動で同期したい場合は「フルアクセス」を許可してください。")
        }
    }

    // MARK: データ取得

    private var dataSection: some View {
        Section {
            Button {
                Task { await model.refresh(force: true) }
            } label: {
                HStack { Text("今すぐ最新の情報を取得"); if model.isRefreshing { Spacer(); ProgressView() } }
            }
            .disabled(model.isRefreshing)
            if let last = model.refresher.lastRefreshAt {
                LabeledContent("最終取得", value: last.mkDateTimeText)
            }
            if !model.lastRefreshMessage.isEmpty {
                Text(model.lastRefreshMessage).font(.footnote).foregroundStyle(.secondary)
            }
            LabeledContent("国立国会図書館サーチ", value: "利用中")
            LabeledContent("楽天ブックス", value: "未対応")
        } header: { Text("データの取得") } footer: {
            Text("自動取得は 1 日 1 回程度です。楽天ブックスは公式ドキュメントを確認できなかったため、この版では使っていません。")
        }
    }

    // MARK: Annict

    private var annictSection: some View {
        Section {
            if hasToken {
                Label("アクセストークン設定済み", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                Button("トークンを削除", role: .destructive) {
                    KeychainStore.annictToken = nil
                    hasToken = false
                }
            } else {
                SecureField("個人用アクセストークン", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("保存") {
                    KeychainStore.annictToken = token
                    token = ""
                    hasToken = KeychainStore.annictToken?.isEmpty == false
                    message = hasToken ? "保存しました（Keychain）" : "保存できませんでした"
                }
                .disabled(token.trimmingCharacters(in: .whitespaces).isEmpty)
                Link("Annict でトークンを作成する", destination: URL(string: "https://annict.com/settings/apps")!)
            }
        } header: { Text("Annict") } footer: {
            Text("トークンは iPhone の Keychain にだけ保存し、Annict 以外には送りません。未設定でもアニメは手入力で登録できます。")
        }
    }

    // MARK: バックアップ

    private var backupSection: some View {
        Section {
            Button("JSON で書き出す") {
                do {
                    exportDoc = BackupDocument(data: try BackupService.encode(BackupService.make(items: items, timers: timers)))
                    showExporter = true
                } catch {
                    message = "書き出せませんでした：\(error.localizedDescription)"
                }
            }
            Button("JSON から読み込む") { showImporter = true }
        } header: { Text("バックアップ") } footer: {
            Text("読み込むと、同じ項目は上書きし、無いものは追加します。")
        }
    }

    private func importBackup(_ result: Result<URL, Error>) {
        switch result {
        case let .success(url):
            let ok = url.startAccessingSecurityScopedResource()
            defer { if ok { url.stopAccessingSecurityScopedResource() } }
            do {
                let b = try BackupService.decode(try Data(contentsOf: url))
                let (i, t) = BackupService.restore(b, into: context)
                model.didChange()
                message = "読み込みました（項目 \(i) 件・タイマー \(t) 件）"
            } catch {
                message = "読み込めませんでした（まちかねのバックアップファイルか確認してください）"
            }
        case let .failure(e):
            message = "読み込めませんでした：\(e.localizedDescription)"
        }
    }

    // MARK: 出典

    private var creditSection: some View {
        Section {
            Text("本アプリは国立国会図書館サーチの API を用いて、出版情報登録センター（JPRO）の近刊情報を取得しています。近刊情報は実際に刊行される図書と内容が異なる可能性があります。")
                .font(.footnote)
            Link("国立国会図書館サーチ", destination: URL(string: "https://ndlsearch.ndl.go.jp/")!)
            Text("アニメの作品情報・放送予定は Annict の API を利用しています。").font(.footnote)
            Link("Annict", destination: URL(string: "https://annict.com/")!)
            Text("ピッコマなどのマンガアプリやゲームの情報は自動取得しません（公開 API が無いため）。手入力とタイマーでお使いください。")
                .font(.footnote).foregroundStyle(.secondary)
        } header: { Text("データの出典") }
    }
}
