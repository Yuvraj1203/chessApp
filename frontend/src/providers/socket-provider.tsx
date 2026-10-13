"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { emitAck, getSocket } from "@/lib/socket";
import { ME_KEY, useAuth } from "./auth-provider";

interface SocketState {
  connected: boolean;
  /** Tournament the user is currently searching an opponent in, if any. */
  queuedTournamentId: string | null;
  joinQueue: (tournamentId: string) => Promise<void>;
  leaveQueue: (tournamentId: string) => Promise<void>;
}

const SocketContext = createContext<SocketState | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [queuedTournamentId, setQueued] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setQueued(null); // the server drops queue entries when we disconnect
    };
    const onConnectError = () => setConnected(false);
    const onQueueStatus = (p: { tournamentId: string; queued: boolean }) =>
      setQueued(p.queued ? p.tournamentId : null);
    const onMatchFound = (p: { matchId: string; opponent: { name: string } }) => {
      toast.success(`Opponent found: ${p.opponent.name}`);
      setQueued(null);
      qc.invalidateQueries({ queryKey: ME_KEY });
      router.push(`/matches/${p.matchId}`);
    };
    const onMatchEnded = () => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ["my-matches"] });
    };
    const onTournamentUpdated = (p: { tournamentId: string }) => {
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["tournament", p.tournamentId] });
      qc.invalidateQueries({ queryKey: ["leaderboard", p.tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament-matches", p.tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament-stats", p.tournamentId] });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("queue:status", onQueueStatus);
    socket.on("match:found", onMatchFound);
    socket.on("match:ended", onMatchEnded);
    socket.on("tournament:updated", onTournamentUpdated);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("queue:status", onQueueStatus);
      socket.off("match:found", onMatchFound);
      socket.off("match:ended", onMatchEnded);
      socket.off("tournament:updated", onTournamentUpdated);
      socket.disconnect();
      setConnected(false);
      setQueued(null);
    };
  }, [userId, qc, router]);

  const joinQueue = useCallback(async (tournamentId: string) => {
    await emitAck("queue:join", { tournamentId });
    setQueued(tournamentId);
  }, []);

  const leaveQueue = useCallback(async (tournamentId: string) => {
    await emitAck("queue:leave", { tournamentId });
    setQueued(null);
  }, []);

  const value = useMemo(
    () => ({ connected, queuedTournamentId, joinQueue, leaveQueue }),
    [connected, queuedTournamentId, joinQueue, leaveQueue],
  );
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useLive(): SocketState {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useLive must be used inside SocketProvider");
  return ctx;
}
