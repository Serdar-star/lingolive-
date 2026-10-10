import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCheck } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { I, EmptyState, Card } from "../components/ui";
import { PageShell } from "../components/layout";
import { getSessionUserId, backendReady } from "../lib/backend";
import { supabase, notificationService } from "../lib/supabase";
import { relTime } from "../store/chatRT";

interface Notif {
  id: string; icon: string; tone: string; title: string; body: string; time: string;
  unread: boolean; kind: "achieve" | "social" | "system";
}

const FILTERS = ["All", "Unread", "Achievements", "Social"] as const;

/* ── DB satırı → UI modeli ── */
type DbRow = { id: number | string; type: string; title: string; body: string | null; is_read: boolean; created_at: string };
const iconFor = (t: string) =>
  t === "LEVEL_UP" ? "zap" : t === "BADGE_EARNED" ? "trophy" : t === "LIKE" ? "heart" : t === "MATCH" ? "video" : t === "CORRECTION" ? "pen" : "note";
const kindFor = (t: string): Notif["kind"] =>
  t === "LEVEL_UP" || t === "BADGE_EARNED" ? "achieve" : t === "LIKE" || t === "MATCH" || t === "CORRECTION" || t === "COMMENT" ? "social" : "system";
const toneFor = (k: Notif["kind"]) =>
  k === "achieve" ? "bg-gold/15 text-gold" : k === "social" ? "bg-pink/15 text-pink" : "bg-primary/12 text-primary";
const rowToNotif = (r: DbRow): Notif => {
  const kind = kindFor(r.type);
  return {
    id: String(r.id), icon: iconFor(r.type), tone: toneFor(kind),
    title: r.title || "Notification", body: r.body ?? "", time: relTime(r.created_at),
    unread: !r.is_read, kind,
  };
};

export default function NotificationsPage() {
  const uid = getSessionUserId();
  const live = backendReady() && !!uid;
  const [list, setList] = useState<Notif[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { pushToast } = useApp();

  /* Load persisted notifications and subscribe to real inserts. */
  useEffect(() => {
    if (!live || !uid) { setList([]); setLoading(false); return; }
    let alive = true;
    let ch: RealtimeChannel | null = null;
    const pollTimer = window.setInterval(() => {
      void notificationService.getNotifications(uid).then((rows) => {
        if (alive) setList((rows as unknown as DbRow[]).map(rowToNotif));
      }).catch((e) => console.warn("Notification polling failed:", e));
    }, 10_000);
    setLoading(true); setError(null);
    void (async () => {
      try {
        const rows = (await notificationService.getNotifications(uid)) as unknown as DbRow[];
        if (alive) setList(rows.map(rowToNotif));
      } catch (e) {
        console.warn("Notifications load failed:", e);
        if (alive) setError(e instanceof Error ? e.message : "Could not load notifications.");
      } finally {
        if (alive) setLoading(false);
      }
      if (!alive) return;
      try {
        ch = notificationService.subscribeToNotifications(uid, (payload) => {
          const row = (payload as { new?: DbRow })?.new;
          if (row && alive) setList((cur) => [rowToNotif(row), ...cur.filter((item) => item.id !== String(row.id))]);
        });
      } catch (e) { console.warn("Notification realtime subscription unavailable:", e); }
    })();
    return () => {
      alive = false;
      window.clearInterval(pollTimer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [live, uid, reloadKey]);

  const unread = list.filter((n) => n.unread).length;
  const shown = list.filter((n) =>
    filter === "All" ? true :
    filter === "Unread" ? n.unread :
    filter === "Achievements" ? n.kind === "achieve" : n.kind === "social"
  );

  const markAll = async () => {
    if (!live || !uid) {
      pushToast({ title: "Sign in required", desc: "Notifications are tied to your Supabase account.", icon: "alert", tone: "primary" });
      return;
    }
    if (!unread) return;
    try {
      await notificationService.markAllAsRead(uid);
      setList((current) => current.map((n) => ({ ...n, unread: false })));
    } catch (e) {
      pushToast({ title: "Could not mark notifications read", desc: e instanceof Error ? e.message : "Try again.", icon: "alert", tone: "red" });
    }
  };

  const markOne = async (notification: Notif) => {
    if (!notification.unread) return;
    if (!live || !uid) return;
    try {
      await notificationService.markAsRead(notification.id, uid);
      setList((current) => current.map((item) => item.id === notification.id ? { ...item, unread: false } : item));
    } catch (e) {
      pushToast({ title: "Could not mark notification read", desc: e instanceof Error ? e.message : "Try again.", icon: "alert", tone: "red" });
    }
  };

  return (
    <PageShell
      title="Notifications"
      sub={!live ? "Sign in to view your account notifications" : unread ? `${unread} unread` : "Live from your account"}
      right={live && unread > 0 ? (
        <button onClick={() => void markAll()} className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary-faint px-3.5 py-2 font-display text-[11.5px] font-bold text-primary transition hover:bg-primary-soft">
          <CheckCheck className="size-4" /> Mark all read
        </button>
      ) : null}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-4 py-2 font-display text-[12px] font-bold transition",
                filter === f ? "border-primary bg-primary text-white shadow-lift" : "border-border bg-card text-fg-sec hover:border-primary/50"
              )}
            >
              {f}{f === "Unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>

        {loading && <Card className="flex items-center justify-center gap-3 p-7"><span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /><span className="text-sm font-semibold text-fg-sec">Loading notifications…</span></Card>}
        {error && <Card className="flex items-center justify-between gap-3 border-red/30 p-4" role="alert"><p className="text-sm text-fg-sec">Notifications unavailable: {error}</p><button onClick={() => setReloadKey((n) => n + 1)} className="rounded-full bg-primary-faint px-3 py-2 text-xs font-bold text-primary">Retry</button></Card>}
        {!loading && !error && !live && <Card className="p-0"><EmptyState icon="bellring" title="Sign in to view notifications" sub="Notifications are loaded from your account; no sample notifications are shown." /></Card>}
        {!loading && !error && live && shown.length === 0 && (
          <Card className="p-0"><EmptyState icon="bellring" title={list.length ? "All caught up" : "No notifications yet"} sub={list.length ? "There are no notifications in this filter." : "Real level-ups, corrections and other account events will appear here."} /></Card>
        )}

        <div className="flex flex-col gap-2">
          {!loading && !error && shown.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={cn("relative flex items-start gap-3 rounded-2xl border p-4 transition", n.unread ? "border-primary/30 bg-primary-faint/60" : "border-border bg-card")}
            >
              {n.unread && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary" />}
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", n.tone)}><I k={n.icon} className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[13.5px] font-extrabold text-fg">{n.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-fg-sec">{n.body}</span>
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-fg-ter">{n.time}</span>
              </span>
              {n.unread && <button onClick={() => void markOne(n)} className="shrink-0 rounded-full bg-primary-faint px-3 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary-soft">Mark read</button>}
            </motion.div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
