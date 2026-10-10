import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ChevronRight, ExternalLink, Moon, Sun, Trash2,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { Flag, I, Card } from "../components/ui";
import { PageShell } from "../components/layout";
import { backendResetPassword, getSessionUserId } from "../lib/backend";
import { supabase, userService } from "../lib/supabase";
import { applyVisualPreferences, getLocalPreferences, saveLocalPreferences, type LocalPreferences } from "../lib/preferences";

/* ─── row primitives ─── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={cn("relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-35", on ? "bg-primary" : "bg-border")}
    >
      <motion.span
        className="absolute top-0.5 size-6 rounded-full bg-white shadow"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

interface RowDef {
  key: string;
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  disabled?: boolean;
  toggle?: [boolean, () => void];
  chevron?: boolean;
  onTap?: () => void;
  custom?: React.ReactNode;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 px-1 font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-fg-ter">{title}</h3>
      <Card className="divide-y divide-border/70 overflow-hidden p-0">{children}</Card>
    </div>
  );
}

function Pills<T extends string>({ options, value, onPick }: { options: T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={cn(
            "cursor-pointer rounded-xl border px-3 py-1.5 font-display text-[11.5px] font-bold transition",
            value === o ? "border-primary bg-primary text-white" : "border-border text-fg-sec hover:border-primary/50"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const THEME_COLORS = [
  { name: "Purple", v: "#6C5CE7" }, { name: "Blue", v: "#3b82f6" }, { name: "Green", v: "#10b981" },
  { name: "Orange", v: "#f97316" }, { name: "Pink", v: "#ec4899" },
];
let goalSaveTimer: number | undefined;

/* ─── SETTINGS PAGE ─── */
export default function SettingsPage() {
  const { user, dark, toggleTheme, pushToast } = useApp();
  const [q, setQ] = useState("");
  const [localPrefs, setLocalPrefs] = useState<LocalPreferences>(() => getLocalPreferences());
  const [goalMin, setGoalMin] = useState(user.dailyGoalMinutes || localPrefs.dailyGoalMinutes);
  const [goalOpen, setGoalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setGoalMin(user.dailyGoalMinutes || getLocalPreferences().dailyGoalMinutes);
  }, [user.dailyGoalMinutes]);

  const savePreferences = (patch: Partial<LocalPreferences>) => {
    const next = { ...localPrefs, ...patch };
    setLocalPrefs(next);
    saveLocalPreferences(next);
    applyVisualPreferences(next);
  };

  const applyAccent = (c: string) => {
    savePreferences({ accentColor: c });
    pushToast({ title: "Accent applied", desc: "Your color choice is saved on this device.", icon: "palette", tone: "primary" });
  };

  const changeGoal = (value: number) => {
    setGoalMin(value);
    savePreferences({ dailyGoalMinutes: value });
    useApp.setState((state) => ({ user: { ...state.user, dailyGoalMinutes: value } }));
    const uid = getSessionUserId();
    if (!uid) return;
    if (goalSaveTimer !== undefined) window.clearTimeout(goalSaveTimer);
    goalSaveTimer = window.setTimeout(() => {
      goalSaveTimer = undefined;
      void userService.updateProfile(uid, { daily_goal_minutes: value })
        .then(() => pushToast({ title: "Daily goal saved", desc: "Your goal is stored in your Supabase profile.", icon: "zap", tone: "green" }))
        .catch((e: unknown) => pushToast({ title: "Goal saved on this device only", desc: e instanceof Error ? e.message : "Supabase could not save the change.", icon: "alert", tone: "red" }));
    }, 700);
  };

  const exportData = async () => {
    const uid = getSessionUserId();
    if (!uid) {
      pushToast({ title: "Sign in to export data", desc: "A real account is required to collect your cloud records.", icon: "alert", tone: "primary" });
      return;
    }
    setExporting(true);
    const read = async (label: string, request: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
      const result = await request;
      if (result.error) throw new Error(`${label}: ${result.error.message}`);
      return result.data;
    };
    try {
      const [profile, stats, streak, lessons, vocabulary, xpEvents, missions, badges, notifications, moments, comments, corrections, participants, roomMemberships, calls] = await Promise.all([
        read("Profile", supabase.from("users").select("*").eq("id", uid).maybeSingle()),
        read("Stats", supabase.from("user_stats").select("*").eq("user_id", uid).maybeSingle()),
        read("Streak", supabase.from("user_streaks").select("*").eq("user_id", uid).maybeSingle()),
        read("Lesson progress", supabase.from("lesson_progress").select("*").eq("user_id", uid)),
        read("Vocabulary", supabase.from("user_vocabulary").select("*").eq("user_id", uid)),
        read("XP events", supabase.from("xp_events").select("*").eq("user_id", uid)),
        read("Daily missions", supabase.from("daily_missions").select("*").eq("user_id", uid)),
        read("Badges", supabase.from("user_badges").select("*").eq("user_id", uid)),
        read("Notifications", supabase.from("notifications").select("*").eq("user_id", uid)),
        read("Moments", supabase.from("moments").select("*").eq("user_id", uid)),
        read("Comments", supabase.from("moment_comments").select("*").eq("user_id", uid)),
        read("Corrections", supabase.from("corrections").select("*").or(`giver_id.eq.${uid},receiver_id.eq.${uid}`)),
        read("Conversations", supabase.from("conversation_participants").select("conversation_id, last_read_at, is_muted, is_pinned").eq("user_id", uid)),
        read("Room memberships", supabase.from("room_members").select("*").eq("user_id", uid)),
        read("Call history", supabase.from("call_sessions").select("*").or(`caller_user_id.eq.${uid},recipient_user_id.eq.${uid}`)),
      ]);
      const conversationIds = ((participants ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id);
      const messages = conversationIds.length
        ? await read("Messages", supabase.from("messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: true }))
        : [];
      const bundle = {
        exportedAt: new Date().toISOString(),
        note: "Cloud account records and this device's app preferences are included. Media file bytes are not included.",
        devicePreferences: { ...localPrefs, darkMode: dark },
        profile, stats, streak, lessons, vocabulary, xpEvents, missions, badges, notifications,
        moments, comments, corrections, conversations: participants, messages, roomMemberships, calls,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lingolive-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast({ title: "Data export downloaded", desc: "The JSON file contains your cloud records; audio and image files are not embedded.", icon: "check", tone: "green" });
    } catch (e) {
      pushToast({ title: "Data export failed", desc: e instanceof Error ? e.message : "Check your connection and try again.", icon: "alert", tone: "red" });
    } finally {
      setExporting(false);
    }
  };

  const groups: { title: string; rows: RowDef[] }[] = useMemo(() => [
    {
      title: "Account",
      rows: [
        { key: "email", icon: "mail", label: "Email", value: user.email },
        { key: "name", icon: "users", label: "Display name", value: user.displayName, chevron: true, onTap: () => useApp.getState().openPage("edit-profile") },
        { key: "country", icon: "globe", label: "Country", value: user.country, chevron: true, onTap: () => useApp.getState().openPage("edit-profile") },
        { key: "pass", icon: "pencil", label: "Change password", chevron: true, onTap: () => {
          if (!user.email) { pushToast({ title: "Reset unavailable", desc: "No email address is saved on this account.", icon: "mail", tone: "red" }); return; }
          void backendResetPassword(user.email)
            .then(() => pushToast({ title: "Check your inbox", desc: "If this email has an account, a password reset link is on its way.", icon: "mail", tone: "green" }))
            .catch((error: unknown) => pushToast({ title: "Reset failed", desc: error instanceof Error ? error.message : "Try again later.", icon: "mail", tone: "red" }));
        } },
        { key: "tfa", icon: "gem", label: "Two-factor authentication", value: "Not configured", disabled: true },
      ],
    },
    {
      title: "Learning",
      rows: [
        { key: "goal", icon: "zap", label: "Daily goal", value: `${goalMin} min/day`, chevron: true, onTap: () => setGoalOpen(!goalOpen) },
        { key: "rem", icon: "bellring", label: "Learning reminder", value: "Browser reminders unavailable", disabled: true },
        { key: "diff", icon: "cap", label: "Lesson difficulty", value: "Not connected to lesson selection", disabled: true },
        { key: "speed", icon: "video", label: "Speech rate", custom: <Pills options={["0.5x", "1x", "1.5x", "2x"]} value={localPrefs.speechRate} onPick={(v) => savePreferences({ speechRate: v as LocalPreferences["speechRate"] })} /> },
      ],
    },
    {
      title: "Appearance",
      rows: [
        { key: "dark", icon: "moon", label: "Dark mode", custom: <Toggle on={dark} onChange={toggleTheme} /> },
        { key: "font", icon: "book", label: "Font size", custom: (
          <span className="flex flex-1 items-center gap-3">
            <span className="font-display text-[11px] font-bold text-fg-ter">A</span>
            <input type="range" min={1} max={3} step={1} value={localPrefs.fontScale} onChange={(e) => savePreferences({ fontScale: Number(e.target.value) as 1 | 2 | 3 })} className="flex-1 accent-[#6C5CE7]" />
            <span className="font-display text-[16px] font-bold text-fg">A</span>
            <span className="w-20 text-right font-body text-fg-sec" style={{ fontSize: [11, 13, 15][localPrefs.fontScale - 1] }}>Preview</span>
          </span>
        ) },
        { key: "accent", icon: "palette", label: "Accent color", custom: (
          <span className="flex gap-2">
            {THEME_COLORS.map((c) => (
              <button
                key={c.v}
                onClick={() => applyAccent(c.v)}
                className={cn("grid size-7 cursor-pointer place-items-center rounded-full transition", localPrefs.accentColor === c.v && "scale-110 ring-2 ring-offset-2 ring-offset-card")}
                style={{ background: c.v, ...(localPrefs.accentColor === c.v ? { ["--tw-ring-color" as string]: c.v } : {}) }}
                title={c.name}
              >
                {localPrefs.accentColor === c.v && <ChevronRight className="size-3.5 rotate-90 text-white" strokeWidth={3.4} />}
              </button>
            ))}
          </span>
        ) },
      ],
    },
    {
      title: "Notifications",
      rows: [{ key: "push", icon: "bellring", label: "Push and scheduled notifications", value: "No notification service configured", disabled: true }],
    },
    {
      title: "Privacy & Safety",
      rows: [
        { key: "vis", icon: "users", label: "Profile visibility", value: "Privacy controls not enforced yet", disabled: true },
        { key: "onl", icon: "globe", label: "Online status visibility", value: "Privacy controls not enforced yet", disabled: true },
        { key: "blocked", icon: "gem", label: "Blocked users", value: "Blocking is not configured", disabled: true },
        { key: "export", icon: "mail", label: "Export my data", value: exporting ? "Preparing…" : "Download JSON", chevron: !exporting, disabled: exporting, onTap: () => void exportData() },
      ],
    },
    {
      title: "Audio",
      rows: [
        { key: "sfx", icon: "note", label: "Sound effects", value: "No sound-effect system configured", disabled: true },
        { key: "voice", icon: "mic", label: "English pronunciation accent", custom: (
          <span className="flex gap-1.5">
            {[{ n: "American", f: "us" }, { n: "British", f: "gb" }, { n: "Australian", f: "au" }].map((v) => (
              <button key={v.n} onClick={() => savePreferences({ speechAccent: v.n as LocalPreferences["speechAccent"] })} className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition",
                localPrefs.speechAccent === v.n ? "border-primary bg-primary text-white" : "border-border text-fg-sec"
              )}>
                <Flag code={v.f} size={13} /> {v.n.slice(0, 4)}.
              </button>
            ))}
          </span>
        ) },
        { key: "ap", icon: "video", label: "Auto-play voice messages", custom: <Toggle on={localPrefs.autoPlayVoiceMessages} onChange={() => savePreferences({ autoPlayVoiceMessages: !localPrefs.autoPlayVoiceMessages })} /> },
      ],
    },
    {
      title: "About",
      rows: [
        { key: "ver", icon: "sparkles", label: "Version", value: "1.0.0 (100)" },
        { key: "rate", icon: "star", label: "Rate LingoLive", value: "App store listing not configured", disabled: true },
        { key: "terms", icon: "note", label: "Terms & Privacy", value: "Legal policy URL not configured", disabled: true },
      ],
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [localPrefs, goalMin, goalOpen, dark, user, exporting]);

  const filtered = q
    ? groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.label.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.rows.length)
    : groups;

  return (
    <PageShell
      title="Settings"
      sub="Tune LingoLive to your liking"
      right={
        <button onClick={toggleTheme} className="grid size-10 cursor-pointer place-items-center rounded-xl bg-primary-faint text-primary">
          {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-ter" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search settings…"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm font-semibold outline-none transition placeholder:text-fg-ter focus:border-primary/60 shadow-card"
          />
        </div>

        {/* daily goal expander */}
        <AnimatePresence>
          {goalOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Card className="border-primary/30 bg-primary-faint/50 p-4">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-fg-sec">Daily goal</span>
                  <span className="font-mono text-primary">{goalMin} min/day</span>
                </div>
                <input
                  type="range" min={5} max={60} step={5} value={goalMin}
                  onChange={(e) => changeGoal(Number(e.target.value))}
                  className="mt-2 w-full accent-[#6C5CE7]"
                />
                <div className="mt-1 flex justify-between text-[10px] font-bold text-fg-ter"><span>5 — casual</span><span>60 — intense</span></div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.map((g) => (
          <Group key={g.title} title={g.title}>
            {g.rows.map((r) => (
              <div key={r.key} className={cn("flex items-center gap-3 px-4 py-3 transition", !r.disabled && "hover:bg-bg-sec/50", r.disabled && "opacity-70")}>
                {!r.custom ? (
                  <>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", r.danger ? "bg-red/10 text-red" : "bg-primary-faint text-primary")}>
                      <I k={r.icon} className="size-4" />
                    </span>
                    <button disabled={r.disabled} onClick={r.onTap} className={cn("flex flex-1 items-center gap-3 text-left", r.disabled ? "cursor-not-allowed" : r.onTap ? "cursor-pointer" : "cursor-default")}>
                      <span className={cn("flex-1 font-display text-[13.5px] font-bold", r.danger ? "text-red" : "text-fg")}>{r.label}</span>
                      {r.value && <span className="truncate text-[12px] font-semibold text-fg-ter">{r.value}</span>}
                      {r.toggle && <Toggle on={r.toggle[0]} onChange={r.toggle[1]} />}
                      {r.chevron && !r.toggle && <ChevronRight className="size-4 shrink-0 text-fg-ter" />}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-faint text-primary">
                      <I k={r.icon} className="size-4" />
                    </span>
                    <span className="flex flex-wrap flex-1 items-center justify-between gap-2">
                      <span className="font-display text-[13.5px] font-bold text-fg">{r.label}</span>
                      {r.custom}
                    </span>
                  </>
                )}
              </div>
            ))}
          </Group>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-display text-sm font-bold text-fg">No settings match "{q}"</p>
            <p className="mt-1 text-xs text-fg-sec">Try "dark", "goal" or "voice"</p>
          </div>
        )}

        {/* Account deletion requires a privileged server-side function; never claim a deletion was scheduled from the client. */}
        <div>
          <h3 className="mb-2 px-1 font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-red/80">Danger zone</h3>
          <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border-2 border-red/20 py-3.5 font-display text-sm font-bold text-fg-ter opacity-70">
            <Trash2 className="size-4.5" /> Account deletion unavailable in this build
          </button>
          <p className="mt-2 px-1 text-xs leading-relaxed text-fg-ter">No deletion request has been sent or scheduled. A secure server-side deletion flow still needs to be configured.</p>
        </div>

        <p className="flex items-center justify-center gap-1 pb-4 text-[11px] font-semibold text-fg-ter">
          LingoLive for Web · made with <ExternalLink className="size-3" /> care
        </p>
      </div>
    </PageShell>
  );
}
