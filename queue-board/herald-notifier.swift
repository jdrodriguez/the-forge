// herald-notifier.swift: the herald's own notification sender. macOS puts the posting app's icon on a notification, and
// one sent through osascript carries Script Editor's. So the herald posts through this small app instead, which
// install-herald.sh builds as "Forge Herald.app" with the Forge's icon (icons/forge.icns).
//   forge-herald <title> <subtitle> <body> [url]   post one notification; exit 0 once macOS has taken it. A click on
//                                                  it opens the url: an http(s) board link or a claude:// link.
//   forge-herald --ask                       ask once to allow its notifications and wait for the answer
//   forge-herald --status                    print allowed, denied or not-asked
// Exit 2 means it has not been allowed yet and 3 that it was turned off; the herald falls back to osascript on any
// failure. A click on one of its notifications opens the app with no arguments: it takes the click, opens the
// notification's url, if it carries one (a board link in the installed Forge app's window), and quits; with no click to take it quits after a few seconds.
import AppKit
import UserNotifications

let args = Array(CommandLine.arguments.dropFirst())
let center = UNUserNotificationCenter.current()

func fail(_ code: Int32, _ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(code)
}

// Only these kinds of link open, so a notification can never start anything else.
func openable(_ text: String?) -> URL? {
  guard let text, let url = URL(string: text), let scheme = url.scheme?.lowercased() else { return nil }
  return ["http", "https", "claude"].contains(scheme) ? url : nil
}

// The installed Chrome app (the Forge) whose start URL has the link's scheme, host and port, found by scanning the
// folders Chrome puts its app shims in and reading each shim's CrAppModeShortcutURL. nil when there is none.
func installedApp(for url: URL) -> URL? {
  guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""), let host = url.host?.lowercased() else { return nil }
  let fm = FileManager.default
  let roots = [fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications"), URL(fileURLWithPath: "/Applications")]
  for root in roots {
    for folder in ["Chrome Apps.localized", "Chrome Apps"] {
      let dir = root.appendingPathComponent(folder)
      guard let apps = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { continue }
      for app in apps where app.pathExtension == "app" {
        guard let info = NSDictionary(contentsOf: app.appendingPathComponent("Contents/Info.plist")),
              let start = (info["CrAppModeShortcutURL"] as? String).flatMap(URL.init(string:)) else { continue }
        if start.scheme?.lowercased() == url.scheme?.lowercased(), start.host?.lowercased() == host, start.port == url.port { return app }
      }
    }
  }
  return nil
}

// Opens a link: a board link in the installed Forge app's own window when there is one, anything else (or when that
// open fails) the default way. Quits once it has handed the link on.
func openLink(_ url: URL) {
  let done = { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { exit(0) } }
  guard let app = installedApp(for: url) else { NSWorkspace.shared.open(url); return done() }
  NSWorkspace.shared.open([url], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration()) { _, error in
    if error != nil { DispatchQueue.main.async { NSWorkspace.shared.open(url); done() } } else { done() }
  }
}

// Shows the banner even if macOS counts this app as the one in front, and opens a clicked notification's link.
final class Presenter: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                              withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .list])
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                              withCompletionHandler done: @escaping () -> Void) {
    let clicked = response.actionIdentifier == UNNotificationDefaultActionIdentifier
    done()
    if clicked, let url = openable(response.notification.request.content.userInfo["url"] as? String) { openLink(url) }
    else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { exit(0) } }
  }
}

func post() {
  let content = UNMutableNotificationContent()
  content.title = args[0]
  content.subtitle = args[1]
  content.body = args[2]
  if args.count > 3, let url = openable(args[3]) { content.userInfo = ["url": url.absoluteString] }
  center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)) { error in
    if let error { fail(4, "macOS refused the notification: \(error.localizedDescription)") }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { exit(0) }
  }
}

let presenter = Presenter()
center.delegate = presenter
// Opened by a click: the delegate gets the click once the app runs, and opens the link. Nothing else to do.
if args.isEmpty { DispatchQueue.main.asyncAfter(deadline: .now() + 5) { exit(0) } }
else { center.getNotificationSettings { settings in
  let status = settings.authorizationStatus
  let allowed = status == .authorized || status == .provisional
  switch args[0] {
  case "--status":
    print(allowed ? "allowed" : status == .denied ? "denied" : "not-asked")
    exit(0)
  case "--ask":
    // The answer can take as long as the person does; give up after 90 seconds and leave the prompt for later.
    DispatchQueue.main.asyncAfter(deadline: .now() + 90) { print("no-answer"); exit(2) }
    center.requestAuthorization(options: [.alert]) { granted, error in
      if let error { fail(5, "macOS would not ask: \(error.localizedDescription)") }
      print(granted ? "allowed" : "denied")
      exit(granted ? 0 : 3)
    }
  default:
    guard args.count >= 3 else { fail(64, "usage: forge-herald <title> <subtitle> <body>") }
    if allowed { post() }
    else if status == .denied { fail(3, "Forge Herald's notifications are turned off in System Settings") }
    else { fail(2, "Forge Herald has not been allowed to post yet: run install-herald.sh") }
  }
} }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
