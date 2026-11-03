import AppKit
import Foundation

// ミチナビのアイコン：夜の地図の上に、曲がる道路と青いルート、白いナビ矢印
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()

// 背景（深い紺のグラデーション）
let bg = NSGradient(starting: NSColor(calibratedRed: 0.06, green: 0.12, blue: 0.24, alpha: 1),
                    ending: NSColor(calibratedRed: 0.10, green: 0.26, blue: 0.42, alpha: 1))!
bg.draw(in: NSRect(origin: .zero, size: size), angle: 90)

// 街区（うっすらした格子）
NSColor(calibratedWhite: 1, alpha: 0.06).setFill()
for x in stride(from: 40, to: 1024, by: 170) {
    for y in stride(from: 40, to: 1024, by: 170) {
        NSBezierPath(roundedRect: NSRect(x: x, y: y, width: 130, height: 130), xRadius: 18, yRadius: 18).fill()
    }
}

// 道路（下から上へ、途中で右へカーブ）
func roadPath() -> NSBezierPath {
    let p = NSBezierPath()
    p.move(to: NSPoint(x: 380, y: -40))
    p.curve(to: NSPoint(x: 560, y: 560), controlPoint1: NSPoint(x: 360, y: 300), controlPoint2: NSPoint(x: 420, y: 470))
    p.curve(to: NSPoint(x: 1080, y: 760), controlPoint1: NSPoint(x: 700, y: 650), controlPoint2: NSPoint(x: 900, y: 700))
    return p
}
let road = roadPath()
road.lineCapStyle = .round
NSColor(calibratedRed: 0.20, green: 0.24, blue: 0.30, alpha: 1).setStroke()
road.lineWidth = 230
road.stroke()

// ルート（青）
let route = roadPath()
route.lineCapStyle = .round
NSColor(calibratedRed: 0.20, green: 0.60, blue: 1.0, alpha: 1).setStroke()
route.lineWidth = 90
route.stroke()

// 渋滞をよけた別ルート（オレンジの点線）
let detour = NSBezierPath()
detour.move(to: NSPoint(x: 330, y: 300))
detour.curve(to: NSPoint(x: 900, y: 930), controlPoint1: NSPoint(x: 200, y: 700), controlPoint2: NSPoint(x: 600, y: 940))
detour.lineWidth = 34
detour.lineCapStyle = .round
detour.setLineDash([2, 70], count: 2, phase: 0)
NSColor(calibratedRed: 1.0, green: 0.62, blue: 0.10, alpha: 1).setStroke()
detour.stroke()

// ナビ矢印（白・中央下）
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 512, y: 520))
arrow.line(to: NSPoint(x: 680, y: 140))
arrow.line(to: NSPoint(x: 512, y: 230))
arrow.line(to: NSPoint(x: 344, y: 140))
arrow.close()
NSColor(calibratedWhite: 0, alpha: 0.35).setFill()
let shadow = arrow.copy() as! NSBezierPath
shadow.transform(using: AffineTransform(translationByX: 0, byY: -14))
shadow.fill()
NSColor.white.setFill()
arrow.fill()

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.95]) else {
    fatalError("Cannot generate icon")
}
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let intermediate = output.deletingPathExtension().appendingPathExtension("jpg")
try jpeg.write(to: intermediate)
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
p.arguments = ["-s", "format", "png", intermediate.path, "--out", output.path]
try p.run()
p.waitUntilExit()
try? FileManager.default.removeItem(at: intermediate)
guard p.terminationStatus == 0 else { fatalError("Cannot convert icon") }
