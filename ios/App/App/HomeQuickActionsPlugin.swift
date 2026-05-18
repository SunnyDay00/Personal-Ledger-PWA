import Foundation
import UIKit
import Capacitor

@objc(HomeQuickActionsPlugin)
public class HomeQuickActionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HomeQuickActionsPlugin"
    public let jsName = "HomeQuickActions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setItems", returnType: CAPPluginReturnPromise)
    ]

    @objc func setItems(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        let shortcuts = items.prefix(4).compactMap { item -> UIApplicationShortcutItem? in
            guard
                let id = item["id"] as? String,
                let title = item["title"] as? String,
                let ledgerId = item["ledgerId"] as? String,
                let actionType = item["type"] as? String,
                !id.isEmpty,
                !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                !ledgerId.isEmpty
            else {
                return nil
            }

            let shortcut = UIMutableApplicationShortcutItem(
                type: "home_quick_action:\(id)",
                localizedTitle: title
            )
            shortcut.shortcutIcon = UIApplicationShortcutIcon(
                systemImageName: actionType == "income" ? "arrow.down.circle" : "arrow.up.circle"
            )
            shortcut.userInfo = [
                "id": id as NSString,
                "ledgerId": ledgerId as NSString,
                "type": actionType as NSString
            ]
            return shortcut
        }

        DispatchQueue.main.async {
            UIApplication.shared.shortcutItems = shortcuts
            call.resolve()
        }
    }
}
