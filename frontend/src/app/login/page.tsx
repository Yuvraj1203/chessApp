"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import type { AuthUser, MeResponse } from "@/lib/types";
import { ME_KEY } from "@/providers/auth-provider";

const DEMO = [
  { label: "Coach", email: "coach@kingdomofchess.com" },
  { label: "Aarav", email: "aarav@kingdomofchess.com" },
  { label: "Diya", email: "diya@kingdomofchess.com" },
];

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { user } = await post<{ user: AuthUser }>("/auth/login", { email, password });
      qc.setQueryData<MeResponse>(ME_KEY, { user, activeMatchId: null });
      qc.invalidateQueries({ queryKey: ME_KEY });
      router.replace("/tournaments");
    } catch (err) {
      setError(err as Error);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Crown className="size-9 text-accent" />
          <CardTitle className="text-2xl text-primary">Kingdom of Chess</CardTitle>
          <CardDescription>Sign in to join a tournament, live.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorState error={error} title="Could not sign in" />}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </form>
          <div className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
            Demo accounts (password <code className="font-mono">Password123!</code>)
            <div className="mt-2 flex justify-center gap-2">
              {DEMO.map((d) => (
                <Button
                  key={d.email}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword("Password123!");
                  }}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
