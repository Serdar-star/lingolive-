# 🚀 LingoLive — Deploy Rehberi (Vercel + API Proxy)
*9 Ekim 2026 · Capacitor Android API/CORS yapılandırması güncellendi; bu yeni değişiklikler henüz test/build/live-request ile doğrulanmadı*

## 0) Bu paketle ne geldi
| Dosya | İş |
|---|---|
| `api/ai/chat.ts` | Serverless Groq proxy: key **sadece sunucuda**, IP başına 30 istek/dk + 400/gün limit, model sunucuda sabit (`gpt-oss-20b`, `PROXY_MODEL` env ile değişir), SSE stream pass-through, max_tokens 4096 tavan |
| `api/ai/transcribe.ts` | Whisper proxy: multipart gövdeyi dokunmadan geçirir (bodyParser kapalı) |
| `api/zego-token.ts` | Supabase oturumunu doğrulayıp room-scoped ZEGO Token04 üretir; ServerSecret istemciye gitmez |
| `api/turso.ts` | Allow-list içerik API'si; Turso kimlik bilgisi yalnızca sunucuda, yazma için Supabase JWT gerekir |
| `vercel.json` | Vite build + `dist` output + SPA rewrite |
| `src/lib/groq.ts` | Web'de same-origin, native Android'de doğrulanmış HTTPS proxy rotasını kullanır; ham Groq anahtarı istemciye gönderilmez |

Önceki sürümde doğrulanmıştı (bu değişikliklerden sonra yeniden çalıştırılmadı): GET → 405 · POST → Groq'a iletim · 20b modeliyle `200 PROXY_OK` · rate-limit ve hata pass-through.

---

## 1) Vercel'e deploy (≈10 dk)
1. Projeyi GitHub'a it (repo yoksa: `git init && git add . && git commit && git remote add origin ... && git push`)
   - ⚠️ push'tan önce `.gitignore`'da `.env` olduğundan emin ol (var) ve **Drive'daki zip'i repo'ya koyma**
2. vercel.com ▸ **Add New → Project** ▸ repo'yu import et
3. Framework: Vite (otomatik) · Build: `npm run build` · Output: `dist` → vercel.json zaten doğru
4. **Environment Variables** ekle:
   | Key | Değer | Not |
   |---|---|---|
   | `GROQ_API_KEY` | `gsk_...` | **VITE_ ÖNEKSİZ** = sadece sunucu okur, bundle'a girmez |
   | `VITE_AI_PROXY_URL` | `/api/ai` | client'ı proxy'ye yönlendirir |
   | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | mevcut | build-time gömülür |
   | `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Turso DB URL + auth token | **VITE_ öneksiz, yalnızca Vercel server env** |
   | `VITE_TURSO_ENABLED` | `true` | tarayıcıdaki entegrasyon anahtarı |
   | `VITE_TURSO_API_URL` | boş / `/api/turso` | İsteğe bağlı; APK başka API hostu kullanacaksa tam HTTPS URL |
   | `VITE_ZEGO_APP_ID` | mevcut | public App ID; build-time |
   | `ZEGO_SERVER_SECRET` | 32 karakterlik secret | **VITE_ ÖNEKSİZ**; sadece sunucuda, Token04 üretimi için |
   | `VITE_ZEGO_TOKEN_URL` | `/api/zego-token` | Web'de aynı-origin; Capacitor APK'da canlı API tam URL'si |
   | `ZEGO_CALLBACK_SECRET` | gerekiyorsa mevcut | **VITE_ ÖNEKSİZ**; sunucuda kalmalı |
   | `VITE_GROQ_API_KEY` | **EKLEME** | proxy varken gerek yok; bundle'a girmesin |
   - **ZEGO güvenliği:** yeni akış Token04'ü `/api/zego-token` içinde üretir; `ZEGO_SERVER_SECRET` browser bundle'a girmez. Daha önce bundle'a girmiş AppSign/secret değerini ZEGO Console'dan yenile ve yeni değeri yalnızca `ZEGO_SERVER_SECRET` olarak sunucuya koy.
5. Deploy → `https://lingolive-xxx.vercel.app`
6. **Supabase Dashboard ▸ SQL Editor ▸ New query**: `supabase/patch_direct_call_participants.sql` dosyasını yapıştırıp **Run** et (sohbet katılımcı RLS'i + korumalı `call_sessions` realtime tablosu).
7. **Supabase Dashboard ▸ Authentication ▸ URL Configuration**: Site URL + Redirect URLs'e Vercel domainini ekle (OAuth ve parola yenileme dönüşü için). Authentication ▸ Providers'ta Email'i, kullanacağın Google/Apple OAuth sağlayıcılarını etkinleştir.
8. Doğrulama:
   - DevTools ▸ Network: `/api/turso` içerik isteği ve AI sohbeti `/api/ai/chat` yanıtları başarılı
   - Build bundle'larında `TURSO_AUTH_TOKEN`, `GROQ_API_KEY` veya `ZEGO_SERVER_SECRET` değerleri yok (değerleri ekrana/loga yazdırma)
   - Live odalar HTTPS altında mikrofon/kamera izni ister; iki cihazla gerçek test yap
   - OAuth ve parola sıfırlama redirect'leri Vercel domainine geri döner

## 2) Netlify / başka host
- Vercel önerilir (handler'lar Vercel formatında).
- Netlify istersen: `netlify/functions/ai-chat.mjs` içine ince bir sarmalayıcı yazıp
  aynı mantığı `handler(event, context)`'e bağla (mantık framework-bağımsız, lokal testle kanıtlandı).
- Kendi VPS'in: `express`/`node:http` ile `/api/ai/chat`, `/api/ai/transcribe` ve `/api/zego-token`
  handler'larını bağla + `dist/`'i statik servis et; ZEGO endpoint'inde Supabase access token doğrulamasını koru.

## 3) Android ile birlikte
- Android WebView, APK içine gömülü dosyaların origin'inden `/api/...` çağırırsa API sunucusuna ulaşamaz. `src/lib/apiEndpoint.ts` native uygulamada çağrıları HTTPS origin'e çözer; API handler'ları `OPTIONS` preflight ve CORS başlıklarını da yanıtlar.
- Üretim API domain'i bu repoda/config'te doğrulanmadı; `lingolive-xxx.vercel.app` gibi bir host'u tahmin edip kullanma. Vercel Dashboard ▸ proje ▸ **Settings ▸ Domains** bölümünde doğrulanmış production domain'i gör.
- Domain doğrulandıktan sonra `.env.android.example` dosyasını `.env.android` olarak kopyala ve `VITE_API_BASE_URL=https://<doğrulanmış-domain>` değerini yaz. Bu dosya gitignore'dadır.
- Node.js 22.12+ ile proje kökünde `npm run sync:android` çalıştır. Komut HTTPS ayarını kontrol eder; ardından web bundle üretip Capacitor sync yapar. Android Studio/Gradle, sync sonrasında eklenen config marker'ı doğrular. APK derlemesi ayrı adımdır; bu repoda henüz yapılmadı.
- AI/Turso/ZEGO sırları istemciye değil Vercel Dashboard ▸ **Settings ▸ Environment Variables** içindeki server-side değişkenlere konmalıdır.

## 4) Limit & maliyet özeti
- Proxy: IP başına 30 istek/dk, 400 istek/gün (tek instance belleğinde; serverless ölçeklenirse
  kalıcı store'a taşınabilir — başlangıç için yeterli)
- Model sabit `gpt-oss-20b` (120b org-limitinde takılıyordu; 20b serbest ve hızlı)
- max_tokens tavanı 4096; client ne isterse istesin sunucu bunu uygular
- Groq free-tier penceresi dolarsa proxy 429'u aynen geçirir → client offline tutor'a düşer (graceful)

## 5) Deploy sonrası checklist
- [ ] `/api/ai/chat` POST 200 (curl veya uygulama)
- [ ] Bundle'da `gsk_` yok
- [ ] Supabase redirect URL'leri güncel
- [ ] Register → e-posta doğrulama akışı çalışıyor
- [ ] Turso hydrate toast'ı: "Course synced from Turso"
- [ ] Zego: gerçek cihazda oda testi
- [ ] Analytics/Sentry eklemek istersen: `YOL_HARITASI.md` §A6
