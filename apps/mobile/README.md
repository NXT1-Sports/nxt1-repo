# NXT1 Mobile Application

Native iOS and Android application built with Ionic Framework 8 + Capacitor 7.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development server in browser (http://localhost:4300)
npm run dev

# Build for production
npm run build

# Sync with native projects
npm run sync

# Run on iOS (requires Mac + Xcode)
npm run ios:dev

# Run on Android (requires Android Studio)
npm run android:dev
```

---

## 📱 Prerequisites

### For iOS Development

- **macOS** (required for iOS development)
- **Xcode 15+**
  ([Download from Mac App Store](https://apps.apple.com/app/xcode/id497799835))
- **CocoaPods** (`sudo gem install cocoapods`)
- **iOS Simulator** (included with Xcode)

### For Android Development

- **Android Studio** ([Download](https://developer.android.com/studio))
- **JDK 17** (bundled with Android Studio)
- **Android SDK** (installed via Android Studio)
- **Android Emulator** (configured in Android Studio)

### For All Platforms

- **Node.js 22+**
- **npm 10+**

---

## 📁 Project Structure

```
apps/mobile/
├── src/
│   ├── app/
│   │   ├── app.component.ts        # Root component
│   │   ├── app.config.ts           # App providers
│   │   ├── app.routes.ts           # Route definitions
│   │   │
│   │   ├── core/                   # Core infrastructure
│   │   │   └── services/           # Platform services
│   │   │       └── native-app.service.ts
│   │   │
│   │   ├── services/               # App-wide services
│   │   │   ├── biometric.service.ts
│   │   │   ├── network.service.ts
│   │   │   ├── cache.service.ts
│   │   │   └── theme.service.ts
│   │   │
│   │   ├── features/               # Feature modules
│   │   │   ├── auth/
│   │   │   ├── home/
│   │   │   └── onboarding/
│   │   │
│   │   └── [feature]/              # Feature structure
│   │       ├── [feature].routes.ts # Feature routes
│   │       ├── pages/              # Page components
│   │       ├── components/         # UI components
│   │       └── services/           # Feature services
│   │
│   ├── environments/               # Environment configs
│   ├── index.html                  # HTML template
│   ├── main.ts                     # Application entry
│   └── styles.scss                 # Global styles
│
├── android/                        # Android native project
│   └── app/
│       └── src/main/
│           └── AndroidManifest.xml
│
├── ios/                            # iOS native project
│   └── App/
│       └── App/
│           └── Info.plist
│
├── capacitor.config.ts             # Capacitor configuration
├── angular.json                    # Angular configuration
└── tsconfig.app.json              # TypeScript config
```

---

## 🔧 Native Services

### 1. BiometricService (Face ID / Touch ID)

```typescript
import { BiometricService } from './services/biometric.service';

@Component({...})
export class LoginPage {
  private readonly biometric = inject(BiometricService);

  async quickLogin() {
    // Check if biometrics available
    if (!this.biometric.isAvailable()) {
      return this.showEmailPasswordForm();
    }

    // Show Face ID / Touch ID prompt
    const result = await this.biometric.authenticate({
      reason: 'Log in to NXT1',
      fallbackTitle: 'Use Password'
    });

    if (result.success) {
      // Get stored credentials
      const credentials = await this.biometric.getCredentials('nxt1.app');
      if (credentials) {
        await this.authService.signInWithCredentials(credentials);
      }
    }
  }

  async saveCredentialsSecurely(email: string, token: string) {
    // Store in iOS Keychain / Android KeyStore
    await this.biometric.saveCredentials('nxt1.app', {
      username: email,
      password: token
    });
  }
}
```

**Platforms:**

- iOS: Face ID, Touch ID
- Android: Fingerprint, Face Unlock
- Web: Not available (graceful fallback)

### 2. NetworkService (Connectivity Monitoring)

```typescript
import { NetworkService } from './services/network.service';

@Component({...})
export class UploadPage {
  private readonly network = inject(NetworkService);

  // Reactive UI updates
  readonly showOfflineBanner = computed(() => this.network.isOffline());
  readonly showCellularWarning = computed(() => this.network.isCellular());

  async uploadVideo(file: File) {
    // Check connection type
    if (this.network.isCellular()) {
      const proceed = await this.confirmCellularUpload();
      if (!proceed) return;
    }

    // Adjust quality based on connection
    const quality = this.network.isWifi() ? 'hd' : 'sd';
    await this.videoService.upload(file, { quality });
  }

  constructor() {
    // Listen to connection changes
    this.network.status$.subscribe(event => {
      if (event.isConnected && !event.wasConnected) {
        // Connection restored - process offline queue
        this.syncService.processPendingChanges();
      }
    });
  }
}
```

**Detected Connection Types:**

- `wifi` - WiFi connection
- `cellular` - Mobile data (2G/3G/4G/5G)
- `ethernet` - Wired connection
- `none` - Offline

### 3. NativeAppService (Platform Controls)

```typescript
import { NativeAppService } from './core/services';

@Component({...})
export class AppComponent {
  private readonly nativeApp = inject(NativeAppService);

  ngOnInit() {
    // Configure native platform
    this.nativeApp.initialize({
      statusBar: {
        style: 'dark',
        backgroundColor: '#000000'
      },
      keyboard: {
        resize: 'native',
        showAccessoryBar: true
      },
      splashScreen: {
        autoHide: true,
        showDuration: 2000
      }
    });

    // Handle app lifecycle
    this.nativeApp.initializeLifecycle({
      onPause: () => this.saveState(),
      onResume: () => this.refreshData(),
      onBackButton: () => this.handleBack()
    });
  }
}
```

**Features:**

- Status bar control (color, style, visibility)
- Keyboard management (resize modes, accessory bar)
- Splash screen (show/hide timing)
- App lifecycle events (pause, resume, back button)
- Device info (model, OS version, platform)

---

## 🎨 UI Components

### Shared Components from @nxt1/ui

```typescript
import {
  AuthShellComponent,
  AuthEmailFormComponent,
  NxtLogoComponent,
} from '@nxt1/ui';

@Component({
  imports: [AuthShellComponent, AuthEmailFormComponent],
  template: `
    <nxt1-auth-shell variant="card">
      <h1 authTitle>Welcome to NXT1</h1>
      <nxt1-auth-email-form mode="login" (submitForm)="onLogin($event)" />
    </nxt1-auth-shell>
  `,
})
export class LoginPage {}
```

### Ionic Components

```html
<!-- Navigation -->
<ion-tabs>
  <ion-tab-bar slot="bottom">
    <ion-tab-button tab="home">
      <ion-icon name="home"></ion-icon>
      <ion-label>Home</ion-label>
    </ion-tab-button>
  </ion-tab-bar>
</ion-tabs>

<!-- Lists -->
<ion-list>
  <ion-item *ngFor="let item of items">
    <ion-label>{{ item.name }}</ion-label>
  </ion-item>
</ion-list>

<!-- Cards -->
<ion-card>
  <ion-card-header>
    <ion-card-title>Card Title</ion-card-title>
  </ion-card-header>
  <ion-card-content> Card content here </ion-card-content>
</ion-card>
```

---

## 🔌 Native Plugins

### Installed Capacitor Plugins

```json
{
  "@capacitor/app": "^7.0.0", // App state & lifecycle
  "@capacitor/haptics": "^7.0.0", // Haptic feedback
  "@capacitor/keyboard": "^7.0.0", // Keyboard control
  "@capacitor/network": "^7.0.0", // Network monitoring
  "@capacitor/preferences": "^7.0.0", // Key-value storage
  "@capacitor/splash-screen": "^7.0.0", // Splash screen
  "@capacitor/status-bar": "^7.0.0", // Status bar control
  "@capacitor/camera": "^7.0.0", // Camera access
  "@capacitor/filesystem": "^7.0.0", // File system
  "@capacitor/share": "^7.0.0", // Share dialog
  "capacitor-native-biometric": "^4.2.2" // Biometric auth
}
```

### Example: Camera

```typescript
import { Camera, CameraResultType } from '@capacitor/camera';

async takePicture() {
  const photo = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Uri
  });

  this.profilePhoto = photo.webPath;
}
```

### Example: Share

```typescript
import { Share } from '@capacitor/share';

async sharePost(post: Post) {
  await Share.share({
    title: post.title,
    text: post.content,
    url: `https://nxt1.app/post/${post.id}`,
    dialogTitle: 'Share this post'
  });
}
```

---

## 🏗️ Building for Production

### iOS

```bash
# 1. Build the web assets
npm run build

# 2. Sync with iOS project
npx cap sync ios

# 3. Open in Xcode
npx cap open ios

# 4. In Xcode:
#    - Select target device/simulator
#    - Product → Archive
#    - Distribute App → App Store Connect
```

**App Store Requirements:**

- App Icons (all sizes)
- Launch Screen
- Privacy descriptions in Info.plist
- App Store screenshots
- App Store metadata

### Android

```bash
# 1. Build the web assets
npm run build

# 2. Sync with Android project
npx cap sync android

# 3. Open in Android Studio
npx cap open android

# 4. In Android Studio:
#    - Build → Generate Signed Bundle / APK
#    - Choose Android App Bundle
#    - Select keystore (create if needed)
#    - Upload to Google Play Console
```

**Google Play Requirements:**

- App Icon
- Feature Graphic
- Screenshots (phone + tablet)
- Privacy Policy URL
- App description & metadata

---

## 🧪 Testing

### Unit Tests

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Run E2E tests on iOS
npm run e2e:ios

# Run E2E tests on Android
npm run e2e:android
```

### Manual Testing Checklist

- [ ] App launches successfully
- [ ] Face ID / Touch ID works
- [ ] Offline mode functions correctly
- [ ] Push notifications received
- [ ] Deep links work
- [ ] Camera/photo picker works
- [ ] Share functionality works
- [ ] App resume/background works
- [ ] Keyboard behavior correct
- [ ] Status bar displays properly

---

## 🚢 Deployment

### Version Management

```typescript
// Update version in:
// 1. package.json
{
  "version": "1.2.3"
}

// 2. iOS (ios/App/App.xcodeproj)
// MARKETING_VERSION = 1.2.3
// CURRENT_PROJECT_VERSION = 123

// 3. Android (android/app/build.gradle)
android {
  defaultConfig {
    versionCode 123
    versionName "1.2.3"
  }
}
```

### Environment Configuration

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  firebase: {
    apiKey: 'prod-api-key',
    projectId: 'nxt1-prod',
  },
  apiUrl: 'https://api.nxt1.app/v1',
};
```

---

## ⚡ Performance Optimization

### Bundle Size

```bash
# Analyze bundle
npm run build -- --stats-json
npx webpack-bundle-analyzer dist/app/stats.json
```

### Lazy Loading

```typescript
// Lazy load feature modules
const routes: Routes = [
  {
    path: 'profile',
    loadChildren: () => import('./features/profile/profile.routes'),
  },
];
```

### Image Optimization

```html
<!-- Use appropriate image sizes -->
<img [src]="imageUrl | imageSize: 'thumbnail'" alt="Profile" />

<!-- Lazy load images -->
<img loading="lazy" [src]="photo" />
```

---

## 🐛 Common Issues

### iOS Build Fails

```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Reinstall pods
cd ios/App && pod deintegrate && pod install

# Rebuild
npx cap sync ios
```

### Android Build Fails

```bash
# Clean Gradle cache
cd android && ./gradlew clean

# Invalidate Android Studio caches
# File → Invalidate Caches → Invalidate and Restart
```

### Capacitor Sync Issues

```bash
# Remove and reinstall
npx cap sync --force
```

---

## 📜 License

Proprietary - NXT1 Platform  
© 2026 NXT1. All rights reserved.

---

## 🔗 Related

- **[@nxt1/core](../../packages/core/README.md)** - Shared TypeScript library
- **[@nxt1/ui](../../packages/ui/README.md)** - Shared UI components
- **[Web App](../web/README.md)** - Angular SSR web application
- **[Capacitor Docs](https://capacitorjs.com/docs)** - Official documentation
- **[Ionic Docs](https://ionicframework.com/docs)** - UI component library

---

## 🆘 Support

For questions or issues:

- **Internal:** #engineering on Slack
- **Documentation:** [/docs/](../../docs/)
- **Native Setup:** [NATIVE-AUTH-SETUP.md](../../docs/NATIVE-AUTH-SETUP.md)
