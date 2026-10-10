import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";

/* ─────────── WEEKLY GROUPED BAR CHART ─────────── */
export function WeeklyBarChart({ data }: { data: { day: string; lessons: number; speaking: number }[] }) {
  const maxL = Math.max(...data.map((d) => d.lessons));
  const maxS = Math.max(...data.map((d) => d.speaking));
  const H = 120;
  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: H + 26 }}>
        {data.map((d, i) => (
          <div key={d.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-[120px] items-end gap-1">
              <motion.div
                title={`${d.lessons} lessons`}
                className="w-3 rounded-full bg-gradient-to-t from-primary-strong to-primary group-hover:brightness-110 sm:w-4"
                initial={{ height: 0 }}
                whileInView={{ height: (d.lessons / maxL) * (H - 14) }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
              <motion.div
                title={`${d.speaking} min speaking`}
                className="w-3 rounded-full bg-gradient-to-t from-cyan to-[#6cf0e7] group-hover:brightness-110 sm:w-4"
                initial={{ height: 0 }}
                whileInView={{ height: (d.speaking / maxS) * (H - 14) }}
                viewport={{ once: true }}
                transition={{ delay: 0.12 + i * 0.06, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className={cn("text-[11px] font-semibold", d.day === "Sat" ? "text-primary" : "text-fg-ter")}>{d.day.slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] font-semibold text-fg-sec">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" /> Lessons</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-cyan" /> Speaking (min)</span>
      </div>
    </div>
  );
}

/* ─────────── SKILLS RADAR CHART ─────────── */
export function SkillsRadar({ skills, size = 260 }: { skills: { label: string; value: number }[]; size?: number }) {
  const n = skills.length;
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 44;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, f: number) => [cx + Math.cos(angle(i)) * R * f, cy + Math.sin(angle(i)) * R * f] as const;

  const valuePoly = useMemo(
    () => skills.map((s, i) => point(i, s.value / 100).join(",")).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skills, size]
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[300px]">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={Array.from({ length: n }, (_, i) => point(i, f).join(",")).join(" ")}
          fill="none" stroke="var(--border)" strokeWidth={f === 1 ? 1.5 : 1}
        />
      ))}
      {skills.map((s, i) => {
        const [x, y] = point(i, 1);
        const [lx, ly] = point(i, 1.22);
        return (
          <g key={s.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={10.5} fontWeight={700} fill="var(--fg-sec)" fontFamily="Inter">
              {s.label}
            </text>
          </g>
        );
      })}
      <motion.polygon
        points={valuePoly}
        fill="rgba(108,92,231,0.22)" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.4 }} whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {skills.map((s, i) => {
        const [x, y] = point(i, s.value / 100);
        return (
          <motion.circle
            key={s.label} cx={x} cy={y} r={4} fill="var(--cyan)" stroke="var(--card)" strokeWidth={2.5}
            initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 380, damping: 16 }}
          />
        );
      })}
    </svg>
  );
}

/* ─────────── ACTIVITY HEATMAP (12 weeks) ─────────── */
export function Heatmap({ className }: { className?: string }) {
  const weeks = 16, days = 7;
  const cells = useMemo(() => {
    // deterministic pseudo-random with a few empty days
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return Array.from({ length: weeks * days }, (_, i) => {
      const r = rand();
      const recent = i > weeks * days - 21 ? 0.35 : 0; // streak boost
      return Math.min(4, Math.floor(r * 4.4 + recent));
    });
  }, []);
  return (
    <div className={cn("overflow-x-auto no-scrollbar", className)}>
      <div className="grid grid-flow-col gap-[4px]" style={{ gridTemplateRows: `repeat(${days}, 1fr)` }}>
        {cells.map((v, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            transition={{ delay: (i % weeks) * 0.012 }}
            className="size-[13px] rounded-[4px]"
            style={{ background: `var(--heat-${v})` }}
            title={`${v * 12} XP`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-fg-ter">
        <span>Last 16 weeks</span>
        <span className="flex items-center gap-1.5">
          Less
          {[0, 1, 2, 3, 4].map((v) => <span key={v} className="size-[10px] rounded-[3px]" style={{ background: `var(--heat-${v})` }} />)}
          More
        </span>
      </div>
    </div>
  );
}

/* ─────────── CEFR TRACK ─────────── */
export function CEFRTrack({ current }: { current: string }) {
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const activeIdx = levels.indexOf(current);
  const colors = ["#2ED573", "#7BED9F", "#74B9FF", "#6C5CE7", "#E84393", "#F8B500"];
  return (
    <div>
      <div className="flex gap-1.5">
        {levels.map((lv, i) => (
          <motion.div
            key={lv}
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
            transition={{ delay: i * 0.07, duration: 0.5 }}
            className="relative h-2.5 flex-1 origin-left rounded-full"
            style={{ background: i <= activeIdx ? colors[i] : "var(--bg-sec)" }}
          />
        ))}
      </div>
      <div className="mt-2 flex">
        {levels.map((lv, i) => (
          <div key={lv} className="flex-1 text-center">
            <span className={cn(
              "font-display text-[11px] font-bold",
              i === activeIdx ? "rounded-md bg-primary px-1.5 py-0.5 text-white" : i < activeIdx ? "text-fg-sec" : "text-fg-ter"
            )}>
              {lv}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
