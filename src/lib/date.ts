/** Calendar-day keys in the learner's local timezone (not UTC). */
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localDateOffset(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return localDateKey(shifted);
}
