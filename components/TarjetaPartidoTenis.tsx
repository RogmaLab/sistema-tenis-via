"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, MoreVertical, Pencil } from "lucide-react";
import { formatProgramacionPartido } from "@/lib/datetime";
import { nombreJugador } from "@/lib/nombre";
import { BadgeEnCancha, estaEnCancha } from "@/components/BadgeEnCancha";

export interface DatosPartidoTarjeta {
  id: string;
  estado: string;
  resultado: string | null;
  ganador_id: string | null;
  fecha_programada: string | null;
  cancha: string | null;
  suspendido_lluvia?: boolean;
  jugador_1: { id?: string; nombre_completo: string } | null;
  jugador_2: { id?: string; nombre_completo: string } | null;
  origen_slot_1?: string | null;
  origen_slot_2?: string | null;
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
  onSuspenderPorLluvia?: () => void;
}

function etiquetaCasillero(
  jugador: { nombre_completo: string } | null,
  partido: DatosPartidoTarjeta,
  casilleroPendiente: "por-definir" | "esperando-rival",
  origenSlot?: string | null
) {
  if (jugador?.nombre_completo) return nombreJugador(jugador);
  if (partido.resultado === "W.O.") return "BYE";
  if (origenSlot) return origenSlot;
  return casilleroPendiente === "esperando-rival"
    ? "Esperando rival..."
    : "Por definir";
}

function esTextoPlaceholder(nombre: string) {
  return (
    nombre === "Esperando rival..." ||
    nombre === "Por definir" ||
    nombre.startsWith("Ganador ")
  );
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

function MenuOpcionesPartido({
  onSuspenderPorLluvia,
}: {
  onSuspenderPorLluvia: () => void;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!menuAbierto) return;

    function cerrarMenu() {
      setMenuAbierto(false);
    }

    document.addEventListener("click", cerrarMenu);
    return () => document.removeEventListener("click", cerrarMenu);
  }, [menuAbierto]);

  function handleSuspender() {
    setMenuAbierto(false);
    const confirmado = window.confirm("¿Este partido se suspendió por lluvia?");
    if (!confirmado) return;
    onSuspenderPorLluvia();
  }

  return (
    <div className="relative shrink-0" data-export-hide>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setMenuAbierto((prev) => !prev);
        }}
        aria-label="Más opciones del partido"
        aria-expanded={menuAbierto}
        className="-mr-0.5 rounded-md p-1 text-foreground/40 transition hover:bg-background/60 hover:text-foreground/70"
      >
        <MoreVertical size={14} strokeWidth={2.25} />
      </button>

      {menuAbierto ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className="absolute right-0 top-full z-20 mt-1 min-w-[11.5rem] overflow-hidden rounded-lg border border-border bg-surface shadow-xl shadow-black/40"
        >
          <button
            type="button"
            onClick={handleSuspender}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-amber-400/90 transition hover:bg-amber-500/10 hover:text-amber-300"
          >
            🌧️ Suspender por lluvia
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BadgeProgramacion({
  fecha,
  cancha,
  estado,
  ambosJugadores,
  suspendidoLluvia,
  mostrarMenuSuspension,
  onSuspenderPorLluvia,
}: {
  fecha: string | null;
  cancha: string | null;
  estado: string;
  ambosJugadores: boolean;
  suspendidoLluvia?: boolean;
  mostrarMenuSuspension: boolean;
  onSuspenderPorLluvia?: () => void;
}) {
  const pendiente = estado === "Pendiente";
  const enCancha = estaEnCancha({ fechaProgramada: fecha, estado });
  const tieneHorario = Boolean(fecha || cancha);
  const mostrarPendiente =
    pendiente && ambosJugadores && !tieneHorario && !suspendidoLluvia;
  const mostrarSuspendido =
    Boolean(suspendidoLluvia) && pendiente && ambosJugadores;

  if (!tieneHorario && !enCancha && !mostrarPendiente && !mostrarSuspendido) {
    return null;
  }

  return (
    <div className="tarjeta-programacion flex items-center justify-between gap-2 border-b border-border/70 bg-background/50 px-2.5 py-1.5 text-[10px] font-medium leading-snug text-foreground/75">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {mostrarSuspendido ? (
          <span className="inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400/95">
            ⚠️ Suspendido por lluvia
          </span>
        ) : (
          <>
            {fecha ? (
              <span className="tarjeta-programacion-horario">
                🗓️ {formatProgramacionPartido(fecha)}
              </span>
            ) : null}
            {fecha && cancha ? (
              <span className="mx-0.5 text-foreground/25">|</span>
            ) : null}
            {cancha ? (
              <span className="tarjeta-programacion-cancha">📍 {cancha}</span>
            ) : null}
            {mostrarPendiente ? (
              <span className="tarjeta-programacion-pendiente">A programar</span>
            ) : null}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {mostrarMenuSuspension && onSuspenderPorLluvia ? (
          <MenuOpcionesPartido onSuspenderPorLluvia={onSuspenderPorLluvia} />
        ) : null}
        {enCancha ? (
          <span data-export-hide>
            <BadgeEnCancha compacto />
          </span>
        ) : null}
      </div>
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
      data-export-fila={
        finalizado && esGanador
          ? "ganador"
          : finalizado && esPerdedor
            ? "perdedor"
            : undefined
      }
      className={`fila-scoreboard flex items-center gap-2 px-2.5 ${compacto ? "min-h-8 py-0.5" : "min-h-9 py-1"}`}
      style={
        finalizado && esGanador
          ? {
              backgroundColor: "rgba(16, 185, 129, 0.22)",
              boxShadow: "inset 3px 0 0 #10b981",
            }
          : undefined
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {finalizado && esGanador ? (
          <Check
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "#10b981" }}
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
              ? "font-normal italic"
              : finalizado && esGanador
                ? "font-bold"
                : finalizado && esPerdedor
                  ? "font-medium"
                  : nombre === "BYE"
                    ? "font-medium uppercase tracking-wide"
                    : "font-medium"
          }`}
          style={{
            color: esPlaceholder
              ? "#737373"
              : finalizado && esGanador
                ? "#ecfdf5"
                : finalizado && esPerdedor
                  ? "#9ca3af"
                  : nombre === "BYE"
                    ? "#9ca3af"
                    : "#f5f5f5",
          }}
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
                  className="min-w-[1.1rem] text-right text-[11px] font-semibold leading-none sm:text-xs"
                  style={{
                    color: finalizado && ganoEsteSet
                      ? "#ffffff"
                      : finalizado && perdioEsteSet
                        ? "#6b7280"
                        : "#a3a3a3",
                  }}
                >
                  {game}
                </span>
              );
            })}
          </span>
        ) : null}
        {esWO && esGanador ? (
          <span
            className="text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "#34d399" }}
          >
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
  onSuspenderPorLluvia,
}: TarjetaPartidoTenisProps) {
  const finalizado = partido.estado === "Finalizado";
  const pendiente = partido.estado === "Pendiente";
  const esWO = partido.resultado === "W.O.";
  const sets = parsearSets(partido.resultado);
  const j1Nombre = etiquetaCasillero(
    partido.jugador_1,
    partido,
    casilleroPendiente,
    partido.origen_slot_1
  );
  const j2Nombre = etiquetaCasillero(
    partido.jugador_2,
    partido,
    casilleroPendiente,
    partido.origen_slot_2
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
  const puedeProgramar = isAdmin && pendiente && Boolean(onProgramarPartido);
  const puedeCargar =
    isAdmin &&
    pendiente &&
    Boolean(partido.jugador_1 && partido.jugador_2);
  const puedeEditar =
    isAdmin && finalizado && !esWO && Boolean(onCargarResultado);
  const puedeSuspenderPorLluvia =
    isAdmin &&
    pendiente &&
    programado &&
    Boolean(partido.jugador_1 && partido.jugador_2) &&
    Boolean(onSuspenderPorLluvia);

  return (
    <div ref={cardRef} className="tarjeta-partido-wrap w-full min-w-0 max-w-full">
      <div
        className={`tarjeta-partido overflow-hidden rounded-lg border bg-[#1a1a1a] ${
          resaltado ? "border-accent/45" : "border-[#3f3f46]"
        }`}
      >
        <BadgeProgramacion
          fecha={partido.fecha_programada}
          cancha={partido.cancha}
          estado={partido.estado}
          ambosJugadores={Boolean(partido.jugador_1 && partido.jugador_2)}
          suspendidoLluvia={partido.suspendido_lluvia}
          mostrarMenuSuspension={puedeSuspenderPorLluvia}
          onSuspenderPorLluvia={onSuspenderPorLluvia}
        />

        {(etiqueta || (pendiente || finalizado)) && etiqueta ? (
          <div
            data-export-hide
            className="flex items-center justify-between gap-2 border-b border-border/50 px-2.5 py-1"
          >
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
        <div className="tarjeta-partido-sep mx-2 h-px bg-[#3f3f46]" />
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
          <div
            data-export-hide
            className="flex gap-1.5 border-t border-[#3f3f46] p-1.5 print:hidden"
          >
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
                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border border-[#3f3f46] bg-background/40 px-2 py-1 text-[10px] font-semibold text-foreground/80 transition hover:bg-background/70 hover:text-foreground"
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
