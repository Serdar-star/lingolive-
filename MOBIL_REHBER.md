# 📱 LingoLive — Mobil Uygulama (APK) Rehberi

## 0) Mobil proje durumu
`android/` altında native Android projesi mevcut. Önceden paylaşılmış `LingoLive-debug.apk`, bu kaynak kod değişikliklerinden önce üretilmiş eski bir APK'dır; güncel Android API ve onboarding düzeltmelerini içermez. Bu düzeltme sırasında yeni APK üretilmedi.

| | |
|---|---|
| Paket | `app.lingolive.mobile` v1.0 |
| Güncel Capacitor paketleri | `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` 8.5.3 ailesi |
| Gereken Node | Node.js 22.12 veya üstü (Vite 7 + Capacitor CLI 8 gereksinimi) |
| Android SDK | Minimum API 24 (Android 7.0); compile/target API 36 |
| İzinler | İnternet, mikrofon, kamera, ses ayarları, wake-lock |
| API | Android WebView'dan yalnızca HTTPS sunucu uçlarına bağlanır; üretim host'u doğrulanmadan Android bundle oluşturulmaz |

### APK'yı nereden alırsın
1. Arena workspace: `/home/user/apk/LingoLive-debug.apk` (indir butonu)
2. Canlı sunucu: önizlemedeki "APK İndirme Sunucusu" → `LingoLive-debug.apk`
3. Google Drive: "Serdar dil ogrenme uygulamsi" klasörü → `LingoLive-debug.apk`
   https://drive.google.com/file/d/1L0PR8znlo71Ym3gx7JbV9CinBspZAEtt/view

### Telefona kurulum
1. APK'yı telefona indir (Drive uygulamasından direkt olur)
2. Dosyaya dokun → "Bilinmeyen uygulamalara izin ver" → Kur
3. Açılışta mikrofon izni isterse onayla (canlı sesli odalar için)

---

## 1) Android bundle / APK hazırlama

### Gerekenler
- Node.js 22.12 veya üstü (`node -v`) — Vite 7 ve Capacitor CLI 8.5.3 bunu gerektirir
- JDK 21 — https://adoptium.net
- Android Studio Otter (2025.2.1) veya üstü + Android SDK (Platform 36, Build-Tools 36, Platform-Tools)
- Üretimde API uçlarını sunan **doğrulanmış HTTPS domain**. Henüz proje dosyalarından bulunmadığı için tahmin ederek yazma.

### API host'unu ayarlama (APK üretmeden önce)
1. `.env.android.example` dosyasını `.env.android` adıyla kopyala.
2. `.env.android` dosyasını bir metin düzenleyiciyle aç; `VITE_API_BASE_URL` değerini doğrulanmış üretim domain'iyle değiştir (ör. `https://api.senin-domainin.com`). `https://` kısmı zorunlu.
3. İsteğe bağlı servis-özel URL'ler gerekiyorsa aynı dosyada ilgili `VITE_*_URL` değerini ayrı HTTPS URL yap.
4. Sunucu sırlarını Vercel Dashboard ▸ ilgili proje ▸ **Settings ▸ Environment Variables** altında ayarla; `GROQ_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` ve ZEGO secret'ları `VITE_` önekiyle yazma.

`.env.android` git tarafından yok sayılır. Placeholder veya HTTP URL bırakılırsa Android build guard durdurur. Guard, sync sonrası Android Studio/Gradle ile doğrudan APK derlemesini de doğrulanmış HTTPS işaretçisi yoksa engeller.

### Sync ve (gerekiyorsa) APK
```bash
cd lingolive
npm install
npm run sync:android   # önce HTTPS ayarını doğrular, Android web bundle'ını üretir ve Capacitor sync yapar
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Capacitor paketlerini ayrıca `npm i @capacitor/...` ile güncelleme; sürümler package.json/package-lock.json içinde birlikte sabitlenmiştir.

### Android Studio ile
1. Önce `.env.android` dosyasındaki gerçek HTTPS host'u ayarla.
2. Proje kökünde `npm run sync:android` çalıştır.
3. Android Studio ▸ Open ▸ `lingolive/android` klasörünü seç.
4. Build ▸ Build App Bundle(s)/APK(s) ▸ **Build APK(s)**. Guard ayar veya marker eksikse derleme durur.

### Kod değiştikçe
API/config değiştiğinde `npm run sync:android` komutunu tekrar çalıştır; ardından istenirse Android Studio veya Gradle ile APK üret.

---

## 2) Bu sandbox'taki önceki derleme notları
- Önceki çalışma ortamında JDK 21 ve `/home/user/android-sdk` kullanılmıştı; bunlar Android toolchain bulunduğunu gösterir, güncel API ayarlarının doğrulandığını göstermez.
- `android/local.properties` içindeki SDK yolu makineye özeldir.
- Yeni kaynak kod için APK derlemesi yapılmadı. Üretim host'u henüz doğrulanmadığından `npm run sync:android` ve Gradle APK komutlarını çalıştırma.
- `app/build.gradle` içindeki Kotlin stdlib `resolutionStrategy` bloğunu kaldırma; proje bu ayarı önceki Kotlin stdlib çatışmasını çözmek için eklemişti.

---

## 3) İleri seviye
- **Release / Play Store:** keystore oluştur (`keytool -genkeypair ...`), `android/app/build.gradle`'e
  signingConfig ekle, `./gradlew bundleRelease` → `.aab` üret. (İstersen Arena'da beraber kurarız.)
- **iPhone (iOS):** Capacitor aynı projeden iOS da üretir (`npx cap add ios`) ama derlemek için
  **Mac + Xcode** şart. Windows/Linux'tan App Store build'i alınamaz.
- **Özel ikon/splash:** `npm i -D @capacitor/assets` → `assets/` klasörüne 1024px PNG koy →
  `npx capacitor-assets generate --android` → tüm ikon/splash'ler otomatik üretilir.

---

## 4) APK özellikleri ve doğrulama durumu
| Özellik | Durum |
|---|---|
| Onboarding, dersler, flashcards | Kaynak kodda mevcut; yeni Android bundle henüz üretilmedi |
| Supabase auth / istatistikler | Canlı doğrulama için yapılandırılmış HTTPS URL ve gerçek cihaz testi gerekir |
| Groq AI sohbet / transkripsiyon | Server-side anahtar Vercel'de olmalı; Android'de CORS + gerçek servis testi gerekir |
| Zego canlı sesli oda | Token host'u doğrulanmalı; gerçek cihazda WebRTC ve mikrofon testi gerekir |
| Bayrak görselleri / fontlar | Bazı içerikler CDN kullanabilir; çevrimdışı görünüm ayrıca test edilmeli |
