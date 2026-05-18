import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    // ── Universal Links: Warm Start ──────────────────────────────────────────
    // When the app is in the background / suspended and the user taps a
    // Universal Link, iOS calls scene(_:continue:) on the SceneDelegate —
    // NOT AppDelegate.application(_:continue:restorationHandler:).
    //
    // We forward to ApplicationDelegateProxy so that:
    //   1. ApplicationDelegateProxy.shared.lastURL is set
    //      → App.getLaunchUrl() works correctly.
    //   2. The "CapacitorOpenUniversalLinkNotification" is posted
    //      → AppPlugin.handleUniversalLink fires appUrlOpen (retainUntilConsumed)
    //      → The JS deep-link handler receives the URL.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    // ── Universal Links: Cold Start ──────────────────────────────────────────
    // When the app was NOT running and the user taps a Universal Link, iOS
    // passes the NSUserActivity via connectionOptions.userActivities.
    // We forward to scene(_:continue:) which routes to the proxy above.
    // The notification fires immediately; the Capacitor App plugin stores the
    // event with retainUntilConsumed: true so it is replayed the moment JS
    // calls App.addListener('appUrlOpen', ...).
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let userActivity = connectionOptions.userActivities.first(where: {
            $0.activityType == NSUserActivityTypeBrowsingWeb
        }) {
            self.scene(scene, continue: userActivity)
        }
    }
}