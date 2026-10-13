"use client";

import Link from "next/link";

import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, reasonLabel, resultLabel } from "@/lib/format";
import { useTournamentMatches } from "@/lib/queries";
import { useAuth } from "@/providers/auth-provider";

export function MatchesList({ tournamentId }: { tournamentId: string }) {
  const { user } = useAuth();
  const { data, isPending, error, refetch } = useTournamentMatches(tournamentId);

  if (isPending) return <RowsSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} title="Could not load matches" />;
  if (data.length === 0) {
    return <EmptyState title="No matches yet" hint="Matches appear here as soon as players are paired." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>White</TableHead>
            <TableHead>Black</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Started</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((m) => {
            const canOpen =
              user?.role === "coach" || m.white.id === user?.id || m.black.id === user?.id;
            return (
              <TableRow key={m.id}>
                <TableCell className={m.result === "white" ? "font-bold" : ""}>{m.white.name}</TableCell>
                <TableCell className={m.result === "black" ? "font-bold" : ""}>{m.black.name}</TableCell>
                <TableCell>
                  {m.status === "active" ? (
                    <Badge className="animate-pulse bg-accent text-accent-foreground">Live</Badge>
                  ) : (
                    <span>
                      <span className="font-mono font-semibold">{resultLabel(m.result)}</span>{" "}
                      <span className="text-xs text-muted-foreground">{reasonLabel(m.endReason)}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(m.startedAt)}</TableCell>
                <TableCell className="text-right">
                  {canOpen && (
                    <Link
                      href={`/matches/${m.id}`}
                      className={buttonVariants({ variant: "outline", size: "xs" })}
                    >
                      {m.status === "active" ? (user?.role === "coach" ? "Spectate" : "Open") : "Review"}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
