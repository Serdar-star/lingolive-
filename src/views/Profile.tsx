import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Pencil, BookOpen, Clock, Users, GraduationCap, Zap, Phone,
  Trophy, LogOut, Moon, Sun, ChevronRight, Gem, Share2, HelpCircle, Languages,
  Target, BarChart3, Award, PenLine, Bookmark, Settings, ShieldAlert, Bell,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { BADGES, CEFR_STEPS, RARITY_STYLES, type BadgeDef } from "../data/mock";
import { getSessionUserId, backendReady } from "../lib/backend";
import { supabase } from "../lib/supabase";
import { Avatar, Flag, LevelBadge, Card, Button, Num, Ring, I, StreakFire, LeagueMark, SectionHeader } from "../components/ui";

/* ─────────── PROFILE HEADER ─────────── */
function ProfileHeader({ live, onEdit }: { live: boolean; onEdit: () => void }) {
  const { user, streak } = useApp();
  if (!live) return (
    <Card className="flex items-center gap-4 p-5">
      <Avatar initials="GL" color="#6C5CE7" size={64} />
      <div><h1 className="font-display text-lg font-extrabold text-fg">Guest profile</h1><p className="mt-1 text-sm text-fg-sec">Sign in to load your saved identity and preferences. Sample profile details are hidden.</p></div>
    </Card>
  );
  return (
    <Card className="relative overflow-hidden p-0">
      <div className="h-28 hero-gradient sm:h-32">
        <div className="absolute inset-x-0 top-0 h-full dotgrid opacity-25" />
        <div className="absolute -right-8 -top-10 size-44 rounded-full bg-white/10 blur-2xl" />
      </div>
      <div className="relative px-5 pb-5 sm:px-7">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-3">
          <div className="relative">
            <div className="rounded-full bg-card p-1.5 shadow-lift">
              <Avatar initials={user.initials} color={user.color} size={92} src={user.avatarUrl} />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-gold to-orange px-2.5 py-0.5 font-display text-[10px] font-extrabold text-white shadow-lift">
              {user.tier}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="size-3.5" /> Edit profile</Button>
        </div>

        <div className="mt-4">
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-fg">
            {user.displayName}
            {user.isVerified && <ShieldCheck className="size-5.5 text-blue" />}
          </h1>
          <p className="text-sm font-medium text-fg-ter">{user.username}</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-sec">{user.bio}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-bg-sec px-3 py-1.5 text-xs font-bold text-fg-sec">
              <Flag code={user.flag} size={15} /> {user.nativeLanguage}
              <span className="text-fg-ter">→</span>
              <Flag code={user.targetFlag} size={15} /> {user.targetLanguage}
            </span>
            <LevelBadge level={user.level} className="px-3 py-1.5 text-xs" />
            <span className="flex items-center gap-1.5 rounded-full bg-gold/12 px-3 py-1.5 text-xs font-bold text-gold">
              <LeagueMark league={user.league} size={14} /> {user.league} League{user.leagueRank > 0 ? ` · #${user.leagueRank}` : ""}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-orange/12 px-3 py-1.5">
              <StreakFire count={streak} size="sm" />
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {user.interests.map((t) => (
              <span key={t} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-fg-sec">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────── STATS GRID ─────────── */
function StatsGrid({ live }: { live: boolean }) {
  const { user } = useApp();
  const items = [
    { label: "Words learned", v: user.stats.wordsLearned, icon: BookOpen, c: "text-primary", bg: "bg-primary-faint" },
    { label: "Speaking hours", v: user.stats.speakingHours, icon: Clock, c: "text-cyan", bg: "bg-cyan-soft" },
    { label: "Partners met", v: user.stats.partnersMet, icon: Users, c: "text-pink", bg: "bg-pink/10" },
    { label: "Lessons done", v: user.stats.lessonsCompleted, icon: GraduationCap, c: "text-green", bg: "bg-green/10" },
    { label: "Total XP", v: user.stats.totalXP, icon: Zap, c: "text-gold", bg: "bg-gold/10" },
    { label: "Video calls", v: user.stats.totalCalls, icon: Phone, c: "text-orange", bg: "bg-orange/10" },
  ];
  if (!live) return <Card className="p-4 text-sm text-fg-sec">Sign in to view account statistics. Demo totals are hidden.</Card>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-20px" }} transition={{ delay: i * 0.05 }}
        >
          <Card hover className="flex flex-col items-center gap-1 p-4 text-center">
            <span className={cn("grid size-10 place-items-center rounded-xl", s.bg, s.c)}>
              <s.icon className="size-5" strokeWidth={2.2} />
            </span>
            <p className="mt-1.5 font-mono text-lg font-bold leading-none text-fg"><Num value={s.v} /></p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-fg-ter">{s.label}</p>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────── LEVEL CARD ─────────── */
function LevelCard({ live }: { live: boolean }) {
  const { xp, xpToNext, levelNum, todayXP } = useApp();
  const pct = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;
  return (
    <Card className="relative flex items-center gap-5 overflow-hidden p-5">
      <div className="absolute -right-10 -top-12 size-40 rounded-full bg-primary/10 blur-2xl" />
      <Ring value={live ? pct : 0} size={104} stroke={10}>
        <div className="text-center">
          <p className="font-mono text-[22px] font-bold leading-none text-fg">{live ? levelNum : "—"}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-fg-ter">level</p>
        </div>
      </Ring>
      <div className="relative flex-1">
        <p className="font-display text-[15px] font-extrabold text-fg">{live ? `Level ${levelNum}` : "Level progress"}</p>
        <p className="mt-0.5 text-xs text-fg-sec">
          {live ? <><span className="font-mono font-bold text-primary">{xp.toLocaleString()}</span> / {xpToNext.toLocaleString()} XP to level {levelNum + 1}</> : "Sign in to view saved XP progress."}
        </p>
        {live && <div className="mt-3 flex gap-2"><span className="rounded-xl bg-gold/12 px-3 py-1.5 text-[11px] font-bold text-gold">+{todayXP} XP today</span></div>}
      </div>
    </Card>
  );
}

/* ─────────── CEFR CARD ─────────── */
function CEFRCard({ live }: { live: boolean }) {
  const { user } = useApp();
  const step = CEFR_STEPS.find((item) => item.level === user.level);
  return (
    <Card className="p-5">
      <SectionHeader title="Current CEFR level" />
      {live ? <div className="flex items-center gap-3"><LevelBadge level={user.level} className="px-4 py-2 text-base" /><p className="font-display text-sm font-bold text-fg">{step?.label ?? user.level}</p></div> : <p className="text-sm text-fg-sec">Sign in to view the level saved to your profile.</p>}
      <p className="mt-3 text-xs leading-relaxed text-fg-sec">This is the level saved in your profile. No placement-test or official CEFR assessment result is currently stored.</p>
    </Card>
  );
}

/* ─────────── LEADERBOARD SNAPSHOT (girişliyse GERÇEK user_stats) ─────────── */
const LB_PALETTE = ["#E84393", "#6C5CE7", "#00CEC9", "#2ED573", "#FFA502", "#74B9FF", "#FF6B6B", "#A29BFE", "#00B0AB", "#F8B500"];
const lbColor = (id: string) => LB_PALETTE[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % LB_PALETTE.length];
const lbInitials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "L";
type LiveBoardRow = { rank: number; name: string; initials: string; avatarUrl: string | null; color: string; flag: string; level: string; xp: number; isYou: boolean; online: boolean };

function BoardSnapshot() {
  const currentUserAvatarUrl = useApp((state) => state.user.avatarUrl);
  const uid = getSessionUserId();
  const live = backendReady() && !!uid;
  const [rows, setRows] = useState<LiveBoardRow[] | null>(null);
  const [myPos, setMyPos] = useState<{ rank: number; xp: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!live || !uid) { setLoading(false); return; }
    let alive = true;
    setLoading(true); setError(null);
    void (async () => {
      try {
        const { data, error: boardError } = await supabase.from("user_stats")
          .select("user_id, total_xp, users!user_id(id, display_name, avatar_url, country_flag, current_level, is_online)")
          .order("total_xp", { ascending: false }).limit(10);
        if (boardError) throw boardError;
        const mapped: LiveBoardRow[] = ((data ?? []) as any[]).map((r, i) => {
          const u = Array.isArray(r.users) ? r.users[0] : r.users;
          return {
            rank: i + 1,
            name: u?.display_name || "Learner",
            initials: lbInitials(u?.display_name || "L"),
            avatarUrl: u?.avatar_url ?? null,
            color: lbColor(r.user_id),
            flag: u?.country_flag || "un",
            level: u?.current_level || "A1",
            xp: Number(r.total_xp) || 0,
            isYou: r.user_id === uid,
            online: !!u?.is_online,
          };
        });
        const { data: mine, error: mineError } = await supabase.from("user_stats").select("total_xp").eq("user_id", uid).maybeSingle();
        if (mineError) throw mineError;
        const myXp = (mine as any)?.total_xp ?? 0;
        let myRank = mapped.findIndex((r) => r.isYou) + 1;
        if (!myRank) {
          const { count, error: rankError } = await supabase.from("user_stats")
            .select("user_id", { count: "exact", head: true }).gt("total_xp", myXp);
          if (rankError) throw rankError;
          myRank = (count ?? 0) + 1;
        }
        if (alive) { setRows(mapped); setMyPos({ rank: myRank, xp: myXp }); }
      } catch (e) {
        console.warn("Leaderboard load failed:", e);
        if (alive) setError(e instanceof Error ? e.message : "Could not load the leaderboard.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [live, uid]);

  if (live && rows && myPos) {
    const myIdx = rows.findIndex((r) => r.isYou);
    const meRow = myIdx >= 0 ? rows[myIdx] : null;
    const above = meRow && myIdx > 0 ? rows[myIdx - 1] : null;
    const leader = rows[0] ?? null;
    return (
      <Card className="p-5">
        <SectionHeader title="All-time XP ranking" />
        <p className="-mt-2 mb-3 text-[11px] font-semibold text-fg-ter">Your current global position: #{myPos.rank}</p>
        <div className="flex flex-col gap-2.5 text-sm">
          {(above ?? (!meRow ? leader : null)) && (
            <div className="flex items-center gap-3 rounded-xl bg-bg-sec/70 p-2.5">
              <span className="w-5 font-mono text-xs font-bold text-fg-ter">{(above ?? leader!).rank}</span>
              <Avatar initials={(above ?? leader!).initials} color={(above ?? leader!).color} size={30} src={(above ?? leader!).avatarUrl} />
              <span className="flex-1 truncate font-display text-[13px] font-bold text-fg-sec">{(above ?? leader!).name}</span>
              <span className="font-mono text-xs font-bold text-fg-ter">{(above ?? leader!).xp.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-faint p-2.5">
            <span className="w-5 font-mono text-xs font-bold text-primary">{myPos.rank}</span>
            <Avatar initials={meRow ? meRow.initials : "YOU"} color={meRow ? meRow.color : "#6C5CE7"} size={30} src={meRow?.avatarUrl ?? currentUserAvatarUrl} />
            <span className="flex-1 truncate font-display text-[13px] font-extrabold text-primary">You</span>
            <span className="font-mono text-xs font-bold text-primary">{myPos.xp.toLocaleString()}</span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-fg-ter">
            <Trophy className="size-3.5 text-gold" />
            {above
              ? `${(above.xp - myPos.xp).toLocaleString()} XP needed to pass ${above.name.split(" ")[0]}`
              : myPos.rank === 1
                ? "You currently have the highest recorded total XP."
                : leader
                  ? `${(leader.xp - myPos.xp).toLocaleString()} XP behind ${leader.name.split(" ")[0]}`
                  : "Earn XP from saved learning activity to appear here."}
          </p>
        </div>
      </Card>
    );
  }

  if (live && error) return (
    <Card className="p-5" role="alert">
      <SectionHeader title="All-time XP ranking" />
      <p className="text-sm text-fg-sec">The real leaderboard could not be loaded: {error}</p>
    </Card>
  );
  if (live && (loading || !rows || !myPos)) return (
    <Card className="flex items-center gap-3 p-5"><span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /><p className="text-sm font-semibold text-fg-sec">Loading the real leaderboard…</p></Card>
  );
  return (
    <Card className="p-5">
      <SectionHeader title="All-time XP ranking" />
      <p className="text-sm leading-relaxed text-fg-sec">A real leaderboard needs a signed-in Supabase account. Sample rankings are hidden so they aren't mistaken for live results.</p>
    </Card>
  );
}

/* ─────────── BADGES ─────────── */
function BadgeTile({ b, earned, i }: { b: BadgeDef; earned: boolean; i: number }) {
  const r = RARITY_STYLES[b.rarity];
  const { pushToast } = useApp();
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-10px" }} transition={{ delay: (i % 5) * 0.05, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -4 }}
      onClick={() => pushToast({
        title: b.name,
        desc: earned ? "This badge is recorded on your account." : b.desc,
        icon: b.icon, tone: earned ? "gold" : b.rarity === "Legendary" ? "gold" : "primary",
      })}
      className={cn(
        "relative flex cursor-pointer flex-col items-center gap-2 rounded-3xl border p-4 text-center transition",
        earned ? "border-border bg-card shadow-card" : "border-border/70 bg-card/50",
        !earned && "opacity-80"
      )}
    >
      {b.rarity === "Legendary" && earned && (
        <span className="absolute -inset-px rounded-3xl bg-gradient-to-br from-gold/40 via-transparent to-orange/40 opacity-60" />
      )}
      <span className={cn(
        "relative grid size-14 place-items-center rounded-2xl ring-2",
        earned ? cn(r.bg, r.ring) : "bg-bg-sec ring-border grayscale",
        b.rarity === "Legendary" && !earned && "ring-gold/30"
      )}>
        <I k={b.icon} className={cn("size-6", earned ? r.text : "text-fg-ter")} />
        {!earned && <span className="absolute inset-0 grid place-items-center rounded-2xl bg-card/40" />}
      </span>
      <div className="relative">
        <p className={cn("font-display text-[11.5px] font-extrabold leading-tight", earned ? "text-fg" : "text-fg-sec")}>{b.name}</p>
        <p className={cn("mt-0.5 text-[9.5px] font-bold uppercase tracking-wider", r.text)}>{b.rarity}</p>
      </div>
      <p className="relative line-clamp-2 text-[10px] leading-relaxed text-fg-ter">{earned ? "Earned" : b.desc}</p>
    </motion.button>
  );
}

export { BadgeTile };

/* ─────────── MENU LIST ─────────── */
interface MenuItem {
  icon: typeof Target; label: string; value?: string; badge?: string; danger?: boolean;
  onTap?: () => void; toggle?: [boolean, () => void];
}

function MenuGroup({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div>
      <h3 className="mb-2 px-1 font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-fg-ter">{title}</h3>
      <Card className="divide-y divide-border/70 overflow-hidden p-0">
        {items.map((m) => (
          <button key={m.label} onClick={m.onTap} className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-bg-sec/50", m.onTap || m.toggle ? "cursor-pointer" : "cursor-default")}>
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", m.danger ? "bg-red/10 text-red" : "bg-primary-faint text-primary")}>
              <m.icon className="size-4" />
            </span>
            <span className={cn("flex-1 font-display text-[13.5px] font-bold", m.danger ? "text-red" : "text-fg")}>{m.label}</span>
            {m.badge && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-gold">{m.badge}</span>}
            {m.value && <span className="text-[12px] font-semibold text-fg-ter">{m.value}</span>}
            {m.toggle && (
              <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", m.toggle[0] ? "bg-primary" : "bg-border")}>
                <motion.span className="absolute top-0.5 size-6 rounded-full bg-white shadow" animate={{ left: m.toggle[0] ? 22 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
              </span>
            )}
            {!m.toggle && <ChevronRight className="size-4 shrink-0 text-fg-ter" />}
          </button>
        ))}
      </Card>
    </div>
  );
}

/* ─────────── PROFILE VIEW ─────────── */
export default function ProfileView() {
  const { earnedBadges, dark, toggleTheme, pushToast, user, signOut, openPage, setTab, setFlashcards } = useApp();
  const live = backendReady() && Boolean(getSessionUserId());
  const [armOut, setArmOut] = useState(false);
  const ordered = [...BADGES].sort((a, b) => Number(earnedBadges.includes(b.id)) - Number(earnedBadges.includes(a.id)));

  const shareInvite = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "LingoLive", text: "Practice a language with me on LingoLive!", url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        pushToast({ title: "Invite link copied", desc: "Share the LingoLive link with a friend.", icon: "handshake", tone: "green" });
        return;
      }
      pushToast({ title: "Invite link", desc: url, icon: "handshake", tone: "primary" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      pushToast({ title: "Share unavailable", desc: "Copy the app address from your browser to invite a friend.", icon: "handshake", tone: "red" });
    }
  };

  const groups: { title: string; items: MenuItem[] }[] = [
    {
      title: "Learning",
      items: [
        { icon: Target, label: "My goals", onTap: () => openPage("settings") },
        { icon: BarChart3, label: "Detailed statistics", onTap: () => openPage("stats") },
        { icon: Award, label: "Achievements", onTap: () => openPage("achievements") },
        { icon: PenLine, label: "My corrections", onTap: () => setTab("chat") },
        { icon: Bookmark, label: "Review vocabulary", onTap: () => setFlashcards(true) },
      ],
    },
    {
      title: "Account",
      items: [
        { icon: Gem, label: "Subscription", badge: live ? user.tier : undefined, onTap: () => openPage("subscription") },
        { icon: Settings, label: "Settings", onTap: () => openPage("settings") },
        { icon: ShieldAlert, label: "Privacy & safety", onTap: () => openPage("settings") },
        { icon: Bell, label: "Notifications", onTap: () => openPage("notifications") },
      ],
    },
    {
      title: "Other",
      items: [
        { icon: dark ? Moon : Sun, label: "Dark mode", toggle: [dark, toggleTheme] },
        { icon: Languages, label: "App language", value: "English only in this build" },
        { icon: Share2, label: "Invite friends", badge: "Share link", onTap: () => { void shareInvite(); } },
        { icon: HelpCircle, label: "Help & support", onTap: () => pushToast({ title: "Support contact not configured", desc: "No support email or help center is connected in this build.", icon: "chat", tone: "primary" }) },
        {
          icon: LogOut, label: armOut ? "Tap again to sign out" : "Sign out", danger: true,
          onTap: () => { if (!armOut) setArmOut(true); else { setArmOut(false); signOut(); } },
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      {!live && <Card className="border-gold/25 bg-gold/5 p-4 text-sm leading-relaxed text-fg-sec">Account profile details, statistics, activity, rankings and achievements are hidden until you sign in to a connected Supabase project.</Card>}
      <ProfileHeader live={live} onEdit={() => openPage("edit-profile")} />
      <StatsGrid live={live} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <LevelCard live={live} />
          <CEFRCard live={live} />
          {live && <Card className="p-5"><SectionHeader title="Activity history" /><p className="text-sm leading-relaxed text-fg-sec">Your saved XP activity is available in Detailed statistics.</p><Button variant="soft" size="sm" className="mt-3" onClick={() => openPage("stats")}>Open statistics</Button></Card>}
        </div>
        <div className="flex flex-col gap-6">
          {live && <Card className="p-5"><SectionHeader title="Skill assessments" /><p className="text-sm leading-relaxed text-fg-sec">No scored skill assessment is saved to your account yet. The app will show results here after an assessment is implemented.</p></Card>}
          <BoardSnapshot />
          {/* preferences */}
          <Card className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary-faint text-primary">
                {dark ? <Moon className="size-5" /> : <Sun className="size-5" />}
              </span>
              <div>
                <p className="font-display text-sm font-extrabold text-fg">{dark ? "Dark mode" : "Light mode"}</p>
                <p className="text-[11px] text-fg-ter">Easier on the eyes at night</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={cn("relative h-7 w-12 cursor-pointer rounded-full transition-colors", dark ? "bg-primary" : "bg-border")}
            >
              <motion.span
                layout
                className="absolute top-0.5 size-6 rounded-full bg-white shadow"
                animate={{ left: dark ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </Card>
        </div>
      </div>

      {live ? (
        <section>
          <SectionHeader title={`Achievements · ${earnedBadges.length}/${BADGES.length}`} action="See all" onAction={() => openPage("achievements")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ordered.slice(0, 10).map((b, i) => <BadgeTile key={b.id} b={b} earned={earnedBadges.includes(b.id)} i={i} />)}
          </div>
        </section>
      ) : <Card className="p-4 text-sm text-fg-sec">Sign in to view badges earned on your account.</Card>}

      <section className="flex flex-col gap-5">
        {groups.map((g) => <MenuGroup key={g.title} title={g.title} items={g.items} />)}
      </section>
    </div>
  );
}
