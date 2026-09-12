import Foundation

// Deterministic runner over HostGeometry's pure functions. Reads one JSON
// fixture from stdin, prints the computed results as JSON. Built only by
// tests/host-geometry.test.mjs; never part of the pet app.
//
// Fixture schema:
//   screens: [[x,y,w,h], ...]   Cocoa screen frames, required
//   mouse:   [x,y]              Cocoa global cursor, optional
//   mainScreenHeight: Double    for the legacy CGWindowList y flip, optional
//   windows: [[x,y,w,h], ...]   legacy display-coord rects, optional
//   target:  [x,z]              page coords to clamp, optional
//   margin:  Double             clamp margin, default 90
//   viewZ:   Double             default HostGeometry.viewZ

@main
struct HostFixtureRunner {
    static func main() throws {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        let fixture = try JSONSerialization.jsonObject(with: input) as! [String: Any]
        let name = fixture["name"] as? String ?? "?"
        let screens = (fixture["screens"] as? [[Double]] ?? []).map { NSRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) }
        let frame = HostGeometry.desktopFrame(screens)
        let viewZ = (fixture["viewZ"] as? Double) ?? HostGeometry.viewZ
        var out: [String: Any] = ["name": name, "union": [frame.minX, frame.minY, frame.width, frame.height]]

        if let mouse = fixture["mouse"] as? [Double], mouse.count == 2 {
            let page = HostGeometry.mouseToPage(NSPoint(x: mouse[0], y: mouse[1]), frame: frame, viewZ: viewZ)
            out["mouseToPage"] = [page.x, page.z]
            let global = HostGeometry.pageToGlobal(x: page.x, z: page.z, frame: frame, viewZ: viewZ)
            out["pageToGlobal"] = [global.x, global.y]
            let pet = HostGeometry.petWindowFrame(x: page.x, z: page.z, desktop: frame, viewZ: viewZ, size: NSSize(width: 360, height: 360))
            out["petWindowFrame"] = [pet.minX, pet.minY, pet.width, pet.height]
        }

        if let mainH = fixture["mainScreenHeight"] as? Double, let windows = fixture["windows"] as? [[Double]] {
            out["windowRects"] = windows.map { rect in
                let r = HostGeometry.windowRectToPage(x: rect[0], y: rect[1], width: rect[2], height: rect[3], mainScreenHeight: mainH, frame: frame, viewZ: viewZ)
                return [r.px, r.pz, r.pw, r.ph]
            }
        }

        if let target = fixture["target"] as? [Double], target.count == 2 {
            let c = HostGeometry.clampedTarget(x: target[0], z: target[1], frame: frame, viewZ: viewZ, margin: (fixture["margin"] as? Double) ?? 90)
            out["clampedTarget"] = [c.x, c.z]
        }

        print(String(data: try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]), encoding: .utf8)!)
    }
}
