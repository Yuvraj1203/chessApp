"use client";

import { Chess } from "chess.js";
import { ArrowLeft, Flag, Handshake, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { toast } from "sonner";

import { Clock } from "@/components/match/clock";
import { MoveList } from "@/components/match/move-list";
import { useMatch } from "@/components/match/use-match";
import { ErrorState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { reasonLabel, resultLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useLive } from "@/providers/socket-provider";

export default function View() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { connected, queuedTournamentId, joinQueue, leaveQueue } = useLive();
  const { snap, error, clocks, send } = useMatch(id);

  const [viewIndex, setViewIndex] = useState<number | null>(null); // null = live
  const [pendingFen, setPendingFen] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [busy, setBusy] = useState(false);

  // Replay the move list with chess.js to get SANs and a FEN per position.
  const { sans, fens, lastMoves } = useMemo(() => {
    const out = { sans: [] as string[], fens: [] as string[], lastMoves: [] as ({ from: string; to: string } | null)[] };
    if (!snap) return out;
    const full = new Chess();
    if (snap.pgn) {
      try {
        full.loadPgn(snap.pgn);
      } catch {
        /* malformed pgn: show nothing */
      }
    }
    const replay = new Chess();
    out.fens.push(replay.fen());
    out.lastMoves.push(null);
    for (const m of full.history({ verbose: true })) {
      replay.move(m.san);
      out.sans.push(m.san);
      out.fens.push(replay.fen());
      out.lastMoves.push({ from: m.from, to: m.to });
    }
    return out;
  }, [snap]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={error} title="Cannot open this match" />
      </div>
    );
  }
  if (!snap) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="h-80 w-full" />
        {!connected && (
          <p className="text-sm text-muted-foreground lg:col-span-2">Connecting to the live server…</p>
        )}
      </div>
    );
  }

  const myColor = snap.white.id === user?.id ? "white" : snap.black.id === user?.id ? "black" : null;
  const isPlayer = myColor !== null;
  const orientation = myColor ?? "white";
  const live = snap.status === "active";
  const shownIndex = viewIndex ?? sans.length;
  const atLive = shownIndex >= sans.length;
  const boardFen = atLive ? (pendingFen ?? snap.fen) : fens[shownIndex];
  const myTurn = live && isPlayer && snap.turn === myColor;
  const top = orientation === "white" ? snap.black : snap.white;
  const bottom = orientation === "white" ? snap.white : snap.black;
  const topColor = orientation === "white" ? "black" : "white";
  const bottomColor = orientation;
  const last = lastMoves[Math.min(shownIndex, lastMoves.length - 1)];

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (last) {
    squareStyles[last.from] = { background: "rgba(255,122,10,0.35)" };
    squareStyles[last.to] = { background: "rgba(255,122,10,0.55)" };
  }

  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare || !myTurn || !atLive) return false;
    // Local legality check only for instant feedback; the server re-validates.
    const chess = new Chess(snap!.fen);
    const piece = chess.get(sourceSquare as never);
    const promotion =
      piece?.type === "p" && (targetSquare[1] === "8" || targetSquare[1] === "1") ? "q" : undefined;
    try {
      chess.move({ from: sourceSquare, to: targetSquare, promotion });
    } catch {
      return false;
    }
    setPendingFen(chess.fen());
    send("match:move", { from: sourceSquare, to: targetSquare, promotion }).catch((e: Error) => {
      toast.error(e.message);
    }).finally(() => setPendingFen(null));
    return true;
  }

  async function act(event: string, payload?: Record<string, unknown>) {
    setBusy(true);
    try {
      await send(event, payload);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const searching = queuedTournamentId === snap.tournamentId;
  const outcome = !snap.result
    ? null
    : snap.result === "draw"
      ? "Draw"
      : myColor
        ? snap.result === myColor
          ? "You won!"
          : "You lost"
        : `${snap.result === "white" ? snap.white.name : snap.black.name} won`;

  return (
    <div className="space-y-4">
      <BackLink tournamentId={snap.tournamentId} />
      {!connected && (
        <Alert variant="destructive">
          <AlertTitle>Connection lost</AlertTitle>
          <AlertDescription>
            Reconnecting… your board and clocks will be restored automatically. The clock keeps
            running on the server.
          </AlertDescription>
        </Alert>
      )}
      {!live && (
        <Alert>
          <AlertTitle className="text-lg">
            {outcome} <span className="font-mono">{resultLabel(snap.result)}</span>
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            by {reasonLabel(snap.endReason)}
            {isPlayer && (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  variant={searching ? "outline" : "default"}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (searching) await leaveQueue(snap.tournamentId);
                      else await joinQueue(snap.tournamentId);
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Search />}
                  {searching ? "Cancel search" : "Find next opponent"}
                </Button>
                {searching && <span className="text-sm">Searching for an opponent…</span>}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <PlayerBar
            name={top.name}
            color={topColor}
            isMe={top.id === user?.id}
            ms={topColor === "white" ? clocks.white : clocks.black}
            toMove={live && snap.turn === topColor}
          />
          <div className="overflow-hidden rounded-lg border shadow-sm">
            <Chessboard
              options={{
                id: `board-${snap.matchId}`,
                position: boardFen,
                boardOrientation: orientation,
                allowDragging: myTurn && atLive,
                canDragPiece: ({ piece }) => piece.pieceType.startsWith(myColor === "white" ? "w" : "b"),
                onPieceDrop,
                squareStyles,
                darkSquareStyle: { backgroundColor: "#4a7aa6" },
                lightSquareStyle: { backgroundColor: "#eef0e4" },
                animationDurationInMs: 150,
              }}
            />
          </div>
          <PlayerBar
            name={bottom.name}
            color={bottomColor}
            isMe={bottom.id === user?.id}
            ms={bottomColor === "white" ? clocks.white : clocks.black}
            toMove={live && snap.turn === bottomColor}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Moves (PGN)</span>
                <span className="text-muted-foreground">{snap.timeControl}</span>
              </div>
              <MoveList
                sans={sans}
                pgn={snap.pgn}
                viewIndex={shownIndex}
                onSelect={(i) => setViewIndex(Math.max(0, Math.min(i, sans.length)))}
              />
              {!atLive && (
                <p className="text-xs text-muted-foreground">
                  Reviewing an earlier position — click “Live” to return.
                </p>
              )}
            </CardContent>
          </Card>

          {live && isPlayer && (
            <Card>
              <CardContent className="space-y-3 py-4">
                <p className="text-sm font-medium">
                  {myTurn ? "Your move" : "Waiting for your opponent…"}
                </p>
                {snap.drawOffer && snap.drawOffer !== myColor && (
                  <Alert>
                    <AlertTitle>Draw offered</AlertTitle>
                    <AlertDescription className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void act("match:draw:respond", { accept: true })}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("match:draw:respond", { accept: false })}>
                        Decline
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || snap.drawOffer === myColor}
                    onClick={() => void act("match:draw:offer")}
                  >
                    <Handshake /> {snap.drawOffer === myColor ? "Draw offered" : "Offer draw"}
                  </Button>
                  <Button variant="destructive" disabled={busy} onClick={() => setConfirmResign(true)}>
                    <Flag /> Resign
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {live && !isPlayer && (
            <p className="text-sm text-muted-foreground">You&apos;re spectating this live game (read-only).</p>
          )}
        </div>
      </div>

      <Dialog open={confirmResign} onOpenChange={setConfirmResign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resign this game?</DialogTitle>
            <DialogDescription>Your opponent will be awarded the win.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResign(false)}>
              Keep playing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmResign(false);
                void act("match:resign");
              }}
            >
              Resign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerBar({
  name,
  color,
  isMe,
  ms,
  toMove,
}: {
  name: string;
  color: "white" | "black";
  isMe: boolean;
  ms: number;
  toMove: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className={cn("size-4 rounded-full border", color === "white" ? "bg-white" : "bg-neutral-900")}
        />
        <span className="font-semibold">{name}</span>
        {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
        {toMove && <span className="size-2 animate-pulse rounded-full bg-emerald-500" title="to move" />}
      </div>
      <Clock ms={ms} active={toMove} />
    </div>
  );
}

function BackLink({ tournamentId }: { tournamentId?: string }) {
  return (
    <Link
      href={tournamentId ? `/tournaments/${tournamentId}` : "/tournaments"}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <ArrowLeft /> {tournamentId ? "Back to tournament" : "Tournaments"}
    </Link>
  );
}
