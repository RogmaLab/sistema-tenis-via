"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import {
  columnasDelArbolCuadro,
  rondaDelPartido,
  RONDA_CUADRO_LABELS,
  type PartidoParaCuadro,
} from "@/lib/adaptar-cuadro-torneo";
import {
  TarjetaPartidoTenis,
  type DatosPartidoTarjeta,
} from "@/components/TarjetaPartidoTenis";

const TEMA_LLAVES = {
  fondoPartido: "#1a1a1a",
  borde: "#3f3f46",
  subtitulo: "#a3a3a3",
  acento: "#ea580c",
  linea: "#52525b",
} as const;

export interface PartidoLlave extends PartidoParaCuadro {
  cancha?: string | null;
}

interface CuadroLlavesProps {
  partidos: PartidoLlave[];
  rondaResaltada?: string | null;
  isAdmin: boolean;
  onCargarResultado?: (partido: PartidoLlave) => void;
  onProgramarPartido?: (partido: PartidoLlave) => void;
}

interface LineaLlave {
  d: string;
}

function nombreCampeon(final: PartidoLlave | undefined) {
  if (!final || final.estado !== "Finalizado" || !final.ganador_id) {
    return null;
  }
  if (final.jugador_1?.id === final.ganador_id) {
    return final.jugador_1.nombre_completo;
  }
  if (final.jugador_2?.id === final.ganador_id) {
    return final.jugador_2.nombre_completo;
  }
  return null;
}

function TarjetaCampeon({ partidoFinal }: { partidoFinal: PartidoLlave }) {
  const campeon = nombreCampeon(partidoFinal);

  return (
    <div
      className="mt-3 w-full min-w-0 overflow-hidden rounded-lg border px-2.5 py-2"
      style={{
        backgroundColor: TEMA_LLAVES.fondoPartido,
        borderColor: TEMA_LLAVES.borde,
      }}
    >
      <div className="flex items-center gap-2">
        <Trophy
          size={14}
          strokeWidth={2.25}
          className="shrink-0"
          style={{ color: TEMA_LLAVES.acento }}
        />
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: TEMA_LLAVES.subtitulo }}
        >
          Campeón
        </p>
      </div>
      <p
        title={campeon ?? "A definir"}
        className="mt-1 truncate text-[12px] font-semibold leading-tight sm:text-[13px]"
        style={{ color: campeon ? TEMA_LLAVES.acento : TEMA_LLAVES.subtitulo }}
      >
        {campeon ?? "A definir"}
      </p>
    </div>
  );
}

function aDatosTarjeta(partido: PartidoLlave): DatosPartidoTarjeta {
  return {
    id: String(partido.id),
    estado: partido.estado,
    resultado: partido.resultado,
    ganador_id: partido.ganador_id,
    fecha_programada: partido.fecha_programada,
    cancha: partido.cancha ?? null,
    jugador_1: partido.jugador_1,
    jugador_2: partido.jugador_2,
  };
}

export function CuadroLlaves({
  partidos,
  rondaResaltada,
  isAdmin,
  onCargarResultado,
  onProgramarPartido,
}: CuadroLlavesProps) {
  const marcoRef = useRef<HTMLDivElement>(null);
  const nodosRef = useRef(new Map<string, HTMLDivElement>());
  const [lineas, setLineas] = useState<LineaLlave[]>([]);
  const columnas = columnasDelArbolCuadro(partidos);
  const filasArbol = Math.max(1, columnas[0]?.partidos.length ?? 1);
  const columnasGrid = `repeat(${columnas.length}, minmax(0, 1fr))`;
  const partidoFinal = columnas.at(-1)?.partidos[0];
  const mostrarCampeon =
    partidoFinal != null && rondaDelPartido(partidoFinal) === "Final";

  useLayoutEffect(() => {
    const marco = marcoRef.current;
    if (!marco) return;

    const medir = () => {
      const caja = marco.getBoundingClientRect();
      if (caja.width === 0) return;
      const nuevas: LineaLlave[] = [];

      for (const partido of partidos) {
        if (!partido.siguiente_partido_id) continue;
        const origen = nodosRef.current.get(String(partido.id));
        const destino = nodosRef.current.get(
          String(partido.siguiente_partido_id)
        );
        if (!origen || !destino) continue;

        const a = origen.getBoundingClientRect();
        const b = destino.getBoundingClientRect();
        const x1 = a.right - caja.left;
        const y1 = a.top + a.height / 2 - caja.top;
        const x2 = b.left - caja.left;
        const y2 = b.top + b.height / 2 - caja.top;
        const midX = (x1 + x2) / 2;
        nuevas.push({
          d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`,
        });
      }
      setLineas(nuevas);
    };

    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(marco);
    window.addEventListener("resize", medir);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [partidos, columnas.length, filasArbol]);

  if (columnas.length === 0) return null;

  return (
    <div
      className="w-full overflow-x-auto rounded-2xl border p-3 sm:p-4"
      style={{
        backgroundColor: TEMA_LLAVES.fondoPartido,
        borderColor: TEMA_LLAVES.borde,
      }}
    >
      <div
        ref={marcoRef}
        className="relative h-auto min-w-[640px] pointer-events-none"
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {lineas.map((linea, i) => (
            <path
              key={i}
              d={linea.d}
              fill="none"
              stroke={TEMA_LLAVES.linea}
              strokeWidth="1.25"
              strokeLinecap="square"
            />
          ))}
        </svg>

        <div
          className="relative z-10 mb-2 grid w-full gap-x-4"
          style={{ gridTemplateColumns: columnasGrid }}
        >
          {columnas.map((columna) => {
            const activa = rondaResaltada === columna.fase;
            return (
              <p
                key={`titulo-${columna.fase}`}
                className="truncate text-center text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px]"
                style={{
                  color: activa ? TEMA_LLAVES.acento : TEMA_LLAVES.subtitulo,
                }}
              >
                {RONDA_CUADRO_LABELS[columna.fase] ?? columna.fase}
              </p>
            );
          })}
        </div>

        <div
          className="relative z-10 grid w-full content-start items-start gap-x-4 gap-y-4 pointer-events-none"
          style={{
            gridTemplateColumns: columnasGrid,
            gridTemplateRows: `repeat(${filasArbol}, min-content)`,
            gridAutoRows: "min-content",
            alignContent: "start",
          }}
        >
          {columnas.map((columna, indiceColumna) => {
            const activa = rondaResaltada === columna.fase;
            const esUltima = indiceColumna === columnas.length - 1;
            const spanFila = filasArbol / columna.partidos.length;

            return columna.partidos.map((partido, indicePartido) => {
              const filaInicio = indicePartido * spanFila + 1;
              const filaFin = (indicePartido + 1) * spanFila + 1;

              return (
                <div
                  key={partido.id}
                  className={`w-full min-w-0 self-center ${
                    esUltima ? "" : "pr-1 sm:pr-3"
                  }`}
                  style={{
                    gridColumn: indiceColumna + 1,
                    gridRow: `${filaInicio} / ${filaFin}`,
                    alignSelf: indiceColumna === 0 ? "start" : "center",
                  }}
                >
                  <div className="pointer-events-auto w-full min-w-0">
                    <TarjetaPartidoTenis
                      partido={aDatosTarjeta(partido)}
                      isAdmin={isAdmin}
                      resaltado={activa}
                      compacto
                      casilleroPendiente="esperando-rival"
                      cardRef={(el) => {
                        if (el) nodosRef.current.set(String(partido.id), el);
                        else nodosRef.current.delete(String(partido.id));
                      }}
                      onCargarResultado={
                        onCargarResultado
                          ? () => onCargarResultado(partido)
                          : undefined
                      }
                      onProgramarPartido={
                        onProgramarPartido
                          ? () => onProgramarPartido(partido)
                          : undefined
                      }
                    />
                  </div>
                </div>
              );
            });
          })}
        </div>

        {mostrarCampeon && partidoFinal ? (
          <div
            className="relative z-10 mt-2 grid w-full gap-x-4 pointer-events-none"
            style={{ gridTemplateColumns: columnasGrid }}
          >
            <div
              className="pointer-events-auto"
              style={{ gridColumn: columnas.length }}
            >
              <TarjetaCampeon partidoFinal={partidoFinal} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
