import Cocoa
import WebKit

// Desktop Topology v2:
//
// The page owns one global desktop/world coordinate system, but the native
// shell no longer creates one enormous transparent WKWebView over the NSScreen
// union. Instead a normal-sized click-through window follows the spider's
// world position. Moving an ordinary window between displays is an AppKit
// primitive; cross-screen rendering no longer depends on WebKit compositing one
// huge transparent surface across multiple physical displays.

final class PetSchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL

    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let url = urlSchemeTask.request.url!
        let path = url.path == "/" ? "/index.html" : url.path
        let file = root.appendingPathComponent(String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let ext = file.pathExtension
        let mime = ext == "js" ? "text/javascript" : ext == "html" ? "text/html" : ext == "css" ? "text/css" : "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class SpiderPetApp: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
    let petWindowSize = NSSize(width: 360, height: 360)

    var window: NSWindow!
    var webView: WKWebView!
    var timer: Timer?
    var frames = 0
    var desktopFrame = NSRect.zero
    var lastPagePose = (x: 0.0, z: 0.0)
    var tracePending = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        desktopFrame = liveDesktopFrame
        NotificationCenter.default.addObserver(self, selector: #selector(repositionWindow), name: NSApplication.didChangeScreenParametersNotification, object: nil)

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PetSchemeHandler(root: root), forURLScheme: "pet")
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "petPose")

        webView = WKWebView(frame: NSRect(origin: .zero, size: petWindowSize), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.allowsMagnification = false

        let initialFrame = HostGeometry.petWindowFrame(x: 0, z: 0, desktop: desktopFrame, viewZ: HostGeometry.viewZ, size: petWindowSize)
        window = NSWindow(contentRect: initialFrame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.level = .floating
        window.ignoresMouseEvents = true
        window.hasShadow = false
        window.isMovable = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)

        if let tracePath {
            FileManager.default.createFile(atPath: tracePath, contents: nil)
        }

        webView.load(URLRequest(url: URL(string: "pet://app/index.html?pet=1")!))
        timer = Timer.scheduledTimer(timeInterval: 1.0 / 60.0, target: self, selector: #selector(tick), userInfo: nil, repeats: true)

        if probePath != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in self?.runProbe() }
        }
    }

    private var liveDesktopFrame: NSRect { HostGeometry.desktopFrame(NSScreen.screens.map(\.frame)) }

    @objc func repositionWindow() {
        desktopFrame = liveDesktopFrame
        moveWindowToPose(x: lastPagePose.x, z: lastPagePose.z)
        injectDesktopState(force: true)
    }

    // MARK: page -> native pose bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "petPose",
              let body = message.body as? [String: Any],
              let x = (body["x"] as? NSNumber)?.doubleValue,
              let z = (body["z"] as? NSNumber)?.doubleValue,
              x.isFinite, z.isFinite else { return }
        lastPagePose = (x, z)
        moveWindowToPose(x: x, z: z)
    }

    private func moveWindowToPose(x: Double, z: Double) {
        guard window != nil else { return }
        let frame = HostGeometry.petWindowFrame(x: x, z: z, desktop: desktopFrame, viewZ: HostGeometry.viewZ, size: petWindowSize)
        window.setFrameOrigin(frame.origin)
    }

    // MARK: native -> page input/topology bridge

    @objc func tick() {
        guard let webView, webView.isLoading == false else { return }
        let mouse = NSEvent.mouseLocation
        let page = HostGeometry.mouseToPage(mouse, frame: desktopFrame, viewZ: HostGeometry.viewZ)
        let topology = frames % 6 == 0 ? desktopInjectionJavaScript() : ""
        let script = "window.__petMouse={x:\(page.x),z:\(page.z)};\(topology)"
        webView.evaluateJavaScript(script) { _, error in
            if let error {
                FileManager.default.createFile(atPath: "/tmp/spider-pet-error.txt", contents: Data("\(error)".utf8))
            }
        }
        if tracePath != nil && frames % 15 == 0 { appendTraceSample() }
        frames += 1
    }

    private func injectDesktopState(force: Bool = false) {
        guard webView != nil, webView.isLoading == false else { return }
        webView.evaluateJavaScript(desktopInjectionJavaScript(), completionHandler: nil)
    }

    private func desktopInjectionJavaScript() -> String {
        let screens = NSScreen.screens.map { screen -> String in
            let page = HostGeometry.screenToPage(screen.frame, desktop: desktopFrame, viewZ: HostGeometry.viewZ)
            return "{gx:\(screen.frame.minX),gy:\(screen.frame.minY),gw:\(screen.frame.width),gh:\(screen.frame.height),minX:\(page.minX),minZ:\(page.minZ),maxX:\(page.maxX),maxZ:\(page.maxZ),scale:\(screen.backingScaleFactor)}"
        }.joined(separator: ",")
        // __petFrame stays as the desktop bounding size for backwards-compatible
        // page logic/tests. __petViewport is the actual small native window.
        return "window.__petFrame={w:\(desktopFrame.width),h:\(desktopFrame.height)};window.__petDesktop={x:\(desktopFrame.minX),y:\(desktopFrame.minY),w:\(desktopFrame.width),h:\(desktopFrame.height)};window.__petViewport={w:\(petWindowSize.width),h:\(petWindowSize.height)};window.__petScreens=[\(screens)];"
    }

    // MARK: diagnostics

    private func argumentValue(_ flag: String) -> String? {
        let args = Array(CommandLine.arguments.dropFirst(2))
        guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private var probePath: String? { argumentValue("--probe") }
    private var tracePath: String? { argumentValue("--trace") }

    private func screenIndex(containing point: NSPoint) -> Int? {
        NSScreen.screens.firstIndex { $0.frame.contains(point) }
    }

    private func rectArray(_ rect: NSRect) -> [Double] {
        [rect.minX, rect.minY, rect.width, rect.height]
    }

    private func nativeSnapshot() -> [String: Any] {
        let mouse = NSEvent.mouseLocation
        let mousePage = HostGeometry.mouseToPage(mouse, frame: desktopFrame, viewZ: HostGeometry.viewZ)
        let poseGlobal = HostGeometry.pageToGlobal(x: lastPagePose.x, z: lastPagePose.z, frame: desktopFrame, viewZ: HostGeometry.viewZ)
        let windowCentre = NSPoint(x: window.frame.midX, y: window.frame.midY)
        var result: [String: Any] = [
            "windowFrame": rectArray(window.frame),
            "windowCenter": [windowCentre.x, windowCentre.y],
            "windowNumber": window.windowNumber,
            "desktopFrame": rectArray(desktopFrame),
            "screens": NSScreen.screens.map { rectArray($0.frame) },
            "screenScales": NSScreen.screens.map(\.backingScaleFactor),
            "screensHaveSeparateSpaces": NSScreen.screensHaveSeparateSpaces,
            "mouseLocation": [mouse.x, mouse.y],
            "mousePage": [mousePage.x, mousePage.z],
            "mouseScreen": screenIndex(containing: mouse) ?? -1,
            "lastPagePose": [lastPagePose.x, lastPagePose.z],
            "expectedPoseGlobal": [poseGlobal.x, poseGlobal.y],
            "poseScreen": screenIndex(containing: poseGlobal) ?? -1,
            "viewZ": HostGeometry.viewZ,
        ]
        if let screen = window.screen { result["windowScreen"] = rectArray(screen.frame) }
        if let screen = window.deepestScreen { result["deepestScreen"] = rectArray(screen.frame) }
        return result
    }

    private func readPageState(_ done: @escaping ([String: Any]) -> Void) {
        let js = "JSON.stringify({petMode,innerWidth,innerHeight,petFrame:window.__petFrame,petDesktop:window.__petDesktop,petViewport:window.__petViewport,petMouse:window.__petMouse,petScreens:window.__petScreens||[],publishedPose:window.__petPublishedPose||null,spider:[spider.position.x,spider.position.z],pointer:[pointer.x,pointer.z],speed:spider.speed,state:petState})"
        webView.evaluateJavaScript(js) { result, error in
            guard let text = result as? String,
                  let data = text.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                done(["readbackError": String(describing: error)])
                return
            }
            done(obj)
        }
    }

    private func appendTraceSample() {
        guard !tracePending, let tracePath else { return }
        tracePending = true
        readPageState { [weak self] page in
            guard let self else { return }
            var snapshot = self.nativeSnapshot()
            snapshot["page"] = page
            snapshot["timestamp"] = Date().timeIntervalSince1970
            if let data = try? JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys]) {
                let line = data + Data("\n".utf8)
                if let handle = try? FileHandle(forWritingTo: URL(fileURLWithPath: tracePath)) {
                    try? handle.seekToEnd()
                    try? handle.write(contentsOf: line)
                    try? handle.close()
                }
            }
            self.tracePending = false
        }
    }

    // Probe verifies the new invariant: desktop/world coordinates stay global,
    // while the small native window follows a known page/world pose.
    private var probeReport: [String: Any] = [:]

    private func runProbe() {
        guard let probePath else { return }
        readPageState { [weak self] page in
            guard let self else { return }
            guard page["petMode"] as? Bool == true, page["petMouse"] != nil else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.runProbe() }
                return
            }
            var phase1 = self.nativeSnapshot()
            phase1["page"] = page
            self.probeReport["phase1"] = phase1
            self.webView.evaluateJavaScript("spider.position.set(140,0,90);spider.speed=0;render(1/60);") { _, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.readPageState { page2 in
                        var phase2 = self.nativeSnapshot()
                        phase2["page"] = page2
                        self.probeReport["phase2"] = phase2
                        if let data = try? JSONSerialization.data(withJSONObject: self.probeReport, options: [.prettyPrinted, .sortedKeys]) {
                            try? data.write(to: URL(fileURLWithPath: probePath))
                        }
                        NSApp.terminate(nil)
                    }
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main
struct SpiderPetEntry {
    static func main() {
        let app = NSApplication.shared
        let delegate = SpiderPetApp()
        app.delegate = delegate
        app.run()
    }
}
