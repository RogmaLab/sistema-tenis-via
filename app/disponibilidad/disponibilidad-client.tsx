"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { fetchMiJugador } from "@/lib/jugador-vinculado";
import { SelectorDisponibilidad } from "@/components/SelectorDisponibilidad";
import { puedeModificarDisponibilidad } from "@/lib/disponibilidad-deadline";
import { fetchEstadoDisponibilidadParaJugadores } from "@/lib/programacion-canchas";
import type { Jugador, BloqueHorario } from "@/lib/types";
import { CalendarClock } from "lucide-react";

export function DisponibilidadClient() {
  const { user, loading } = useAuth();
  const supabase = createClient();

  const [jugador, setJugador] = useState<Jugador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estadoDisponibilidad, setEstadoDisponibilidad] = useState<{
    abierta: boolean;
    torneoNombre: string | null;
    bloquesHabilitados: BloqueHorario[];
  }>({
    abierta: false,
    torneoNombre: null,
    bloquesHabilitados: [],
  });

  const cargar = useCallback(async () => {
    if (!user) {
      setJugador(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    const [data, estado] = await Promise.all([
      fetchMiJugador(supabase, user.id),
      fetchEstadoDisponibilidadParaJugadores().catch(() => ({
        abierta: false,
        torneoId: null,
        torneoNombre: null,
        bloquesHabilitados: [] as BloqueHorario[],
      })),
    ]);
    setJugador(data);
    setEstadoDisponibilidad({
      abierta: estado.abierta,
      torneoNombre: estado.torneoNombre,
      bloquesHabilitados: estado.bloquesHabilitados,
    });
    setCargando(false);
  }, [supabase, user]);

  useEffect(() => {
    if (loading) return;
    void cargar();
  }, [loading, cargar]);

  async function handleGuardarDisponibilidad(disponibilidad: BloqueHorario[]) {
    if (!jugador) return;

    if (!estadoDisponibilidad.abierta) {
      toast.error(
        "La organización aún no confirmó las canchas del fin de semana."
      );
      throw new Error("Disponibilidad cerrada");
    }

    // Validación del deadline en el cliente
    if (!puedeModificarDisponibilidad()) {
      toast.error(
        "El plazo para modificar la disponibilidad ya expiró. El período de modificación cerró el jueves a las 22:00 hs."
      );
      throw new Error("Deadline expirado");
    }

    const { error } = await supabase
      .from("jugadores")
      .update({ disponibilidad_horaria: disponibilidad })
      .eq("id", jugador.id);

    if (error) {
      toast.error(error.message || "No se pudo guardar la disponibilidad.");
      throw error;
    }

    toast.success("Disponibilidad actualizada.");
    await cargar();
  }

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Mi Disponibilidad Horaria
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Indicá los horarios en los que podés jugar tus partidos para que el
            sistema de programación automática los tenga en cuenta.
          </p>
        </header>

        {loading || cargando ? (
          <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
            Cargando...
          </p>
        ) : !jugador ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-foreground/60">
              Todavía no hay una ficha vinculada a esta cuenta.
            </p>
            <Link
              href="/vincular-perfil"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Vinculá tu perfil
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {!estadoDisponibilidad.abierta ? (
              <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                  <CalendarClock size={28} className="text-accent" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">
                  Disponibilidad aún no habilitada
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
                  La organización todavía no confirmó las canchas y horarios
                  del fin de semana. Cuando publique la configuración, vas a
                  poder indicar en qué bloques podés jugar.
                </p>
              </div>
            ) : (
              <SelectorDisponibilidad
                disponibilidadInicial={jugador.disponibilidad_horaria ?? []}
                bloquesHabilitados={estadoDisponibilidad.bloquesHabilitados}
                torneoNombre={estadoDisponibilidad.torneoNombre}
                onGuardar={handleGuardarDisponibilidad}
              />
            )}

            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="text-base font-semibold text-foreground">
                ¿Cómo funciona?
              </h2>
              <div className="mt-3 space-y-2 text-sm text-foreground/70">
                <p>
                  El sistema de auto-asignación de horarios usa esta
                  información para programar tus partidos únicamente en los
                  bloques horarios que seleccionaste.
                </p>
                <p>
                  <strong className="text-foreground/90">
                    Si no seleccionás ningún bloque,
                  </strong>{" "}
                  se asume que podés jugar en cualquier horario y el sistema
                  asignará libremente.
                </p>
                <p>
                  Podés actualizar tu disponibilidad en cualquier momento desde
                  esta página.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
