// herald-notifier.swift: the herald's own notification sender. macOS puts the posting app's icon on a notification, and
// one sent through osascript carries Script Editor's. So the herald posts through this small app instead, which
// install-herald.sh builds as "Forge Herald.app" with the Forge's icon (icons/forge.icns).
//   forge-herald <title> <subtitle> <body>   post one notification; exit 0 once macOS has taken it
//   forge-herald --ask                       ask once to allow its notifications and wait for the answer
//   forge-herald --status                    print allowed, denied or not-asked
// Exit 2 means it has not been allowed yet and 3 that it was turned off; the herald falls back to osascript on any
// failure. Opened with no arguments, as a click on one of its notifications does, it quits.
import AppKit
import UserNotifications

let args = Array(CommandLine.arguments.dropFirst())
let center = UNUserNotificationCenter.current()

func fail(_ code: Int32, _ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(code)
}

// Shows the banner even if macOS counts this app as the one in front.
final class Presenter: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                              withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .list])
  }
}

func post() {
  let content = UNMutableNotificationContent()
  content.title = args[0]
  content.subtitle = args[1]
  content.body = args[2]
  center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)) { error in
    if let error { fail(4, "macOS refused the notification: \(error.localizedDescription)") }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { exit(0) }
  }
}

if args.isEmpty { exit(0) }
let presenter = Presenter()
center.delegate = presenter
center.getNotificationSettings { settings in
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
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
