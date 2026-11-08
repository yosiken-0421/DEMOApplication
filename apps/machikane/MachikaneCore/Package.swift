// swift-tools-version:5.9
import PackageDescription

// まちかねの「通信・日付・通知計画」など UI に依存しない処理。
// macOS でも `swift test` でテストできるよう、Foundation だけに依存する。
let package = Package(
    name: "MachikaneCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "MachikaneCore", targets: ["MachikaneCore"])
    ],
    targets: [
        .target(name: "MachikaneCore"),
        .testTarget(
            name: "MachikaneCoreTests",
            dependencies: ["MachikaneCore"],
            resources: [.copy("Fixtures")]
        )
    ]
)
