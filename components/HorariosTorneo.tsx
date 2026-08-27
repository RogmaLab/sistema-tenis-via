"use client";

import { formatFechaHorario } from "@/lib/datetime";

export interface PartidoHorario {
  id: string;
  fase: string;
  categoria: string | null;
  cancha: string | null;
  fecha_programada: string | null;
  jugador_1: { nombre_completo: string } | null;
  jugador_2: { nombre_completo: string } | null;
}

interface HorariosTorneoProps {
  partidos: PartidoHorario[];
  isLoading?: boolean;
}

export function HorariosTorneo({ partidos, isLoading = false }: HorariosTorneoProps) {
  if (isLoading) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-foreground/50">
        Cargando horarios...
      </p>
    );
  }

  if (partidos.length === 0) {
    return (
      <section className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="text-base font-semibold text-foreground/70">
          Todavía no hay partidos programados
        </p>
        <p className="mt-2 max-w-sm text-sm text-foreground/40">
          Cuando el club asigne día y hora, van a aparecer acá.
        </p>
      </section>
    );
  }

  return (
    <ul className="space-y-2">
      {partidos.map((partido) => (
        <li
          key={partido.id}
          className="rounded-2xl border border-border bg-surface px-4 py-3 sm:px-5"
        >
          <p className="text-xs font-medium text-foreground/50">
            {partido.fecha_programada
              ? formatFechaHorario(partido.fecha_programada)
              : "Horario a confirmar"}
            {partido.cancha ? ` · ${partido.cancha}` : ""}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {partido.jugador_1?.nombre_completo ?? "Por definir"}{" "}
            <span className="font-normal text-foreground/40">vs</span>{" "}
            {partido.jugador_2?.nombre_completo ?? "Por definir"}
          </p>
          <p className="mt-0.5 text-xs text-foreground/45">
            {partido.fase}
            {partido.categoria ? ` · ${partido.categoria}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
