import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TournamentStatus } from "@/lib/types";

const STYLES: Record<TournamentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-emerald-100 text-emerald-800",
  ongoing: "bg-accent text-accent-foreground",
  completed: "bg-primary text-primary-foreground",
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <Badge className={cn("capitalize", STYLES[status])} variant="secondary">
      {status}
    </Badge>
  );
}
