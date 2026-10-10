# 🗺️ LingoLive — Canlılık Denetimi & Yol Haritası
*(8 Ekim 2026 · çalışan kod, canlı yerel API kontrolleri ve production build bazlı)*

## 0) Bu turda doğrulananlar

| Alan | Durum |
|---|---|
| Turso içerik API'si | ✅ Tarayıcı DB token'ı görmüyor; `/api/turso` allow-list kullanılıyor. Canlı yerel `course`: 4 ünite/24 ders; kelime sorgusu: 200; JWT'siz yazma: 401. |
| Production build | ✅ Build geçti. 5 MB ZEGO SDK artık bundle parse belleğini şişirmeyen, çağrı/oda açılırken yüklenen ayrı vendor asset'i. |
| Ders konuşma alıştırması | ✅ Sahte rastgele puan kaldırıldı. Gerçek mikrofon kaydı → Whisper transkripsiyonu → istemle kelime benzerliği. Bu akustik/telaffuz puanı değildir; UI bunu açıkça söylüyor. Dinleme/örnek sesleri tarayıcı TTS kullanıyor. |
| Auth arayüzü | ✅ Google/Apple düğmeleri simülasyon değil, Supabase OAuth çağrısı yapıyor. Şifre sıfırlama isteği ve yeni şifre ekranı eklendi; callback oturum algılama açıldı. Gerçek kullanıcıyla uçtan uca test henüz yapılmadı. |
| Birebir ses/video arama, kabul/ret/bitirme, altyazı ve transcript raporu | ⚠️ İlgili gerçek servis akışları kodda; son kabul testi iki Supabase hesabı ve iki mikrofon/kamera cihazı gerektiriyor. Bu turda gerçek arama başlatılmadı. |
| Supabase / Groq uçtan uca | ⚠️ Bu turda kayıt/giriş, canlı AI sohbeti veya Whisper'a gerçek ses gönderimi yapılmadı. |
| Ödeme | ❌ Stripe/iyzico/RevenueCat bağlı değil; satın alma ve deneme başlatma gerçek değil. |
| Push / çevrimdışı PWA | ❌ Henüz yok. |
| Arayüz dili | ⏸️ Sonraya bırakıldı. |
| 75.000 kelime üretimi | ⏸️ Script server-only Turso anahtarlarıyla hazır; tam üretim bu turda çalıştırılmadı. |

## 1) Anahtarların doğru yerleşimi

| Değişken | Nerede | Not |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | İstemci/build | Supabase anon key public'tir; RLS zorunludur. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Yalnızca sunucu | **VITE_ öneki yok.** Vercel `/api/turso` ve 75k scripti kullanır. |
| `VITE_TURSO_ENABLED=true` | İstemci/build | İçerik API entegrasyonunu açar. |
| `VITE_TURSO_API_URL` | İstemci/build, isteğe bağlı | Varsayılan `/api/turso`; APK başka hosta gidecekse tam HTTPS URL. |
| `GROQ_API_KEY` | Yalnızca sunucu | Tarayıcı `/api/ai/*` proxy'sini kullanır. |
| `VITE_ZEGO_APP_ID` | İstemci/build | Public App ID. |
| `ZEGO_SERVER_SECRET` | Yalnızca sunucu | `/api/zego-token` Token04 üretir; istemciye kopyalanmaz. |

Deploy adımları ve Vercel env ekranı: `DEPLOY_REHBERI.md`. Eski `VITE_TURSO_DATABASE_URL` / `VITE_TURSO_AUTH_TOKEN` isimlerini hiçbir ortama ekleme.

## 2) Şimdi sıradaki canlı doğrulama

1. Yerel `npm run dev` ile Turso'nun `search_words`, `word_categories`, `daily_words`, `grammar_topics` ve `exam_questions` okuma işlemlerini ayrı ayrı dene; arama SQL'i özellikle kontrol edilsin.
2. `/api/ai/chat` üzerinden tek kısa gerçek Groq çağrısı yap; Whisper için gerçek ses örneğiyle `/api/ai/transcribe` testi ayrıca yapılmalı.
3. Build çıktısında `.env`'deki `TURSO_AUTH_TOKEN`, `GROQ_API_KEY` ve `ZEGO_SERVER_SECRET` değerlerinin bulunmadığını değerleri göstermeden doğrula.
4. Preview'da onboarding/login ekranlarını kontrol et; Supabase OAuth sağlayıcılarını ve redirect URL'lerini dashboard'da etkinleştir.
5. Gerçek auth için yeni test hesabıyla kayıt → e-posta doğrulama → giriş → parola sıfırlama/yeni parola akışını doğrula. Kullanıcı parolasını isteme; kullanıcı testi kendi cihazında yapsın.
6. Birebir arama kabul testi: iki ayrı hesap/cihazla davet → kabul/ret → gerçek ses/video → iki tarafta Whisper altyazısı → transcript'e dayalı rapor → çağrı sonlandırma.

## 3) Çalışmayan ya da gerçek servis bekleyen ürün alanları

### P0 — Gerçeği yansıtan deneyim
- Subscription CTA'ları ödeme sağlayıcısı bağlanana kadar satın alma/deneme başlatıyormuş gibi davranmamalı.
- Placement ve sınav testleri, sohbet seçenekleri, invite/share ve profil avatarı gibi yalnızca toast gösteren etkileşimleri tek tek denetle; gerçek iş yapmayanları ya uygula ya da açıkça devre dışı göster.
- Search kapsamı: konuşma adı, sözlük/kelime sorgusu ve kategori filtrelerinin boş sonuç/servis hatası davranışını test et.
- Günlük istatistiklerin mock fallback'ten gerçek Supabase verisine geçtiğini test hesabıyla kontrol et.

### P1 — Ürüne hazırlık
- İki cihazlı ZEGO ve Call Kit testi, izin/arka plan/bağlantı kopması senaryoları.
- Supabase RLS, kayıt/giriş, reset/OAuth redirect, Storage ve Realtime E2E testi.
- Gerçek push bildirim; ancak Android/iOS izinleri ve backend anahtarları hazır olduktan sonra.
- Üretim dağıtımı, log/monitoring ve yedekleme.

### P2 — Sonraya bırakılanlar
- UI i18n (kullanıcı kararı: dili sonra ekle).
- Ödeme entegrasyonu (Stripe/iyzico/RevenueCat seçimi ve anahtarları gerektirir).
- PWA/çevrimdışı paketler ve 75k kelime üretiminin tamamlanması.

## 4) Yeniden çalıştırılabilir kontroller

```bash
npx tsc --noEmit
NODE_OPTIONS=--max-old-space-size=1024 npm run build
```

75k üretim normal uygulama build'inin parçası değildir; smoke test için:

```bash
SMOKE=1 npx tsx scripts/generate75k.ts
```

Üretim işi küçük, resumable 25–30 dakikalık bloklarda yürütülmeli; her blok sonunda ilerleme raporu alınmalı.