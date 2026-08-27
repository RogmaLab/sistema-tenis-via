"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function ClaimPerfilGate({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading, jugadorId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const enPerfil = pathname === "/perfil" || pathname.startsWith("/perfil/");

  // La cartelera es pública: solo pedimos ficha vinculada al entrar a Mi Perfil.
  const debeVincular =
    !loading && Boolean(user) && !isAdmin && !jugadorId && enPerfil;

  useEffect(() => {
    if (debeVincular) {
      router.replace("/vincular-perfil");
    }
  }, [debeVincular, router]);

  if (loading && enPerfil) {
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
