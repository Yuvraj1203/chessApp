"use client";

import { CalendarDays, Clock, Plus, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { TournamentFormDialog } from "@/components/tournament/tournament-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { useJoinTournament, useTournaments } from "@/lib/queries";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type Filter = "all" | TournamentStatus;

function TournamentCard({ t, isCoach }: { t: Tournament; isCoach: boolean }) {
  const join = useJoinTournament();
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">
            <Link href={`/tournaments/${t.id}`} className="hover:underline">
              {t.name}
            </Link>
          </CardTitle>
          <StatusBadge status={t.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        <div className="space-y-1.5 text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock className="size-4" /> {t.timeControl} · {t.allowRematch ? "rematches allowed" : "round robin"}
          </p>
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4" /> {formatDateTime(t.startsAt)}
          </p>
          <p className="flex items-center gap-2">
            <Users className="size-4" /> {t.participantCount} player{t.participantCount === 1 ? "" : "s"}
          </p>
          {t.winner && (
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Trophy className="size-4 text-accent" /> Winner: {t.winner.name}
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Link
            href={`/tournaments/${t.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {isCoach ? "Manage" : "View"}
          </Link>
          {!isCoach && t.joined && <Badge variant="secondary">Joined</Badge>}
          {!isCoach && !t.joined && t.status === "open" && (
            <Button
              size="sm"
              disabled={join.isPending}
              onClick={() =>
                join.mutate(t.id, {
                  onSuccess: () => toast.success(`Joined ${t.name}`),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {join.isPending ? "Joining…" : "Join"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function View() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const { data, isPending, error, refetch } = useTournaments();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

  const filters: Filter[] = isCoach
    ? ["all", "draft", "open", "ongoing", "completed"]
    : ["all", "open", "ongoing", "completed"];
  const shown = (data ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tournaments</h1>
          <p className="text-sm text-muted-foreground">
            {isCoach
              ? "Create and run tournaments. Opponents are paired automatically."
              : "Join an open tournament, then hit “Find opponent” to play live."}
          </p>
        </div>
        {isCoach && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New tournament
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          {filters.map((f) => (
            <TabsTrigger key={f} value={f} className="capitalize">
              {f}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} title="Could not load tournaments" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No tournaments yet" : `No ${filter} tournaments`}
          hint={
            isCoach
              ? "Create the first tournament to get started."
              : "Check back soon — your coach will open one shortly."
          }
          action={
            isCoach ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> New tournament
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <TournamentCard key={t.id} t={t} isCoach={isCoach} />
          ))}
        </div>
      )}

      {creating && <TournamentFormDialog open onOpenChange={setCreating} />}
    </div>
  );
}
