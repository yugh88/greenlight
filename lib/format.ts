import type { Range } from "@/lib/schema";

export const DIFFICULTY_STYLE: Record<number, { text: string; bg: string; ring: string; bar: string }> = {
  1: { text: "text-emerald-300", bg: "bg-emerald-500/15", ring: "ring-emerald-500/40", bar: "bg-emerald-400" },
  2: { text: "text-lime-300", bg: "bg-lime-500/15", ring: "ring-lime-500/40", bar: "bg-lime-400" },
  3: { text: "text-yellow-300", bg: "bg-yellow-500/15", ring: "ring-yellow-500/40", bar: "bg-yellow-400" },
  4: { text: "text-orange-300", bg: "bg-orange-500/15", ring: "ring-orange-500/40", bar: "bg-orange-400" },
  5: { text: "text-rose-300", bg: "bg-rose-500/15", ring: "ring-rose-500/40", bar: "bg-rose-400" },
};

export const EVIDENCE_STYLE = {
  tested: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  sourced: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
  uncertain: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
} as const;

export const OWNER_STYLE = {
  agent: { label: "Agent", cls: "bg-violet-500/15 text-violet-300 ring-violet-500/40" },
  you: { label: "You", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/40" },
  provider: { label: "Provider", cls: "bg-zinc-500/20 text-zinc-300 ring-zinc-500/40" },
} as const;

const dash = "–";

export function fmtMinutes(r: Range) {
  const one = (m: number) => (m >= 120 ? `${+(m / 60).toFixed(1)} h` : `${m} min`);
  if (r.max >= 120) return r.min === r.max ? one(r.min) : `${+(r.min / 60).toFixed(1)}${dash}${+(r.max / 60).toFixed(1)} h`;
  return r.min === r.max ? one(r.min) : `${r.min}${dash}${r.max} min`;
}

export function fmtDays(r: Range) {
  if (r.max < 1) return "same day";
  if (r.min >= 14 && r.max >= 21) {
    const w = (d: number) => Math.round(d / 7);
    return `${w(r.min)}${dash}${w(r.max)} weeks`;
  }
  if (r.min === r.max) return `${r.min} day${r.min === 1 ? "" : "s"}`;
  if (r.min < 1 && r.max <= 1) return "within a day";
  return `${r.min < 1 ? "<1" : r.min}${dash}${r.max} days`;
}

/** Phase duration for the timeline (minutes → human). */
export function fmtSpan(minutes: Range) {
  const hi = minutes.max;
  if (hi < 120) return fmtMinutes(minutes);
  if (hi < 60 * 24) return `${+(minutes.min / 60).toFixed(1)}${dash}${+(hi / 60).toFixed(1)} h`;
  return fmtDays({ min: +(minutes.min / 1440).toFixed(1), max: +(hi / 1440).toFixed(1) });
}
