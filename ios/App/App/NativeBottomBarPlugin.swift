import Foundation
import UIKit
import WebKit
import Capacitor

@objc(NativeBottomBarPlugin)
public class NativeBottomBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeBottomBarPlugin"
    public let jsName = "NativeBottomBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    private var bottomBar: UIView?
    private var requestedVisible = false
    private var hostVisible = true
    private var keyboardVisible = false
    private var loadingObservation: NSKeyValueObservation?
    private var notificationObservers: [NSObjectProtocol] = []

    public override func load() {
        super.load()
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard change.newValue == true else { return }
            DispatchQueue.main.async { [weak self] in
                self?.resetForPageLoad()
            }
        }
        notificationObservers = [
            NotificationCenter.default.addObserver(
                forName: UIResponder.keyboardWillShowNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.keyboardVisible = true
                self?.applyVisibility()
            },
            NotificationCenter.default.addObserver(
                forName: UIResponder.keyboardDidHideNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.keyboardVisible = false
                self?.applyVisibility()
            }
        ]
    }

    deinit {
        loadingObservation?.invalidate()
        notificationObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc func update(_ call: CAPPluginCall) {
        let options = NativeBottomBarOptions(call: call)
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve(["available": false])
                return
            }
            guard #available(iOS 26.0, *), let hostView = self.bridge?.viewController?.view else {
                self.resetForPageLoad()
                call.resolve(["available": false])
                return
            }

            let bar: NativeBottomBarView
            if let existingBar = self.bottomBar as? NativeBottomBarView {
                bar = existingBar
            } else {
                bar = NativeBottomBarView { [weak self] action in
                    self?.notifyListeners("action", data: action)
                }
                bar.translatesAutoresizingMaskIntoConstraints = false
                bar.isHidden = true
                hostView.addSubview(bar)
                let preferredWidth = bar.widthAnchor.constraint(equalToConstant: 440)
                preferredWidth.priority = .defaultHigh
                NSLayoutConstraint.activate([
                    bar.centerXAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.centerXAnchor),
                    bar.widthAnchor.constraint(lessThanOrEqualTo: hostView.safeAreaLayoutGuide.widthAnchor, constant: -32),
                    preferredWidth,
                    bar.heightAnchor.constraint(equalToConstant: 64),
                    // Match the web bar's bottom: 24px; do not change the WebView's content insets.
                    bar.bottomAnchor.constraint(equalTo: hostView.bottomAnchor, constant: -24)
                ])
                self.bottomBar = bar
            }

            bar.update(options)
            self.requestedVisible = options.visible
            self.applyVisibility()
            call.resolve(["available": true])
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requestedVisible = false
            self?.applyVisibility()
            call.resolve()
        }
    }

    func setHostVisible(_ visible: Bool) {
        hostVisible = visible
        applyVisibility()
    }

    private func applyVisibility() {
        let visible = requestedVisible && hostVisible && !keyboardVisible
        bottomBar?.isHidden = !visible
        bottomBar?.isUserInteractionEnabled = visible
    }

    private func resetForPageLoad() {
        requestedVisible = false
        bottomBar?.removeFromSuperview()
        bottomBar = nil
    }
}

private struct NativeBottomBarOptions {
    let selectedTab: String
    let statsMode: String
    let trading: Bool
    let visible: Bool
    let themeMode: String
    let tintColor: UIColor

    init(call: CAPPluginCall) {
        let tab = call.getString("selectedTab") ?? "home"
        selectedTab = ["home", "stats", "ledgers", "settings"].contains(tab) ? tab : "home"
        statsMode = call.getString("statsMode") == "ai" ? "ai" : "stats"
        trading = call.getBool("trading") ?? false
        visible = call.getBool("visible") ?? false
        themeMode = call.getString("themeMode") ?? "auto"
        tintColor = Self.color(from: call.getString("tintColor")) ?? .systemBlue
    }

    private static func color(from hex: String?) -> UIColor? {
        guard let hex = hex, hex.count == 7, hex.hasPrefix("#"),
              let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((value >> 16) & 0xff) / 255,
            green: CGFloat((value >> 8) & 0xff) / 255,
            blue: CGFloat(value & 0xff) / 255,
            alpha: 1
        )
    }
}

@available(iOS 26.0, *)
private final class NativeBottomBarView: UIView {
    private let glassView: UIVisualEffectView
    private let homeButton = UIButton(type: .system)
    private let statsButton = UIButton(type: .system)
    private let addButton = UIButton(type: .system)
    private let ledgersButton = UIButton(type: .system)
    private let settingsButton = UIButton(type: .system)
    private let onAction: ([String: Any]) -> Void
    private var previousOptions: NativeBottomBarOptions?

    init(onAction: @escaping ([String: Any]) -> Void) {
        let glassEffect = UIGlassEffect(style: .regular)
        glassEffect.isInteractive = true
        glassView = UIVisualEffectView(effect: glassEffect)
        self.onAction = onAction
        super.init(frame: .zero)

        backgroundColor = .clear
        layer.cornerRadius = 32
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOffset = CGSize(width: 0, height: 4)
        layer.shadowRadius = 12
        layer.shadowOpacity = 0.12
        glassView.layer.cornerRadius = 32
        glassView.clipsToBounds = true
        glassView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(glassView)
        NSLayoutConstraint.activate([
            glassView.leadingAnchor.constraint(equalTo: leadingAnchor),
            glassView.trailingAnchor.constraint(equalTo: trailingAnchor),
            glassView.topAnchor.constraint(equalTo: topAnchor),
            glassView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])

        let addSlot = UIView()
        addButton.translatesAutoresizingMaskIntoConstraints = false
        addSlot.addSubview(addButton)
        NSLayoutConstraint.activate([
            addButton.centerXAnchor.constraint(equalTo: addSlot.centerXAnchor),
            addButton.centerYAnchor.constraint(equalTo: addSlot.centerYAnchor),
            addButton.widthAnchor.constraint(equalToConstant: 48),
            addButton.heightAnchor.constraint(equalToConstant: 48)
        ])

        let stack = UIStackView(arrangedSubviews: [homeButton, statsButton, addSlot, ledgersButton, settingsButton])
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        glassView.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor, constant: -8),
            stack.topAnchor.constraint(equalTo: glassView.contentView.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor, constant: -4)
        ])

        for (button, tab) in [(homeButton, "home"), (statsButton, "stats"), (ledgersButton, "ledgers"), (settingsButton, "settings")] {
            button.accessibilityIdentifier = "native-bottom-bar-\(tab)"
            button.addAction(UIAction { [weak self] _ in
                self?.onAction(["type": "tab", "tab": tab])
            }, for: .touchUpInside)
        }
        // UIKit owns gesture arbitration: a long press opens the menu without also switching tabs.
        statsButton.showsMenuAsPrimaryAction = false
        addButton.showsMenuAsPrimaryAction = true
        addButton.accessibilityIdentifier = "native-bottom-bar-add"
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(_ options: NativeBottomBarOptions) {
        let previous = previousOptions
        previousOptions = options
        if let previous = previous,
           previous.selectedTab == options.selectedTab,
           previous.statsMode == options.statsMode,
           previous.trading == options.trading,
           previous.themeMode == options.themeMode,
           previous.tintColor.isEqual(options.tintColor) {
            return
        }

        switch options.themeMode {
        case "light": overrideUserInterfaceStyle = .light
        case "dark": overrideUserInterfaceStyle = .dark
        default: overrideUserInterfaceStyle = .unspecified
        }
        tintColor = options.tintColor

        configureNavigationButton(homeButton, title: "首页", image: "house", selected: options.selectedTab == "home", tint: options.tintColor)
        configureNavigationButton(
            statsButton,
            title: options.statsMode == "ai" ? "AI" : "统计",
            image: options.statsMode == "ai" ? "sparkles" : "chart.bar",
            selected: options.selectedTab == "stats",
            tint: options.tintColor
        )
        configureNavigationButton(ledgersButton, title: "账本", image: "books.vertical", selected: options.selectedTab == "ledgers", tint: options.tintColor)
        configureNavigationButton(settingsButton, title: "设置", image: "gearshape", selected: options.selectedTab == "settings", tint: options.tintColor)

        if previous?.statsMode != options.statsMode {
            statsButton.menu = UIMenu(children: [
                UIAction(title: "统计", image: UIImage(systemName: "chart.bar"), state: options.statsMode == "stats" ? .on : .off) { [weak self] _ in
                    self?.onAction(["type": "statsMode", "mode": "stats"])
                },
                UIAction(title: "AI 助手", image: UIImage(systemName: "sparkles"), state: options.statsMode == "ai" ? .on : .off) { [weak self] _ in
                    self?.onAction(["type": "statsMode", "mode": "ai"])
                }
            ])
        }
        statsButton.accessibilityHint = "轻点打开，长按切换统计或 AI 助手"

        var addConfiguration = UIButton.Configuration.plain()
        addConfiguration.image = UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .semibold))
        addConfiguration.baseForegroundColor = .white
        addConfiguration.background.backgroundColor = .systemGreen
        addConfiguration.cornerStyle = .capsule
        addButton.configuration = addConfiguration
        addButton.accessibilityLabel = options.trading ? "添加交易" : "添加账目"
        if previous?.trading != options.trading {
            addButton.menu = UIMenu(children: [
                UIAction(title: options.trading ? "添加买入" : "添加支出", image: UIImage(systemName: "arrow.up.circle")) { [weak self] _ in
                    self?.onAction(["type": "add", "transactionType": "expense"])
                },
                UIAction(title: options.trading ? "添加卖出" : "添加收入", image: UIImage(systemName: "arrow.down.circle")) { [weak self] _ in
                    self?.onAction(["type": "add", "transactionType": "income"])
                }
            ])
        }
    }

    private func configureNavigationButton(_ button: UIButton, title: String, image: String, selected: Bool, tint: UIColor) {
        var configuration = UIButton.Configuration.plain()
        configuration.title = title
        configuration.image = UIImage(systemName: selected ? "\(image).fill" : image)
            ?? UIImage(systemName: image)
        configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 21, weight: .medium)
        configuration.imagePlacement = .top
        configuration.imagePadding = 3
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 3, leading: 0, bottom: 3, trailing: 0)
        configuration.baseForegroundColor = selected ? tint : .secondaryLabel
        configuration.background.backgroundColor = selected ? tint.withAlphaComponent(0.12) : .clear
        configuration.cornerStyle = .capsule
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var updated = attributes
            updated.font = UIFont.systemFont(ofSize: 10, weight: .semibold)
            return updated
        }
        button.configuration = configuration
        button.isSelected = selected
        button.accessibilityLabel = title
        button.accessibilityTraits = selected ? [.button, .selected] : [.button]
    }
}
