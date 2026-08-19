"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CANCHAS_TORNEO } from "@/lib/types";
import {
  fromDateAndTimeValues,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/datetime";
import { guardarProgramacionPartido } from "@/lib/motor-torneo";

interface PartidoProgramable {
  id: string;
  fecha_horario: string | null;
  cancha: string | null;
  jugador_1: { nombre_completo: string } | null;
  jugador_2: { nombre_completo: string } | null;
}

interface ModalProgramarPartidoProps {
  partido: PartidoProgramable;
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition [color-scheme:dark] focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/30";

export function ModalProgramarPartido({
  partido,
  onCerrar,
  onGuardado,
}: ModalProgramarPartidoProps) {
  const [fecha, setFecha] = useState(toDateInputValue(partido.fecha_horario));
  const [hora, setHora] = useState(toTimeInputValue(partido.fecha_horario));
  const [cancha, setCancha] = useState(partido.cancha ?? "");
  const [guardando, setGuardando] = useState(false);

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando(true);
    try {
      await guardarProgramacionPartido({
        partido_id: partido.id,
        cancha: cancha || null,
        fecha_horario: fromDateAndTimeValues(fecha, hora),
      });
      toast.success("Programación guardada.");
      await onGuardado();
      onCerrar();
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudo guardar la programación.";
      toast.error(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Programar Partido
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-foreground/50 transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mb-6 text-sm text-foreground/60">
          {partido.jugador_1?.nombre_completo ?? "Por definir"} vs{" "}
          {partido.jugador_2?.nombre_completo ?? "Por definir"}
        </p>

        <form onSubmit={handleGuardar} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="programar-fecha"
                className="block text-xs font-medium text-foreground/50"
              >
                Fecha
              </label>
              <input
                id="programar-fecha"
                type="date"
                value={fecha}
                onChange={(event) => setFecha(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="programar-hora"
                className="block text-xs font-medium text-foreground/50"
              >
                Hora
              </label>
              <input
                id="programar-hora"
                type="time"
                value={hora}
                onChange={(event) => setHora(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="programar-cancha"
              className="block text-xs font-medium text-foreground/50"
            >
              Cancha
            </label>
            <select
              id="programar-cancha"
              value={cancha}
              onChange={(event) => setCancha(event.target.value)}
              className={inputClass}
            >
              <option value="">Sin asignar</option>
              {CANCHAS_TORNEO.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-lg bg-[#ea580c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c2410c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar Programación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
