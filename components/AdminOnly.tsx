"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";

/** Solo monta children si el usuario logueado tiene rol admin. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading || !isAdmin) return null;
  return <>{children}</>;
}
