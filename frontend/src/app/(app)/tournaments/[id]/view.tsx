"use client";

import { ArrowLeft, CalendarDays, Clock, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Leaderboard } from "@/components/tournament/leaderboard";
import { MatchesList } from "@/components/tournament/matches-list";
import {
  CoachControls,
  ParticipantsPanel,
  StatsCards,
} from "@/components/tournament/coach-panel";
import { StudentPanel } from "@/components/tournament/student-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useTournament } from "@/lib/queries";
import { emitAck, getSocket } from "@/lib/socket";
import { useAuth } from "@/providers/auth-provider";
import { useLive } from "@/providers/socket-provider";

export default function View() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { connected } = useLive();
  const { data: t, isPending, error, refetch } = useTournament(id);
  const isCoach = user?.role === "coach";

  // Live updates: the server pushes `tournament:updated` to everyone watching.
  useEffect(() => {
    if (!connected) return;
    void emitAck("tournament:watch", { tournamentId: id }).catch(() => undefined);
    return () => {
      if (getSocket().connected) void emitAck("tournament:unwatch", { tournamentId: id }).catch(() => undefined);
    };
  }, [id, connected]);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState
          error={error}
          onRetry={error instanceof ApiError && error.status === 404 ? undefined : () => void refetch()}
          title={error instanceof ApiError && error.status === 404 ? "Tournament not found" : "Could not load tournament"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-primary">{t.name}</h1>
          <StatusBadge status={t.status} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" /> {t.timeControl}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4" /> {formatDateTime(t.startsAt)}
          </span>
          <span>{t.allowRematch ? "Rematches allowed" : "Round robin — everyone plays everyone once"}</span>
        </div>
      </div>

      {t.status === "completed" && (
        <div className="flex items-center gap-3 rounded-xl bg-primary p-4 text-primary-foreground">
          <Trophy className="size-8 text-accent" />
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">Tournament winner</p>
            <p className="text-xl font-bold">{t.winner?.name ?? "No games were played"}</p>
          </div>
        </div>
      )}

      {isCoach ? <CoachControls t={t} /> : <StudentPanel t={t} />}
      {isCoach && <StatsCards id={t.id} />}

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard" className="pt-2">
          <Leaderboard tournamentId={t.id} winnerId={t.winner?.id} />
        </TabsContent>
        <TabsContent value="matches" className="pt-2">
          <MatchesList tournamentId={t.id} />
        </TabsContent>
        <TabsContent value="participants" className="pt-2">
          <ParticipantsPanel t={t} isCoach={isCoach} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> All tournaments
    </Link>
  );
}
