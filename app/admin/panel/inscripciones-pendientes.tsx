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
import { etiquetaMedioPago } from "@/lib/inscripciones-precio";
import { formatearNombre } from "@/lib/nombre";

function normalizarNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase("es-AR");
}

function titularDifiereDelJugador(
  nombreJugador: string | undefined,
  titularPago: string | null | undefined
) {
  if (!titularPago?.trim() || !nombreJugador?.trim()) return false;
  return normalizarNombre(nombreJugador) !== normalizarNombre(titularPago);
}

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
      `¿Aprobar el pago de ${formatearNombre(inscripcion.jugador.nombre_completo)}?\n\nEsto inscribirá automáticamente al jugador en el torneo.`
    );
    if (!confirmar) return;

    setProcesando(inscripcion.id);
    try {
      const response = await fetch("/api/inscripciones/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inscripcionId: inscripcion.id }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        yaInscritoEnTorneo?: boolean;
        nombreJugador?: string;
        correoEnviado?: boolean;
        errorCorreo?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "No se pudo aprobar el pago.");
      }

      const nombre =
        payload.nombreJugador ??
        formatearNombre(inscripcion.jugador.nombre_completo);

      if (payload.yaInscritoEnTorneo) {
        toast.success(
          `Pago aprobado. ${nombre} ya estaba inscripto al torneo.`,
          { duration: 5000 }
        );
      } else {
        toast.success(`Pago aprobado. ${nombre} está inscripto al torneo.`, {
          duration: 5000,
        });
      }

      if (payload.correoEnviado) {
        toast.message("Correo de confirmación enviado al jugador.");
      } else if (payload.errorCorreo) {
        toast.message(
          "La inscripción se aprobó, pero no se pudo enviar el correo de confirmación.",
          { duration: 6000 }
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
      `¿Rechazar el pago de ${formatearNombre(inscripcion.jugador.nombre_completo)}?\n\nEl jugador deberá reintentar la inscripción.`
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
        `Pago rechazado. ${formatearNombre(inscripcion.jugador.nombre_completo)} deberá reintentar.`,
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

      {inscripciones.map((inscripcion) => {
        const nombreOriginal = inscripcion.jugador?.nombre_completo ?? "";
        const nombreJugador = formatearNombre(nombreOriginal) || "Sin nombre";
        const titularPago = inscripcion.titular_pago?.trim() || null;
        const esEfectivo = (inscripcion.medio_pago ?? "transferencia") === "efectivo";
        const titularDistinto =
          !esEfectivo &&
          titularDifiereDelJugador(nombreOriginal, titularPago);

        return (
        <div
          key={inscripcion.id}
          className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Inscripto: {nombreJugador}
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

              <div className="mt-3 space-y-2">
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                    esEfectivo
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-border bg-background text-foreground/70"
                  }`}
                >
                  {esEfectivo ? "💵" : "🏦"}{" "}
                  {etiquetaMedioPago(inscripcion.medio_pago)}
                </div>

                {esEfectivo ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                      Modalidad elegida
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-emerald-100">
                      Abonará en efectivo en el club (10% off)
                    </p>
                    <p className="mt-1 text-xs text-emerald-300/80">
                      Validá el pago cuando reciba el dinero en persona.
                    </p>
                  </div>
                ) : titularPago ? (
                  <div
                    className={`rounded-xl border px-3 py-2.5 ${
                      titularDistinto
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-border bg-background"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        titularDistinto
                          ? "text-amber-400"
                          : "text-foreground/45"
                      }`}
                    >
                      Titular de la transferencia
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-medium ${
                        titularDistinto ? "text-amber-100" : "text-foreground"
                      }`}
                    >
                      {titularDistinto
                        ? `Pagó desde cuenta de: ${titularPago}`
                        : titularPago}
                    </p>
                    {titularDistinto ? (
                      <p className="mt-1 text-xs text-amber-400/80">
                        Difiere del jugador inscripto — verificá el home banking
                        con este titular.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/45">
                    Sin titular de transferencia registrado.
                  </p>
                )}
                <p className="text-xs text-foreground/50">
                  Fecha de inscripción:{" "}
                  {formatFecha(inscripcion.fecha_inscripcion)}
                </p>
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
        );
      })}
    </div>
  );
}
