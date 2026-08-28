"use client";

import { Calendar, Check, Pencil } from "lucide-react";
import { formatProgramacionPartido } from "@/lib/datetime";
import { BadgeEnCancha, estaEnCancha } from "@/components/BadgeEnCancha";

export interface DatosPartidoTarjeta {
  id: string;
  estado: string;
  resultado: string | null;
  ganador_id: string | null;
  fecha_programada: string | null;
  cancha: string | null;
  jugador_1: { id?: string; nombre_completo: string } | null;
  jugador_2: { id?: string; nombre_completo: string } | null;
}

interface TarjetaPartidoTenisProps {
  partido: DatosPartidoTarjeta;
  isAdmin: boolean;
  etiqueta?: string;
  resaltado?: boolean;
  compacto?: boolean;
  /** Casilleros vacíos sin BYE: cuadro → esperando rival; clasificación → por definir. */
  casilleroPendiente?: "por-definir" | "esperando-rival";
  cardRef?: (el: HTMLDivElement | null) => void;
  onCargarResultado?: () => void;
  onProgramarPartido?: () => void;
}

function etiquetaCasillero(
  jugador: { nombre_completo: string } | null,
  partido: DatosPartidoTarjeta,
  casilleroPendiente: "por-definir" | "esperando-rival"
) {
  if (jugador?.nombre_completo) return jugador.nombre_completo;
  if (partido.resultado === "W.O.") return "BYE";
  return casilleroPendiente === "esperando-rival"
    ? "Esperando rival..."
    : "Por definir";
}

function esTextoPlaceholder(nombre: string) {
  return nombre === "Esperando rival..." || nombre === "Por definir";
}

function parsearSets(resultado: string | null) {
  if (!resultado || resultado === "W.O.") return null;
  const j1: string[] = [];
  const j2: string[] = [];
  for (const parte of resultado.split(",")) {
    const [a, b] = parte.trim().split("-").map((valor) => valor.trim());
    if (!a || !b) continue;
    j1.push(a);
    j2.push(b);
  }
  return j1.length > 0 ? { j1, j2 } : null;
}

function BadgeProgramacion({
  fecha,
  cancha,
  estado,
}: {
  fecha: string | null;
  cancha: string | null;
  estado: string;
}) {
  const enCancha = estaEnCancha({ fechaProgramada: fecha, estado });

  if (!fecha && !cancha && !enCancha) return null;
  
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-background/50 px-2.5 py-1.5 text-[10px] font-medium leading-snug text-foreground/75">
      <div className="flex flex-wrap items-center gap-1">
        {fecha ? (
          <span>
            🗓️ {formatProgramacionPartido(fecha)}
          </span>
        ) : null}
        {fecha && cancha ? (
          <span className="mx-0.5 text-foreground/25">|</span>
        ) : null}
        {cancha ? <span>📍 {cancha}</span> : null}
      </div>
      
      {/* Badge EN CANCHA */}
      {enCancha ? (
        <BadgeEnCancha compacto />
      ) : null}
    </div>
  );
}

function FilaScoreboard({
  nombre,
  games,
  gamesRival,
  esGanador,
  esPerdedor,
  finalizado,
  esWO,
  compacto,
  esPlaceholder,
}: {
  nombre: string;
  games: string[] | null;
  gamesRival: string[] | null;
  esGanador: boolean;
  esPerdedor: boolean;
  finalizado: boolean;
  esWO: boolean;
  compacto: boolean;
  esPlaceholder: boolean;
}) {
  const texto = compacto ? "text-[12px] sm:text-[13px]" : "text-xs sm:text-sm";

  return (
    <div
      className={`flex items-center gap-2 px-2.5 ${compacto ? "min-h-8 py-0.5" : "min-h-9 py-1"}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {finalizado && esGanador ? (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-emerald-500"
            strokeWidth={3}
            aria-hidden
          />
        ) : finalizado ? (
          <span className="inline-block w-3.5 shrink-0" aria-hidden />
        ) : null}
        <span
          title={nombre}
          className={`truncate leading-tight ${texto} ${
            esPlaceholder
              ? "font-normal italic text-foreground/40"
              : finalizado && esGanador
                ? "font-bold text-white"
                : finalizado && esPerdedor
                  ? "font-medium text-foreground/35"
                  : nombre === "BYE"
                    ? "font-medium uppercase tracking-wide text-foreground/45"
                    : "font-medium text-foreground"
          }`}
        >
          {nombre}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-end">
        {games && games.length > 0 ? (
          <span className="flex items-center gap-1.5 tabular-nums">
            {games.map((game, i) => {
              const gameNum = Number(game);
              const rivalGameNum = gamesRival?.[i] ? Number(gamesRival[i]) : 0;
              const ganoEsteSet = gameNum > rivalGameNum;
              const perdioEsteSet = gameNum < rivalGameNum;
              
              return (
                <span
                  key={`${game}-${i}`}
                  className={`min-w-[1.1rem] text-right text-[11px] font-semibold leading-none sm:text-xs ${
                    finalizado && ganoEsteSet
                      ? "text-white"
                      : finalizado && perdioEsteSet
                        ? "text-foreground/30"
                        : "text-foreground/55"
                  }`}
                >
                  {game}
                </span>
              );
            })}
          </span>
        ) : null}
        {esWO && esGanador ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent">
            W.O.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TarjetaPartidoTenis({
  partido,
  isAdmin,
  etiqueta,
  resaltado = false,
  compacto = false,
  casilleroPendiente = "por-definir",
  cardRef,
  onCargarResultado,
  onProgramarPartido,
}: TarjetaPartidoTenisProps) {
  const finalizado = partido.estado === "Finalizado";
  const pendiente = partido.estado === "Pendiente";
  const esWO = partido.resultado === "W.O.";
  const sets = parsearSets(partido.resultado);
  const j1Nombre = etiquetaCasillero(
    partido.jugador_1,
    partido,
    casilleroPendiente
  );
  const j2Nombre = etiquetaCasillero(
    partido.jugador_2,
    partido,
    casilleroPendiente
  );
  const j1Gana = Boolean(
    partido.ganador_id && partido.ganador_id === partido.jugador_1?.id
  );
  const j2Gana = Boolean(
    partido.ganador_id && partido.ganador_id === partido.jugador_2?.id
  );
  const j1Pierde = finalizado && !j1Gana && Boolean(partido.jugador_1);
  const j2Pierde = finalizado && !j2Gana && Boolean(partido.jugador_2);
  const programado = Boolean(partido.fecha_programada || partido.cancha);
  const puedeProgramar =
    isAdmin && pendiente && Boolean(partido.jugador_1 && partido.jugador_2);
  const puedeCargar =
    isAdmin &&
    pendiente &&
    Boolean(partido.jugador_1 && partido.jugador_2);
  const puedeEditar =
    isAdmin && finalizado && !esWO && Boolean(onCargarResultado);

  return (
    <div ref={cardRef} className="w-full min-w-0 max-w-full">
      <div
        className={`overflow-hidden rounded-lg border bg-[#1a1a1a] ${
          resaltado ? "border-accent/45" : "border-[#3f3f46]"
        }`}
      >
        <BadgeProgramacion
          fecha={partido.fecha_programada}
          cancha={partido.cancha}
          estado={partido.estado}
        />

        {(etiqueta || (pendiente || finalizado)) && etiqueta ? (
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2.5 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
              {etiqueta}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                finalizado
                  ? "bg-accent/15 text-accent"
                  : "bg-foreground/10 text-foreground/50"
              }`}
            >
              {finalizado ? "Finalizado" : "Pendiente"}
            </span>
          </div>
        ) : null}

        <FilaScoreboard
          nombre={j1Nombre}
          games={sets?.j1 ?? null}
          gamesRival={sets?.j2 ?? null}
          esGanador={j1Gana}
          esPerdedor={j1Pierde}
          finalizado={finalizado}
          esWO={esWO}
          compacto={compacto}
          esPlaceholder={esTextoPlaceholder(j1Nombre)}
        />
        <div className="mx-2 h-px bg-[#3f3f46]" />
        <FilaScoreboard
          nombre={j2Nombre}
          games={sets?.j2 ?? null}
          gamesRival={sets?.j1 ?? null}
          esGanador={j2Gana}
          esPerdedor={j2Pierde}
          finalizado={finalizado}
          esWO={esWO}
          compacto={compacto}
          esPlaceholder={esTextoPlaceholder(j2Nombre)}
        />

        {isAdmin && (puedeProgramar || puedeCargar || puedeEditar) ? (
          <div className="flex gap-1.5 border-t border-[#3f3f46] p-1.5">
            {puedeProgramar && onProgramarPartido ? (
              <button
                type="button"
                onClick={onProgramarPartido}
                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border border-[#3f3f46] px-2 py-1 text-[10px] font-semibold text-foreground/70 transition hover:bg-background/60 hover:text-foreground"
              >
                <Calendar size={12} strokeWidth={2.25} />
                {programado ? "Editar horario" : "Programar"}
              </button>
            ) : null}
            {(puedeCargar || puedeEditar) && onCargarResultado ? (
              <button
                type="button"
                onClick={onCargarResultado}
                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-accent-hover active:scale-[0.98]"
              >
                <Pencil size={12} strokeWidth={2.25} />
                {pendiente ? "Cargar Resultado" : "Editar Resultado"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
