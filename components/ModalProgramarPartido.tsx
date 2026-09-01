"use client";

import { useState, type FormEvent } from "react";
import { Calendar, AlertCircle, Pencil } from "lucide-react";
import { nombreJugador } from "@/lib/nombre";
import { toast } from "sonner";
import { CANCHAS_TORNEO } from "@/lib/types";
import {
  fromDateAndTimeValues,
  HORAS_PROGRAMACION,
  MINUTOS_PROGRAMACION,
  snapHoraAMediaHora,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/datetime";
import { guardarProgramacionPartido } from "@/lib/motor-torneo";
import { useAuth } from "@/components/auth-provider";

interface PartidoProgramable {
  id: string;
  fecha_programada: string | null;
  cancha: string | null;
  jugador_1: { nombre_completo: string } | null;
  jugador_2: { nombre_completo: string } | null;
}

interface ModalProgramarPartidoProps {
  partido: PartidoProgramable;
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
  onCargarResultado?: () => void;
  etiquetaJugador1?: string | null;
  etiquetaJugador2?: string | null;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition [color-scheme:dark] focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/30";

export function ModalProgramarPartido({
  partido,
  onCerrar,
  onGuardado,
  onCargarResultado,
  etiquetaJugador1,
  etiquetaJugador2,
}: ModalProgramarPartidoProps) {
  const { isAdmin } = useAuth();
  const yaProgramado = Boolean(partido.fecha_programada || partido.cancha);
  const horaInicial = partido.fecha_programada
    ? snapHoraAMediaHora(toTimeInputValue(partido.fecha_programada))
    : "";
  const [fecha, setFecha] = useState(
    toDateInputValue(partido.fecha_programada)
  );
  const [hora, setHora] = useState(horaInicial ? horaInicial.slice(0, 2) : "");
  const [minuto, setMinuto] = useState(
    horaInicial.slice(3, 5) === "30" ? "30" : "00"
  );
  const [cancha, setCancha] = useState(partido.cancha ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errorProgramacion, setErrorProgramacion] = useState<string | null>(
    null
  );

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;
    setErrorProgramacion(null);
    setGuardando(true);
    try {
      await guardarProgramacionPartido({
        partido_id: partido.id,
        cancha: cancha || null,
        fecha_programada: fromDateAndTimeValues(
          fecha,
          hora ? `${hora}:${minuto}` : ""
        ),
      });
      toast.success(
        yaProgramado ? "Programación actualizada." : "Partido programado."
      );
      await onGuardado();
      onCerrar();
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "No se pudo guardar la programación.";
      setErrorProgramacion(mensaje);
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
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Calendar size={18} className="text-accent" />
            {yaProgramado ? "Editar Programación" : "Programar Partido"}
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
          {nombreJugador(partido.jugador_1, etiquetaJugador1 ?? "Por definir")} vs{" "}
          {nombreJugador(partido.jugador_2, etiquetaJugador2 ?? "Por definir")}
        </p>

        <form onSubmit={handleGuardar} className="space-y-4">
          {errorProgramacion ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
            >
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <p>{errorProgramacion}</p>
            </div>
          ) : null}

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
                onChange={(event) => {
                  setFecha(event.target.value);
                  setErrorProgramacion(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <p className="block text-xs font-medium text-foreground/50">
                Hora
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="sr-only" htmlFor="programar-hora">
                  Hora
                </label>
                <select
                  id="programar-hora"
                  value={hora}
                  onChange={(event) => {
                    setHora(event.target.value);
                    setErrorProgramacion(null);
                  }}
                  className={inputClass}
                >
                  <option value="">--</option>
                  {HORAS_PROGRAMACION.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="programar-minuto">
                  Minutos
                </label>
                <select
                  id="programar-minuto"
                  value={minuto}
                  onChange={(event) => {
                    setMinuto(event.target.value);
                    setErrorProgramacion(null);
                  }}
                  className={inputClass}
                >
                  {MINUTOS_PROGRAMACION.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </select>
              </div>
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
              onChange={(event) => {
                setCancha(event.target.value);
                setErrorProgramacion(null);
              }}
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

          {onCargarResultado ? (
            <button
              type="button"
              onClick={onCargarResultado}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-background hover:text-foreground"
            >
              <Pencil size={14} strokeWidth={2.25} />
              Cargar resultado
            </button>
          ) : null}

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
