"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";

import { ApiError, api, post } from "@/lib/api";
import type { AuthUser, MeResponse } from "@/lib/types";

interface AuthState {
  user: AuthUser | null;
  activeMatchId: string | null;
  isLoading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const ME_KEY = ["me"] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api<MeResponse>("/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null; // logged out
        throw e;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  const logout = useCallback(async () => {
    try {
      await post("/auth/logout");
    } finally {
      qc.clear();
      router.replace("/login");
    }
  }, [qc, router]);

  const value = useMemo<AuthState>(
    () => ({
      user: me.data?.user ?? null,
      activeMatchId: me.data?.activeMatchId ?? null,
      isLoading: me.isPending,
      error: me.error,
      logout,
    }),
    [me.data, me.isPending, me.error, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
