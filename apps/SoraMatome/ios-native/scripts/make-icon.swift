import AppKit
import Foundation
let size=NSSize(width:1024,height:1024)
let image=NSImage(size:size)
image.lockFocus()
NSColor(calibratedRed:0.05,green:0.20,blue:0.42,alpha:1).setFill()
NSRect(origin:.zero,size:size).fill()
NSColor(calibratedRed:0.13,green:0.48,blue:0.75,alpha:1).setFill()
NSBezierPath(ovalIn:NSRect(x:65,y:65,width:894,height:894)).fill()
NSColor(calibratedRed:1,green:0.82,blue:0.28,alpha:1).setFill()
NSBezierPath(ovalIn:NSRect(x:555,y:475,width:270,height:270)).fill()
NSColor.white.setFill()
NSBezierPath(ovalIn:NSRect(x:230,y:340,width:390,height:360)).fill()
NSBezierPath(ovalIn:NSRect(x:425,y:315,width:335,height:320)).fill()
NSBezierPath(roundedRect:NSRect(x:215,y:320,width:600,height:235),xRadius:112,yRadius:112).fill()
image.unlockFocus()
guard let tiff=image.tiffRepresentation,
      let rep=NSBitmapImageRep(data:tiff),
      let jpeg=rep.representation(using:.jpeg,properties:[.compressionFactor:0.95]) else {
 fatalError("Cannot generate icon")
}
let output=URL(fileURLWithPath:CommandLine.arguments[1])
let intermediate=output.deletingPathExtension().appendingPathExtension("jpg")
try jpeg.write(to:intermediate)
let p=Process()
p.executableURL=URL(fileURLWithPath:"/usr/bin/sips")
p.arguments=["-s","format","png",intermediate.path,"--out",output.path]
try p.run()
p.waitUntilExit()
try? FileManager.default.removeItem(at:intermediate)
guard p.terminationStatus==0 else { fatalError("Cannot convert icon") }
