import Cocoa
import WebKit

// Transparent desktop-pet shell for the spider page.  Zero dependencies:
// CGWindowList gives window bounds without permission, NSEvent.mouseLocation
// gives the global cursor without permission, and the page runs in a
// borderless, click-through, always-on-top WKWebView over the whole screen.

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
        let screen = desktopFrame()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PetSchemeHandler(root: root), forURLScheme: "pet")
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: screen, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.allowsMagnification = false

        window = NSWindow(contentRect: screen, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.level = .floating
        window.ignoresMouseEvents = true
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        window.setFrame(screen, display: true)

        webView.load(URLRequest(url: URL(string: "pet://app/index.html?pet=1")!))
        timer = Timer.scheduledTimer(timeInterval: 1.0 / 60.0, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
    }

    // Screen rect in page coordinates: origin at the union of all screens'
    // centre, x right.  The page camera (0,1200,700) renders world z at
    // 0.8638 screen px per unit, so every injected z (cursor and window
    // rects, heights included) is divided by viewZ to stay 1:1 with the
    // rendered spider; keep viewZ in sync with app.js's VIEW_Z_K.
    let viewZ: Double = 0.8638
    @objc func tick() {
        guard let webView, webView.isLoading == false else { return }
        let mouse = NSEvent.mouseLocation
        let s = desktopFrame()
        let cx = s.midX, cy = s.midY
        var script = "window.__petMouse={x:\(mouse.x - cx),z:\(-(mouse.y - cy) / viewZ)};"
        // Window geometry changes rarely; refresh it at 10 Hz instead of every
        // frame so the per-frame cost stays a single cheap JS injection.
        if frames % 6 == 0 {
            let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
            let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
            let own = CGWindowID(window.windowNumber)
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
                // Cocoa global (origin bottom-left, y up); x matches.  Flip
                // the window's top edge to Cocoa y before projecting, so it
                // lands in the same z-down convention as the cursor: top edge
                // at world z = -(yCocoaTop - midY) / viewZ, height h / viewZ,
                // and the page tests z in [wz, wz+wh].
                let mainH = NSScreen.screens.first { $0.frame.origin == .zero }?.frame.height ?? s.height
                let px = x - s.minX - s.width / 2, pz = -(mainH - y - s.midY) / viewZ
                rects.append("[\(Int(px)),\(Int(pz)),\(Int(w)),\(Int(h / viewZ))]")
            }
            script += "window.__petFrame={w:\(Int(s.width)),h:\(Int(s.height))};window.__petWindows=[\(rects.joined(separator: ","))];"
        }
        webView.evaluateJavaScript(script) { _, error in
            if let error { FileManager.default.createFile(atPath: "/tmp/spider-pet-error.txt", contents: Data("\(error)".utf8)) }
        }
        frames += 1
    }

    func desktopFrame() -> NSRect {
        NSScreen.screens.map { $0.frame }.reduce(.null) { $0.union($1) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = SpiderPetApp()
app.delegate = delegate
app.run()
