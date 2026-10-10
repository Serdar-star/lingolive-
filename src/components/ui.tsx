import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  BookOpen, GraduationCap, Mic, AudioLines, Sprout, Leaf, Plane, Briefcase, Hand, Hash,
  Palette, Users, Clock, Gem, ShoppingCart, UtensilsCrossed, Bus, CloudSun, Home, Crown,
  BedDouble, Map, Presentation, Mail, Video, Phone, Globe, Pencil, NotebookPen, Zap,
  Flame, FlameKindling, Sunrise, Moon, Handshake, UserRoundCheck, Star, PenLine, Heart,
  Drama, Trophy, Clapperboard, MessageCircle, Check, X, Loader2, Sparkles, LucideIcon,
  Newspaper, Link2, Repeat2, Paperclip, MessageCircleQuestion, Code, Stethoscope, TrendingUp,
  Timer, CalendarDays, BellRing,
} from "lucide-react";
import { cn } from "../utils/cn";
import { LEVEL_COLORS, type CEFR, type League } from "../data/mock";

/* ─────────── ICON REGISTRY ─────────── */
const ICONS: Record<string, LucideIcon> = {
  book: BookOpen, cap: GraduationCap, mic: Mic, rooms: AudioLines, sprout: Sprout, leaf: Leaf,
  plane: Plane, brief: Briefcase, wave: Hand, hash: Hash, palette: Palette, users: Users,
  clock: Clock, gem: Gem, cart: ShoppingCart, food: UtensilsCrossed, bus: Bus, cloud: CloudSun,
  home: Home, crown: Crown, hotel: BedDouble, map: Map, present: Presentation, mail: Mail,
  video: Video, call10: Phone, globe: Globe, pencil: Pencil, note: NotebookPen, zap: Zap,
  flame: Flame, flame2: FlameKindling, flame3: Flame, sunrise: Sunrise, moon: Moon,
  handshake: Handshake, teacher: UserRoundCheck, star: Star, pen: PenLine, heart: Heart,
  masks: Drama, trophy: Trophy, film: Clapperboard, chat: MessageCircle, sparkles: Sparkles,
  news: Newspaper, link: Link2, repeat: Repeat2, clip: Paperclip, ask: MessageCircleQuestion,
  code: Code, stetho: Stethoscope, trending: TrendingUp, timer: Timer, calendar: CalendarDays,
  bellring: BellRing,
};
export function I({ k, className, strokeWidth = 2.2 }: { k: string; className?: string; strokeWidth?: number }) {
  const Cmp = ICONS[k] ?? Sparkles;
  return <Cmp className={className} strokeWidth={strokeWidth} />;
}

/* ─────────── FLAG (circle flag CDN) ─────────── */
export function Flag({ code, size = 20, className }: { code: string; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  if (err) return <Globe style={{ width: size, height: size }} className={cn("text-fg-ter", className)} />;
  return (
    <img
      src={`https://hatscripts.github.io/circle-flags/flags/${code}.svg`}
      width={size} height={size} alt={code} loading="lazy"
      onError={() => setErr(true)}
      className={cn("rounded-full object-cover ring-1 ring-black/10", className)}
      style={{ width: size, height: size }}
    />
  );
}

/* ─────────── BUTTON ─────────── */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const variants = {
    primary: "bg-gradient-to-br from-primary to-primary-strong text-white shadow-lift hover:brightness-110",
    secondary: "bg-gradient-to-br from-cyan to-[#009fa0] text-white shadow-glow-cyan hover:brightness-110",
    outline: "border-2 border-primary/60 text-primary hover:bg-primary-faint bg-transparent",
    ghost: "text-primary hover:bg-primary-faint bg-transparent",
    soft: "bg-primary-faint text-primary hover:bg-primary-soft",
    danger: "bg-red text-white hover:brightness-110",
  };
  const sizes = {
    sm: "h-9 px-3.5 text-[13px] rounded-xl gap-1.5",
    md: "h-11 px-5 text-sm rounded-xl gap-2",
    lg: "h-14 px-7 text-base rounded-2xl gap-2.5",
    icon: "h-10 w-10 rounded-xl justify-center",
  };
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-display font-bold tracking-tight select-none",
        "transition-[filter,background,color] duration-150 disabled:opacity-45 disabled:pointer-events-none cursor-pointer",
        variants[variant], sizes[size], className
      )}
      {...(rest as object)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : children}
    </motion.button>
  );
}

/* ─────────── CARD ─────────── */
interface CardProps extends HTMLAttributes<HTMLDivElement> { hover?: boolean }
export function Card({ className, hover, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card shadow-card",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ─────────── AVATAR ─────────── */
export function Avatar({
  initials, color, size = 40, online, verified, ring, className, src,
}: {
  initials: string; color: string; size?: number; online?: boolean; verified?: boolean; ring?: boolean; className?: string; src?: string | null;
}) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full font-display font-bold text-white",
          ring && "ring-2 ring-white/60"
        )}
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}bb 60%, ${color}88)`,
          fontSize: size * 0.36,
        }}
      >
        {initials}
        {src && <img src={src} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-card",
            online ? "bg-green" : "bg-fg-ter"
          )}
          style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
        />
      )}
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-[16px] place-items-center rounded-full border-2 border-card bg-blue">
          <Check className="size-2.5 text-white" strokeWidth={4} />
        </span>
      )}
    </div>
  );
}

/* ─────────── BADGES / CHIPS ─────────── */
export function LevelBadge({ level, className }: { level: CEFR; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold text-white", className)}
      style={{ background: `linear-gradient(135deg, ${LEVEL_COLORS[level]}, ${LEVEL_COLORS[level]}cc)` }}
    >
      {level}
    </span>
  );
}
export function LiveChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-red px-2.5 py-1 font-display text-[10px] font-bold tracking-wider text-white", className)}>
      <span className="size-1.5 rounded-full bg-white anim-pulse-dot" /> LIVE
    </span>
  );
}
export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-bg-sec px-2.5 py-1 text-[11px] font-semibold text-fg-sec", className)}>
      {children}
    </span>
  );
}

/* ─────────── PROGRESS BAR ─────────── */
export function ProgressBar({
  value, className, barClass, h = 8, animate = true,
}: { value: number; className?: string; barClass?: string; h?: number; animate?: boolean }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-bg-sec", className)} style={{ height: h }}>
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-r from-primary to-cyan", barClass)}
        initial={animate ? { width: 0 } : false}
        whileInView={{ width: `${Math.min(100, value)}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* ─────────── CIRCULAR PROGRESS (SVG ring) ─────────── */
export function Ring({
  value, size = 120, stroke = 10, from = "#6C5CE7", to = "#00D2D3", track = "var(--ring-neutral)", children, className,
}: {
  value: number; size?: number; stroke?: number; from?: string; to?: string; track?: string; children?: ReactNode; className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c - (c * Math.min(100, value)) / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ─────────── STREAK FIRE ─────────── */
export function StreakFire({ count, size = "md" }: { count: number; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "size-4" : size === "lg" ? "size-8" : "size-5";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="relative inline-flex">
        <Flame className={cn(s, "text-orange anim-flicker")} fill="#FFA502" strokeWidth={1.5} />
      </span>
      <span className={cn("font-mono font-bold text-orange", size === "lg" ? "text-2xl" : "text-sm")}>{count}</span>
    </span>
  );
}

/* ─────────── XP CHIP ─────────── */
export function XPChip({ xp, className }: { xp: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 font-mono text-xs font-bold text-gold", className)}>
      <Zap className="size-3.5" fill="currentColor" strokeWidth={1} /> {xp.toLocaleString()} XP
    </span>
  );
}

/* ─────────── SECTION HEADER ─────────── */
export function SectionHeader({ title, action, onAction, className }: { title: string; action?: string; onAction?: () => void; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between", className)}>
      <h2 className="font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
      {action && (
        <button onClick={onAction} className="cursor-pointer font-display text-[13px] font-bold text-primary hover:opacity-80">
          {action}
        </button>
      )}
    </div>
  );
}

/* ─────────── COUNT-UP HOOK ─────────── */
export function useCountUp(target: number, duration = 1200) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);
  return { ref, v };
}
export function Num({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const { ref, v } = useCountUp(value);
  return (
    <span ref={ref} className={className}>
      {v.toLocaleString()}{suffix}
    </span>
  );
}

/* ─────────── WAVE BARS (voice/speaking) ─────────── */
export function WaveBars({ active = true, className, color = "bg-cyan" }: { active?: boolean; className?: string; color?: string }) {
  const durs = [0.7, 0.95, 0.6, 1.1, 0.8];
  return (
    <span className={cn("flex h-4 items-center gap-[3px]", className)}>
      {durs.map((d, i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full", color, active && "anim-wavebar")}
          style={{ height: 14, animationDuration: `${d}s`, transform: active ? undefined : "scaleY(0.25)", transformOrigin: "center" }}
        />
      ))}
    </span>
  );
}

/* ─────────── TOAST LAYER ─────────── */
export function ToastLayer({ toasts, dismiss }: { toasts: { id: number; title: string; desc?: string; icon?: string; tone?: string }[]; dismiss: (id: number) => void }) {
  const tones: Record<string, string> = {
    primary: "from-primary to-primary-strong",
    green: "from-green to-[#1db866]",
    gold: "from-gold to-orange",
    red: "from-red to-[#e05252]",
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[190] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ y: -60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-2 shadow-lift"
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white", tones[t.tone ?? "primary"])}>
              <I k={t.icon ?? "sparkles"} className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-fg">{t.title}</p>
              {t.desc && <p className="truncate text-xs text-fg-sec">{t.desc}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="grid size-7 cursor-pointer place-items-center rounded-lg text-fg-ter hover:bg-bg-sec">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─────────── XP FLOATER LAYER ─────────── */
export function XPFloaters({ events }: { events: { id: number; amount: number }[] }) {
  return (
    <div className="pointer-events-none fixed right-6 top-20 z-[195] flex flex-col items-end gap-1">
      <AnimatePresence>
        {events.slice(-4).map((e) => (
          <motion.span
            key={e.id}
            initial={{ opacity: 0, y: 14, scale: 0.7 }}
            animate={{ opacity: 1, y: -28, scale: 1 }}
            exit={{ opacity: 0, y: -56 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 font-mono text-sm font-bold text-white shadow-lift"
          >
            <Zap className="size-3.5" fill="currentColor" strokeWidth={1} /> +{e.amount} XP
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─────────── EMPTY STATE ─────────── */
export function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-3xl bg-primary-faint text-primary anim-floaty">
        <I k={icon} className="size-7" />
      </span>
      <h3 className="mt-1 font-display text-lg font-bold text-fg">{title}</h3>
      <p className="max-w-60 text-sm text-fg-sec">{sub}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ─────────── LEAGUE GEM ─────────── */
export function LeagueMark({ league, size = 18 }: { league: League; size?: number }) {
  const colors: Record<League, string> = { Bronze: "#CD7F32", Silver: "#B8BDC9", Gold: "#FFD700", Platinum: "#A29BFE", Diamond: "#74B9FF" };
  return <Gem style={{ width: size, height: size, color: colors[league] }} fill={colors[league]} strokeWidth={1.4} />;
}
