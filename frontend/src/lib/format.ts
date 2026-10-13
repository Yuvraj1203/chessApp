import type { EndReason, MatchResult } from "./types";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

/** DD/MM/YYYY (platform-wide format), in the viewer's timezone. */
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

/** DD/MM/YYYY, HH:mm TZ */
export const formatDateTime = (iso: string) =>
  `${formatDate(iso)}, ${timeFmt.format(new Date(iso))}`;

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) {
    const s = Math.floor(total / 1000);
    const tenths = Math.floor((total % 1000) / 100);
    return `0:0${s}.${tenths}`;
  }
  const secs = Math.ceil(total / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const formatPoints = (p: number) =>
  Number.isInteger(p) ? String(p) : p.toFixed(1);

const REASONS: Record<EndReason, string> = {
  checkmate: "checkmate",
  resignation: "resignation",
  timeout: "time out",
  stalemate: "stalemate",
  agreement: "agreement",
  repetition: "threefold repetition",
  fifty_moves: "50-move rule",
  insufficient_material: "insufficient material",
};
export const reasonLabel = (r: EndReason | null) => (r ? REASONS[r] : "");

export function resultLabel(r: MatchResult | null): string {
  if (r === "white") return "1-0";
  if (r === "black") return "0-1";
  if (r === "draw") return "½-½";
  return "*";
}
