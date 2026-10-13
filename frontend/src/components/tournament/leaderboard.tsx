"use client";

import { Crown } from "lucide-react";

import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPoints } from "@/lib/format";
import { useLeaderboard } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

export function Leaderboard({ tournamentId, winnerId }: { tournamentId: string; winnerId?: string }) {
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useLeaderboard(tournamentId);

  if (isPending) return <RowsSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} title="Could not load leaderboard" />;
  if (data.length === 0) {
    return (
      <EmptyState
        title="No players yet"
        hint="The leaderboard fills up as soon as players join and finish games."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead className="text-right">P</TableHead>
            <TableHead className="text-right">W</TableHead>
            <TableHead className="text-right">D</TableHead>
            <TableHead className="text-right">L</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="text-right" title="Sonneborn-Berger tiebreak">
              SB
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.userId} className={cn(r.userId === user?.id && "bg-accent/10 font-medium")}>
              <TableCell className="font-semibold">{r.rank}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  {r.userId === winnerId && <Crown className="size-4 text-accent" />}
                  {r.name}
                  {r.userId === user?.id && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right">{r.played}</TableCell>
              <TableCell className="text-right">{r.wins}</TableCell>
              <TableCell className="text-right">{r.draws}</TableCell>
              <TableCell className="text-right">{r.losses}</TableCell>
              <TableCell className="text-right text-base font-bold text-primary">
                {formatPoints(r.points)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatPoints(r.tiebreak)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Win = 1, draw = ½, loss = 0. Ties are broken by wins, then Sonneborn-Berger (SB).
      </p>
    </div>
  );
}
