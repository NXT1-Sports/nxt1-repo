import UIKit
import Capacitor
import FirebaseCore
import FirebaseAuth
import GoogleSignIn
import MSAL

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize Firebase - MUST be called before using any Firebase services
        FirebaseApp.configure()

        // Safety net for iOS fullscreen video (AVPlayerViewController) dismissal.
        // When WebKit presents native fullscreen video, it creates a separate UIWindow.
        // On dismissal that window resigns key status and ours becomes key again — this
        // fires UIWindow.didBecomeKeyNotification for OUR window. At that point iOS UIKit
        // may have already (or is about to) set WKScrollView.contentOffset.y to a negative
        // value, producing black bars. We schedule two resets with short delays to win the
        // race after UIKit's post-dismissal completion block.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(mainWindowDidBecomeKey(_:)),
            name: UIWindow.didBecomeKeyNotification,
            object: nil
        )

        // Set GIDServerClientID from GoogleService-Info.plist so serverAuthCode is
        // scoped to the correct Web OAuth client for backend token exchange.
        // The build script (auto-switch-firebase-env.js) copies the right plist
        // for each environment (staging/production) automatically.
        if let clientID = FirebaseApp.app()?.options.clientID,
           let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let plist = NSDictionary(contentsOfFile: plistPath),
           let serverClientID = plist["GIDServerClientID"] as? String {
            let config = GIDConfiguration(clientID: clientID, serverClientID: serverClientID)
            GIDSignIn.sharedInstance.configuration = config
        }

        // Apply the NXT1 in-app theme to the UIWindow so all native iOS system
        // sheets (share sheet, camera picker, date picker, etc.) render in the
        // correct appearance regardless of the device's system-level setting.
        applyNativeUIStyle()

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Re-apply in case UserDefaults was updated while the app was backgrounded
        // (edge case: JS wrote the preference while app was suspended).
        applyNativeUIStyle()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Firebase Auth must handle its own OAuth redirect callbacks
        // (e.g. legacy OAuthProvider – comes back as REVERSED_CLIENT_ID://firebaseauth/link).
        // FirebaseAppDelegateProxyEnabled=false disables auto-swizzling, so we forward manually.
        if Auth.auth().canHandle(url) {
            return true
        }
        // MSAL broker flows (e.g. Microsoft Authenticator app) use the msauth. scheme.
        // MSALPublicClientApplication.handleMSALResponse forwards the URL to the
        // active MSAL acquire-token request so it can complete the broker handshake.
        let sourceApp = options[UIApplication.OpenURLOptionsKey.sourceApplication] as? String
        if MSALPublicClientApplication.handleMSALResponse(url, sourceApplication: sourceApp) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Forward APNs device token to Capacitor bridge.
    // Required by both @capacitor/push-notifications (foreground display)
    // and @capacitor-firebase/messaging (FCM token retrieval).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: - Fullscreen video layout guard

    @objc private func mainWindowDidBecomeKey(_ notification: Notification) {
        // Only act when OUR main window becomes key (not alerts, keyboards, etc.)
        guard let notifWindow = notification.object as? UIWindow,
              notifWindow === self.window else { return }

        // Schedule resets at 150 ms and 450 ms.
        // • 150 ms: catches UIKit's immediate post-dismissal callback
        // • 450 ms: catches deferred layout passes on slower devices
        // Guard condition inside resetWebViewLayoutIfNeeded() means this is a no-op
        // unless the scrollView actually has a negative offset (i.e., after fullscreen).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.resetWebViewLayoutIfNeeded()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            self?.resetWebViewLayoutIfNeeded()
        }
    }

    private func resetWebViewLayoutIfNeeded() {
        guard let webView = (window?.rootViewController as? CAPBridgeViewController)?.bridge?.webView else { return }

        let scrollView = webView.scrollView

        // Only act when the scrollView has the specific negative-offset symptom.
        // This prevents running unnecessarily on every window-key event (alerts, etc.).
        guard scrollView.contentOffset.y < -1 || scrollView.contentInset != .zero else { return }

        scrollView.contentOffset = .zero
        scrollView.contentInset = .zero
        scrollView.scrollIndicatorInsets = .zero

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

        print("[AppDelegate] ✅ resetWebViewLayoutIfNeeded: black-bar fix applied")
    }

    // MARK: - Native UI Style

    /// Reads the NXT1 in-app theme written by NxtThemeService via @capacitor/preferences
    /// (UserDefaults key: "CapacitorStorage.nxt1-native-ui-style") and applies it to
    /// every UIWindow AND the Capacitor root view controller chain so all native iOS
    /// overlays (UIAlertController, system sheets) inherit the correct appearance.
    private func applyNativeUIStyle() {
        // @capacitor/preferences stores values in UserDefaults under "CapacitorStorage.<key>"
        let storedStyle = UserDefaults.standard.string(forKey: "CapacitorStorage.nxt1-native-ui-style")

        let style: UIUserInterfaceStyle
        switch storedStyle {
        case "light":
            style = .light
        case "dark":
            style = .dark
        default:
            // No preference persisted yet (first launch or web-only): use system default
            style = .unspecified
        }

        // Apply to all UIWindows (covers system sheets: share, camera, date picker)
        let scenes = UIApplication.shared.connectedScenes
        for scene in scenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for w in windowScene.windows {
                w.overrideUserInterfaceStyle = style
            }
        }

        // Apply to root VC chain (covers UIAlertController from @capacitor/dialog
        // which inherits appearance from its PRESENTING view controller, not the window)
        func applyStyle(to vc: UIViewController?) {
            var current = vc
            while let c = current {
                c.overrideUserInterfaceStyle = style
                current = c.presentedViewController
            }
        }

        if let rootVC = window?.rootViewController {
            applyStyle(to: rootVC)
        }
    }

}
