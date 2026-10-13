"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "./auth-provider";
import { SocketProvider } from "./socket-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SocketProvider>{children}</SocketProvider>
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
