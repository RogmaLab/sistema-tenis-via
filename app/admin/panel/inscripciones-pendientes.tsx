"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  fetchInscripcionesPendientes,
  actualizarEstadoInscripcion,
  type InscripcionPago,
} from "@/lib/inscripciones-pago";
import { formatFecha } from "@/lib/datetime";

export function InscripcionesPendientesTab() {
  const [inscripciones, setInscripciones] = useState<InscripcionPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const supabase = createClient();
      const data = await fetchInscripcionesPendientes(supabase);
      setInscripciones(data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las inscripciones."
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function handleAprobar(inscripcion: InscripcionPago) {
    if (!inscripcion.jugador) return;

    const confirmar = confirm(
      `¿Aprobar el pago de ${inscripcion.jugador.nombre_completo}?\n\nEsto inscribirá automáticamente al jugador en el torneo.`
    );
    if (!confirmar) return;

    setProcesando(inscripcion.id);
    try {
      const supabase = createClient();

      // 1. Aprobar la inscripción
      await actualizarEstadoInscripcion(supabase, {
        inscripcionId: inscripcion.id,
        estado: "aprobado",
      });

      // 2. ✅ NUEVA VALIDACIÓN: Verificar si ya está inscrito ANTES de insertar
      const { data: yaInscrito } = await supabase
        .from("torneo_jugadores")
        .select("id")
        .eq("torneo_id", inscripcion.torneo_id)
        .eq("jugador_id", inscripcion.jugador_id)
        .maybeSingle();

      // 3. Solo inscribir si NO está ya en el torneo
      if (!yaInscrito) {
        const categoriaJugador = inscripcion.jugador.categoria || "3ra";
        
        const { error: errorInscripcion } = await supabase
          .from("torneo_jugadores")
          .insert({
            torneo_id: inscripcion.torneo_id,
            jugador_id: inscripcion.jugador_id,
            categoria: categoriaJugador,
            clasificado: false,
          });

        if (errorInscripcion) {
          throw new Error(errorInscripcion.message);
        }

        toast.success(
          `Pago aprobado. ${inscripcion.jugador.nombre_completo} está inscripto al torneo.`,
          { duration: 5000 }
        );
      } else {
        // Ya estaba inscrito (posible doble click o race condition)
        toast.success(
          `Pago aprobado. ${inscripcion.jugador.nombre_completo} ya estaba inscripto al torneo.`,
          { duration: 5000 }
        );
      }

      await cargar();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo aprobar el pago."
      );
    } finally {
      setProcesando(null);
    }
  }

  async function handleRechazar(inscripcion: InscripcionPago) {
    if (!inscripcion.jugador) return;

    const confirmar = confirm(
      `¿Rechazar el pago de ${inscripcion.jugador.nombre_completo}?\n\nEl jugador deberá reintentar la inscripción.`
    );
    if (!confirmar) return;

    setProcesando(inscripcion.id);
    try {
      const supabase = createClient();
      await actualizarEstadoInscripcion(supabase, {
        inscripcionId: inscripcion.id,
        estado: "rechazado",
        notasAdmin: "Pago rechazado por el administrador",
      });
      toast.success(
        `Pago rechazado. ${inscripcion.jugador.nombre_completo} deberá reintentar.`,
        { duration: 5000 }
      );
      await cargar();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo rechazar el pago."
      );
    } finally {
      setProcesando(null);
    }
  }

  if (cargando) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
        Cargando inscripciones pendientes...
      </p>
    );
  }

  if (inscripciones.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <Clock size={22} className="text-accent" />
        <p className="text-sm text-foreground/60">
          No hay inscripciones pendientes de validación.
        </p>
        <p className="text-xs text-foreground/40">
          Las nuevas inscripciones aparecerán aquí automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
        <p className="text-sm font-medium text-yellow-500">
          {inscripciones.length}{" "}
          {inscripciones.length === 1
            ? "inscripción pendiente"
            : "inscripciones pendientes"}{" "}
          de validación
        </p>
      </div>

      {inscripciones.map((inscripcion) => (
        <div
          key={inscripcion.id}
          className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {inscripcion.jugador?.nombre_completo ?? "Sin nombre"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {inscripcion.torneo?.nombre ?? "Sin torneo"} •{" "}
                    {inscripcion.jugador?.categoria ?? "Sin categoría"}
                  </p>
                </div>
                {inscripcion.torneo_id ? (
                  <a
                    href={`/torneos/${inscripcion.torneo_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-accent transition hover:text-accent-hover"
                  >
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>

              <div className="mt-2 space-y-1">
                <p className="text-xs text-foreground/50">
                  Fecha de inscripción:{" "}
                  {formatFecha(inscripcion.fecha_inscripcion)}
                </p>
                {inscripcion.jugador?.whatsapp ? (
                  <p className="text-xs text-foreground/50">
                    WhatsApp:{" "}
                    <a
                      href={`https://wa.me/${inscripcion.jugador.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {inscripcion.jugador.whatsapp}
                    </a>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => handleRechazar(inscripcion)}
                disabled={procesando === inscripcion.id}
                className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
                Rechazar
              </button>
              <button
                onClick={() => handleAprobar(inscripcion)}
                disabled={procesando === inscripcion.id}
                className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-500 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={16} />
                Aprobar Pago
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
