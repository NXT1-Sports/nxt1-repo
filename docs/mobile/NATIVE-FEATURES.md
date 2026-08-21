# Native Features Implementation

## Overview

Complete native polish suite for NXT1 mobile app providing **100% professional
native feel**. All services use signals, are SSR-safe, and follow enterprise
architecture patterns.

---

## 🎯 Services

### 1. **NativeAppService** - Platform Initialization

**Location:** `apps/mobile/src/services/native`

Centralized native app initialization handling StatusBar, SplashScreen,
Keyboard, and lifecycle events.

> **Note:** This service is **mobile-only** (not in `@nxt1/ui`) because
> StatusBar, Keyboard, and SplashScreen have no web equivalents.

#### Features

- ✅ **StatusBar** - Style, color, show/hide, overlay control
- ✅ **SplashScreen** - Auto-hide with configurable delay
- ✅ **Keyboard** - Resize modes, accessory bar, show/hide, height tracking
- ✅ **App Lifecycle** - pause, resume, backButton events
- ✅ **Signal-based state** - Reactive keyboard/status bar state
- ✅ **SSR-safe** - No-ops on server, dynamic plugin imports

#### Usage

```typescript
// apps/mobile/src/app/app.component.ts
export class AppComponent {
  private readonly nativeApp = inject(NativeAppService);

  constructor() {
    afterNextRender(() => {
      this.nativeApp.initialize({
        // StatusBar configuration
        statusBarStyle: 'light', // 'dark' | 'light' | 'default'
        statusBarColor: '#0a0a0a', // Hex color (Android)

        // Splash screen
        autoHideSplash: true,
        splashDelay: 500, // ms

        // Keyboard behavior
        keyboardResize: 'body', // 'body' | 'ionic' | 'native' | 'none'
        keyboardAccessoryBarHidden: false,

        // Lifecycle callbacks
        onPause: () => console.log('App paused'),
        onResume: () => this.refreshData(),
        onBackButton: () => false, // Return true to prevent default
      });
    });
  }
}
```

#### Signals

```typescript
nativeApp.isNative(); // boolean
nativeApp.isInitialized(); // boolean
nativeApp.keyboardVisible(); // boolean
nativeApp.keyboardHeight(); // number (px)
nativeApp.statusBarVisible(); // boolean
```

#### Methods

```typescript
// Status bar
await nativeApp.setStatusBarStyle('dark');
await nativeApp.showStatusBar();
await nativeApp.hideStatusBar();

// Splash screen
await nativeApp.hideSplashScreen();
await nativeApp.showSplashScreen();

// Keyboard
await nativeApp.showKeyboard();
await nativeApp.hideKeyboard();

// App info
const info = await nativeApp.getAppInfo(); // { name, version, build }
await nativeApp.exitApp(); // Android only
```

---

### 2. **NetworkService** - Offline Detection

**Locations:**

- Web: `apps/web/src/app/core/services/network.service.ts`
- Mobile: `apps/mobile/src/app/services/network.service.ts`
- Shared types: `@nxt1/core/models/network.model.ts`

Platform-specific implementations with shared interface for real-time network
status monitoring.

> **Architecture Note:** NetworkService has **platform-specific
> implementations** rather than a shared service. The web version uses browser
> APIs (`navigator.onLine`, `window.addEventListener`), while the mobile version
> uses the Capacitor Network plugin for native network detection including
> WiFi/cellular distinction.

#### Features

- ✅ **Online/Offline detection** - Reactive signals
- ✅ **Connection type** - wifi, cellular, 2g/3g/4g/5g, none
- ✅ **Change events** - Observable stream
- ✅ **Helper methods** - waitForNetwork, executeIfOnline
- ✅ **Cross-platform** - Capacitor Network + browser navigator.onLine

#### Usage

```typescript
export class MyComponent {
  private readonly network = inject(NetworkService);

  // Template: @if (network.isOffline()) { ... }

  async loadData() {
    if (this.network.isOffline()) {
      return this.loadFromCache();
    }

    return this.api.fetchData();
  }

  async syncData() {
    // Wait for connection with timeout
    const connected = await this.network.waitForNetwork(5000);

    if (!connected) {
      this.toast.show('Still offline, will sync later');
      return;
    }

    await this.uploadData();
  }
}
```

#### Signals

```typescript
// Available on both web and mobile
network.isOnline(); // boolean
network.isOffline(); // boolean
network.connectionType(); // 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none'
network.status(); // NetworkStatus

// Mobile-only (Capacitor Network plugin)
network.isWifi(); // boolean - Available only on mobile
network.isCellular(); // boolean - Available only on mobile
```

#### Connection Types

**Web (Browser):**

- `online` - Connected to internet
- `offline` - No internet connection
- `unknown` - Connection status unclear

**Mobile (Capacitor Network):**

- `wifi` - WiFi connection
- `cellular` - Mobile data (2G/3G/4G/5G)
- `ethernet` - Wired connection (rare on mobile)
- `none` - No connection
- `unknown` - Connection type unclear

#### Methods

```typescript
// Check network status
await network.checkStatus();

// Wait for connection (with timeout)
const connected = await network.waitForNetwork(5000); // ms

// Execute only if online
await network.executeIfOnline(
  async () => await this.upload(),
  () => this.toast.show('Offline')
);
```

---

### 3. **BiometricService** - Face ID / Touch ID

**Location:** `apps/mobile/src/app/services/biometric.service.ts`

Native biometric authentication for secure user verification.

> **Architecture Note:** BiometricService is **mobile-only** and lives in the
> mobile app's services folder because biometric authentication is not available
> on web. It uses the `capacitor-native-biometric` plugin to access native iOS
> Keychain and Android KeyStore.

#### Features

- ✅ **Face ID / Touch ID / Fingerprint** - Platform detection
- ✅ **Secure credential storage** - Encrypted by biometric
- ✅ **Availability checking** - Pre-check before prompting
- ✅ **Error handling** - Detailed error codes and messages
- ✅ **SSR-safe** - Dynamic plugin imports

#### Usage

```typescript
export class LoginComponent {
  private readonly biometric = inject(BiometricService);

  async ngOnInit() {
    // Check availability
    const info = await this.biometric.initialize();

    if (info.available) {
      this.showBiometricOption = true;
      this.biometricName = this.biometric.biometryName(); // 'Face ID', 'Touch ID', etc.
    }
  }

  async verifyIdentity() {
    const result = await this.biometric.authenticate({
      reason: 'Verify your identity to view sensitive data',
      title: 'Authentication Required',
      allowDeviceCredential: false, // Fallback to PIN/pattern
    });

    if (result.success) {
      this.showSensitiveData();
    } else {
      this.toast.show(result.error);
    }
  }

  async enableBiometricLogin() {
    // Store credentials securely
    await this.biometric.setCredentials(
      'nxt1-auth',
      this.user.email,
      this.user.accessToken
    );
  }

  async biometricLogin() {
    // Retrieve credentials (prompts biometric)
    const credentials = await this.biometric.getCredentials(
      'nxt1-auth',
      'Log in with biometrics'
    );

    if (credentials) {
      await this.loginWithToken(credentials.password);
    }
  }
}
```

#### Signals

```typescript
biometric.isAvailable(); // boolean
biometric.biometryType(); // 'face' | 'fingerprint' | 'iris' | 'none'
biometric.biometryName(); // 'Face ID', 'Touch ID', 'Fingerprint', etc.
```

#### Methods

```typescript
// Initialize and check availability
const info = await biometric.initialize();
// { available: boolean, biometryType: BiometricType, reason?: string }

// Authenticate
const result = await biometric.authenticate({
  reason: 'Why you need biometric',
  title: 'Dialog title (Android)',
  subtitle: 'Dialog subtitle (Android)',
  negativeButtonText: 'Cancel',
  allowDeviceCredential: true, // PIN/pattern fallback
  maxAttempts: 3,
});

// Quick auth with default options
const success = await biometric.quickAuth('Verify identity');

// Credential storage
await biometric.setCredentials('server-id', 'username', 'password');
const creds = await biometric.getCredentials('server-id', 'reason');
await biometric.deleteCredentials('server-id');
```

#### Error Codes

```typescript
BIOMETRIC_ERROR_CODES.NOT_AVAILABLE; // Device doesn't support biometric
BIOMETRIC_ERROR_CODES.NOT_ENROLLED; // No biometric data enrolled
BIOMETRIC_ERROR_CODES.USER_CANCELLED; // User cancelled prompt
BIOMETRIC_ERROR_CODES.LOCKOUT; // Too many failed attempts
BIOMETRIC_ERROR_CODES.LOCKOUT_PERMANENT; // Biometric locked, use passcode
```

---

## 🧩 Components

### 1. **NxtRefreshContainerComponent** - Pull-to-Refresh

**Location:** `@nxt1/ui/components`

Drop-in replacement for ion-refresher with signal-based state and haptic
feedback.

#### Usage

```html
<nxt-refresh-container (onRefresh)="loadData($event)">
  <ion-list>
    @for (item of items(); track item.id) {
    <ion-item>{{ item.name }}</ion-item>
    }
  </ion-list>
</nxt-refresh-container>
```

#### With Custom Options

```html
<nxt-refresh-container
  [pullingIcon]="'chevron-down'"
  [refreshingSpinner]="'crescent'"
  [pullingText]="'Pull to refresh'"
  [refreshingText]="'Loading...'"
  [hapticFeedback]="true"
  [pullFactor]="1"
  [pullMin]="60"
  [pullMax]="120"
  (onRefresh)="loadData($event)"
>
  <!-- content -->
</nxt-refresh-container>
```

#### Event Handler

```typescript
async loadData(event: RefreshEvent) {
  try {
    const data = await this.api.fetchData();
    this.items.set(data);
    event.complete(); // Success haptic
  } catch (error) {
    this.toast.show('Failed to refresh');
    event.cancel(); // Error haptic
  }
}
```

---

### 2. **NxtOfflineIndicatorComponent** - Offline Banner

**Location:** `@nxt1/ui/components`

Automatically shows a banner when the device is offline.

#### Usage

```html
<!-- In app.component.html or layout -->
<nxt-offline-indicator />
```

#### With Custom Options

```html
<nxt-offline-indicator
  message="No internet connection"
  [showRetryButton]="true"
  [dismissible]="true"
  position="bottom"
  (retry)="retryConnection()"
>
</nxt-offline-indicator>
```

#### Styling

```css
/* CSS variables for customization */
--nxt-color-error-surface: #dc2626;
--nxt-color-text-on-error: #ffffff;
--nxt-color-error-800: #991b1b;
```

---

## 🎮 Directives

### 1. **HapticButtonDirective** - Auto-Haptic Feedback

**Location:** `@nxt1/ui/directives`

Adds native haptic feedback to any element on tap/click.

#### Usage

```html
<!-- Light haptic (default) -->
<button nxtHaptic>Tap me</button>

<!-- Medium haptic -->
<button nxtHaptic="medium">Submit</button>

<!-- Heavy haptic for destructive actions -->
<button nxtHaptic="heavy" (click)="delete()">Delete</button>

<!-- Success notification haptic -->
<ion-button nxtHaptic="success" (click)="save()">Save</ion-button>

<!-- Selection haptic (for toggles) -->
<button nxtHaptic="selection">Toggle</button>

<!-- Disabled -->
<button [nxtHaptic]="null">No feedback</button>
<button nxtHaptic [nxtHapticDisabled]="true">Also disabled</button>
```

#### Feedback Types

- **Impact**: `'light'` | `'medium'` | `'heavy'`
- **Notification**: `'success'` | `'warning'` | `'error'`
- **Selection**: `'selection'` (for toggles, pickers)

---

### 2. **HapticSelectionDirective** - Selection Haptic

Triggers selection haptic on value changes (toggles, checkboxes, radio buttons).

#### Usage

```html
<ion-toggle nxtHapticSelect [(ngModel)]="enabled"></ion-toggle>
<ion-checkbox nxtHapticSelect [(ngModel)]="checked"></ion-checkbox>
<ion-radio-group nxtHapticSelect [(ngModel)]="selected">
  <ion-radio value="option1">Option 1</ion-radio>
  <ion-radio value="option2">Option 2</ion-radio>
</ion-radio-group>
```

---

## 📦 Installation

### 1. Install Biometric Plugin

```bash
# In nxt1-monorepo/apps/mobile
npm install capacitor-native-biometric@^4.3.1
npx cap sync
```

### 2. Configure iOS (Info.plist)

```xml
<key>NSFaceIDUsageDescription</key>
<string>We use Face ID to securely authenticate you</string>
```

### 3. Import Services in App Component

```typescript
// apps/mobile/src/app/app.component.ts
import { NativeAppService } from './core/services/native-app.service';
import { NetworkService } from './services/network.service';
import { BiometricService } from './services/biometric.service';

export class AppComponent {
  private readonly nativeApp = inject(NativeAppService);
  private readonly network = inject(NetworkService);
  private readonly biometric = inject(BiometricService);

  constructor() {
    afterNextRender(async () => {
      await this.nativeApp.initialize({
        /* config */
      });
      await this.network.initialize();
      await this.biometric.initialize();
    });
  }
}
```

---

## 🎨 Best Practices

### 1. **Always Check Availability First**

```typescript
// Biometric
const { available } = await biometric.initialize();
if (available) {
  // Show biometric option
}

// Network
if (network.isOffline()) {
  // Load from cache
}
```

### 2. **Use Signals in Templates**

```html
@if (network.isOffline()) {
<div class="offline-banner">You are offline</div>
} @if (nativeApp.keyboardVisible()) {
<div [style.padding-bottom.px]="nativeApp.keyboardHeight()">
  <!-- Content pushed up by keyboard -->
</div>
}
```

### 3. **Haptic Feedback for All Interactions**

```html
<!-- Buttons -->
<ion-button nxtHaptic="medium">Save</ion-button>
<ion-button nxtHaptic="heavy" color="danger">Delete</ion-button>

<!-- Toggles -->
<ion-toggle nxtHapticSelect [(ngModel)]="enabled">Enable</ion-toggle>

<!-- List items -->
<ion-item nxtHaptic="light" (click)="viewDetails()">
  <ion-label>{{ item.name }}</ion-label>
</ion-item>
```

### 4. **Network-Aware Operations**

```typescript
async syncData() {
  // Wait for connection
  if (!this.network.isOnline()) {
    const connected = await this.network.waitForNetwork(5000);
    if (!connected) {
      this.toast.show('Still offline');
      return;
    }
  }

  await this.upload();
}
```

### 5. **Lifecycle Hooks**

```typescript
this.nativeApp.initialize({
  onResume: () => {
    // Refresh data when app resumes
    this.refreshData();
  },
  onPause: () => {
    // Save state before backgrounding
    this.saveState();
  },
  onBackButton: () => {
    // Custom back button behavior
    if (this.hasUnsavedChanges()) {
      this.showExitConfirmation();
      return true; // Prevent default
    }
    return false; // Allow default behavior
  },
});
```

---

## 🚀 What's Next?

### Recommended Enhancements

1. **App Badging** - Unread count on app icon
2. **Push Notifications** - With badge, sound, and data
3. **In-App Purchases** - StoreKit (iOS) / Google Play Billing
4. **Share Sheet** - Native sharing to other apps
5. **Camera** - With overlay, QR code scanning
6. **Local Notifications** - Scheduled reminders
7. **App Rate Prompt** - Smart timing for reviews
8. **Screen Orientation Lock** - Portrait/landscape control

---

## 📚 Architecture

All services follow the **NXT1 Monorepo Pattern**:

- ✅ **100% Portable Core** - Pure TypeScript in `@nxt1/core`
- ✅ **Signal-Based State** - Reactive, performant
- ✅ **SSR-Safe** - Platform checks, dynamic imports
- ✅ **Enterprise-Grade** - Error handling, logging, types
- ✅ **Mobile-First** - Native performance and feel

---

## 🎉 Result

Your NXT1 mobile app now has **100% professional native polish** including:

- ✅ StatusBar integration with theme-aware styling
- ✅ Smart splash screen management
- ✅ Keyboard-aware layouts with height tracking
- ✅ Offline detection with retry capability
- ✅ Face ID / Touch ID / Fingerprint authentication
- ✅ Haptic feedback on every interaction
- ✅ Pull-to-refresh with native animations
- ✅ App lifecycle event handling
- ✅ Network-aware operations

The app feels indistinguishable from a fully native iOS/Android app! 🚀
