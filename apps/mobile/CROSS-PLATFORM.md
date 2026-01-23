# Cross-Platform Development Guide

## ✅ Đã Fix Để Chạy Cả Windows & macOS

### 🔧 Changes Made

#### 1. **Package.json Scripts** (Cross-platform)

```json
// ❌ Before (Unix only)
"clean": "rm -rf dist www .angular"

// ✅ After (Cross-platform)
"clean": "rimraf dist www .angular"
```

#### 2. **Environment Variables** (Cross-platform)

```json
// ❌ Before (Unix only)
"serve:ssr:dev": "NODE_ENV=development node server.mjs"

// ✅ After (Cross-platform)
"serve:ssr:dev": "cross-env NODE_ENV=development node server.mjs"
```

#### 3. **Gradle Properties** (Auto-detect Java)

```properties
# ❌ Before (Hardcoded macOS path)
org.gradle.java.home=/usr/local/Cellar/openjdk@17/17.0.18/libexec/openjdk.jdk/Contents/Home

# ✅ After (Auto-detect)
# org.gradle.java.home=... (commented out)
# Let Gradle auto-detect Java based on JAVA_HOME
```

#### 4. **Auto Setup Script**

- `scripts/setup-gradle.js` - Tự động fix gradle.properties khi `npm install`
- Chạy mỗi khi postinstall

### 📦 Dependencies Added

```bash
# Already installed in root
rimraf        # Cross-platform rm -rf
cross-env     # Cross-platform environment variables
```

### 🚀 Development Workflow

#### Windows

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for Android
npm run build:dev
npm run android

# Clean build artifacts
npm run clean:soft
```

#### macOS

```bash
# Same commands work!
npm install
npm run dev
npm run ios
```

### 🐛 Common Issues & Solutions

#### Issue: "Gradle Java home invalid"

**Solution:** Đã auto-fix bằng postinstall script

```bash
# Manual fix nếu cần
node scripts/setup-gradle.js
```

#### Issue: "rm not found" trên Windows

**Solution:** Đã thay bằng `rimraf` trong tất cả scripts

#### Issue: "NODE_ENV not recognized" trên Windows

**Solution:** Đã thay bằng `cross-env`

### 📁 Platform-Specific Paths

#### ✅ Good (Portable)

```typescript
import { join } from 'path';
const configPath = join(__dirname, 'config.json');
```

#### ❌ Bad (Platform-specific)

```typescript
const configPath = '/usr/local/config.json'; // macOS only
const configPath = 'C:\\config.json'; // Windows only
```

### 🔍 Storage Differences

#### Browser (port 4300)

```
Storage: localStorage
Clear: Browser DevTools > Application > Local Storage
```

#### Android

```
Storage: Capacitor Preferences (native)
Clear: Settings > Apps > NXT1 > Clear Data
```

#### iOS

```
Storage: UserDefaults (native)
Clear: Settings > NXT1 > Reset
```

### 🧪 Testing Cross-Platform

```bash
# Test scripts work on both platforms
npm run clean:soft    # Should work on Windows & Mac
npm run build:dev     # Should work on both
npm run dev           # Should work on both
```

### 📝 Checklist cho Dev Mới

- [ ] Install Node.js 18+
- [ ] Install Java JDK 17+ (set JAVA_HOME)
- [ ] Install Android Studio (cho Android dev)
- [ ] Install Xcode (cho iOS dev - Mac only)
- [ ] Run `npm install` (auto-setup gradle)
- [ ] Test `npm run dev`
- [ ] Test platform build

### 🎯 Best Practices

1. **Always use cross-platform tools:**
   - `rimraf` instead of `rm -rf`
   - `cross-env` for env vars
   - `path.join()` for file paths

2. **Never hardcode platform paths:**
   - Let tools auto-detect
   - Use environment variables
   - Use relative paths

3. **Test on both platforms:**
   - Windows dev should test scripts
   - Mac dev should test scripts
   - Use CI/CD to verify

4. **Clear storage when switching platforms:**
   - Browser vs Native have different storage
   - Always "Clear Data" when testing

### 🔄 Migration from Old Setup

```bash
# 1. Pull latest code (already has fixes)
git pull

# 2. Reinstall dependencies
npm install --force

# 3. Auto-setup will fix gradle.properties
# (runs automatically via postinstall)

# 4. Test
npm run dev
```

### 💡 Tips

- **Port 4300** = Dev server (browser storage)
- **Android build** = Native app (Capacitor storage)
- **Storage persists** between builds
- **Clear data** to test fresh state

### 📚 Related Docs

- [DEBUG-ANDROID.md](./DEBUG-ANDROID.md) - Android debugging guide
- [Capacitor Docs](https://capacitorjs.com/docs) - Native platform docs
