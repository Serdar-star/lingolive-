# LingoLive — Uygulama Denetim Raporu

**Tarih:** 9 Ekim 2026  
**Genel karar:** **Yayına hazır değil.** Açılış hatası düzeltildi ve build geçiyor; ancak Supabase gizlilik/yetki açıkları ile Android/Vercel uçtan uca doğrulaması hâlâ yayını engelliyor.

## Yönetici özeti

- **Düzeltildi — uygulama açılışını engelleyen JSX:** `src/views/Home.tsx:399` satırındaki kapanış eklendi. Takip çalışmasında `npx tsc --noEmit` ve `npm run build` başarılı tamamlandı; Vite önizlemesi de başladı.
- **Kurs içeriği tamamlandı:** Canlı Turso `en-tr` kursundaki 21 boş derse Turkish-pivot eşleşmelerinden 5’er gerçek alıştırma eklendi. Kurs artık 24/24 dolu ders ve toplam 126 alıştırma içeriyor.
- **Dil çifti desteği eklendi:** 15 desteklenen dil arasındaki farklı hedef/native çiftleri için Turso’dan ortak Turkish pivot ile kelime eşleştirip 24 derslik içerik üretme yolu eklendi. Canlı API duman kontrolü `en-tr`, `es-en`, `ja-fr`, `sv-de` çiftlerinde başarılı oldu.
- **P0 — E-posta gizliliği canlı ortamda doğrulandı:** Supabase’e oturum açmadan yaptığım, hiç satır içeriği indirmeyen kontrollerde `public.users` için görünür kayıt bulundu; `email` sütununu seçen `limit=0` isteği de kabul edildi. Hiçbir e-posta adresi okunmadı. Mevcut `schema.sql` herkese açık SELECT politikasıyla birlikte değerlendirildiğinde e-posta verisinin anonim ziyaretçilere açık olması kuvvetle doğrulanıyor.
- **P0/P1 — Sohbet ve canlı oda yetkilendirmesi ciddi risk taşıyor:** Mesaj RLS ifadeleri dış tablonun `conversation_id` alanını açıkça nitelemiyor; üye ekleme politikası kişinin kendisini istediği konuşmaya eklemesine izin veriyor gibi görünüyor. `room_members` politikası üyenin kendi `role` alanını değiştirmesini engellemiyor; token API’si bu role göre yayın izni veriyor. Bunlar SQL ve API kodunun statik incelemesindeki bulgular; gerçek kullanıcı hesaplarıyla istismar testi yapılmadı.
- **İlk denetimde görülen öğrenme içeriği eksiği (bu takipte giderildi):** İlk sorguda 75.000 kelime (**15 dil × 5.000**) ve `en-tr` kursunda 21 boş ders bulundu. Bu takipte o derslere 105 alıştırma eklendi; artık Groq üretimine bağımlı değiller.
- **Android APK yolu mevcut ayarla tamamlanmamış:** Capacitor yalnızca yerel `dist` dosyalarını açıyor; gerçek `.env` içinde AI/Turso/ZEGO API adresleri göreli veya tanımsız. APK’de `/api/...` çağrıları Vercel’e kendiliğinden gitmez. Uzak adrese çevirmek de tek başına yeterli değil; ZEGO uç noktası CORS açarken AI ve Turso uç noktalarında bu başlıklar yok.
- **Canlı olarak doğrulananlar:** Supabase Auth sağlık uç noktası `200`; Turso erişimi çalışıyor ve kelime/kurs tabloları okunabiliyor. Bunlar kayıt olma, sohbet, ödeme, AI, çağrı veya APK akışlarının uçtan uca çalıştığını kanıtlamaz.
- `npx tsc --noEmit` ve `npm run build` başarılı. `npm audit` **5 güvenlik uyarısı** veriyor (4 yüksek, 1 düşük). Ayrı bir uygulama testi script’i yok; Android/Gradle build, APK ve cihaz testi yapılmadı. Groq’a canlı istek gönderilmedi.

---

## Denetimin sınırları ve yöntem

React/Vite arayüzü ve store’lar, Supabase/Turso/Groq/ZEGO entegrasyon kodu, API handler’ları, RLS SQL’i ve Android/Capacitor yapılandırması statik incelendi. Güvenli, yalnızca-okuma amaçlı canlı kontroller yapıldı:

1. Supabase Auth sağlık uç noktası kontrol edildi: **HTTP 200**.
2. Supabase REST şema/izin kontrolünde kullanıcı, istatistik, sohbet, oda ve kelime tabloları sorgulanabilir durumda; `call_sessions` anonim isteğe **401** verdi. Kullanıcı, istatistik ve oda üyeliği tablolarında anonim rolden görünür kayıt olup olmadığı yalnızca HEAD/sayım başlığıyla kontrol edildi; kişisel satır içerikleri alınmadı.
3. `users?select=email&limit=0` isteği **200** döndü; `limit=0` nedeniyle e-posta değeri indirilmedi.
4. İlk incelemede Turso’ya doğrudan salt-okunur sorgular yapıldı; takipte boş `en-tr` derslerine insert-only alıştırma yazımı yapıldı ve canlı DB’den sayım doğrulandı. API proxy’sinin Vercel’deki canlı dağıtımı ayrıca çağrılmadı.
5. Bu takip çalışmasında `npx tsc --noEmit` ve `npm run build` çalıştırıldı; ikisi de başarılı. Canlı Vite API proxy’sinde dört dil çifti için `course_pair_words` sorgusu ve `en-tr` kurs/alıştırma sayımı yapıldı. Önizleme sunucusu kullanıcıya açık kaldı.

**Takip çalışmasında kod değiştirildi ve Turso’ya yalnızca eksik `en-tr` alıştırmaları eklendi.** Supabase RLS/gizlilik politikaları, ödeme, APK ve güvenlik bulguları değiştirilmedi. Secret değerleri rapora yazılmadı.

## 1. Açılış hatası — giderildi

`src/views/Home.tsx:399` satırındaki koşullu JSX ifadesine `</span>}` kapanışı eklendi. Takip sonrası `npx tsc --noEmit` hatasız, `npm run build` başarılı ve Vite geliştirme önizlemesi 5173 portunda çalışıyor. Bu, gerçek kullanıcı hesabıyla Supabase akışlarının uçtan uca doğrulandığı anlamına gelmez.

## 2. Güvenlik ve gizlilik — öncelik sırası yüksek

### 2.1 Anonim e-posta erişimi — canlı erişim yolu doğrulandı

- `supabase/schema.sql:7–34` tablosu `public.users` içinde `email` sütunu tutuyor.
- `supabase/schema.sql:265–267` politikası `users` için `SELECT USING (true)` tanımlıyor.
- Canlı Supabase’te anonim rolden kullanıcı satırı görünürlüğü HEAD/sayım başlığıyla doğrulandı; e-posta sütununu seçen, sıfır satır döndürmesi istenen REST sorgusu da kabul edildi.
- **Hiçbir e-posta adresi alınmadı.** Buna rağmen erişim politikası ve sütun izni nedeniyle bu tabloyu bu haliyle herkese açık kabul etmek gerekir.
- Ayarlar’da profil görünürlüğü kontrolleri “henüz uygulanmadı” olarak görünüyor; mevcut herkese açık veri davranışıyla çelişiyor.

**Öneri:** E-posta adresini herkese açık profil tablosundan ayırın ya da keşif için e-posta içermeyen dar bir view kullanın; yalnızca gerekli profil alanlarına SELECT izni verin. Kullanıcı/stats/oda üyelik tablolarındaki herkese açık alanları da ürün ihtiyacına göre azaltın.

### 2.2 Konuşmalar arası mesaj erişimi — kritik statik RLS riski

`supabase/schema.sql:402–406` mesaj okuma ve gönderme politikalarında şu biçimde bir karşılaştırma bulunuyor:

```sql
p.conversation_id = conversation_id
```

İç sorguda `conversation_id` adının `p` tablosundaki sütuna bağlanması muhtemel; o durumda ifade `p.conversation_id = p.conversation_id` olur ve dıştaki mesajın konuşma kimliğine bağ kurulmaz. Bir oturum kullanıcısının herhangi bir katılımcı kaydı varsa, politika mesaj satırlarını konuşmalar arasında ayırmayabilir.

Bunu gerçek iki hesapla denemedim. **Anonim REST kontrolleri bu kimliği doğrulanmış kullanıcı açığını ne kanıtlar ne de çürütür.** Politikanın dış satırı açıkça nitelemesi gerekir (ör. `messages.conversation_id`).

### 2.3 İstediği konuşmaya kendini ekleyebilme

`conversation_participants` INSERT politikası (`schema.sql:336`) yalnızca `user_id = auth.uid()` kontrol ediyor. Hedef `conversation_id` için yetki/konuşma sahibi koşulu görünmüyor. `conversations` INSERT politikası da (`:308`) `WITH CHECK (true)`. Konuşma kimliğini bilen doğrulanmış bir kullanıcı, başka bir konuşmaya kendisini ekleyebilir gibi görünüyor. Bu bulgu da statiktir; gerçek hesapla yazma testi yapılmadı.

**Öneri:** Katılımcı eklemeyi yalnızca konuşmayı oluşturan/katılımcı olan tarafa veya kontrollü bir sunucu RPC’sine bağlayın; iki hesaplı negatif test ekleyin.

### 2.4 Canlı odada HOST/SPEAKER rolünü yükseltme

- `room_members` için `schema.sql:418` politikası kullanıcının kendi satırında tüm işlemlere izin veriyor; izin verilen `role` değerleri de `HOST`, `SPEAKER`, `LISTENER`.
- `api/shared/zegoToken.ts:155–163` oda üyeliğini ve DB’deki rolü kontrol edip `HOST`/`SPEAKER` rolüne yayın yetkisi veriyor.
- Bu iki parça birlikte, bir üyenin kendi rolünü `HOST` yapıp yayın token’ı alabilmesi riskini doğuruyor. Oda sahibi politikası tek başına bunu engellemiyor.
- Canlı anon kontrolde `room_members` satırlarının görünür olduğu doğrulandı; **rol yükseltme ise doğrulanmış hesap gerektirdiğinden canlı istismar testi yapılmadı.**

**Öneri:** Rol değişimini yalnızca oda sahibi/sunucu tarafı RPC’si yapmalı. Üye istemcisi kendi rolünü seçememeli. Token API’si yalnızca DB’de güvenilir biçimde atanmış rolü kabul etmeli.

### 2.5 Güvenilir istatistik ve rozet alanları istemci tarafından değiştirilebilir

`users` sahibi için geniş UPDATE (`schema.sql:269`) `subscription_tier`, `xp`, `is_verified`, `trust_score` gibi alanları sütun düzeyinde sınırlamıyor. `user_stats` sahibi için `FOR ALL` (`:275`) XP ve sayaçları da kapsıyor. `user_badges` için yalnızca `user_id = auth.uid()` kontrolüyle INSERT var (`:293`); rozet koşulu sunucuda doğrulanmıyor. Bu, skor/rozet/plan bilgisinin doğrudan REST çağrısıyla değiştirilebilmesi riskidir. Canlı hesapla yazma denemesi yapılmadı.

**Öneri:** Güvenilir alanları sütun izinleriyle kapatın ve yalnızca sunucu tarafı fonksiyonlarından güncelleyin; XP/ödül yazımını atomik ve yinelenmeye karşı korumalı yapın.

### 2.6 Paylaşılan Turso içeriği ve Groq uç noktaları

- `api/shared/tursoApi.ts` `save_words`, `save_exercises`, `save_grammar_topic`, `save_daily_words`, `save_exam_questions` işlemlerinde Supabase JWT istiyor; fakat yönetici rolü aramıyor. Yazımlar `INSERT OR IGNORE` olduğu için mevcut satırları normal yoldan değiştirmiyor, ancak herhangi bir doğrulanmış kullanıcı ortak içerik tablosuna yeni satırlar ekleyip içerik kirliliği/önceden ID kapma riski yaratabilir. Bu endpoint için uygulama düzeyinde hız sınırı görünmüyor.
- `api/ai/chat.ts` IP başına bellekte hız sınırı uygular; fakat kullanıcı oturumu zorunlu değil, gövde boyutu sınırı yok ve sunucusuz örneklerde sayaç süreç/instance başına kalabilir.
- `api/ai/transcribe.ts` gelen ses gövdesini bellekte tamponluyor; görünür uygulama düzeyinde dosya boyutu veya hız sınırı yok. Bu, dışarıdan Groq kotası/tüketimi suistimali riskidir.
- Secret’ların (Groq/Turso/ZEGO server secret) `VITE_*` değişkenlerinde tutulmadığı yapılandırma niyeti doğru. Yerel ortamda gerekli anahtar adları mevcut; **anahtarların Groq/ZEGO servisinde geçerli olup olmadığı bu denetimde çağrılarak doğrulanmadı.** Groq’a özellikle istek göndermedim.

## 3. İşlevsel akışların durumu

| Alan | Durum | Bulgu |
|---|---|---|
| Onboarding ve giriş | 🟡 Kod yolu var; uçtan uca denenmedi | 7 adımlı dil/hedef/seviye/hedef akışı, e-posta/şifre, şifre sıfırlama ve Google/Apple OAuth kodu var. Supabase Auth sağlık uç noktası 200; hesap oluşturma/giriş, e-posta doğrulama ve OAuth sağlayıcı ayarları test edilmedi. Ana akışta misafir hesabı yok. |
| Ana ekran | ✅ Derleniyor ve önizleme açılıyor; canlı hesap akışı ayrıca denenmeli | `Home.tsx:399` JSX hatası düzeltildi; typecheck/build geçti ve Vite önizlemesi çalışıyor. Karşılama ekranındaki “2.847 kişi şu an konuşuyor” metni hâlâ sabit; canlı sayım olduğuna dair kod yolu yok. Gerçek hesapla Supabase akışı bu turda uçtan uca denenmedi. |
| Öğrenme yolu | ✅ İçerik ve pair-aware fallback eklendi; hesapla uçtan uca akış ayrıca doğrulanmalı | `en-tr` Turso kursu 4 ünite/24 ders; artık 24 dersin her birinde en az 5 alıştırma var. Daha önce boş olan 21 derse 105 Turkish-pivot tabanlı alıştırma kalıcı olarak eklendi. Diğer farklı dil çiftlerinde API’den eşleşen kelimelerle 24 derslik yol kuruluyor; 15 dil arasındaki 210 farklı eşleşmenin pivot kapsamı salt-okunur sorguda doğrulanmıştı. Canlı proxy duman kontrolü dört çifti başarıyla döndürdü. Groq kullanılmıyor. |
| Kelime hazinesi | ✅ Veri tabanı doğrulandı; uygulama ekranı denenmedi | Canlı Turso sorgusu 75.000 satırı ve 15 dilin her birinde 5.000 kaydı doğruladı: `ar, de, en, es, fr, hi, it, ja, ko, nl, pt, ru, sv, tr, zh`. Bu, UI’de arama/filtre/SRS’nin uçtan uca çalıştığını tek başına kanıtlamaz. |
| Flashcard/SRS | 🟡 Kalıcılık kodu var; istatistikler tutarsız olabilir | Kart derecelendirmesi `user_vocabulary` ve sonraki tekrar zamanını kaydediyor. Fakat `learnWords()` fonksiyonunun çağrı noktası görünmüyor; ders bitişi de DB’de `words_learned`/`today_words` değerini güncellemiyor. Bu yüzden “öğrenilen kelime” sayaçları kart/dersten sonra yanlış kalabilir. Canlı kullanıcı kaydı yapılmadı. |
| Dilbilgisi / sınav / iş kelimeleri | 🟡 Veri tabanı seyrek; üretim gerekebilir | Canlı Turso’da 3 dilbilgisi konusu ve toplam 7 sınav sorusu var. Bazı ekranlar boş setlerde Groq üretmeyi deniyor. Sınav pratiği kodu `en-tr` çiftini sabit kullanıyor; resmi sınav puanı vermediği doğru biçimde belirtilmiş. Bu ekranlar ve üretim uç noktası canlı denenmedi. |
| Konuşma pratiği | 🟡 Transkripsiyon var; telaffuz değerlendirmesi yok | Tarayıcı mikrofonundan `MediaRecorder` ile ses alıp Whisper’a gönderiyor ve çıkan metni beklenen cevapla karşılaştırıyor. Ekran bunun aksan/telaffuz puanı olmadığını açıkça belirtiyor. Cihaz mikrofonu ve gerçek ses uçtan uca denenmedi. |
| AI öğretmen | 🟡 Proxy/fallback kodu var; Groq doğrulanmadı | Groq anahtarı yerel ortamda mevcut, fakat bu denetimde Groq çağrısı yapılmadı; önceki 75K üretim sürecinde kota sınırına ulaşılmıştı. `isGroqConfigured()` yalnızca proxy adresinin boş olmamasına bakıyor; varsayılan `/api/ai` adresi gerçek API anahtarının çalıştığını kanıtlamıyor. Hata olunca yerel kural tabanlı motora düşüyor. |
| AI sohbet geçmişi | ❌ Geçmiş geri yükleme tamamlanmamış | Kullanıcı mesajları ve başarılı Groq cevapları kaydedilebiliyor; `aiChatService.getHistory()` tanımlı ama uygulama içinde çağrılmıyor. Yeniden açınca geçmiş Supabase’ten yüklenmiyor. Tutor bağlamında günlük kelime sayısı **sabit 23** (`backend.ts:359`); “gerçek sayılar, uydurma” talimatıyla çelişiyor. Beceri puanları da doğrulanmış sınavdan gelmiyor. |
| Sohbet / Moments / düzeltmeler | 🟡 Supabase kod yolu var; canlı hesap gerek | Konuşmaları yükleme, mesaj gönderme, Realtime/polling, Moments yorumları ve düzeltmeler için kod var; iki gerçek kullanıcıyla denenmedi. RLS riskleri nedeniyle güvenlik düzeltmesi/kanıt testi yapılmadan hassas mesajları açığa çıkarmaya uygun değil. Sesli mesaj ve medya da gerçek cihazda test edilmedi. |
| Birebir çağrı / canlı odalar | 🟡 Sinyal ve token kodu var; gerçek servis doğrulanmadı | Arama sinyali Supabase Realtime ve 2,5 saniyelik REST polling fallback kullanıyor. ZEGO token API’si Supabase oturumunu, kabul edilmiş çağrıyı/oda üyeliğini ve rolü kontrol ediyor. Bu akışlar iki hesap ve cihazla çalıştırılmadı; oda rolü RLS riski giderilmeden canlı yayın için güvenli sayılmaz. |
| Bildirimler | 🟡 Uygulama içi var; push yok | Bildirim ekranı Supabase’ten okuma, Realtime ve 10 saniyelik polling yapıyor. Ayarlar push/zamanlanmış bildirimlerin yapılandırılmadığını söylüyor. Firebase yapılandırma dosyası Android’de yok; push test edilmedi. |
| Profil / ayarlar / dışa aktarma | 🟡 Bazı akışlar var; diğerleri açıkça kapalı | Profil güncelleme, tercihleri cihazda saklama ve JSON veri dışa aktarma için kod var; gerçek hesapla denenmedi. Dosya dışa aktarımı medya baytlarını içermiyor (arayüz bunu belirtiyor). |
| Ödeme / hesap güvenliği / yasal | ❌ Kullanılamıyor | Abonelik sayfası ödeme, trial, plan değiştirme ve entitlement kontrolünün bağlı olmadığını söylüyor. 2FA, engelleme, profil/görünürlük gizlilik kontrolleri, push, hatırlatıcı, hesap silme, destek merkezi ve Terms/Privacy URL’si yapılandırılmamış. |

### Öğrenme verisinin canlı sayımı

Turso’ya doğrudan salt-okunur sorguyla alınan sonuç:

- Kelimeler: **75.000** toplam; 15 dil × 5.000.
- Kurs: **1** (`en-tr`), **4** ünite, **24** ders.
- Alıştırma: **126** toplam; 24 dersin hepsinde en az 5 var. Daha önce boş olan 21 derse 5’er alıştırma eklendi; mevcut dolu derslerde 8, 8 ve 5 alıştırma korundu.
- Dilbilgisi konuları: **3**.
- Sınav soruları: **7**.
- `daily_word_sets`: **0** (ana flashcard yolu kelimeleri doğrudan kelime bankasından da çekebiliyor; bu tablo sayısı tek başına kart akışının bozuk olduğu anlamına gelmez).

## 4. Android ve dağıtım

- `capacitor.config.ts` yalnızca `webDir: 'dist'` tanımlıyor; uzak `server.url` yok. Bu, paketin API sunucusunu da içerdiği anlamına gelmez.
- Yerel `.env` değerlendirmesinde AI proxy URL’si göreli; `VITE_TURSO_API_URL` ve `VITE_ZEGO_TOKEN_URL` tanımlı değil. Kod varsayılan olarak `/api/...` kullanıyor. Web’de aynı origin/Vercel düzeninde mantıklı olan bu adresler, APK içindeki yerel WebView origin’inde kendi kendine Vercel’e yönlenmez.
- `.env.example` Android için uzak HTTPS adresi verilmesini söylüyor; fakat `api/zego-token.ts` CORS/OPTIONS işlerken `api/ai/*` ve `api/turso.ts` bunu yapmıyor. Uzak origin’e geçirmek için AI/Turso handler’larında da kontrollü CORS ve preflight yanıtı gerekir.
- `@capacitor/cli` major 7; `@capacitor/core` ve `@capacitor/android` major 8. Bu bir uyumluluk/build riski; Gradle build yapılmadığı için kesin hata olduğu söylenemez.
- Kamera, mikrofon ve internet izinleri manifestte mevcut. OAuth için uygulama deep-link intent filtresi görünmüyor; Supabase OAuth/şifre sıfırlama dönüşünün Android’e geri geldiği doğrulanmadı.
- **APK, Gradle sync/build, gerçek Android cihaz, kamera/mikrofon, çağrı veya deep-link testi yapılmadı.**

## 5. Bağımlılık denetimi

`npm ci` başarılı (214 paket kuruldu). Yerel `npm audit` sonucu: **5 uyarı: 4 high, 1 low, 0 critical**.

- Doğrudan `vite@7.3.2`: `7.3.4` ve altındaki sürümler için iki yüksek uyarı; `7.3.7` düzeltmesi mevcut.
- `vite-plugin-singlefile@2.3.0` üzerinden `micromatch`/`braces`: derin iç içe desenlerde kaynak tüketimiyle ilgili yüksek uyarı; npm’nin önerdiği düzeltme major sürüm değişikliği bildiriyor, körlemesine uygulanmamalı.
- `esbuild`: Windows dev server dosya erişimiyle ilgili düşük uyarı; düzeltme mevcut.

`npm audit fix` çalıştırılmadı, sürüm yükseltmesi yapılmadı. Paket sürümleri güncellendikten sonra build/CI doğrulaması gerekir.

## 6. Yapılan doğrulamalar ve kalan test kapsamı

**Tamamlanan doğrulamalar:** `npx tsc --noEmit` başarılı; `npm run build` başarılı (yalnızca mevcut chunk-size/dinamik import uyarıları var). Canlı Vite proxy’sindeki `course_pair_words` eylemi `en-tr`, `es-en`, `ja-fr` ve `sv-de` için 120 eşleşmiş kelime döndürdü; her örnekte difficulty 1–5 düzeylerinin her birinden 24’er kayıt geldi. Canlı `en-tr` kurs sorgusu 4 ünite/24 ders, egzersiz sorgusu da her derste en az 5 ve en çok 8 alıştırma doğruladı. Uygulama önizlemesi çalışır durumda.

Şunlar hâlâ doğrulanmadı: gerçek kullanıcı oluşturma/giriş/e-posta doğrulama; Google/Apple OAuth sağlayıcı ayarları; gerçek hesapla profil/istatistik yazımı; Realtime publication ve iki hesaplı konuşma izolasyonu; oda üyesi/host yetkileri; ZEGO token ve medya bağlantısı; Groq sohbet ve Whisper; Vercel’de canlı dağıtım ortam değişkenleri; fotoğraf yükleme/dışa aktarma; Android CORS, deep link, mikrofon/kamera ve performans. `package.json` içinde ayrı bir test script’i yok.

## Önerilen düzeltme sırası

1. `Home.tsx:399` JSX kapatma hatası düzeltildi; typecheck/build başarılı.
2. `users.email` anonim erişimini kapat; yalnızca keşif için gereken profili e-postasız sun.
3. Mesaj RLS dış konuşma kimliğini açıkça nitelesin; katılımcı ekleme/oda rolü değişimini sunucu tarafında yetkilendir. XP, abonelik, doğrulama ve rozet alanlarını istemci yazımından koru.
4. **21 boş `en-tr` ders tamamlandı**; seyrek grammar/exam içerikleri için ayrıca üretim/inceleme planı belirle. Groq kotasını yeniden doğrulamadan içerik üretim işini başlatma.
5. Android API URL/CORS/deep-link ayarlarını ve Capacitor sürümlerini eşleştir; ardından cihazda doğrula.
6. Groq sohbet/transkripsiyon için auth/rate/body limitlerini güçlendir; paylaşılan Turso içerik yazımlarını admin/inceleme akışına bağla.
7. npm uyarılarını uyumluluğu inceleyerek düzelt; güvenlik onarımlarından sonra iki hesaplı izolasyon testleri yap.

**Sonuç:** Açılışı engelleyen JSX sorunu giderildi, typecheck/build geçti; `en-tr` alıştırmaları dolduruldu ve farklı dil çiftleri için gerçek Turso kelime eşleşmeli yol eklendi. Bununla birlikte canlı e-posta görünürlüğü ve ciddi RLS riskleri hâlâ çözülmedi. Bu güvenlik bulguları, Vercel/Android uçtan uca doğrulamasıyla birlikte ele alınmadan production veya APK yayını önermiyorum.
