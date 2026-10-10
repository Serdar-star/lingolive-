/* ──────────────────────────────────────────────────────────
   LINGOLIVE — Gerçek Quick Match motoru (sunucusuz eşleşme)
   İki istemci, matching_queue üzerinden GERÇEK eşleşme yapar.
   RLS "self-service" olduğu için kimse başkası adına satır
   YAZAMAZ; bu yüzden tokalaşma şöyle çalışır:

   1. Herkes kendi kuyruk satırını upsert eder ve tick() koşar
      (realtime eventi + 2.5sn'lik interval tick'i tetikler).
   2. Dil-uyumlu adaylar bulunur. Çiftin LİDERİ = created_at'i
      eski olan (eşitlikte user_id'si küçük olan). Deterministik
      olduğu için iki taraf da aynı lideri hesaplar.
   3. Lider: deterministik id'lerle (SHA-256(uidA+uidB)) room +
      kendi üyelik satırı + conversation + kendi katılımcı satırını
      oluşturur, SONRA kendi kuyruk satırını topic="qm:<partnerId>"
      diye etiketler.
   4. Misafir: etiketi görünce liderin üyelik satırını bekler,
      sonra kendi üyelik + katılımcı satırlarını ekler ve kendi
      kuyruk satırını siler.
   5. Lider: misafirin üyelik satırını görünce kendi kuyruk
      satırını siler → iki tarafta da status="matched".

   Deterministik id'ler sayesinde taraflar birbirini "keşfetmek"
   zorunda değil: roomId/convId/zegoRoom her iki istemcide de
   aynı hesaplanır. 30sn içinde tamamlanmayan eşleşme kendini
   temizler (timeout → kuyruktan çık + room ENDED).

   Bu modül SAFTIR: React/store'a dokunmaz, SupabaseClient'ı
   parametre alır → Node test script'i de aynı kodu koşabilir
   (scripts/test_quickmatch.ts).
   ────────────────────────────────────────────────────────── */
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export type QMPartner = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  flag?: string | null;
  level?: string | null;
  nativeLanguage?: string | null;
};

export type QMParams = {
  targetLanguage: string;
  nativeLanguage: string;
  level: string;
  duration?: number;
  topic?: string;
};

export type QMMatch = {
  roomId: string;
  convId: string;
  zegoRoom: string;
  partner: QMPartner;
  iAmHost: boolean;
};

export type QMStatus =
  | { status: "not_in_queue" }
  | { status: "waiting"; queueSize: number }
  | { status: "pending"; partner: QMPartner } // tokalaşma sürüyor
  | { status: "matched"; match: QMMatch }
  | { status: "error"; message: string };

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TAG_PREFIX = "qm:";
const tag = (id: string) => `${TAG_PREFIX}${id}`;
const PENDING_TIMEOUT_MS = 30_000;

/** İki kullanıcı id'sinden deterministik UUID üret (sıralamadan bağımsız). */
export async function detUuid(kind: string, a: string, b: string): Promise<string> {
  const [x, y] = [a, b].sort();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`lingolive-qm-v1:${kind}:${x}:${y}`)
  );
  const hex = [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Çift için paylaşılan kimlikler — iki tarafta da aynı sonuç. */
export async function qmIds(a: string, b: string): Promise<{ roomId: string; convId: string; zegoRoom: string }> {
  const roomId = await detUuid("room", a, b);
  const convId = await detUuid("conv", a, b);
  return { roomId, convId, zegoRoom: roomId.replace(/-/g, "") };
}

const USER_EMBED = "*, users!user_id(id, display_name, avatar_url, country_flag, current_level)";

function toPartner(row: any): QMPartner {
  return {
    id: row.user_id,
    displayName: row.users?.display_name || "Learner",
    avatarUrl: row.users?.avatar_url ?? null,
    flag: row.users?.country_flag ?? null,
    level: row.users?.current_level ?? row.level ?? null,
    nativeLanguage: row.native_language ?? null,
  };
}

export function createQuickMatch(sb: SupabaseClient) {
  let matched: QMMatch | null = null;
  let pendingSince: number | null = null;

  const isDup = (e: any) => e?.code === "23505";

  /** Kuyruğa katıl (satırın varsa tazeler; eski etiketi temizler). */
  async function join(me: string, p: QMParams): Promise<void> {
    matched = null;
    pendingSince = null;
    const { error } = await sb.from("matching_queue").upsert({
      user_id: me,
      target_language: p.targetLanguage,
      native_language: p.nativeLanguage,
      level: p.level,
      duration: p.duration ?? 15,
      topic: p.topic ?? null,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  /** Kuyruktan çık + yerel durumu sıfırla. */
  async function leave(me: string): Promise<void> {
    matched = null;
    pendingSince = null;
    await sb.from("matching_queue").delete().eq("user_id", me);
  }

  /** Tarafın KENDİ satırlarını oluştur (idempotent). Room'u yalnızca host yaratabilir
      (RLS: rooms insert/update = host_id kendi olmalı); misafir createRoom=false ile
      sadece üyelik + conversation + katılımcı satırlarını ekler. */
  async function createArtifacts(me: string, partnerId: string, p: QMParams, hostId: string, createRoom: boolean): Promise<{ roomId: string; convId: string }> {
    const { roomId, convId } = await qmIds(me, partnerId);
    if (createRoom) {
      const room = await sb.from("rooms").upsert(
        {
          id: roomId, name: "Quick Match", topic: "Quick Match", type: "VIDEO",
          level: p.level, language1: p.nativeLanguage, language2: p.targetLanguage,
          host_id: hostId, max_speakers: 2, status: "ACTIVE",
        },
        { onConflict: "id" }
      );
      if (room.error && !isDup(room.error)) console.warn("[qm] room upsert:", room.error.message);
    }
    const mem = await sb.from("room_members").upsert(
      { room_id: roomId, user_id: me, role: hostId === me ? "HOST" : "SPEAKER", is_muted: false },
      { onConflict: "room_id,user_id" }
    );
    if (mem.error) console.warn("[qm] member upsert:", mem.error.message);
    const cv = await sb.from("conversations").insert({ id: convId, type: "DIRECT" });
    if (cv.error && !isDup(cv.error)) console.warn("[qm] conv insert:", cv.error.message);
    const cp = await sb.from("conversation_participants").upsert(
      { conversation_id: convId, user_id: me },
      { onConflict: "conversation_id,user_id" }
    );
    if (cp.error) console.warn("[qm] participant upsert:", cp.error.message);
    return { roomId, convId };
  }

  async function fetchUser(id: string): Promise<QMPartner> {
    const { data } = await sb.from("users")
      .select("id, display_name, avatar_url, country_flag, current_level")
      .eq("id", id).maybeSingle();
    return {
      id,
      displayName: (data as any)?.display_name || "Learner",
      avatarUrl: (data as any)?.avatar_url ?? null,
      flag: (data as any)?.country_flag ?? null,
      level: (data as any)?.current_level ?? null,
    };
  }

  /** Pending durumunu yönet; 30sn aşıldıysa temizle ve hata döndür. */
  async function pendingState(me: string, partner: QMPartner): Promise<QMStatus> {
    pendingSince ??= Date.now();
    if (Date.now() - pendingSince > PENDING_TIMEOUT_MS) {
      await cleanup(me);
      return { status: "error", message: "Match timed out — your partner didn't connect. Try again!" };
    }
    return { status: "pending", partner };
  }

  async function cleanup(me: string): Promise<void> {
    pendingSince = null;
    matched = null;
    const mine = await sb.from("matching_queue").select("topic").eq("user_id", me).maybeSingle();
    const topic = (mine.data as any)?.topic as string | null;
    if (topic?.startsWith(TAG_PREFIX)) {
      const partnerId = topic.slice(TAG_PREFIX.length);
      const { roomId } = await qmIds(me, partnerId);
      await sb.from("rooms").update({ status: "ENDED" }).eq("id", roomId).eq("host_id", me);
    }
    await sb.from("matching_queue").delete().eq("user_id", me);
  }

  /** Ana durum makinesi — her tick'te çağrılır. */
  async function tick(me: string, p: QMParams): Promise<QMStatus> {
    if (matched) return { status: "matched", match: matched };

    const mine = await sb.from("matching_queue").select("*").eq("user_id", me).maybeSingle();
    if (mine.error) return { status: "error", message: mine.error.message };
    if (!mine.data) return { status: "not_in_queue" };
    const myRow = mine.data as any;

    const all = await sb.from("matching_queue").select(USER_EMBED);
    if (all.error) return { status: "error", message: all.error.message };
    const rows = (all.data ?? []) as any[];

    // ── 1) Bir lider beni etiketlediyse → misafir olarak katıl
    const taggedBy = rows.find((r) => r.user_id !== me && r.topic === tag(me));
    if (taggedBy) {
      const partner = toPartner(taggedBy);
      const { roomId, convId } = await qmIds(me, partner.id);
      const host = await sb.from("room_members").select("user_id")
        .eq("room_id", roomId).eq("user_id", partner.id).maybeSingle();
      if (host.data) {
        await createArtifacts(me, partner.id, p, partner.id, false); // misafir room YARATAMAZ (RLS) — sadece kendi satırları
        await sb.from("matching_queue").delete().eq("user_id", me);
        matched = { roomId, convId, zegoRoom: roomId.replace(/-/g, ""), partner, iAmHost: false };
        pendingSince = null;
        return { status: "matched", match: matched };
      }
      return pendingState(me, partner); // lider artifact'leri henüz yaratmadı
    }

    // ── 2) Ben liderim ve etiketledim → misafirin katılımını bekle
    if (typeof myRow.topic === "string" && myRow.topic.startsWith(TAG_PREFIX)) {
      const partnerId = myRow.topic.slice(TAG_PREFIX.length);
      const partnerRow = rows.find((r) => r.user_id === partnerId);
      const partner = partnerRow ? toPartner(partnerRow) : await fetchUser(partnerId);
      const { roomId, convId } = await qmIds(me, partnerId);
      const guest = await sb.from("room_members").select("user_id")
        .eq("room_id", roomId).eq("user_id", partnerId).maybeSingle();
      if (guest.data) {
        await sb.from("matching_queue").delete().eq("user_id", me);
        matched = { roomId, convId, zegoRoom: roomId.replace(/-/g, ""), partner, iAmHost: true };
        pendingSince = null;
        return { status: "matched", match: matched };
      }
      await createArtifacts(me, partnerId, p, me, true); // kısmi kaldıysa tamamla (idempotent)
      return pendingState(me, partner);
    }

    // ── 3) Aday ara
    const myIdx = LEVELS.indexOf(myRow.level);
    const compatible = (r: any) =>
      (r.native_language === p.targetLanguage || r.target_language === p.nativeLanguage);
    const levelOk = (r: any) => {
      const i = LEVELS.indexOf(r.level);
      return myIdx < 0 || i < 0 || Math.abs(i - myIdx) <= 1;
    };
    const cands = rows
      .filter((r) => r.user_id !== me)
      .filter((r) => !(typeof r.topic === "string" && r.topic.startsWith(TAG_PREFIX))) // etiketli = başka eşleşmede
      .filter((r) => levelOk(r) && compatible(r))
      .map((r) => ({
        r,
        score: (r.native_language === p.targetLanguage ? 1 : 0) + (r.target_language === p.nativeLanguage ? 1 : 0),
      }))
      .sort((a, b) =>
        b.score - a.score ||
        new Date(a.r.created_at).getTime() - new Date(b.r.created_at).getTime() ||
        (a.r.user_id < b.r.user_id ? -1 : 1));

    if (cands.length === 0) {
      pendingSince = null;
      return { status: "waiting", queueSize: rows.length };
    }

    const best = cands[0].r;
    const partner = toPartner(best);
    const myT = new Date(myRow.created_at).getTime();
    const theirT = new Date(best.created_at).getTime();
    const iLead = myT < theirT || (myT === theirT && me < best.user_id);

    if (iLead) {
      await createArtifacts(me, partner.id, p, me, true); // önce yarat…
      const { error } = await sb.from("matching_queue").update({ topic: tag(partner.id) }).eq("user_id", me); // …sonra etiketle
      if (error) return { status: "error", message: error.message };
      return pendingState(me, partner);
    }
    pendingSince = null;
    return { status: "waiting", queueSize: rows.length }; // lider beni etiketleyecek
  }

  /** matching_queue realtime kanalı — her event tick'i tetiklesin. */
  function subscribe(onWake: () => void): RealtimeChannel {
    return sb.channel(`qm_${Math.random().toString(36).slice(2, 8)}`, { config: { private: true } })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "matching_queue" }, onWake)
      .subscribe();
  }

  /** Aramayı bitir: host room'u ENDED yapar, kendi üyelik satırına left_at basar. */
  async function endMatch(me: string, m: QMMatch): Promise<void> {
    if (matched?.roomId === m.roomId) matched = null;
    if (m.iAmHost) await sb.from("rooms").update({ status: "ENDED" }).eq("id", m.roomId).eq("host_id", me);
    await sb.from("room_members").update({ left_at: new Date().toISOString() })
      .eq("room_id", m.roomId).eq("user_id", me);
  }

  return { join, leave, tick, subscribe, endMatch, qmIds };
}
