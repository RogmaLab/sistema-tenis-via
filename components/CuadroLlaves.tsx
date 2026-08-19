"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Trophy } from "lucide-react";
import {
  columnasDelArbolCuadro,
  RONDA_CUADRO_LABELS,
  type PartidoParaCuadro,
} from "@/lib/adaptar-cuadro-torneo";

const TEMA_LLAVES = {
  fondoPartido: "#1a1a1a",
  borde: "#3f3f46",
  texto: "#ffffff",
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
  onCargarResultado: (partido: PartidoLlave) => void;
  onProgramarPartido: (partido: PartidoLlave) => void;
}

interface LineaLlave {
  d: string;
}

function nombreAsiento(
  jugador: { nombre_completo: string } | null,
  vacio: boolean
) {
  if (jugador?.nombre_completo) return jugador.nombre_completo;
  if (vacio) return "Por definir";
  return "BYE";
}

function parsearGamesPorJugador(resultado: string | null): {
  j1: string[];
  j2: string[];
} | null {
  if (!resultado || resultado === "W.O.") return null;
  const j1: string[] = [];
  const j2: string[] = [];
  for (const parte of resultado.split(",")) {
    const [a, b] = parte.trim().split("-").map((valor) => valor.trim());
    if (!a || !b) continue;
    j1.push(a);
    j2.push(b);
  }
  if (j1.length === 0) return null;
  return { j1, j2 };
}

function FilaJugador({
  nombre,
  ganador,
  derecha,
}: {
  nombre: string;
  ganador: boolean;
  derecha: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-0.5">
      <span
        title={nombre}
        className="min-w-0 truncate text-[12px] font-semibold leading-tight sm:text-[13px]"
        style={{ color: ganador ? TEMA_LLAVES.acento : TEMA_LLAVES.texto }}
      >
        {nombre}
      </span>
      <div className="flex shrink-0 items-center justify-end">{derecha}</div>
    </div>
  );
}

function MarcadorFila({
  games,
  ganador,
}: {
  games: string[];
  ganador: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      {games.map((game, i) => (
        <span
          key={`${game}-${i}`}
          className="min-w-3 text-right text-[11px] font-semibold leading-none sm:text-[12px]"
          style={{
            color: ganador ? TEMA_LLAVES.acento : TEMA_LLAVES.texto,
          }}
        >
          {game}
        </span>
      ))}
    </span>
  );
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

function BarraAccionesAdmin({
  programado,
  onProgramar,
  onCargar,
}: {
  programado: boolean;
  onProgramar: () => void;
  onCargar: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 border-t px-1.5 py-1"
      style={{ borderColor: TEMA_LLAVES.borde }}
    >
      <button
        type="button"
        onClick={onProgramar}
        className="h-auto min-h-0 flex-1 rounded px-1 py-1 text-[10px] font-semibold leading-none"
        style={{
          minHeight: 0,
          color: TEMA_LLAVES.subtitulo,
          border: `1px solid ${TEMA_LLAVES.borde}`,
        }}
      >
        {programado ? "Horario" : "Programar"}
      </button>
      <button
        type="button"
        onClick={onCargar}
        className="h-auto min-h-0 flex-1 rounded px-1 py-1 text-[10px] font-semibold leading-none text-white"
        style={{ minHeight: 0, backgroundColor: TEMA_LLAVES.acento }}
      >
        Cargar
      </button>
    </div>
  );
}

function TarjetaPartido({
  partido,
  resaltado,
  isAdmin,
  onCargarResultado,
  onProgramarPartido,
  cardRef,
}: {
  partido: PartidoLlave;
  resaltado: boolean;
  isAdmin: boolean;
  onCargarResultado: (partido: PartidoLlave) => void;
  onProgramarPartido: (partido: PartidoLlave) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const vacio = !partido.jugador_1 && !partido.jugador_2;
  const j1Gana = Boolean(
    partido.ganador_id && partido.ganador_id === partido.jugador_1?.id
  );
  const j2Gana = Boolean(
    partido.ganador_id && partido.ganador_id === partido.jugador_2?.id
  );
  const puedeCargar =
    isAdmin &&
    partido.estado === "Pendiente" &&
    Boolean(partido.jugador_1 && partido.jugador_2);
  const puedeEditar =
    isAdmin &&
    partido.estado === "Finalizado" &&
    partido.resultado !== "W.O.";
  const games = parsearGamesPorJugador(partido.resultado);
  const esWO = partido.resultado === "W.O.";
  const programado = Boolean(partido.fecha_horario || partido.cancha);

  function derechaDe(fila: 1 | 2) {
    if (games) {
      const marcador = (
        <MarcadorFila
          games={fila === 1 ? games.j1 : games.j2}
          ganador={fila === 1 ? j1Gana : j2Gana}
        />
      );
      if (!puedeEditar) return marcador;
      return (
        <button
          type="button"
          onClick={() => onCargarResultado(partido)}
          className="h-auto p-0"
          style={{ minHeight: 0 }}
          aria-label="Editar resultado"
        >
          {marcador}
        </button>
      );
    }
    if (esWO) {
      const ganoEstaFila = fila === 1 ? j1Gana : j2Gana;
      if (!ganoEstaFila) return null;
      return (
        <span
          className="text-[10px] font-semibold leading-none"
          style={{ color: TEMA_LLAVES.acento }}
        >
          WO
        </span>
      );
    }
    return null;
  }

  return (
    <div ref={cardRef} className="w-full min-w-0 max-w-full">
      <div
        className="overflow-hidden rounded-lg border"
        style={{
          backgroundColor: TEMA_LLAVES.fondoPartido,
          borderColor: resaltado ? `${TEMA_LLAVES.acento}73` : TEMA_LLAVES.borde,
        }}
      >
        <FilaJugador
          nombre={nombreAsiento(partido.jugador_1, vacio)}
          ganador={j1Gana}
          derecha={derechaDe(1)}
        />
        <div className="mx-2 h-px" style={{ backgroundColor: TEMA_LLAVES.borde }} />
        <FilaJugador
          nombre={nombreAsiento(partido.jugador_2, vacio)}
          ganador={j2Gana}
          derecha={derechaDe(2)}
        />
        {puedeCargar ? (
          <BarraAccionesAdmin
            programado={programado}
            onProgramar={() => onProgramarPartido(partido)}
            onCargar={() => onCargarResultado(partido)}
          />
        ) : null}
      </div>
    </div>
  );
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
  const primera = columnas[0]?.partidos.length ?? 1;
  const alto = Math.max(320, primera * 104 + 72);

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
  }, [partidos, columnas.length, alto]);

  if (columnas.length === 0) return null;

  return (
    <div
      className="w-full overflow-hidden overscroll-none rounded-2xl border p-3 sm:p-4"
      style={{
        backgroundColor: TEMA_LLAVES.fondoPartido,
        borderColor: TEMA_LLAVES.borde,
      }}
    >
      <div
        ref={marcoRef}
        className="relative w-full overflow-hidden"
        style={{ height: alto }}
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

        <div className="relative z-10 flex h-full w-full">
          {columnas.map((columna, indice) => {
            const activa = rondaResaltada === columna.fase;
            const esUltima = indice === columnas.length - 1;
            return (
              <div
                key={columna.fase}
                className={`flex h-full min-w-0 flex-1 flex-col ${
                  esUltima ? "pr-0" : "pr-4 sm:pr-6"
                }`}
              >
                <p
                  className="mb-2 shrink-0 truncate text-center text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px]"
                  style={{
                    color: activa ? TEMA_LLAVES.acento : TEMA_LLAVES.subtitulo,
                  }}
                >
                  {RONDA_CUADRO_LABELS[columna.fase] ?? columna.fase}
                </p>
                <div className="flex min-h-0 flex-1 flex-col">
                  {columna.partidos.map((partido) => (
                    <div
                      key={partido.id}
                      className="flex min-h-0 flex-1 items-center"
                    >
                      <TarjetaPartido
                        partido={partido}
                        resaltado={activa}
                        isAdmin={isAdmin}
                        onCargarResultado={onCargarResultado}
                        onProgramarPartido={onProgramarPartido}
                        cardRef={(el) => {
                          if (el) nodosRef.current.set(String(partido.id), el);
                          else nodosRef.current.delete(String(partido.id));
                        }}
                      />
                    </div>
                  ))}
                  {esUltima && columna.fase === "Final" && columna.partidos[0] ? (
                    <TarjetaCampeon partidoFinal={columna.partidos[0]} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
