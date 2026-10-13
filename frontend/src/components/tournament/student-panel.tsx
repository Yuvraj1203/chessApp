"use client";

import { Loader2, Search, Swords, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJoinTournament, useLeaderboard } from "@/lib/queries";
import type { TournamentDetail } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useLive } from "@/providers/socket-provider";
import { formatPoints } from "@/lib/format";

import { useState } from "react";

export function StudentPanel({ t }: { t: TournamentDetail }) {
  const { user, activeMatchId } = useAuth();
  const { connected, queuedTournamentId, joinQueue, leaveQueue } = useLive();
  const join = useJoinTournament();
  const board = useLeaderboard(t.id);
  const [busy, setBusy] = useState(false);

  const searching = queuedTournamentId === t.id;
  const me = board.data?.find((r) => r.userId === user?.id);
  const playable = t.status === "open" || t.status === "ongoing";

  async function toggleQueue() {
    setBusy(true);
    try {
      if (searching) await leaveQueue(t.id);
      else await joinQueue(t.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!t.joined) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            {t.status === "open"
              ? "Join this tournament to start playing."
              : t.status === "completed"
                ? "This tournament has finished."
                : "Joining is closed — the tournament has already started."}
          </p>
          {t.status === "open" && (
            <Button
              disabled={join.isPending}
              onClick={() =>
                join.mutate(t.id, {
                  onSuccess: () => toast.success(`Joined ${t.name}`),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {join.isPending && <Loader2 className="animate-spin" />}
              Join tournament
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activeMatchId && (
        <Alert>
          <Swords />
          <AlertTitle>You have a game in progress</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            Your clock is running.
            <Link href={`/matches/${activeMatchId}`} className={buttonVariants({ size: "sm" })}>
              Resume game
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-semibold">
              {me ? (
                <>
                  Your rank: <span className="text-primary">#{me.rank}</span> · {formatPoints(me.points)} pts
                </>
              ) : (
                "You're in!"
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {searching
                ? "Searching for an opponent… you'll be taken to the board automatically."
                : playable
                  ? "Ready for your next game?"
                  : "This tournament is not accepting games."}
            </p>
          </div>
          {playable && (
            <Button
              size="lg"
              variant={searching ? "outline" : "default"}
              disabled={busy || !connected || (!!activeMatchId && !searching)}
              onClick={() => void toggleQueue()}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : searching ? (
                <X />
              ) : (
                <Search />
              )}
              {searching ? "Cancel search" : "Find opponent"}
            </Button>
          )}
        </CardContent>
      </Card>
      {!connected && (
        <p className="text-xs text-destructive">
          Live connection lost — reconnecting. You can&apos;t queue until it&apos;s back.
        </p>
      )}
    </div>
  );
}
