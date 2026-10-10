import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Check, Share2, XCircle } from "lucide-react";
import { cn } from "../utils/cn";
import { useApp } from "../store/store";
import { BADGES, RARITY_STYLES, type BadgeDef, type Rarity } from "../data/mock";
import { I, Button, Card } from "../components/ui";
import { PageShell } from "../components/layout";
import { backendReady, getSessionUserId } from "../lib/backend";

const RARITY_GRADIENT: Record<Rarity, string> = {
  Common: "from-[#9CA3AF] to-[#6B7280]",
  Rare: "from-[#74B9FF] to-[#0984E3]",
  Epic: "from-[#6C5CE7] to-[#A29BFE]",
  Legendary: "from-[#F8B500] to-[#E08600]",
};
const RARITY_GLOW: Record<Rarity, string> = {
  Common: "shadow-card",
  Rare: "shadow-[0_10px_30px_-8px_rgba(116,185,255,0.55)]",
  Epic: "shadow-[0_10px_30px_-8px_rgba(108,92,231,0.6)]",
  Legendary: "shadow-[0_10px_34px_-6px_rgba(248,181,0,0.65)]",
};
const FILTERS = [
  { id: "all", label: "All" }, { id: "speaking", label: "Speaking" },
  { id: "learning", label: "Learning" }, { id: "consistency", label: "Consistency" },
] as const;

function BadgeTileFull({ b, earned, i, onOpen }: { b: BadgeDef; earned: boolean; i: number; onOpen: (b: BadgeDef) => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -4, scale: 1.02 }} whileTap={{ scale: 0.96 }}
      onClick={() => onOpen(b)}
      className={cn(
        "relative flex cursor-pointer flex-col items-center rounded-3xl p-4 text-center transition",
        earned ? cn("bg-gradient-to-br text-white", RARITY_GRADIENT[b.rarity], RARITY_GLOW[b.rarity]) : "border border-border bg-card shadow-card",
      )}
    >
      {earned && <div className="absolute -right-4 -top-6 size-16 rounded-full bg-white/15 blur-lg" />}
      <span className={cn("relative grid size-16 place-items-center rounded-[22px]", earned ? "bg-white/20 ring-1 ring-white/30 backdrop-blur" : "bg-bg-sec")}>
        <I k={b.icon} className={cn("size-7", earned ? "text-white" : "text-fg-ter opacity-50")} />
        {!earned && <span className="absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-card ring-1 ring-border"><Lock className="size-3 text-fg-ter" /></span>}
      </span>
      <p className={cn("mt-3 font-display text-[12px] font-extrabold leading-tight", earned ? "text-white" : "text-fg-sec")}>{b.name}</p>
      <p className={cn("mt-1 text-[9.5px] font-bold uppercase tracking-wider", earned ? "text-white/75" : "text-fg-ter")}>{earned ? "Earned" : b.rarity}</p>
    </motion.button>
  );
}

function BadgeSheet({ badge, earned, onClose }: { badge: BadgeDef; earned: boolean; onClose: () => void }) {
  const { pushToast } = useApp();
  const rarity = RARITY_STYLES[badge.rarity];
  const share = async () => {
    const text = `I earned the ${badge.name} badge on LingoLive!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "LingoLive achievement", text, url: window.location.origin });
        pushToast({ title: "Achievement shared", desc: "Your device completed the share.", icon: "trophy", tone: "gold" });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
        pushToast({ title: "Achievement link copied", desc: "Share it anywhere you like.", icon: "trophy", tone: "gold" });
      } else {
        pushToast({ title: "Sharing unavailable", desc: "This browser has no share or clipboard support.", icon: "alert", tone: "red" });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") pushToast({ title: "Share failed", desc: error.message, icon: "alert", tone: "red" });
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: "60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "50%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] border-t border-border bg-card p-6 pb-8 shadow-lift sm:rounded-[32px] sm:border"
      >
        <button onClick={onClose} aria-label="Close badge details" className="absolute right-4 top-4 grid size-9 cursor-pointer place-items-center rounded-xl text-fg-sec hover:bg-bg-sec"><X className="size-5" /></button>
        <div className="mx-auto grid size-24 place-items-center rounded-[28px] bg-gradient-to-br from-primary to-cyan text-white shadow-lift"><I k={badge.icon} className="size-11" /></div>
        <p className={cn("mt-4 text-center font-display text-[10px] font-extrabold uppercase tracking-[0.28em]", rarity.text)}>{badge.rarity} badge</p>
        <h2 className="mt-1 text-center font-display text-2xl font-extrabold tracking-tight text-fg">{badge.name}</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-center text-sm leading-relaxed text-fg-sec">{badge.desc}</p>
        {earned ? (
          <div className="mt-5 flex flex-col items-center gap-4">
            <span className="flex items-center gap-1.5 rounded-full bg-green/12 px-3 py-1.5 text-xs font-bold text-green"><Check className="size-3.5" strokeWidth={3} /> Earned on your account</span>
            <Button className="w-full" onClick={() => void share()}><Share2 className="size-4.5" /> Share achievement</Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-2xl bg-bg-sec p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-fg-ter">Requirement</p>
              <p className="mt-1.5 text-sm font-bold text-fg">{badge.desc}</p>
              <p className="mt-2 text-xs leading-relaxed text-fg-sec">Progress and XP cannot be claimed manually. This badge will appear as earned only after its criteria are recorded by the app.</p>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function AchievementsPage() {
  const { earnedBadges } = useApp();
  const live = backendReady() && Boolean(getSessionUserId());
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<BadgeDef | null>(null);
  const earnedCount = live ? BADGES.filter((badge) => earnedBadges.includes(badge.id)).length : 0;
  const list = BADGES.filter((badge) => filter === "all" || badge.category === filter)
    .sort((a, b) => Number(earnedBadges.includes(b.id)) - Number(earnedBadges.includes(a.id)));
  const pct = Math.round((earnedCount / BADGES.length) * 100);

  return (
    <PageShell title="Achievements" sub={live ? `${earnedCount} of ${BADGES.length} badges recorded` : "Sign in to view account badges"}>
      {!live ? (
        <Card className="p-5 text-sm leading-relaxed text-fg-sec">Sample badge progress is not shown. Sign in to a connected Supabase account to view badges recorded on your profile.</Card>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4 rounded-3xl border border-gold/30 bg-gradient-to-r from-gold/12 via-card to-card p-5">
            <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold to-orange text-white shadow-lift"><I k="trophy" className="size-6" /></span>
            <div className="flex-1">
              <div className="flex justify-between text-[11px] font-bold"><span className="text-fg-sec">Recorded badges</span><span className="font-mono text-gold">{pct}%</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-sec"><motion.div className="h-full rounded-full bg-gradient-to-r from-gold to-orange" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} /></div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {FILTERS.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={cn("shrink-0 cursor-pointer rounded-full border px-4 py-2 font-display text-[12.5px] font-bold transition", filter === item.id ? "border-primary bg-primary text-white shadow-lift" : "border-border bg-card text-fg-sec hover:border-primary/50")}>{item.label}</button>)}
          </div>

          {list.length === 0 && <div className="flex flex-col items-center gap-2 py-14 text-center"><XCircle className="size-8 text-fg-ter" /><p className="font-display text-sm font-bold text-fg">No badges in this category</p></div>}
          {earnedCount === 0 && <Card className="p-4 text-sm leading-relaxed text-fg-sec">No badge has been recorded for this account yet. Badge criteria are shown for reference; unsupported criteria cannot be claimed from this screen.</Card>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">{list.map((badge, index) => <BadgeTileFull key={badge.id} b={badge} earned={earnedBadges.includes(badge.id)} i={index} onOpen={setOpen} />)}</AnimatePresence>
          </div>
        </div>
      )}
      <AnimatePresence>{open && live && <BadgeSheet badge={open} earned={earnedBadges.includes(open.id)} onClose={() => setOpen(null)} />}</AnimatePresence>
    </PageShell>
  );
}
