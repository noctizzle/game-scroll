// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Npu",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "Npu", targets: ["NPUPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // ONNX Runtime (MIT) with its Core ML execution provider
        .package(url: "https://github.com/microsoft/onnxruntime-swift-package-manager.git", exact: "1.24.2")
    ],
    targets: [
        .target(
            name: "NPUPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "onnxruntime", package: "onnxruntime-swift-package-manager")
            ],
            path: "ios/Sources/NPUPlugin")
    ]
)
