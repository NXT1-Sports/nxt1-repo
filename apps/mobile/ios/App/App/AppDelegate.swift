import UIKit
import Capacitor
import FirebaseCore
import GoogleSignIn

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize Firebase - MUST be called before using any Firebase services
        FirebaseApp.configure()

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
        
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
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

}
