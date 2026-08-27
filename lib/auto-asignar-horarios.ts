import { fromDateAndTimeValues, snapHoraAMediaHora } from "@/lib/datetime";
import { esJugadorHumano } from "@/lib/motor-ranking";
import type { DiaFinDeSemana, VentanaCancha } from "@/lib/disponibilidad-canchas";

export interface BloqueHorario {
  cancha: string;
  inicioMs: number;
  finMs: number;
  fecha_programada: string;
}

export interface PartidoParaAsignar {
  id: string;
  estado: string;
  tipo_fase: string | null;
  fase: string;
  ronda: string | null;
  numero_slot: number | null;
  categoria: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  fecha_programada: string | null;
  cancha: string | null;
}

export interface OcupacionExistente {
  partidoId: string;
  cancha: string | null;
  inicioMs: number;
  finMs: number;
  jugadorIds: string[];
}

export interface AsignacionHorario {
  id: string;
  cancha: string;
  fecha_programada: string;
}

const ORDEN_FASE: Record<string, number> = {
  Clasificacion: 0,
  "Fase de Grupos": 1,
  "Dieciseisavos de Final": 2,
  "Octavos de Final": 3,
  "Cuartos de Final": 4,
  Semifinal: 5,
  Final: 6,
};

function pad(valor: number) {
  return String(valor).padStart(2, "0");
}

function ymd(fecha: Date) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function minutosDeHora(hora: string) {
  const normalizada = snapHoraAMediaHora(hora);
  const [hh, mm] = normalizada.split(":").map(Number);
  return hh * 60 + mm;
}

/** Próximo sábado y domingo a partir de `desde` (incluye el fin de semana en curso). */
export function fechasProximoFinDeSemana(desde = new Date()): {
  sabado: string;
  domingo: string;
} {
  const hoy = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const dia = hoy.getDay();
  const sabado = new Date(hoy);
  const domingo = new Date(hoy);

  if (dia === 6) {
    domingo.setDate(hoy.getDate() + 1);
  } else if (dia === 0) {
    sabado.setDate(hoy.getDate() - 1);
  } else {
    sabado.setDate(hoy.getDate() + (6 - dia));
    domingo.setDate(sabado.getDate() + 1);
  }

  return { sabado: ymd(sabado), domingo: ymd(domingo) };
}

export function prioridadPartido(partido: PartidoParaAsignar) {
  if (partido.tipo_fase === "clasificacion" || partido.fase === "Clasificacion") {
    return 0;
  }
  const clave = partido.ronda || partido.fase;
  return ORDEN_FASE[clave] ?? 50;
}

export function esPartidoAsignable(partido: PartidoParaAsignar) {
  if (partido.estado === "Finalizado") return false;
  return (
    esJugadorHumano(partido.jugador_1_id) &&
    esJugadorHumano(partido.jugador_2_id)
  );
}

export function generarBloquesHorarios(params: {
  ventanas: VentanaCancha[];
  fechas: Record<DiaFinDeSemana, string>;
  duracionMinutos: number;
  ahora?: Date;
}): BloqueHorario[] {
  const ahora = params.ahora ?? new Date();
  const bloques: BloqueHorario[] = [];

  for (const ventana of params.ventanas) {
    const fecha = params.fechas[ventana.dia];
    let cursor = minutosDeHora(ventana.hora_inicio);
    const fin = minutosDeHora(ventana.hora_fin);

    while (cursor + params.duracionMinutos <= fin) {
      const hh = Math.floor(cursor / 60);
      const mm = cursor % 60;
      const hora = `${pad(hh)}:${pad(mm)}`;
      const fechaProgramada = fromDateAndTimeValues(fecha, hora);
      if (!fechaProgramada) {
        cursor += params.duracionMinutos;
        continue;
      }
      const inicio = new Date(fechaProgramada);
      const finBloque = new Date(
        inicio.getTime() + params.duracionMinutos * 60 * 1000
      );
      if (inicio.getTime() >= ahora.getTime() - 5 * 60 * 1000) {
        bloques.push({
          cancha: ventana.cancha,
          inicioMs: inicio.getTime(),
          finMs: finBloque.getTime(),
          fecha_programada: fechaProgramada,
        });
      }
      cursor += params.duracionMinutos;
    }
  }

  bloques.sort((a, b) => {
    if (a.inicioMs !== b.inicioMs) return a.inicioMs - b.inicioMs;
    return a.cancha.localeCompare(b.cancha, "es");
  });

  return bloques;
}

function seSolapan(
  a: { inicioMs: number; finMs: number },
  b: { inicioMs: number; finMs: number }
) {
  return a.inicioMs < b.finMs && b.inicioMs < a.finMs;
}

function bloqueLibre(
  bloque: BloqueHorario,
  ocupaciones: OcupacionExistente[],
  jugadorIds: string[]
) {
  for (const ocupado of ocupaciones) {
    if (!seSolapan(bloque, ocupado)) continue;
    if (ocupado.cancha && ocupado.cancha === bloque.cancha) return false;
    if (ocupado.jugadorIds.some((id) => jugadorIds.includes(id))) return false;
  }
  return true;
}

export function autoAsignarHorarios(params: {
  partidos: PartidoParaAsignar[];
  bloques: BloqueHorario[];
  ocupaciones: OcupacionExistente[];
  reasignarProgramados?: boolean;
}): {
  asignaciones: AsignacionHorario[];
  sinSlot: PartidoParaAsignar[];
  omitidos: number;
} {
  const reasignar = params.reasignarProgramados === true;
  const ocupaciones = [...params.ocupaciones];
  const asignaciones: AsignacionHorario[] = [];
  const sinSlot: PartidoParaAsignar[] = [];
  let omitidos = 0;

  const pendientes = params.partidos
    .filter((partido) => {
      if (!esPartidoAsignable(partido)) {
        omitidos += 1;
        return false;
      }
      if (!reasignar && partido.fecha_programada) {
        omitidos += 1;
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const porFase = prioridadPartido(a) - prioridadPartido(b);
      if (porFase !== 0) return porFase;
      const catA = a.categoria ?? "";
      const catB = b.categoria ?? "";
      if (catA !== catB) return catA.localeCompare(catB, "es");
      return (a.numero_slot ?? 0) - (b.numero_slot ?? 0);
    });

  const bloquesUsados = new Set<string>();

  for (const partido of pendientes) {
    const jugadores = [partido.jugador_1_id!, partido.jugador_2_id!];
    const elegido = params.bloques.find((bloque) => {
      const clave = `${bloque.cancha}-${bloque.inicioMs}`;
      if (bloquesUsados.has(clave)) return false;
      return bloqueLibre(bloque, ocupaciones, jugadores);
    });

    if (!elegido) {
      sinSlot.push(partido);
      continue;
    }

    bloquesUsados.add(`${elegido.cancha}-${elegido.inicioMs}`);
    ocupaciones.push({
      partidoId: partido.id,
      cancha: elegido.cancha,
      inicioMs: elegido.inicioMs,
      finMs: elegido.finMs,
      jugadorIds: jugadores,
    });
    asignaciones.push({
      id: partido.id,
      cancha: elegido.cancha,
      fecha_programada: elegido.fecha_programada,
    });
  }

  return { asignaciones, sinSlot, omitidos };
}
