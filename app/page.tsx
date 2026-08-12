export const dynamic = "force-dynamic";

import Link from "next/link";
import { Trophy, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminOnly } from "@/components/AdminOnly";
import { LogoutButton } from "@/components/LogoutButton";

export default async function Home() {
  const supabase = await createClient();

  // Torneos vigentes: todos los que todavía no se dieron por terminados.
  // Un torneo pasa a "finalizado" solo cuando se corona campeón (resultado
  // de la Final). No usamos fecha_fin porque ya no se pide al crear.
  const [jugadoresResult, torneosActivosResult] = await Promise.all([
    supabase.from("jugadores").select("*", { count: "exact", head: true }),
    supabase
      .from("torneos")
      .select("*", { count: "exact", head: true })
      .neq("estado", "finalizado"),
  ]);

  if (jugadoresResult.error) {
    console.error(
      "Error al contar jugadores:",
      jugadoresResult.error.message
    );
  }
  if (torneosActivosResult.error) {
    console.error(
      "Error al contar torneos activos:",
      torneosActivosResult.error.message
    );
  }

  const totalJugadores = jugadoresResult.count ?? 0;
  const torneosActivos = torneosActivosResult.count ?? 0;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Saludo de bienvenida */}
        <header className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Panel de Control - Tenis La Vía
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Bienvenido de nuevo, administrador.
            </p>
          </div>
          {/* En mobile el BottomNav no tiene "Salir"; queda acá al alcance del pulgar */}
          <div className="md:hidden">
            <LogoutButton />
          </div>
        </header>

        {/* KPIs */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <Users size={18} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-foreground/60">
                Jugadores registrados
              </p>
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {totalJugadores}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <Trophy size={18} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-foreground/60">
                Torneos activos
              </p>
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {torneosActivos}
            </p>
          </div>
        </div>

        {/* Accesos rápidos de escritura: solo admin */}
        <AdminOnly>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/50">
              Accesos rápidos
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/torneos"
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent hover:bg-accent/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                  <Trophy size={18} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Crear torneo
                  </p>
                  <p className="text-xs text-foreground/50">
                    Configurar un nuevo torneo
                  </p>
                </div>
              </Link>

              <Link
                href="/jugadores"
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent hover:bg-accent/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15">
                  <UserPlus size={18} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Agregar jugador
                  </p>
                  <p className="text-xs text-foreground/50">
                    Sumar un nuevo jugador al club
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </AdminOnly>
      </div>
    </main>
  );
}
