import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let addTransactionShortcutType = "add_transaction"
    private let addTransactionShortcutURL = URL(string: "personalledger://add")!
    private let homeQuickActionShortcutPrefix = "home_quick_action:"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
           canHandleShortcut(shortcutItem) {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                _ = self.openShortcut(application, shortcutItem)
            }
            return false
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        if canHandleShortcut(shortcutItem) {
            completionHandler(openShortcut(application, shortcutItem))
        } else {
            completionHandler(false)
        }
    }

    private func canHandleShortcut(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
        return shortcutItem.type == addTransactionShortcutType || shortcutItem.type.hasPrefix(homeQuickActionShortcutPrefix)
    }

    private func openShortcut(_ application: UIApplication, _ shortcutItem: UIApplicationShortcutItem) -> Bool {
        if shortcutItem.type == addTransactionShortcutType {
            return openAddTransactionShortcut(application)
        }

        guard let url = urlForHomeQuickAction(shortcutItem) else {
            return false
        }
        return ApplicationDelegateProxy.shared.application(application, open: url, options: [:])
    }

    private func openAddTransactionShortcut(_ application: UIApplication) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, open: addTransactionShortcutURL, options: [:])
    }

    private func urlForHomeQuickAction(_ shortcutItem: UIApplicationShortcutItem) -> URL? {
        guard
            let userInfo = shortcutItem.userInfo,
            let ledgerId = userInfo["ledgerId"] as? String,
            let type = userInfo["type"] as? String,
            !ledgerId.isEmpty,
            (type == "expense" || type == "income")
        else {
            return nil
        }

        var components = URLComponents()
        components.scheme = "personalledger"
        components.host = "add"
        components.queryItems = [
            URLQueryItem(name: "ledgerId", value: ledgerId),
            URLQueryItem(name: "type", value: type)
        ]
        return components.url
    }

}
