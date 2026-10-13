"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { emitAck, getSocket } from "@/lib/socket";
import type { MatchSnapshot } from "@/lib/types";
import { useLive } from "@/providers/socket-provider";

export interface LiveMatch {
  snap: MatchSnapshot | null;
  error: Error | null;
  /** Remaining ms for each side, ticking locally between server snapshots. */
  clocks: { white: number; black: number };
  send: (event: string, payload?: Record<string, unknown>) => Promise<void>;
}

/**
 * Joins the match room and keeps the snapshot in sync with the server.
 * The server owns state and the clock; we only tick locally for display and
 * re-sync on every `match:state` / reconnect (which restores board + clock).
 */
export function useMatch(matchId: string): LiveMatch {
  const { connected } = useLive();
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [clocks, setClocks] = useState({ white: 0, black: 0 });
  const receivedAt = useRef(0);

  const apply = useCallback((s: MatchSnapshot) => {
    receivedAt.current = performance.now();
    setSnap(s);
    setClocks({ white: s.whiteMs, black: s.blackMs });
  }, []);

  useEffect(() => {
    if (!connected) return;
    const socket = getSocket();
    const onState = (s: MatchSnapshot) => s.matchId === matchId && apply(s);
    socket.on("match:state", onState);
    socket.on("match:ended", onState);

    // (Re)join on mount and on every reconnect.
    emitAck<MatchSnapshot>("match:join", { matchId })
      .then((s) => {
        setError(null);
        apply(s);
      })
      .catch((e: Error) => setError(e));

    return () => {
      socket.off("match:state", onState);
      socket.off("match:ended", onState);
      if (socket.connected) void emitAck("match:leave", { matchId }).catch(() => undefined);
    };
  }, [matchId, connected, apply]);

  // Local ticking for the running side.
  useEffect(() => {
    if (!snap?.running) return;
    const id = setInterval(() => {
      const elapsed = performance.now() - receivedAt.current;
      setClocks({
        white: Math.max(0, snap.whiteMs - (snap.turn === "white" ? elapsed : 0)),
        black: Math.max(0, snap.blackMs - (snap.turn === "black" ? elapsed : 0)),
      });
    }, 100);
    return () => clearInterval(id);
  }, [snap]);

  const send = useCallback(
    async (event: string, payload: Record<string, unknown> = {}) => {
      await emitAck(event, { matchId, ...payload });
    },
    [matchId],
  );

  return { snap, error, clocks, send };
}
