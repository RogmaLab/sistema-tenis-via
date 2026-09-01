import {
  compararPuntajesRanking,
  esJugadorHumano,
  esPartidoEntreHumanos,
  type PartidoParaRanking,
} from "@/lib/motor-ranking";
import { nombreJugador } from "@/lib/nombre";
import { statsCuentanParaRanking } from "@/lib/categoria-nivel";

export type PuestoTrofeo = 1 | 2 | 3;

export interface TrofeoPerfil {
  torneoId: string;
  torneoNombre: string;
  categoria: string;
  puesto: PuestoTrofeo;
}

export interface ProximoPartidoPerfil {
  torneoId: string;
  torneoNombre: string;
  rivalNombre: string;
  cancha: string | null;
  fecha_programada: string;
  fase: string;
}

export function formatPuesto(puesto: number) {
  return `${puesto}°`;
}

export function posicionRankingEnCategoria(params: {
  jugadorId: string;
  categoria: string;
  jugadores: {
    id: string;
    categoria: string;
    nombre_completo: string;
    puntos: number;
    partidosGanados: number;
    diferenciaGames: number;
  }[];
}): { puesto: number; total: number } | null {
  const deLaCategoria = params.jugadores
    .filter((jugador) => jugador.categoria === params.categoria)
    .sort(compararPuntajesRanking);
  const indice = deLaCategoria.findIndex(
    (jugador) => jugador.id === params.jugadorId
  );
  if (indice < 0) return null;
  return { puesto: indice + 1, total: deLaCategoria.length };
}

/** Partidos reales (dos humanos), no BYE ni cuadros inferiores a la ficha. */
export function contarPartidosJugados(
  jugadorId: string,
  partidos: PartidoParaRanking[],
  categoriaFicha?: string | null
) {
  return partidos.filter(
    (partido) =>
      esPartidoEntreHumanos(partido) &&
      (partido.jugador_1_id === jugadorId || partido.jugador_2_id === jugadorId) &&
      statsCuentanParaRanking(categoriaFicha, partido.categoria)
  ).length;
}

function jugadorEnPartido(
  partido: {
    jugador_1_id: string | null;
    jugador_2_id: string | null;
  },
  jugadorId: string
) {
  return (
    partido.jugador_1_id === jugadorId || partido.jugador_2_id === jugadorId
  );
}

function perdioPartido(
  partido: {
    ganador_id: string | null;
    jugador_1_id: string | null;
    jugador_2_id: string | null;
  },
  jugadorId: string
) {
  if (!jugadorEnPartido(partido, jugadorId)) return false;
  if (!esJugadorHumano(partido.ganador_id)) return false;
  return partido.ganador_id !== jugadorId;
}

/**
 * 1° ganó la Final, 2° la perdió, 3° perdió una Semifinal
 * (sin 3er puesto aparte). Un (torneo, categoría) = un trofeo.
 */
export function extraerTrofeos(params: {
  jugadorId: string;
  categoriaFicha?: string | null;
  torneosFinalizados: { id: string; nombre: string }[];
  partidos: {
    torneo_id: string | null;
    categoria: string | null;
    fase: string | null;
    estado: string | null;
    ganador_id: string | null;
    jugador_1_id: string | null;
    jugador_2_id: string | null;
  }[];
}): TrofeoPerfil[] {
  const nombrePorTorneo = new Map(
    params.torneosFinalizados.map((torneo) => [torneo.id, torneo.nombre])
  );
  const idsFinalizados = new Set(params.torneosFinalizados.map((t) => t.id));

  const grupos = new Map<string, typeof params.partidos>();
  for (const partido of params.partidos) {
    const torneoId = partido.torneo_id?.trim();
    if (!torneoId || !idsFinalizados.has(torneoId)) continue;
    if (partido.estado !== "Finalizado") continue;
    if (!statsCuentanParaRanking(params.categoriaFicha, partido.categoria)) {
      continue;
    }
    const categoria = (partido.categoria ?? "").trim() || "Sin categoría";
    const clave = `${torneoId}::${categoria}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(partido);
    grupos.set(clave, lista);
  }

  const trofeos: TrofeoPerfil[] = [];

  for (const [clave, partidos] of grupos) {
    const [torneoId, categoria] = clave.split("::");
    const nombre = nombrePorTorneo.get(torneoId);
    if (!nombre) continue;

    const finales = partidos.filter((partido) => partido.fase === "Final");
    const semis = partidos.filter((partido) => partido.fase === "Semifinal");

    let puesto: PuestoTrofeo | null = null;

    const finalGanada = finales.find(
      (partido) =>
        esJugadorHumano(partido.ganador_id) &&
        partido.ganador_id === params.jugadorId
    );
    if (finalGanada) {
      puesto = 1;
    } else if (finales.some((partido) => perdioPartido(partido, params.jugadorId))) {
      puesto = 2;
    } else if (semis.some((partido) => perdioPartido(partido, params.jugadorId))) {
      puesto = 3;
    }

    if (!puesto) continue;
    trofeos.push({
      torneoId,
      torneoNombre: nombre,
      categoria,
      puesto,
    });
  }

  const ordenPuesto: Record<PuestoTrofeo, number> = { 1: 0, 2: 1, 3: 2 };
  trofeos.sort((a, b) => {
    const porPuesto = ordenPuesto[a.puesto] - ordenPuesto[b.puesto];
    if (porPuesto !== 0) return porPuesto;
    return a.torneoNombre.localeCompare(b.torneoNombre, "es");
  });

  return trofeos;
}

export function elegirProximoPartido(params: {
  jugadorId: string;
  partidos: {
    torneo_id: string;
    torneo_nombre: string;
    torneo_estado: string;
    fase: string;
    estado: string;
    cancha: string | null;
    fecha_programada: string | null;
    jugador_1_id: string | null;
    jugador_2_id: string | null;
    rival_nombre: string | null;
  }[];
  ahora?: Date;
}): ProximoPartidoPerfil | null {
  const ahora = params.ahora ?? new Date();

  const candidatos = params.partidos
    .filter((partido) => {
      if (partido.estado === "Finalizado") return false;
      if (partido.torneo_estado === "finalizado") return false;
      if (!partido.fecha_programada) return false;
      if (!jugadorEnPartido(partido, params.jugadorId)) return false;
      const fecha = new Date(partido.fecha_programada);
      if (Number.isNaN(fecha.getTime())) return false;
      return fecha.getTime() >= ahora.getTime() - 60 * 60 * 1000;
    })
    .sort(
      (a, b) =>
        new Date(a.fecha_programada!).getTime() -
        new Date(b.fecha_programada!).getTime()
    );

  const elegido = candidatos[0];
  if (!elegido?.fecha_programada) return null;

  return {
    torneoId: elegido.torneo_id,
    torneoNombre: elegido.torneo_nombre,
    rivalNombre: nombreJugador(elegido.rival_nombre, "Rival a definir"),
    cancha: elegido.cancha,
    fecha_programada: elegido.fecha_programada,
    fase: elegido.fase,
  };
}
