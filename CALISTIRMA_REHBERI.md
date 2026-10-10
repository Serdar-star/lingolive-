# 🌍 LingoLive — A'dan Z'ye Çalıştırma Rehberi

> Bu rehber 8 Ekim 2026'da, projenin gerçek kodu ve **canlı API testleri** baz alınarak güncellendi.
> Son doğrulamalar: Turso API'den 4 ünite/24 ders ve kelime sorgusu 200; oturumsuz yazma 401. Build başarılı.

---

## 0) Mimari harita — hangi parça ne iş yapıyor

| Parça | Servis | Anahtarlar | Ne oluyor |
|---|---|---|---|
| Auth + sosyal (rooms, messages, moments, stats, streaks, badges) | **Supabase** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Üyelik, giriş, 20 tablo, RLS |
| Ders içeriği (units/lessons/exercises/words) | **Turso (libsql)** | Sunucu: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`; istemci: `VITE_TURSO_ENABLED=true` | Tarayıcı `/api/turso` allow-list rotasını çağırır; olmazsa gömülü içerik |
| AI tutor, quiz, **15 dilde egzersiz üretimi**, ses yazma | **Groq** | `GROQ_API_KEY` + `VITE_AI_PROXY_URL=/api/ai` | `openai/gpt-oss-20b` + `whisper-large-v3-turbo` |
| Canlı sesli/görüntülü odalar ve birebir aramalar | **ZegoCloud + Supabase Realtime** | `VITE_ZEGO_APP_ID`, server-only `ZEGO_SERVER_SECRET` | Sunucu token'ı, gerçek davet/kabul, WebRTC ses/video |
| Arayüz | React 19 + Vite 7 + Tailwind 4 + Zustand | — | `npm run dev` |

**İçerik akışı (önemli):**
- `en → tr` kursu: Turso'dan (`hydrateCourse`, `content.ts`). Turso yoksa/blokluysa → `src/data/mock.ts` içindeki gömülü kurs.
- **Diğer tüm dil çiftleri** (ja, ko, es, de...): ders açılınca egzersizler **Groq ile anında üretilir** (`store.ts:266` → `contentGenerator.getExercises`). Yani 15 dilin tamamı AI yoluyla zaten çalışabilir.
- Bayraklar: `hatscripts.github.io/circle-flags` CDN'inden → internet gerekir.

---

## 1) TL;DR — 5 komutla ayağa kaldır

```bash
unzip lingolive-react-native-setup.zip -d lingolive && cd lingolive
npm install
# .env dosyasını doldur (bölüm 2-5)
npm run dev          # http://localhost:5173
# üretim: npm run build  → standart Vite çıktısı (dist/index.html + dist/assets)
```

`.env` değişirse **dev sunucuyu yeniden başlat** (Vite env'i başlangıçta okur).

---

## 2) .env — hangi anahtar nereden alınır

| Değişken | Nereden | Not |
|---|---|---|
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard ▸ Project Settings ▸ API | Projendeki değerler şu an **geçerli (test edildi)** |
| `GROQ_API_KEY` | console.groq.com ▸ API Keys | Sunucu tarafında tutulur; istemci `/api/ai` proxy rotasını kullanır. `VITE_` öneki ekleme. |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Turso Dashboard ▸ database ▸ Connect / token | Yalnızca server env; **`VITE_` öneki kesinlikle kullanma** |
| `VITE_TURSO_ENABLED` | `true` | Tarayıcıda Turso entegrasyonunu açar |
| `VITE_TURSO_API_URL` | İsteğe bağlı; varsayılan `/api/turso` | Capacitor APK'da aynı API için tam HTTPS URL verilebilir |
| `VITE_ZEGO_APP_ID` | Zego Console ▸ Project | Public App ID; istemci build'ında bulunabilir |
| `ZEGO_SERVER_SECRET` | Zego Console ▸ Project ▸ Server Secret | 32 karakter; yalnızca `.env`/server env, **`VITE_` öneki yok** |
| `VITE_ZEGO_TOKEN_URL` | `/api/zego-token` | Web'de aynı-origin. APK'da `https://domainin/api/zego-token` olarak ayarla |

---

## 3) Supabase — tam kurulum

1. Dashboard ▸ **SQL Editor** ▸ New query → `supabase/schema.sql` dosyasının **tamamını** yapıştır ▸ Run.
   (Tablolar: users, rooms, room_members, conversations, messages, moments, notifications,
   user_stats, user_streaks, user_badges, xp_events, lesson_progress, user_vocabulary,
   corrections, matching_queue, daily_missions, ai_chat_history...)
2. Authentication ▸ Providers ▸ **Email** açık olsun. Google/Apple düğmeleri gerçek OAuth başlatır; kullanacağın sağlayıcıyı aynı ekranda etkinleştirip OAuth credentials ekle.
3. Authentication ▸ URL Configuration ▸ Site URL ve Redirect URLs'e web alan adını ekle; parola yenileme ve OAuth dönüşü bu origin'e gelir.
4. Test: uygulamada **Register** ol → Dashboard ▸ Authentication ▸ Users'ta görünmeli;
   `users` tablosuna satır düşmeli (RLS trigger'ları şemada var).
5. Önceki denetimde şema kurulu ve **çalışıyor** görünüyordu — `users`, `user_stats`, `user_streaks` tablolarında
   gerçek satır gördüm (1 kullanıcı). `rooms` boş ama var. `lessons` tablosu Supabase'te **yok ve olmamalı**
   (dersler Turso'da).

---

## 4) Turso — sunucu tarafı güvenli içerik veritabanı

### 4.1 Canlı doğrulama (8 Ekim 2026)
- Tarayıcı artık libSQL'e/DB token'ına doğrudan bağlanmıyor; içerik için aynı-origin `/api/turso` rotasını kullanıyor.
- Allow-list yalnızca tanımlı içerik eylemlerini kabul eder; istemciden SQL çalıştırılamaz. `save_*` yazmaları Supabase oturum JWT'si ister.
- Canlı yerel API testi: `course` → **200, 4 ünite/24 ders**; `words_by_category` → **200, 3 kelime**; JWT'siz `save_words` → **401**. Turso okuma kotası blokajı görülmedi.
- Yerelde Vite middleware'i rotayı sunar; Vercel'de `api/turso.ts` handler kullanılır. Bağlantı sorunu olursa mevcut içerik katmanı yerel yedek içeriğe düşer.

### 4.2 Ortam değişkenleri
- `.env` / hosting env: `TURSO_DATABASE_URL` ve `TURSO_AUTH_TOKEN` (server-only; **`VITE_` öneki ekleme**).
- İstemci: `VITE_TURSO_ENABLED=true`; varsayılan endpoint `/api/turso`.
- İsteğe bağlı `VITE_TURSO_API_URL`, özellikle APK başka bir API alan adına gidecekse tam HTTPS adresi alabilir.
- Deploy'da anahtarların tanımlanması için `DEPLOY_REHBERI.md` §1'e bak.

### 4.3 75.000 kelime / 15 dil üretim scripti
```bash
SMOKE=1 npx tsx scripts/generate75k.ts   # önce küçük bir deneme
npx tsx scripts/generate75k.ts           # tam üretim; kesilirse kaldığı yerden devam eder
```
- Script server-only `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` ve `GROQ_API_KEY` okur; VITE önekli Turso anahtarı kullanmaz.
- Üretim uzun sürdüğü için küçük/resumable bloklarla yürüt; tam 75k üretim bu canlı API smoke testinin kapsamına dahil değil.
- Kelime sorgularında limit uygulanır; tüm kurs hydrate işlemi açılışta bir kez yapılır.

---

## 5) Groq — AI motoru

- Key geçerli, model erişimi açık (test: `GET /v1/models` 200, chat completion 200).
- Kullanılan modeller: `openai/gpt-oss-120b` (sohbet/quiz/üretim), `whisper-large-v3-turbo` (ses→metin).
- `gpt-oss-120b` bir **reasoning** modeli: çok düşük `max_tokens` verirsen cevap boş dönebilir
  (token'lar "düşünmeye" gider). Kod 300-512 veriyor → pratikte sorun yok.
- Ücretsiz tier rate-limit'leri var (dk başına istek); AI tutor hızlı üst üste istek atarsa
  429 görebilirsin → kısa bekleme yeter.
- **Güvenlik:** `GROQ_API_KEY` yalnızca sunucu tarafında kalır. Tarayıcı, yerelde Vite
  middleware'i; production'da `/api/ai/*` serverless rotalarını kullanır. `VITE_GROQ_API_KEY`
  kullanma; o önek anahtarı browser bundle'ına gömer.

---

## 6) ZEGO — gerçek birebir arama, altyazı ve rapor

### 6.1 Token güvenliği
- Browser'a yalnızca `VITE_ZEGO_APP_ID` gider. `ZEGO_SERVER_SECRET` sadece sunucuda kalır.
- Web/local development token'ı `/api/zego-token` verir; sunucu önce Supabase access token'ını doğrular,
  sonra sadece istenen ZEGO odası için 1 saatlik Token04 oluşturur.
- Capacitor APK için build öncesi `VITE_ZEGO_TOKEN_URL=https://senin-domainin/api/zego-token` olmalı.
  Aksi halde APK içindeki `/api/zego-token` yerel WebView'e gider ve çalışmaz.

### 6.2 Birebir arama
- Chat içindeki telefon ve video düğmeleri gerçek Supabase sohbet katılımcısına arama daveti yollar.
  Karşı taraf uygulamayı açık ve internete bağlı tutmalı; gelen aramayı kabul etmelidir.
- Kabul edilince iki kullanıcı aynı, rastgele ZEGO odasına girer. Sesli aramada kamera kapalıdır;
  video aramasında kamera+mikrofon kullanılır. Demo sohbetler ve oturumsuz kullanıcılar arama yapamaz.
- Arama daveti/durumları açık broadcast yerine `call_sessions` tablosunda tutulur; RLS yalnızca iki sohbet üyesine okuma ve rolüne uygun durum güncelleme verir. ZEGO token endpoint'i de `callId` + aktif oturum/katılımcı eşleşmesini sunucuda doğrular.
- Mevcut Supabase kurulumunda bir defa: Dashboard ▸ **SQL Editor** ▸ **New query** ▸ `supabase/patch_direct_call_participants.sql` içeriğini yapıştır ▸ **Run**. Bu yama partner ID erişim politikasını, `call_sessions` tablosunu/RLS'ini ve `supabase_realtime` publication kaydını ekler.
- Karşı taraf bildirimi alabilmek için uygulaması/sekmesi açık ve internet bağlantısı olmalı; kapalı uygulamaya push araması bu akışta yok.

### 6.3 Canlı Whisper altyazısı + AI raporu
- Görüşmeye girerken açık onay gerekir: **Altyazıyla katıl** veya **Altyazısız katıl**.
- Altyazı açıkken mikrofondan 5 saniyelik ses parçaları `/api/ai/transcribe` üzerinden Whisper'a gider;
  tanınan metin Supabase Realtime ile diğer katılımcıya aktarılır. Ham ses ve transkript Supabase tablolarına yazılmaz.
- Arama sonu raporu sadece kendi gerçek transkriptinden üretilir: algılanan kelimeler, net alıntılar,
  olası düzeltmeler ve alıştırma önerisi. Transkript yoksa puan/istatistik uydurulmaz; rapor gösterilmez.
  Metinden telaffuz puanı hesaplanmaz. Whisper yanlış duyabilir; düzeltmeler öneridir.

### 6.4 Canlı test (iki gerçek hesap gerekir)
1. Supabase SQL yamasını uygula, Vercel/local ortamda `ZEGO_SERVER_SECRET` tanımla, web için `VITE_ZEGO_TOKEN_URL=/api/zego-token` kullan.
2. İki farklı cihaz/tarayıcıda iki ayrı Supabase hesabıyla giriş yap; birinde mevcut gerçek sohbeti açıp arama başlat.
3. İkinci cihazda gelen aramayı kabul et; her iki cihazda da mikrofon/kamera izinlerini ver.
4. Altyazıyla katıl seçeneğini iki tarafta da seçip konuş; 5 saniyelik Whisper segmentleri ve partner altyazısı görünmeli.
5. Taraflardan biri kapatsın; diğer cihaz da çağrıdan düşmeli ve raporda yalnızca o kullanıcının algılanan metni yer almalı.

Önizleme iframe'inde WebRTC/mikrofon engellenebilir; son doğrulama HTTPS web alanında veya gerçek Android cihazda yapılmalı.

---

## 7) "Tüm diller" checklist'i (15 dil)

1. Onboarding'de native + target seç (veya Profile ▸ dil çifti). `store/language.ts` 15 dili tutar,
   localStorage'a yazar (`lingolive-lang-pair`).
2. `en→tr` dışındaki çiftlerde ders egzersizleri Groq'dan üretilebilir; gerçek model/anahtar ve kota gerekir.
3. Flashcard/kelime havuzu (`getWordsByCategory`) Turso'dan gelir; API/DB erişilemiyorsa gömülü/mock yedek kullanılır.
4. AI tutor sistem prompt'u seçili çifte göre kurulur (`ai/engine.ts`) → sohbet her dilde çift dilli akar.
5. Bayrak görselleri CDN'den → çevrimdışıysa `Globe` ikonu fallback olur (çökmez).

---

## 8) Uçtan uca test listesi (sırayla tikle)

1. `npm run dev` → splash ve onboarding açılıyor mu
2. Onboarding'de dil/hedef/hedefler/seviye/günlük süre seçimi kaydoluyor mu
3. `/api/turso` `course` ve `search_words` sorguları 200 dönüyor mu; oturumsuz `save_*` 401 mi
4. Register → e-posta onayı → login; çıkış yapınca tekrar login ekranına dönüyor mu
5. Forgot password → e-posta reset linki → yeni şifre ekranı → yeni şifreyle giriş
6. Google/Apple OAuth (yalnız Supabase sağlayıcısı ve Redirect URL ayarlıysa) gerçek provider'a gidip geri dönüyor mu
7. Learn ▸ kelime/çoktan seçmeli/sesli alıştırma; sesli alıştırma gerçek mikrofon + Whisper kullanıyor mu
8. Listening ▸ TTS sesi ve hız düğmeleri çalışıyor mu; AI tutor'daki kelime ses düğmesi gerçekten okuyor mu
9. AI tutor ▸ canlı Groq yanıtı; Chat search ve kelime kategorisi araması
10. İki gerçek kullanıcıyla gelen arama: kabul/ret/bitir, ses/video, iki tarafta transcript ve rapor
11. Profile ▸ Stats/Achievements/Streak gerçek kullanıcı verisiyle değişiyor mu
12. `npm run build` → `dist/assets` + `dist/vendor/zego-uikit-prebuilt.js`; bundle'da server secret değerleri yok mu

---

## 9) Sorun giderme tablosu

| Belirti | Sebep | Çözüm |
|---|---|---|
| `/api/turso` 503 | Sunucu ortamında DB URL/token eksik | `TURSO_DATABASE_URL` ve `TURSO_AUTH_TOKEN` değerlerini Vercel Function env'ine ekle; `VITE_` öneki verme |
| `/api/turso` 401 (`save_*`) | Oturum yok ya da JWT gönderilmedi | Önce giriş yap; salt okunur içerik sorguları bu yazma kuralına tabi değil |
| Turso okuması 502 / kota hatası | DB bağlantısı, şema veya kota sorunu | Turso Dashboard'da DB durumunu kontrol et; uygulama yerel yedek içeriği kullanır |
| `PGRST205 ... did you mean` | Supabase şeması uygulanmamış | `supabase/schema.sql`'i SQL Editor'da çalıştır |
| Groq 401 | key hatalı/rotate olmuş | console.groq.com ▸ yeni key |
| Groq 429 | rate limit | 30-60 sn bekle |
| Zego "token invalid" | appId/sign uyumsuz veya prod token bekleniyor | Console'dan doğru ikiliyi al; dev modda test token'ı kullan |
| Bayraklar görünmüyor | CDN/internet yok | `Flag` zaten Globe'a düşer; internet aç |
| Önizlemede beyaz/bozuk stil | eski CSS cache | **Ctrl+Shift+R** (sert yenile) |
| `.env` değişti ama etki yok | Vite env'i başlangıçta okur | dev sunucuyu restart et |
| Kamera/mikron açılmıyor | iframe/izin | kendi tarayıcında, https altında dene |

---

## 10) Güvenlik checklist'i (kısa ama önemli)

- [ ] `.env`'i zip'ten çıkar, sadece `.env.example` paylaş
- [ ] Bu zip'i birine gönderdiysen: Groq + Supabase + Turso token'larını **rotate** et
- [ ] `GROQ_API_KEY`, `TURSO_AUTH_TOKEN`, `ZEGO_SERVER_SECRET` VITE_ öneki almamalı ve client build'ında olmamalı
- [ ] ZEGO Token04 yalnızca `/api/zego-token` sunucusunda üretilmeli
- [ ] Supabase RLS politikalarını şemadan geldiği gibi bırak (public tablo yapma)

---

## Özet durum (8 Ekim 2026 testi)

| Servis | Durum |
|---|---|
| Supabase | Auth / veri akışlarının canlı E2E doğrulaması bu build testine dahil değil |
| Groq | API proxy tanımlı; bu turda canlı AI isteği çalıştırılmadı |
| Zego | Server-token akışı kodda; iki cihazla gerçek medya testi bekliyor |
| Turso | ✅ `/api/turso` canlı yerel okuma geçti (4 ünite/24 ders, kelime sorgusu); JWT'siz yazma 401 |
| Build | ✅ `NODE_OPTIONS=--max-old-space-size=1024 npm run build`; ZEGO SDK ayrı lazy-loaded asset |
| 15 dil | AI üretimi için Groq anahtarı/kotası gerekir; Turso içerik eşleşmeleri ayrıca doğrulanmalı |
