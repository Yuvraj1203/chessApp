"use client";

import { Crown, LogOut, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useLive } from "@/providers/socket-provider";

export function Navbar() {
  const { user, activeMatchId, logout } = useAuth();
  const { connected } = useLive();
  const pathname = usePathname();

  const links = [
    { href: "/tournaments", label: "Tournaments" },
    ...(user?.role === "student"
      ? [{ href: "/schedule", label: "My games & schedule" }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b bg-primary text-primary-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/tournaments" className="flex items-center gap-2 font-bold">
          <Crown className="size-5 text-accent" />
          <span className="hidden sm:inline">Kingdom of Chess</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-white/10",
                pathname.startsWith(l.href) && "bg-white/15 font-semibold",
              )}
            >
              {l.label}
            </Link>
          ))}
          {activeMatchId && !pathname.startsWith("/matches/") && (
            <Link
              href={`/matches/${activeMatchId}`}
              className="ml-1 animate-pulse rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
            >
              Resume game
            </Link>
          )}
        </nav>
        <span
          title={connected ? "Live connection active" : "Live connection lost"}
          className="flex items-center gap-1 text-xs"
        >
          {connected ? (
            <Wifi className="size-4 text-emerald-300" />
          ) : (
            <WifiOff className="size-4 text-red-300" />
          )}
          <span className="hidden md:inline">{connected ? "Live" : "Offline"}</span>
        </span>
        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden text-right text-xs leading-tight sm:block">
              <div className="font-semibold">{user.name}</div>
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] capitalize">
                {user.role}
              </Badge>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Log out"
              className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
              onClick={() => void logout()}
            >
              <LogOut />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
