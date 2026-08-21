import Cocoa

// Pure geometry for the desktop-pet shell, extracted from SpiderPet.swift so
// the coordinate conversions can be exercised deterministically by
// tests/host-geometry.test.mjs (via HostFixtureRunner) without a window or an
// app loop.  SpiderPet.swift calls the same functions live.
//
// Page coordinates: origin at the union of all screens' centre, x right.
// The page camera (0,1200,700) renders world z at 0.8638 screen px per unit
// (VIEW_Z_K in app.js), so every injected z — cursor and window rects,
// heights included — is divided by viewZ to stay 1:1 with the rendered
// spider; keep viewZ in sync with app.js's VIEW_Z_K.

enum HostGeometry {
    /// Screen frames are Cocoa global (origin at the main screen's
    /// bottom-left, y up).  The union is the desktop area the pet window
    /// must cover for injected page coordinates to match what is shown.
    static func desktopFrame(_ screens: [NSRect]) -> NSRect {
        screens.reduce(.null) { $0.union($1) }
    }

    /// Global cursor -> page coordinates: x right from the union centre, z
    /// down (screen y up is negated), z divided by viewZ.
    static func mouseToPage(_ mouse: NSPoint, frame: NSRect, viewZ: Double) -> (x: Double, z: Double) {
        (mouse.x - frame.midX, -(mouse.y - frame.midY) / viewZ)
    }

    /// CGWindowList bounds (display coordinates: origin at the main screen's
    /// top-left, y down) -> page-space window rect in the same convention as
    /// the injected cursor: px/pz = top-left, pw = width, ph = height in
    /// world z units.  Flips the window's top edge to Cocoa y (mainH - y)
    /// before projecting so it lands in the same z-down convention as the
    /// cursor.
    static func windowRectToPage(x: Double, y: Double, width: Double, height: Double,
                                 mainScreenHeight: Double, frame: NSRect, viewZ: Double) -> (px: Double, pz: Double, pw: Double, ph: Double) {
        let topCocoaY = mainScreenHeight - y
        return (x - frame.minX - frame.width / 2, -(topCocoaY - frame.midY) / viewZ, width, height / viewZ)
    }

    /// Page-side clamp that keeps the follow target inside the desktop union
    /// with a margin; must match app.js petPointer()'s margin.
    static func clampedTarget(x: Double, z: Double, frame: NSRect, viewZ: Double, margin: Double) -> (x: Double, z: Double) {
        (min(max(x, -frame.width / 2 + margin), frame.width / 2 - margin),
         min(max(z, -frame.height / 2 / viewZ + margin / viewZ), frame.height / 2 / viewZ - margin / viewZ))
    }

    static let viewZ: Double = 0.8638
}
