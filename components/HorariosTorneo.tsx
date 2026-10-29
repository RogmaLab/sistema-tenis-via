"use client";

import { formatFechaHorario } from "@/lib/datetime";
import { nombreJugador } from "@/lib/nombre";

function fechaValida(iso: string | null) {
  if (!iso) return null;
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function claveDia(fecha: Date) {
  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

/** Sábado que abre el fin de semana de esa fecha. Domingo cuenta con el sábado anterior. */
function sabadoDelFinde(fecha: Date) {
  const copia = new Date(fecha);
  copia.setHours(12, 0, 0, 0);
  const dia = copia.getDay();
  if (dia === 0) copia.setDate(copia.getDate() - 1);
  else if (dia !== 6) copia.setDate(copia.getDate() - dia - 1);
  return claveDia(copia);
}

function etiquetaDia(fecha: Date) {
  const nombre = fecha.toLocaleDateString("es-AR", { weekday: "long" });
  const titulo = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`;
  return `${titulo} ${fecha.getDate()}/${fecha.getMonth() + 1}`;
}

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
  isAdmin?: boolean;
  onGestionarPartido?: (partido: PartidoHorario) => void;
}

export function HorariosTorneo({
  partidos,
  isLoading = false,
  isAdmin = false,
  onGestionarPartido,
}: HorariosTorneoProps) {
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

  const clickeable = Boolean(isAdmin && onGestionarPartido);
  const ultimo = [...partidos]
    .map((partido) => fechaValida(partido.fecha_programada))
    .filter((fecha): fecha is Date => Boolean(fecha))
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1);

  const findes: {
    clave: string;
    dias: { clave: string; etiqueta: string; partidos: PartidoHorario[] }[];
  }[] = [];

  for (const partido of partidos) {
    const fecha = fechaValida(partido.fecha_programada);
    const claveFinde = fecha ? sabadoDelFinde(fecha) : "sin-fecha";
    const clave = fecha ? claveDia(fecha) : "sin-fecha";
    const etiqueta = fecha ? etiquetaDia(fecha) : "Sin día";
    let finde = findes.find((grupo) => grupo.clave === claveFinde);
    if (!finde) {
      finde = { clave: claveFinde, dias: [] };
      findes.push(finde);
    }
    let dia = finde.dias.find((grupo) => grupo.clave === clave);
    if (!dia) {
      dia = { clave, etiqueta, partidos: [] };
      finde.dias.push(dia);
    }
    dia.partidos.push(partido);
  }

  return (
    <div className="space-y-2">
      {ultimo ? (
        <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground/70">
          El programa llega hasta el{" "}
          <span className="font-semibold text-foreground">
            {etiquetaDia(ultimo)}
          </span>
          . A partir de ahí se puede pensar un torneo relámpago.
        </p>
      ) : null}
      {findes.map((finde, indiceFinde) => (
        <section
          key={finde.clave}
          className={
            indiceFinde > 0
              ? "mt-6 border-t-4 border-double border-foreground/35 pt-6"
              : undefined
          }
        >
          {finde.dias.map((dia, indiceDia) => (
            <div
              key={dia.clave}
              className={
                indiceDia > 0
                  ? "mt-4 border-t border-foreground/20 pt-4"
                  : undefined
              }
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/45">
                {dia.etiqueta}
              </h3>
              <ul className="space-y-2">
                {dia.partidos.map((partido) => {
                  const vs = (
                    <>
                      <p className="text-xs font-medium text-foreground/50">
                        {partido.fecha_programada
                          ? formatFechaHorario(partido.fecha_programada)
                          : "Horario a confirmar"}
                        {partido.cancha ? ` · ${partido.cancha}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {nombreJugador(partido.jugador_1, "Por definir")}{" "}
                        <span className="font-normal text-foreground/40">vs</span>{" "}
                        {nombreJugador(partido.jugador_2, "Por definir")}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/45">
                        {partido.fase}
                        {partido.categoria ? ` · ${partido.categoria}` : ""}
                      </p>
                    </>
                  );

                  return (
                    <li key={partido.id}>
                      {clickeable ? (
                        <button
                          type="button"
                          onClick={() => onGestionarPartido?.(partido)}
                          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:border-accent/50 hover:bg-background/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:px-5"
                        >
                          {vs}
                        </button>
                      ) : (
                        <div className="rounded-2xl border border-border bg-surface px-4 py-3 sm:px-5">
                          {vs}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
