"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const RUTAS_SIN_GATE = ["/login", "/vincular-perfil", "/recuperar-clave"];

export function ClaimPerfilGate({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, jugadorId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const debeVincular =
    !loading &&
    Boolean(user) &&
    !isAdmin &&
    !jugadorId &&
    !RUTAS_SIN_GATE.includes(pathname);

  useEffect(() => {
    if (debeVincular) {
      router.replace("/vincular-perfil");
    }
  }, [debeVincular, router]);

  if (loading && !RUTAS_SIN_GATE.includes(pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-sm text-foreground/50">Cargando...</p>
      </div>
    );
  }

  if (debeVincular) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-sm text-foreground/50">Vinculá tu perfil...</p>
      </div>
    );
  }

  return children;
}
