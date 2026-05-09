# NXT1 Mobile OTA Update Guide

**Last updated:** April 28, 2026  
**Stack:** `@capgo/capacitor-updater@8.45.10` (self-hosted, manual mode) +
Cloudflare R2 + Firestore

---

## Tổng quan hệ thống

NXT1 mobile sử dụng **Over-the-Air (OTA) bundle update** để cập nhật JS/HTML/CSS
mà **không cần submit App Store**. Toàn bộ logic nằm ở:

| File                                                              | Vai trò                                   |
| ----------------------------------------------------------------- | ----------------------------------------- |
| `apps/mobile/src/app/core/services/native/live-update.service.ts` | Orchestrator: check, download, stage      |
| `apps/mobile/src/app/app.component.ts` (line 234)                 | Trigger `initialize()` mỗi cold start     |
| `backend/scripts/deploy-mobile-bundle.ts`                         | Build → zip → upload R2 → ghi Firestore   |
| Firestore `AppUpdates/ios_production`                             | Manifest: version, URL, SHA-256, rollout% |
| Cloudflare R2 `nxt1-app-bundles-prod`                             | File storage cho bundle.zip               |

---

## ✅ Những gì có thể deploy qua OTA (KHÔNG cần rebuild Xcode)

Bất kỳ thay đổi nào trong `apps/mobile/src/` đều OTA được:

- **Bug fix logic**: Service, component logic, business logic
- **UI thay đổi**: Màu sắc, layout, font, spacing, Tailwind classes
- **Tính năng mới Angular/Ionic**: Thêm màn hình, thêm component, sửa route
- **API calls**: Thêm/sửa endpoint, request/response handling
- **Text, copy, i18n**: Label, error message, placeholder
- **Assets**: Ảnh, icon (nếu đã bundle vào `www/browser/`)
- **Shared packages** (`@nxt1/core`, `@nxt1/ui`): Thay đổi TS/Angular library

**Quy tắc đơn giản:** Nếu output là file trong `apps/mobile/www/browser/` → OTA
được.

---

## ❌ Những gì BẮT BUỘC rebuild Xcode + submit App Store

| Loại thay đổi                                             | Lý do                                         |
| --------------------------------------------------------- | --------------------------------------------- |
| Thêm/xóa Capacitor plugin (`@capacitor/*`, `@capgo/*`)    | Plugin native cần compile vào `.xcframework`  |
| Sửa `apps/mobile/capacitor.config.json`                   | Đọc khi build native, không đọc lại runtime   |
| Sửa `Info.plist` (permissions, URL schemes)               | Apple yêu cầu review khi permissions thay đổi |
| Sửa `AppDelegate.swift` hoặc code Swift/Kotlin            | Native code, không thể OTA                    |
| Bump `MARKETING_VERSION` trong Xcode (e.g. 5.0.0 → 6.0.0) | Phải ship qua App Store                       |
| Thay đổi entitlements, push cert, signing                 | Build-time configuration                      |
| Sửa `PrivacyInfo.xcprivacy`                               | Privacy manifest được bundle khi build        |
| Thay đổi `assets/` ngoài `www/browser/`                   | Không được pack vào OTA bundle                |

---

## Flow hoạt động (verify từ source code)

```
App cold start
    │
    ▼
app.component.ts → liveUpdate.initialize()
    │
    ├─ notifyAppReady()           ← đánh dấu bundle hiện tại là healthy
    ├─ updater.current()          ← lấy version đang chạy (empty "" nếu chưa OTA)
    │
    ▼
checkForUpdate()
    ├─ Firestore AppUpdates/ios_production  ← fetch manifest
    ├─ manifest.enabled === false?          → skip
    ├─ nativeVersion < minNativeVersion?    → skip (native-too-old)
    ├─ currentVersion >= manifest.version?  → up-to-date
    ├─ isInRollout(deviceId, rollout%)?     → nếu không → skip
    └─ failureCount >= 3?                   → skip (circuit breaker)
    │
    ▼ (status === 'available')
applyUpdate()
    ├─ WiFi check: nếu cellular → DEFER (không download)
    ├─ download(url: R2_URL, version, checksum: sha256)
    ├─ next({ id: bundle.id })    ← STAGE cho lần mở tiếp (KHÔNG reload ngay)
    └─ saveState(version, failureCount: 0)
    │
    ▼
User backgrounds app → kills → reopens
    └─ Bundle mới được load ✅
```

> **Tại sao dùng `next()` thay vì `set()`?**  
> `set()` phá hủy JavaScript context ngay lập tức → app "crash" mid-session.  
> `next()` queue bundle cho lần mở kế tiếp → UX tự nhiên, Apple-friendly.

---

## ⚠️ Điều kiện để update được nhận

1. **WiFi required** — Code check `connectionType !== 'wifi'` → bỏ qua nếu đang
   dùng 4G/5G  
   (file: `live-update.service.ts`, hàm `applyUpdate()`)

2. **Native shell version** — Nếu app trên device quá cũ (< `minNativeVersion`
   trong manifest), OTA bị skip

3. **Rollout percentage** — Manifest có `rolloutPercentage: 100` → tất cả users
   nhận. Có thể set thấp hơn để rollout dần (e.g. 10% = chỉ 10% users nhận)

4. **Circuit breaker** — Sau **3 lần fail** liên tiếp (download lỗi, SHA-256
   mismatch), OTA tự tắt cho đến lần native update kế tiếp

---

## Quy trình deploy OTA

### Bước 1: Build Angular bundle

```bash
cd apps/mobile
npm run build          # production build
# hoặc
npm run build:staging  # staging build
```

Output: `apps/mobile/www/browser/`

### Bước 2: Deploy lên R2 + Firestore

```bash
cd backend

# Production (iOS)
NODE_ENV=production npm run deploy:mobile-bundle:prod -- --platform ios --version 1.0.4

# Staging (iOS)
NODE_ENV=staging npm run deploy:mobile-bundle:staging -- --platform ios --version 1.0.4-beta

# Với flags tùy chọn
NODE_ENV=production npm run deploy:mobile-bundle:prod \
  -- --platform ios \
     --version 1.0.4 \
     --rollout 10 \          # chỉ 10% users (thử nghiệm)
     --min-native 1.0.0 \    # app store version tối thiểu cần thiết
     --notes "Fix login bug"
```

### Bước 3: Verify

```bash
# Kiểm tra file đã có trên R2
curl -I "https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev/app-bundles/production/ios/1.0.4/bundle.zip"
# Expect: HTTP/1.1 200 OK
```

---

## Firestore manifest structure

**Collection:** `AppUpdates`  
**Document ID:** `{platform}_{channel}` (e.g. `ios_production`,
`android_staging`)

```json
{
  "platform": "ios",
  "channel": "production",
  "version": "1.0.4",
  "bundleUrl": "https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev/app-bundles/production/ios/1.0.4/bundle.zip",
  "bundleHash": "sha256_hex_string",
  "bundleSize": 3857368,
  "minNativeVersion": "1.0.0",
  "publishedAt": "2026-04-28T09:19:14.000Z",
  "enabled": true,
  "rolloutPercentage": 100
}
```

**Tắt OTA khẩn cấp (rollback ngay):**

```
Firestore → AppUpdates → ios_production → enabled: false
```

Không cần deploy gì, tất cả users sẽ stop nhận update ngay lập tức.

---

## Cloudflare R2 storage

- **Bucket:** `nxt1-app-bundles-prod`
- **Public URL:** `https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev`
- **Path pattern:** `app-bundles/{channel}/{platform}/{version}/bundle.zip`
- **Cache:** `public, max-age=31536000, immutable` (1 year, content-addressed by
  version)

---

## Rollback procedure

### Rollback về version trước (OTA)

1. Deploy lại version cũ hơn:
   ```bash
   NODE_ENV=production npm run deploy:mobile-bundle:prod -- --platform ios --version 1.0.3
   ```
2. Users sẽ nhận `1.0.3` trong lần mở app tiếp theo

### Emergency disable (tắt OTA ngay)

Vào Firestore Console → `AppUpdates/ios_production` → sửa `enabled: false`

### Reset về native bundle (trường hợp bundle crash)

Plugin tự reset sau 3 lần fail liên tiếp (circuit breaker). Hoặc gọi thủ công:

```typescript
// In-app dev menu
liveUpdateService.resetToNativeBundle();
```

---

## Lưu ý bảo mật & Apple compliance

- **SHA-256 checksum** được verify trước khi apply → không thể tamper bundle
- **Không dùng Capgo cloud** — `autoUpdate: false`, `statsUrl: ""`,
  `updateUrl: ""` trong `capacitor.config.json`
- **Apple App Store Guidelines 4.7** cho phép OTA JS/assets với điều kiện:
  - Không thay đổi mục đích chính của app
  - Không bypass security
  - Không tạo code marketplace
- **NXT1 thỏa mãn tất cả 3 điều kiện** → không cần thông báo Apple
