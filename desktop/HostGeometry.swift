import Cocoa

// Pure geometry shared by the desktop-pet shell and deterministic tests.
//
// Desktop/page coordinates are global and DO NOT depend on the pet window:
// - page origin = centre of the NSScreen union
// - page x points right
// - page z points down on screen
// - world z is divided by viewZ because the tilted page camera maps one world
//   z unit to viewZ screen points
//
// Keeping world coordinates independent from the native window is important:
// Desktop Topology v2 moves a small pet window with the spider instead of
// requiring one huge WKWebView to span every physical display.
enum HostGeometry {
    static func desktopFrame(_ screens: [NSRect]) -> NSRect {
        screens.reduce(.null) { $0.union($1) }
    }

    /// Cocoa global cursor -> page/world coordinates.
    static func mouseToPage(_ mouse: NSPoint, frame: NSRect, viewZ: Double) -> (x: Double, z: Double) {
        (mouse.x - frame.midX, -(mouse.y - frame.midY) / viewZ)
    }

    /// Exact inverse of mouseToPage: page/world ground point -> Cocoa global.
    static func pageToGlobal(x: Double, z: Double, frame: NSRect, viewZ: Double) -> NSPoint {
        NSPoint(x: frame.midX + x, y: frame.midY - z * viewZ)
    }

    /// A normal-sized native pet window centred on the spider's page/world
    /// position. Moving this window between displays is much more reliable than
    /// depending on one transparent WebKit surface spanning the whole desktop.
    static func petWindowFrame(x: Double, z: Double, desktop: NSRect, viewZ: Double, size: NSSize) -> NSRect {
        let centre = pageToGlobal(x: x, z: z, frame: desktop, viewZ: viewZ)
        return NSRect(x: centre.x - size.width / 2,
                      y: centre.y - size.height / 2,
                      width: size.width,
                      height: size.height)
    }

    /// Convert one NSScreen frame into page/world ground bounds. Useful for
    /// diagnostics and future topology-aware idle/path planning.
    static func screenToPage(_ screen: NSRect, desktop: NSRect, viewZ: Double) -> (minX: Double, minZ: Double, maxX: Double, maxZ: Double) {
        let topLeft = mouseToPage(NSPoint(x: screen.minX, y: screen.maxY), frame: desktop, viewZ: viewZ)
        let bottomRight = mouseToPage(NSPoint(x: screen.maxX, y: screen.minY), frame: desktop, viewZ: viewZ)
        return (topLeft.x, topLeft.z, bottomRight.x, bottomRight.z)
    }

    /// Legacy page-side outer-union clamp retained for browser regressions.
    /// It is no longer used to derive the native pet-window frame.
    static func clampedTarget(x: Double, z: Double, frame: NSRect, viewZ: Double, margin: Double) -> (x: Double, z: Double) {
        (min(max(x, -frame.width / 2 + margin), frame.width / 2 - margin),
         min(max(z, -frame.height / 2 / viewZ + margin / viewZ), frame.height / 2 / viewZ - margin / viewZ))
    }

    static let viewZ: Double = 0.8638
}
