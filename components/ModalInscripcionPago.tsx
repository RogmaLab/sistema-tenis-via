"use client";

import { useState } from "react";
import { X, DollarSign, Info, User, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { crearInscripcion } from "@/lib/inscripciones-pago";

interface ModalInscripcionPagoProps {
  torneoId: string;
  torneoNombre: string;
  jugadorId: string;
  precioInscripcion: number;
  aliasCbu: string | null;
  titular: string | null;
  onClose: () => void;
  onInscripcionCreada: () => void;
}

export function ModalInscripcionPago({
  torneoId,
  torneoNombre,
  jugadorId,
  precioInscripcion,
  aliasCbu,
  titular,
  onClose,
  onInscripcionCreada,
}: ModalInscripcionPagoProps) {
  const [notificando, setNotificando] = useState(false);
  const aliasMostrado = aliasCbu?.trim() || null;
  const titularMostrado = titular?.trim() || null;
  const hayDatosPago = Boolean(aliasMostrado || titularMostrado);

  async function handleNotificarPago() {
    setNotificando(true);
    try {
      const supabase = createClient();
      await crearInscripcion(supabase, { torneoId, jugadorId });
      toast.success(
        "Inscripción registrada. El administrador verificará tu pago en breve.",
        { duration: 5000 }
      );
      onInscripcionCreada();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear la inscripción."
      );
    } finally {
      setNotificando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Inscripción al Torneo
            </h2>
            <p className="mt-1 text-sm text-foreground/60">{torneoNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground/60 transition hover:bg-background hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Precio */}
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15">
            <DollarSign size={24} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground/60">
              Precio de inscripción
            </p>
            <p className="text-2xl font-bold text-foreground">
              ${precioInscripcion.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Datos de pago */}
        {hayDatosPago ? (
          <div className="mb-5 space-y-3 rounded-xl border border-border bg-background p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Datos para realizar la transferencia
            </h3>
            {titularMostrado ? (
              <div className="flex items-start gap-3">
                <User size={16} className="mt-0.5 shrink-0 text-foreground/45" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                    Titular
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {titularMostrado}
                  </p>
                </div>
              </div>
            ) : null}
            {aliasMostrado ? (
              <div className="flex items-start gap-3">
                <CreditCard size={16} className="mt-0.5 shrink-0 text-foreground/45" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                    Alias / CBU
                  </p>
                  <p className="break-all text-sm font-semibold text-accent">
                    {aliasMostrado}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mb-5 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-400/90">
            El administrador aún no cargó los datos de pago para este torneo.
            Consultá con la organización antes de transferir.
          </div>
        )}

        {/* Información */}
        <div className="mb-5 flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-blue-500" />
          <p className="text-sm leading-relaxed text-blue-500/90">
            Realizá la transferencia por el monto indicado y luego presioná
            &quot;Ya transferí / Notificar Pago&quot; para que el administrador
            valide tu inscripción.
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleNotificarPago}
            disabled={notificando}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {notificando ? "Notificando..." : "Ya transferí / Notificar Pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
