"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
        <p className="mx-auto max-w-5xl rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
          Cargando...
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
        <p className="mx-auto max-w-5xl rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
          Acceso restringido al equipo de organización.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
