import Capacitor

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    private let nativeBottomBarPlugin = NativeBottomBarPlugin()

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HomeQuickActionsPlugin())
        bridge?.registerPluginInstance(nativeBottomBarPlugin)
        webView?.scrollView.showsVerticalScrollIndicator = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
    }

    override open func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        nativeBottomBarPlugin.setHostVisible(true)
    }

    override open func viewWillDisappear(_ animated: Bool) {
        nativeBottomBarPlugin.setHostVisible(false)
        super.viewWillDisappear(animated)
    }
}
