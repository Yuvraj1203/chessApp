"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/providers/auth-provider";
import type { Role } from "@/lib/types";

/** Renders children only for `role`; anyone else is redirected away. */
export function RoleGate({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = user?.role === role;

  useEffect(() => {
    if (user && !allowed) router.replace("/tournaments");
  }, [user, allowed, router]);

  return allowed ? <>{children}</> : null;
}
