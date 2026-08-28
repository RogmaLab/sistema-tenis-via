export const PUNTOS_POR_PARTICIPACION = 1;
export const PUNTOS_POR_PARTIDO_GANADO = 3;
export const PUNTOS_BONUS_FINALISTA = 5;
export const PUNTOS_BONUS_CAMPEON = 10;

/** Resultado persistido de un walkover entre dos humanos (no BYE). */
export const RESULTADO_WALKOVER = "W.O.";

const FASE_FINAL = "Final";

export interface InscripcionParaRanking {
  jugador_id: string | null;
  torneo_id: string | null;
}

export interface PartidoParaRanking {
  ganador_id: string | null;
  fase: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  resultado?: string | null;
  torneo_id?: string | null;
}

export interface PuntajeRanking {
  puntos: number;
  partidosGanados: number;
  diferenciaGames: number;
}

/** Nodo BYE en el cuadro: null, vacío, "BYE" o ids sintéticos `bye-...`. */
export function esNodoBye(id: string | null | undefined) {
  if (id == null) return true;
  const valor = id.trim();
  if (valor === "" || valor === "BYE") return true;
  return valor.toLowerCase().startsWith("bye-");
}

export function esJugadorHumano(
  id: string | null | undefined
): id is string {
  return Boolean(id) && !esNodoBye(id);
}

/** Partido administrativo: un humano vs un asiento BYE. */
export function esPartidoBye(partido: PartidoParaRanking) {
  return (
    esNodoBye(partido.jugador_1_id) !== esNodoBye(partido.jugador_2_id)
  );
}

/** Cruce real: dos jugadores inscriptos, no un pase libre. */
export function esPartidoEntreHumanos(partido: PartidoParaRanking) {
  return (
    esJugadorHumano(partido.jugador_1_id) &&
    esJugadorHumano(partido.jugador_2_id)
  );
}

/** El jugador real que avanza cuando el rival es BYE. */
export function ganadorHumanoDeBye(partido: PartidoParaRanking) {
  if (!esPartidoBye(partido)) return null;
  const humano = esNodoBye(partido.jugador_1_id)
    ? partido.jugador_2_id
    : partido.jugador_1_id;
  return esJugadorHumano(humano) ? humano : null;
}

/** Victoria para PG y puntos de partido: excluye BYE. Incluye W.O. entre humanos. */
function idVictoriaRendimiento(partido: PartidoParaRanking) {
  if (esPartidoBye(partido) || !esPartidoEntreHumanos(partido)) return null;
  return esJugadorHumano(partido.ganador_id) ? partido.ganador_id : null;
}

/** Incluye BYE: sirve para bonus de campeón (quién avanzó a coronarse). */
function idAvanceParaBonus(partido: PartidoParaRanking) {
  const porBye = ganadorHumanoDeBye(partido);
  if (porBye) return porBye;
  return esJugadorHumano(partido.ganador_id) ? partido.ganador_id : null;
}

export function contarApariciones(
  filas: Record<string, string | null>[],
  columna: string
) {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const id = fila[columna];
    if (!esJugadorHumano(id)) continue;
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }
  return conteo;
}

export function contarVictoriasRanking(partidos: PartidoParaRanking[]) {
  const victorias = new Map<string, number>();
  for (const partido of partidos) {
    const ganadorId = idVictoriaRendimiento(partido);
    if (!ganadorId) continue;
    victorias.set(ganadorId, (victorias.get(ganadorId) ?? 0) + 1);
  }
  return victorias;
}

export function calcularBonusFinales(partidos: PartidoParaRanking[]) {
  const bonusPorJugador = new Map<string, number>();

  const sumarBonus = (id: string | null | undefined, puntos: number) => {
    if (!esJugadorHumano(id)) return;
    bonusPorJugador.set(id, (bonusPorJugador.get(id) ?? 0) + puntos);
  };

  for (const partido of partidos) {
    if (partido.fase !== FASE_FINAL) continue;
    const ganadorId = idAvanceParaBonus(partido);
    if (!ganadorId) continue;

    sumarBonus(ganadorId, PUNTOS_BONUS_CAMPEON);

    const perdedorId =
      partido.jugador_1_id === ganadorId
        ? partido.jugador_2_id
        : partido.jugador_2_id === ganadorId
          ? partido.jugador_1_id
          : null;

    if (!esNodoBye(perdedorId)) {
      sumarBonus(perdedorId, PUNTOS_BONUS_FINALISTA);
    }
  }

  return bonusPorJugador;
}

export function puntajeDesdeConteos(params: {
  participaciones: number;
  partidosGanados: number;
  bonus: number;
}): PuntajeRanking {
  return {
    partidosGanados: params.partidosGanados,
    diferenciaGames: 0,
    puntos:
      params.participaciones * PUNTOS_POR_PARTICIPACION +
      params.partidosGanados * PUNTOS_POR_PARTIDO_GANADO +
      params.bonus,
  };
}

/** Sets parseables de un resultado ("6-4, 3-6, 10-7"). W.O. y BYE no aportan games. */
export function parsearSetsResultado(resultado: string | null | undefined) {
  if (!resultado || resultado.trim() === RESULTADO_WALKOVER) return [];

  const sets: { j1: number; j2: number }[] = [];
  for (const parte of resultado.split(",")) {
    const [a, b] = parte.trim().split("-").map((valor) => valor.trim());
    const gamesJ1 = Number(a);
    const gamesJ2 = Number(b);
    if (!Number.isFinite(gamesJ1) || !Number.isFinite(gamesJ2)) continue;
    sets.push({ j1: gamesJ1, j2: gamesJ2 });
  }
  return sets;
}

/**
 * Detecta si un set es un Super Tie-Break.
 * Un Super Tie-Break típicamente se juega a 10 puntos (con ventaja de 2),
 * por lo que uno de los jugadores tendrá 10+ puntos.
 */
export function esSuperTieBreak(set: { j1: number; j2: number }): boolean {
  const max = Math.max(set.j1, set.j2);
  const min = Math.min(set.j1, set.j2);
  
  // Super Tie-Break: el ganador tiene 10+ puntos
  // Ejemplos: 10-3, 10-8, 11-9, 12-10, etc.
  return max >= 10 && min < max;
}

/**
 * Games ganados menos games perdidos.
 * Solo partidos jugados entre dos personas con marcador de sets.
 * BYE y W.O. no aportan games.
 * Los Super Tie-Breaks se cuentan como 1-0 para evitar distorsionar el diferencial.
 */
export function diferenciaGamesCircuito(partidos: PartidoParaRanking[]) {
  const diferencia = new Map<string, number>();
  const sumar = (id: string | null | undefined, delta: number) => {
    if (!esJugadorHumano(id) || delta === 0) return;
    diferencia.set(id, (diferencia.get(id) ?? 0) + delta);
  };

  for (const partido of partidos) {
    if (esPartidoBye(partido) || !esPartidoEntreHumanos(partido)) continue;
    const sets = parsearSetsResultado(partido.resultado);
    if (sets.length === 0) continue;

    let gamesJ1 = 0;
    let gamesJ2 = 0;
    for (const set of sets) {
      if (esSuperTieBreak(set)) {
        // Super Tie-Break: cuenta como 1 game para el ganador, 0 para el perdedor
        if (set.j1 > set.j2) {
          gamesJ1 += 1;
        } else {
          gamesJ2 += 1;
        }
      } else {
        // Set normal: suma los games reales
        gamesJ1 += set.j1;
        gamesJ2 += set.j2;
      }
    }

    sumar(partido.jugador_1_id, gamesJ1 - gamesJ2);
    sumar(partido.jugador_2_id, gamesJ2 - gamesJ1);
  }

  return diferencia;
}

export function compararPuntajesRanking(
  a: {
    puntos: number;
    partidosGanados: number;
    diferenciaGames?: number;
    nombre_completo?: string;
  },
  b: {
    puntos: number;
    partidosGanados: number;
    diferenciaGames?: number;
    nombre_completo?: string;
  }
) {
  if (b.puntos !== a.puntos) return b.puntos - a.puntos;
  if (b.partidosGanados !== a.partidosGanados) {
    return b.partidosGanados - a.partidosGanados;
  }
  const diffA = a.diferenciaGames ?? 0;
  const diffB = b.diferenciaGames ?? 0;
  if (diffB !== diffA) return diffB - diffA;
  if (a.nombre_completo && b.nombre_completo) {
    return a.nombre_completo.localeCompare(b.nombre_completo, "es");
  }
  return 0;
}

/**
 * W.O. disciplinario: dos humanos, resultado W.O.
 * Un BYE (humano vs asiento vacío) no cuenta: es administrativo.
 */
export function esWalkoverDisciplinario(partido: PartidoParaRanking) {
  if ((partido.resultado ?? "").trim() !== RESULTADO_WALKOVER) return false;
  if (esPartidoBye(partido)) return false;
  return (
    esJugadorHumano(partido.jugador_1_id) &&
    esJugadorHumano(partido.jugador_2_id)
  );
}

/** Quien dio el W.O. / no se presentó: el perdedor humano del cruce. */
export function perdedorWalkoverDisciplinario(
  partido: PartidoParaRanking
): string | null {
  if (!esWalkoverDisciplinario(partido)) return null;
  const ganadorId = esJugadorHumano(partido.ganador_id)
    ? partido.ganador_id
    : null;
  if (!ganadorId) return null;

  if (partido.jugador_1_id === ganadorId) {
    return esJugadorHumano(partido.jugador_2_id) ? partido.jugador_2_id : null;
  }
  if (partido.jugador_2_id === ganadorId) {
    return esJugadorHumano(partido.jugador_1_id) ? partido.jugador_1_id : null;
  }
  return null;
}

function agrupadosPorTorneo<T extends { torneo_id?: string | null }>(
  filas: T[]
): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const fila of filas) {
    const torneoId = fila.torneo_id?.trim();
    if (!torneoId) continue;
    const lista = grupos.get(torneoId) ?? [];
    lista.push(fila);
    grupos.set(torneoId, lista);
  }
  return grupos;
}

/**
 * Puntos de ranking: se calculan por torneo y después se suman.
 * Un W.O. en contra (no presentación) deja en 0 los puntos de esa
 * competencia, aunque el jugador haya ganado partidos antes.
 */
export function calcularPuntajesRanking(
  inscripciones: InscripcionParaRanking[],
  partidos: PartidoParaRanking[]
): Map<
  string,
  PuntajeRanking & { participaciones: number }
> {
  const inscripcionesPorTorneo = agrupadosPorTorneo(inscripciones);
  const partidosPorTorneo = agrupadosPorTorneo(partidos);
  const torneoIds = new Set([
    ...inscripcionesPorTorneo.keys(),
    ...partidosPorTorneo.keys(),
  ]);

  const totales = new Map<
    string,
    {
      participaciones: number;
      partidosGanados: number;
      puntos: number;
      diferenciaGames: number;
    }
  >();

  const acumular = (
    jugadorId: string,
    delta: {
      participaciones: number;
      partidosGanados: number;
      puntos: number;
    }
  ) => {
    const actual = totales.get(jugadorId) ?? {
      participaciones: 0,
      partidosGanados: 0,
      puntos: 0,
      diferenciaGames: 0,
    };
    totales.set(jugadorId, {
      participaciones: actual.participaciones + delta.participaciones,
      partidosGanados: actual.partidosGanados + delta.partidosGanados,
      puntos: actual.puntos + delta.puntos,
      diferenciaGames: actual.diferenciaGames,
    });
  };

  for (const torneoId of torneoIds) {
    const inscripcionesTorneo = inscripcionesPorTorneo.get(torneoId) ?? [];
    const partidosTorneo = partidosPorTorneo.get(torneoId) ?? [];

    const penalizados = new Set<string>();
    for (const partido of partidosTorneo) {
      const perdedorId = perdedorWalkoverDisciplinario(partido);
      if (perdedorId) penalizados.add(perdedorId);
    }

    const participaciones = new Map<string, number>();
    for (const fila of inscripcionesTorneo) {
      if (!esJugadorHumano(fila.jugador_id)) continue;
      participaciones.set(
        fila.jugador_id,
        (participaciones.get(fila.jugador_id) ?? 0) + 1
      );
    }
    const victorias = contarVictoriasRanking(partidosTorneo);
    const bonus = calcularBonusFinales(partidosTorneo);

    const jugadorIds = new Set<string>([
      ...participaciones.keys(),
      ...victorias.keys(),
      ...bonus.keys(),
      ...penalizados,
    ]);

    for (const jugadorId of jugadorIds) {
      if (!esJugadorHumano(jugadorId)) continue;
      const participacionesTorneo = participaciones.get(jugadorId) ?? 0;
      const partidosGanadosTorneo = victorias.get(jugadorId) ?? 0;
      const bonusTorneo = bonus.get(jugadorId) ?? 0;
      const puntajeTorneo = puntajeDesdeConteos({
        participaciones: participacionesTorneo,
        partidosGanados: partidosGanadosTorneo,
        bonus: bonusTorneo,
      });

      acumular(jugadorId, {
        participaciones: participacionesTorneo,
        partidosGanados: partidosGanadosTorneo,
        puntos: penalizados.has(jugadorId) ? 0 : puntajeTorneo.puntos,
      });
    }
  }

  const diferencias = diferenciaGamesCircuito(partidos);
  for (const [jugadorId, diferenciaGames] of diferencias) {
    const actual = totales.get(jugadorId);
    if (actual) {
      totales.set(jugadorId, { ...actual, diferenciaGames });
    } else {
      totales.set(jugadorId, {
        participaciones: 0,
        partidosGanados: 0,
        puntos: 0,
        diferenciaGames,
      });
    }
  }

  return totales;
}
