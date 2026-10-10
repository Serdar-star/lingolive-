import { supabase } from "./supabase";
import { localDateKey } from "./date";

export type ActivityDay = {
  dateKey: string;
  label: string;
  xp: number;
  lessons: number;
};

/** Real persisted XP/lesson activity, grouped by the learner's local calendar days. */
export async function getWeeklyActivity(userId: string, dayCount = 7): Promise<ActivityDay[]> {
  const count = Math.max(1, Math.min(31, Math.floor(dayCount)));
  const today = new Date();
  const dates = Array.from({ length: count }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - index)),
  );
  const firstDay = dates[0];
  const { data, error } = await supabase.from("xp_events")
    .select("amount, source, created_at")
    .eq("user_id", userId)
    .gte("created_at", firstDay.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const buckets = new Map(dates.map((date) => [localDateKey(date), { xp: 0, lessons: 0 }]));
  for (const event of data ?? []) {
    const bucket = buckets.get(localDateKey(new Date(event.created_at)));
    if (!bucket) continue;
    bucket.xp += Number(event.amount) || 0;
    if (event.source === "LESSON") bucket.lessons += 1;
  }
  return dates.map((date) => ({
    dateKey: localDateKey(date),
    label: date.toLocaleDateString(undefined, { weekday: "short" }),
    ...buckets.get(localDateKey(date))!,
  }));
}
