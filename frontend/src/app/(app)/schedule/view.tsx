"use client";

import { CalendarDays, Swords } from "lucide-react";
import Link from "next/link";

import { RoleGate } from "@/components/role-gate";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatPoints, reasonLabel } from "@/lib/format";
import { useLeaderboard, useMyMatches, useTournaments } from "@/lib/queries";
import type { Tournament } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

function ScheduleItem({ t }: { t: Tournament }) {
  const { user } = useAuth();
  const { data } = useLeaderboard(t.id);
  const me = data?.find((r) => r.userId === user?.id);
  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 hover:border-accent"
    >
      <div>
        <p className="font-semibold">{t.name}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" /> {formatDateTime(t.startsAt)} · {t.timeControl}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {me && (
          <Badge variant="secondary">
            Rank #{me.rank} · {formatPoints(me.points)} pts
          </Badge>
        )}
        <StatusBadge status={t.status} />
      </div>
    </Link>
  );
}

function SchedulePage() {
  const tournaments = useTournaments();
  const matches = useMyMatches();

  const upcoming = (tournaments.data ?? [])
    .filter((t) => t.joined && t.status !== "completed")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const active = matches.data?.find((m) => m.status === "active");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-primary">My games &amp; schedule</h1>

      {active && (
        <Card className="border-accent">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <Swords className="size-6 text-accent" />
              <div>
                <p className="font-semibold">Game in progress vs {active.opponent}</p>
                <p className="text-sm text-muted-foreground">{active.tournamentName}</p>
              </div>
            </div>
            <Link href={`/matches/${active.id}`} className={buttonVariants()}>
              Resume game
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming tournaments</h2>
        {tournaments.isPending ? (
          <RowsSkeleton rows={3} />
        ) : tournaments.error ? (
          <ErrorState error={tournaments.error} onRetry={() => void tournaments.refetch()} />
        ) : upcoming.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            hint="Join an open tournament and it will show up here."
            action={
              <Link href="/tournaments" className={buttonVariants({ size: "sm" })}>
                Browse tournaments
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((t) => (
              <ScheduleItem key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Match history</h2>
        {matches.isPending ? (
          <RowsSkeleton />
        ) : matches.error ? (
          <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
        ) : matches.data.length === 0 ? (
          <EmptyState title="No games yet" hint="Join a tournament and press “Find opponent”." />
        ) : (
          <Card>
            <CardHeader className="sr-only">
              <CardTitle>History</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Opponent</TableHead>
                    <TableHead>Colour</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.data.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">{formatDateTime(m.startedAt)}</TableCell>
                      <TableCell>{m.tournamentName}</TableCell>
                      <TableCell>{m.opponent}</TableCell>
                      <TableCell className="capitalize">{m.color}</TableCell>
                      <TableCell>
                        {m.status === "active" ? (
                          <Badge className="animate-pulse bg-accent text-accent-foreground">Live</Badge>
                        ) : (
                          <span
                            className={cn(
                              "font-semibold capitalize",
                              m.outcome === "win" && "text-emerald-700",
                              m.outcome === "loss" && "text-destructive",
                            )}
                          >
                            {m.outcome}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              ({reasonLabel(m.endReason)})
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/matches/${m.id}`}
                          className={buttonVariants({ variant: "outline", size: "xs" })}
                        >
                          {m.status === "active" ? "Open" : "Review"}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

export default function View() {
  return (
    <RoleGate role="student">
      <SchedulePage />
    </RoleGate>
  );
}
