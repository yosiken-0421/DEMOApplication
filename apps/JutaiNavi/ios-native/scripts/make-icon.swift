import AppKit
import Foundation

// 渋滞ナビのアイコン：緑の案内標識の上に、奥へのびる道路と渋滞の車列
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.0, green: 0.42, blue: 0.27, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()

// 標識の白枠
NSColor.white.setStroke()
let frame = NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884), xRadius: 120, yRadius: 120)
frame.lineWidth = 26
frame.stroke()

// 道路（台形）
NSColor(calibratedRed: 0.16, green: 0.18, blue: 0.2, alpha: 1).setFill()
let road = NSBezierPath()
road.move(to: NSPoint(x: 190, y: 120)); road.line(to: NSPoint(x: 834, y: 120))
road.line(to: NSPoint(x: 580, y: 760)); road.line(to: NSPoint(x: 444, y: 760)); road.close()
road.fill()

// 車線の白線
NSColor.white.setFill()
for i in 0..<5 {
    let t = CGFloat(i) / 5
    let y = 140 + t * 560
    let h = 70 * (1 - t * 0.7)
    let w = 22 * (1 - t * 0.6)
    NSBezierPath(rect: NSRect(x: 512 - w / 2, y: y, width: w, height: h)).fill()
}

// 渋滞の車（オレンジのテールランプ）
let orange = NSColor(calibratedRed: 1.0, green: 0.55, blue: 0.0, alpha: 1)
let cars: [(CGFloat, CGFloat, CGFloat)] = [(330, 200, 1.0), (618, 200, 1.0), (375, 400, 0.72), (575, 400, 0.72), (412, 560, 0.5), (548, 560, 0.5)]
for (x, y, s) in cars {
    NSColor(calibratedWhite: 0.95, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: x - 70 * s, y: y, width: 140 * s, height: 90 * s), xRadius: 22 * s, yRadius: 22 * s).fill()
    orange.setFill()
    NSBezierPath(ovalIn: NSRect(x: x - 58 * s, y: y + 18 * s, width: 30 * s, height: 22 * s)).fill()
    NSBezierPath(ovalIn: NSRect(x: x + 28 * s, y: y + 18 * s, width: 30 * s, height: 22 * s)).fill()
}

// 上の黄色いマイク（声で聞ける）
NSColor(calibratedRed: 1.0, green: 0.82, blue: 0.2, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 422, y: 790, width: 180, height: 120)).fill()
NSColor(calibratedRed: 0.0, green: 0.42, blue: 0.27, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 492, y: 812, width: 40, height: 76), xRadius: 20, yRadius: 20).fill()
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
