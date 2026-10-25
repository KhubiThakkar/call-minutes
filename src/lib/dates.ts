// All "today" values come from the server (`fn_today()`, backed by
// app_settings.timezone) — never computed from the browser's local clock —
// so day boundaries stay correct for the one shared timezone regardless of
// where either partner is travelling.

function parseDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** Monday of the ISO week containing `dateOnly`. */
export function weekStartOf(dateOnly: string): string {
  const date = parseDateOnly(dateOnly);
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // Mon=1..Sun=7
  return addDaysToDateOnly(dateOnly, -(isoDow - 1));
}

export function formatDisplayDate(dateOnly: string): string {
  return parseDateOnly(dateOnly).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Whole days between two date-only strings (b - a). */
export function diffDaysDateOnly(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDateOnly(b).getTime() - parseDateOnly(a).getTime()) / msPerDay);
}

