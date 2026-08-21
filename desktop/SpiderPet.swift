import Cocoa
import WebKit

// Transparent desktop-pet shell for the spider page.  Zero dependencies:
// CGWindowList gives window bounds without permission, NSEvent.mouseLocation
// gives the global cursor without permission, and the page runs in a
// borderless, click-through, always-on-top WKWebView over the whole desktop.
// Pure coordinate conversions live in HostGeometry.swift so tests can run
// them deterministically; this file only wires them to the live app.

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

final class SpiderPetApp: NSObject, NSApplicationDelegate {
    let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
    var window: NSWindow!
    var webView: WKWebView!
    var timer: Timer?
    var frames = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        // Re-run placement whenever the display arrangement changes (monitor
        // plugged in, moved, resolution changed, lid opened/closed).
        NotificationCenter.default.addObserver(self, selector: #selector(repositionWindow), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        let screen = HostGeometry.desktopFrame(NSScreen.screens.map(\.frame))
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PetSchemeHandler(root: root), forURLScheme: "pet")
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: NSRect(origin: .zero, size: screen.size), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.allowsMagnification = false

        // Create the window anchored at the main screen's origin (0,0) with
        // the union's size, then let placement settle asynchronously.
        window = NSWindow(contentRect: NSRect(origin: .zero, size: screen.size), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.level = .floating
        window.ignoresMouseEvents = true
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        placeWindow()

        webView.load(URLRequest(url: URL(string: "pet://app/index.html?pet=1")!))
        timer = Timer.scheduledTimer(timeInterval: 1.0 / 60.0, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        if probePath != nil {
            // Probe after the placement has settled and injections are live.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.runProbe() }
        }
    }

    // Re-home the window whenever the display arrangement changes.  The
    // probe calls the same path to prove re-homing works.
    @objc func repositionWindow() {
        placeWindow()
    }

    // MARK: window placement
    //
    // The window server relocates a borderless window that spans screens to
    // the origin of the screen it most overlaps (measured: on a stacked
    // arrangement with an overhanging secondary, a union-sized request lands
    // one main-screen-height off, and the union itself is unreachable).
    // So: request candidate frames in order until one actually covers the
    // main screen after the server settles, and derive every injected
    // coordinate from that FINAL actual frame (coordinateFrame) — never from
    // the intended union — so the page's clamps always match what the
    // window really shows and the spider can neither desync from the cursor
    // nor walk off the visible area.

    private var coordinateFrame = NSRect.zero
    private var settleLast = NSRect.zero

    private var mainScreen: NSScreen? { NSScreen.screens.first { $0.frame.origin == .zero } }
    private var unionFrame: NSRect { HostGeometry.desktopFrame(NSScreen.screens.map(\.frame)) }

    private func placeWindow() {
        let union = unionFrame
        let mainH = mainScreen?.frame.height ?? union.height
        let candidates = [
            NSRect(x: 0, y: 0, width: union.width, height: union.height), // union, anchored on the main screen
            NSRect(x: 0, y: 0, width: union.width, height: mainH),        // main screen height only
            NSRect(origin: union.origin, size: union.size),               // the raw union origin
            mainScreen?.frame ?? union,                                   // the main screen itself always sticks
        ]
        tryCandidates(candidates, index: 0)
    }

    private func tryCandidates(_ candidates: [NSRect], index: Int) {
        guard index < candidates.count else { return }
        window.setFrame(candidates[index], display: true)
        pollSettle { [weak self] in
            guard let self else { return }
            if self.window.frame.contains(NSPoint(x: self.mainScreen?.frame.midX ?? 0, y: self.mainScreen?.frame.midY ?? 0)) || index == candidates.count - 1 {
                self.coordinateFrame = self.window.frame
            } else {
                self.tryCandidates(candidates, index: index + 1)
            }
        }
    }

    // Wait until the server's placement stops moving the window (8 equal
    // consecutive polls, ~0.8 s), with a hard cap so a fighting server
    // cannot hang the shell.  A naive "two equal polls" is too eager: after
    // setFrame the window briefly reports the requested frame before the
    // server's relocation lands.
    private func pollSettle(_ done: @escaping () -> Void) {
        var stable = 0
        var polls = 0
        func poll() {
            polls += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                guard let self else { return }
                let frame = self.window.frame
                stable = frame == self.settleLast ? stable + 1 : 0
                self.settleLast = frame
                if stable >= 8 || polls >= 40 {
                    self.settleLast = .zero
                    done()
                } else {
                    poll()
                }
            }
        }
        poll()
    }

    @objc func tick() {
        guard let webView, webView.isLoading == false else { return }
        // All injected coordinates derive from the window's ACTUAL frame:
        // the settled coordinateFrame once placement finishes, and the
        // live window frame while placement is still moving the window, so
        // the page's clamps always match what is really visible.
        let frame = coordinateFrame != .zero ? coordinateFrame : window.frame
        let mouse = NSEvent.mouseLocation
        let page = HostGeometry.mouseToPage(mouse, frame: frame, viewZ: HostGeometry.viewZ)
        var script = "window.__petMouse={x:\(page.x),z:\(page.z)};"
        // Window geometry changes rarely; refresh it at 10 Hz instead of every
        // frame so the per-frame cost stays a single cheap JS injection.
        if frames % 6 == 0 {
            let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
            let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
            let own = CGWindowID(window.windowNumber)
            let mainH = NSScreen.screens.first { $0.frame.origin == .zero }?.frame.height ?? frame.height
            var rects: [String] = []
            for entry in info {
                guard let number = entry[kCGWindowNumber as String] as? Int, number != Int(own) else { continue }
                let owner = entry[kCGWindowOwnerName as String] as? String ?? ""
                if owner == "Dock" { continue } // wallpaper layer spans a whole screen
                guard let bounds = entry[kCGWindowBounds as String] as? [String: Any],
                      let x = bounds["X"] as? Double, let y = bounds["Y"] as? Double,
                      let w = bounds["Width"] as? Double, let h = bounds["Height"] as? Double else { continue }
                if w < 80 || h < 40 { continue } // skip menu bar strips and tiny items
                // CGWindowList bounds use display coordinates (origin at the
                // main screen's top-left, y down), while NSScreen frames are
                // Cocoa global (origin bottom-left, y up); x matches.  The
                // conversion (top edge to Cocoa y, then to page z) lives in
                // HostGeometry so tests can pin it down.
                let r = HostGeometry.windowRectToPage(x: x, y: y, width: w, height: h, mainScreenHeight: mainH, frame: frame, viewZ: HostGeometry.viewZ)
                rects.append("[\(Int(r.px)),\(Int(r.pz)),\(Int(r.pw)),\(Int(r.ph))]")
            }
            script += "window.__petFrame={w:\(Int(frame.width)),h:\(Int(frame.height))};window.__petWindows=[\(rects.joined(separator: ","))];"
        }
        webView.evaluateJavaScript(script) { _, error in
            if let error { FileManager.default.createFile(atPath: "/tmp/spider-pet-error.txt", contents: Data("\(error)".utf8)) }
        }
        frames += 1
    }

    // MARK: probe mode (tests/host-integration.test.mjs)

    private var probePath: String? {
        let args = Array(CommandLine.arguments.dropFirst(2))
        guard let i = args.firstIndex(of: "--probe"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    // Raw facts only: window geometry, live screen union, cursor, and the
    // page's readback of what tick() actually injected.  The test process
    // recomputes expectations; the shell never asserts anything itself.
    private func nativeSnapshot() -> [String: Any] {
        let frame = HostGeometry.desktopFrame(NSScreen.screens.map(\.frame))
        let mouse = NSEvent.mouseLocation
        return [
            "windowFrame": [window.frame.minX, window.frame.minY, window.frame.width, window.frame.height],
            "coordinateFrame": [coordinateFrame.minX, coordinateFrame.minY, coordinateFrame.width, coordinateFrame.height],
            "windowNumber": window.windowNumber,
            "desktopFrame": [frame.minX, frame.minY, frame.width, frame.height],
            "screens": NSScreen.screens.map { [$0.frame.minX, $0.frame.minY, $0.frame.width, $0.frame.height] },
            "mouseLocation": [mouse.x, mouse.y],
            "viewZ": HostGeometry.viewZ,
        ]
    }

    private func readPageState(_ done: @escaping ([String: Any]) -> Void) {
        webView.evaluateJavaScript("JSON.stringify({petMode, innerWidth, innerHeight, petFrame: window.__petFrame, petMouse: window.__petMouse, petWindows: window.__petWindows || []})") { result, error in
            guard let text = result as? String, let data = text.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                done(["readbackError": String(describing: error)])
                return
            }
            done(obj)
        }
    }

    // Probe sequence: wait for placement, snapshot phase1, move the window
    // off, announce a screen-parameters change, snapshot phase2.  The test
    // then asserts the window re-homed over the main screen and the bridge
    // stayed live.
    private func runProbe() {
        guard let probePath else { return }
        var report: [String: Any] = [:]
        guard coordinateFrame != .zero else {
            // Placement still running; retry until it settles (max ~8 s).
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.runProbe() }
            return
        }
        var phase1 = nativeSnapshot()
        readPageState { page in
            phase1["page"] = page
            report["phase1"] = phase1
            let frame = self.window.frame
            self.window.setFrame(NSRect(x: frame.minX + 150, y: frame.minY + 250, width: frame.width, height: frame.height), display: true)
            report["sabotagedFrame"] = [self.window.frame.minX, self.window.frame.minY, self.window.frame.width, self.window.frame.height]
            NotificationCenter.default.post(name: NSApplication.didChangeScreenParametersNotification, object: NSApp)
            // Placement re-runs asynchronously (settle polls + possible
            // candidate fallback); give it room before phase2.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                var phase2 = self.nativeSnapshot()
                self.readPageState { page in
                    phase2["page"] = page
                    report["phase2"] = phase2
                    if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
                        try? data.write(to: URL(fileURLWithPath: probePath))
                    }
                    NSApp.terminate(nil)
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
