import UIKit
import Capacitor

/**
 * NxtThemePlugin
 *
 * Minimal Capacitor plugin that exposes a single `setStyle` call so JavaScript
 * can apply `overrideUserInterfaceStyle` to every UIWindow at runtime.
 *
 * This ensures native iOS system sheets (UIAlertController, UIActivityViewController,
 * UIImagePickerController, etc.) rendered by @capacitor/dialog and other native
 * plugins immediately reflect the in-app light/dark theme — not the system preference.
 *
 * JS usage (via NxtThemeService.syncIOSAppearance):
 *   NxtTheme.setStyle({ style: 'light' | 'dark' | 'unspecified' })
 */
@objc(NxtThemePlugin)
public class NxtThemePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "NxtThemePlugin"
    public let jsName = "NxtTheme"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetWebViewLayout", returnType: CAPPluginReturnPromise),
    ]

    @objc func setStyle(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "unspecified"
        print("[NxtThemePlugin] ▶︎ setStyle called with: '\(style)'")

        let uiStyle: UIUserInterfaceStyle
        switch style {
        case "light":
            uiStyle = .light
        case "dark":
            uiStyle = .dark
        default:
            uiStyle = .unspecified
        }

        DispatchQueue.main.async {
            // 1. Set on every UIWindow so system sheets (share, camera, date picker) inherit it.
            var windowCount = 0
            let scenes = UIApplication.shared.connectedScenes
            for scene in scenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for w in windowScene.windows {
                    w.overrideUserInterfaceStyle = uiStyle
                    windowCount += 1
                }
            }
            print("[NxtThemePlugin] ✅ Applied to \(windowCount) UIWindow(s)")

            // 2. Set on the Capacitor bridge's root view controller and its entire
            //    presented-VC chain. UIAlertController inherits appearance from its
            //    PRESENTING view controller's trait collection, not the window — so
            //    this is required for @capacitor/dialog prompts/confirms to respect
            //    the in-app theme.
            var vcCount = 0
            func applyStyle(to vc: UIViewController?) {
                var current = vc
                while let c = current {
                    c.overrideUserInterfaceStyle = uiStyle
                    vcCount += 1
                    current = c.presentedViewController
                }
            }

            applyStyle(to: self.bridge?.viewController)
            print("[NxtThemePlugin] ✅ Applied to \(vcCount) ViewController(s) in chain")
            print("[NxtThemePlugin] ✅ bridge?.viewController = \(String(describing: self.bridge?.viewController))")
            call.resolve()
        }
    }

    @objc func resetWebViewLayout(_ call: CAPPluginCall) {
        // Resolve immediately — the JS caller does not need to wait for retries.
        call.resolve()

        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else { return }

            func applyReset() {
                webView.scrollView.contentOffset = .zero
                webView.scrollView.contentInset = .zero
                webView.scrollView.scrollIndicatorInsets = .zero

                if let superview = webView.superview {
                    webView.frame = superview.bounds
                }

                webView.setNeedsLayout()
                webView.superview?.setNeedsLayout()
                webView.layoutIfNeeded()
                webView.superview?.layoutIfNeeded()

                webView.evaluateJavaScript(
                    "window.scrollTo(0,0); window.dispatchEvent(new Event('resize'));",
                    completionHandler: nil
                )
            }

            applyReset()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.20) { applyReset() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.50) { applyReset() }
        }
    }
}
