import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Clock({ ms, active }: { ms: number; active: boolean }) {
  return (
    <div
      className={cn(
        "min-w-24 rounded-lg px-3 py-1.5 text-right font-mono text-2xl font-bold tabular-nums transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        active && ms < 20_000 && "bg-destructive text-white",
      )}
      aria-label="clock"
    >
      {formatClock(ms)}
    </div>
  );
}
