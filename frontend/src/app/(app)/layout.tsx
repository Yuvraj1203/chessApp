"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Navbar } from "@/components/navbar";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { post } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user && !error) {
      // Clear a stale cookie first, otherwise the proxy would bounce us back.
      void post("/auth/logout")
        .catch(() => undefined)
        .finally(() => router.replace("/login"));
    }
  }, [isLoading, user, error, router]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl p-6">
        <ErrorState error={error} title="Cannot load your session" />
      </div>
    );
  }
  if (isLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
