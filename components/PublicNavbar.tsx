"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

function nombreVisible(nombre: string | null, email: string | undefined) {
  if (nombre?.trim()) {
    return nombre.trim().split(/\s+/).slice(0, 2).join(" ");
  }
  return email?.split("@")[0] ?? "Mi cuenta";
}

export function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, loading, jugadorNombre } = useAuth();
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    setHidratado(true);
  }, []);

  if (
    pathname === "/login" ||
    pathname === "/vincular-perfil" ||
    pathname === "/recuperar-clave"
  ) {
    return null;
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5"
          aria-label="Tenis La Vía — ir al torneo"
        >
          <Image
            src="/logo-tenis-la-via.png"
            alt="Tenis La Vía"
            width={507}
            height={205}
            priority
            className="h-9 w-auto sm:h-10"
          />
          <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
            Tenis La Vía
          </span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          {isAdmin ? (
            <nav className="flex items-center gap-1" aria-label="Gestión">
              <Link
                href="/torneos"
                className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-foreground/70 transition hover:text-foreground"
              >
                Torneos
              </Link>
              <Link
                href="/jugadores"
                className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-foreground/70 transition hover:text-foreground"
              >
                Jugadores
              </Link>
            </nav>
          ) : null}

          {!hidratado || loading ? (
            <div
              className="h-10 w-44 animate-pulse rounded-lg bg-foreground/10"
              aria-hidden
            />
          ) : user ? (
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="max-w-[88px] truncate text-sm font-medium text-foreground sm:max-w-[140px] md:max-w-[200px]">
                {nombreVisible(jugadorNombre, user.email)}
              </span>
              <Link
                href="/perfil"
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground transition hover:bg-background"
              >
                Mi Perfil
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Cerrar sesión"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground/55 transition hover:text-foreground"
              >
                <LogOut size={16} />
                <span className="hidden md:inline">Cerrar sesión</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-accent px-3 text-xs font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98] sm:px-3.5 sm:text-sm"
            >
              Iniciar Sesión / Registrarse
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
