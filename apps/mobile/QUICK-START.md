# 🚀 Quick Start - Tự Động 100%

## Development (Staging) - Dùng Hàng Ngày

```bash
cd apps/mobile

# Chạy trên thiết bị kết nối (dev build)
npm run ios:dev        # iOS development
npm run android:dev    # Android development

# Live reload (hot reload khi code thay đổi)
npm run ios:live       # iOS live reload
npm run android:live   # Android live reload
```

**Tự động:**

- ✅ Dùng staging configs (`com.nxt1.sports`)
- ✅ Connect Firebase `nxt-1-staging`
- ✅ Debug mode ON
- ✅ Không cần manual gì cả!

---

## Testing (Staging) - Test Trước Khi Deploy

```bash
# Build staging để test
npm run ios:staging      # iOS staging build
npm run android:staging  # Android staging build
```

**Tự động:**

- ✅ Dùng staging configs
- ✅ Optimized build (như production)
- ✅ Firebase staging project

---

## Production - Deploy Lên Store

```bash
# Build production
npm run ios:prod      # Mở Xcode để archive
npm run android:prod  # Mở Android Studio để sign
```

**Tự động:**

- ✅ Dùng production configs (`com.nxt1sports.nxt1`)
- ✅ Connect Firebase `nxt-1-de054`
- ✅ Production optimized
- ✅ Ready cho App Store/Play Store

---

## 🎯 Tất Cả Đều Tự Động!

| Command                   | Môi Trường | Tự Động? |
| ------------------------- | ---------- | -------- |
| `npm run dev`             | Web only   | -        |
| `npm run ios:dev`         | Staging    | ✅       |
| `npm run android:dev`     | Staging    | ✅       |
| `npm run ios:live`        | Staging    | ✅       |
| `npm run android:live`    | Staging    | ✅       |
| `npm run ios:staging`     | Staging    | ✅       |
| `npm run android:staging` | Staging    | ✅       |
| `npm run ios:prod`        | Production | ✅       |
| `npm run android:prod`    | Production | ✅       |

**Không cần:**

- ❌ Không cần manually copy Firebase configs
- ❌ Không cần manually switch Capacitor config
- ❌ Không cần nhớ dùng môi trường nào
- ❌ Không cần `npx cap sync` thủ công

**Chỉ cần:**

- ✅ Chạy 1 command duy nhất
- ✅ Mọi thứ tự động đúng môi trường!

---

## 🔍 Kiểm Tra Môi Trường Hiện Tại

```bash
# Check appId
cat capacitor.config.json | grep appId

# Staging:    "appId": "com.nxt1.sports"
# Production: "appId": "com.nxt1sports.nxt1"
```

---

## ⚠️ Lưu Ý

### Live Reload (ios:live / android:live)

- Tự động dùng **staging**
- Hot reload khi save code
- Nhanh nhất cho development
- **Lưu ý:** Device và máy tính phải cùng WiFi

### Dev Builds (ios:dev / android:dev)

- Tự động dùng **staging**
- Build mới mỗi lần chạy
- Debug mode ON
- Chậm hơn live reload nhưng stable hơn

### Staging Builds

- Giống production nhưng dùng staging Firebase
- Dùng để test trước khi deploy production
- Optimized build

### Production Builds

- **Chỉ dùng khi deploy lên store!**
- Firebase production
- Fully optimized
- Bundle IDs production

---

## 🎉 Workflow Mỗi Ngày

```bash
# 1. Code & test với live reload
npm run ios:live

# 2. Test xong → build staging để verify
npm run ios:staging

# 3. OK → build production để submit store
npm run ios:prod
```

**Tất cả tự động, không cần config gì thêm! 🚀**
