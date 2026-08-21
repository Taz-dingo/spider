import Cocoa

// Prints one line per on-screen window whose owner name contains the given
// filter: "<cgWindowNumber> <owner> <x> <y> <w> <h>" in display coordinates
// (origin at the main screen's top-left, y down).  Used by
// tests/host-integration.test.mjs to cross-check the pet window's real
// on-screen geometry from outside the app process.  Compiled on its own
// (single-file module, top-level code), never part of the pet app.

let filter = CommandLine.arguments.dropFirst().first ?? "SpiderPet"
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for entry in info {
    guard let owner = entry[kCGWindowOwnerName as String] as? String, owner.localizedCaseInsensitiveContains(filter) else { continue }
    let number = entry[kCGWindowNumber as String] as? Int ?? -1
    let bounds = entry[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let x = bounds["X"] as? Double ?? -1, y = bounds["Y"] as? Double ?? -1
    let w = bounds["Width"] as? Double ?? -1, h = bounds["Height"] as? Double ?? -1
    print("\(number) \(owner) \(x) \(y) \(w) \(h)")
}
