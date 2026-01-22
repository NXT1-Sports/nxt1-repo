# App Resources

This folder contains source assets for app icons and splash screens.

## Required Files

### Icon

- **icon.png** - App icon (1024x1024px, PNG)
  - Used to generate all platform-specific icon sizes
  - Should have transparent background
  - Logo should be centered with safe area padding

### Splash Screen (Optional)

- **splash.png** - Splash screen (2732x2732px, PNG)
  - Used to generate all platform-specific splash screens
  - Logo should be centered on dark background (#0a0a0a)

## Generate Assets

After adding/updating icon.png and splash.png, run:

```bash
npm run resources
```

This will automatically generate:

- **Android**: All mipmap sizes (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- **iOS**: All app icon sizes for App Store and devices
- **Splash screens**: All sizes for both platforms

## Manual Icon Requirements

If you prefer manual icon generation:

### Android

Place icons in `android/app/src/main/res/mipmap-*/`:

- mipmap-mdpi: 48x48px
- mipmap-hdpi: 72x72px
- mipmap-xhdpi: 96x96px
- mipmap-xxhdpi: 144x144px
- mipmap-xxxhdpi: 192x192px

### iOS

Place icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

- Various sizes from 20x20 to 1024x1024

## Current Setup

The app currently uses:

- **App Name**: NXT1 Sports
- **Package**: com.nxt1.sports
- **Background Color**: #0a0a0a (dark)
