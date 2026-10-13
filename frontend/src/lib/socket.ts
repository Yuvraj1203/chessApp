import { io, type Socket } from "socket.io-client";

import { API_URL } from "./api";

let socket: Socket | null = null;

/** Single shared Socket.IO connection; authenticated by the httpOnly cookie. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { withCredentials: true, autoConnect: false });
  }
  return socket;
}

/** Emit an event and resolve with the server's `{ok,data,error}` ack. */
export function emitAck<T = unknown>(
  event: string,
  payload: unknown,
  timeoutMs = 8000,
): Promise<T> {
  const s = getSocket();
  return new Promise<T>((resolve, reject) => {
    if (!s.connected) {
      reject(new Error("Not connected to the live server"));
      return;
    }
    s.timeout(timeoutMs).emit(
      event,
      payload,
      (err: Error | null, res?: { ok: boolean; data?: T; error?: string }) => {
        if (err) return reject(new Error("The server did not respond in time"));
        if (!res?.ok) return reject(new Error(res?.error ?? "Request failed"));
        resolve(res.data as T);
      },
    );
  });
}
