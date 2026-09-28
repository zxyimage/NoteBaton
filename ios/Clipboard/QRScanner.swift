import SwiftUI
import AVFoundation

struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onError: (String) -> Void
    func makeUIViewController(context: Context) -> ScannerController { ScannerController(onCode: onCode, onError: onError) }
    func updateUIViewController(_ uiViewController: ScannerController, context: Context) {}
    static func dismantleUIViewController(_ controller: ScannerController, coordinator: ()) { controller.stop() }
}
final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "app.privateclipboard.qr")
    private var preview: AVCaptureVideoPreviewLayer?
    private let lock = NSLock()
    private var cancelled = false
    private var finished: Bool { lock.withLock { cancelled } }
    private var failureObserver: NSObjectProtocol?
    private let onCode: (String) -> Void
    private let onError: (String) -> Void
    init(onCode: @escaping (String) -> Void, onError: @escaping (String) -> Void) { self.onCode = onCode; self.onError = onError; super.init(nibName: nil, bundle: nil) }
    deinit { if let failureObserver { NotificationCenter.default.removeObserver(failureObserver) } }
    required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        failureObserver = NotificationCenter.default.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: .main) { [weak self] _ in
            guard let self, !self.finished else { return }; self.onError("相机暂不可用，可以返回手动输入配对码")
        }
        let preview = AVCaptureVideoPreviewLayer(session: session); preview.videoGravity = .resizeAspectFill; view.layer.addSublayer(preview); self.preview = preview
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard let self else { return }
            if granted { self.queue.async { self.configure() } }
            else { DispatchQueue.main.async { if !self.finished { self.onError("请在系统设置中允许接力使用相机，或返回手动输入配对码") } } }
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    private func configure() {
        guard !finished, let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) else { fail(); return }
        session.beginConfiguration(); session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { session.commitConfiguration(); fail(); return }
        session.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]
        session.commitConfiguration(); if !finished { session.startRunning() }
    }
    private func fail() { DispatchQueue.main.async { if !self.finished { self.onError("相机暂不可用，可以返回手动输入配对码") } } }
    func stop() { lock.withLock { cancelled = true }; queue.async { self.session.stopRunning() } }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished else { return }
        for case let value as AVMetadataMachineReadableCodeObject in metadataObjects {
            if let code = value.stringValue, PairingTarget.isPairingInput(code) { stop(); onCode(code); return }
        }
    }
}
