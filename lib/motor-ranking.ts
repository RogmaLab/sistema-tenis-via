export const PUNTOS_POR_PARTICIPACION = 1;
export const PUNTOS_POR_PARTIDO_GANADO = 3;
export const PUNTOS_BONUS_FINALISTA = 5;
export const PUNTOS_BONUS_CAMPEON = 10;

const FASE_FINAL = "Final";

export interface PartidoParaRanking {
  ganador_id: string | null;
  fase: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  resultado?: string | null;
}

export interface PuntajeRanking {
  puntos: number;
  partidosGanados: number;
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

/** El jugador real que avanza cuando el rival es BYE. */
export function ganadorHumanoDeBye(partido: PartidoParaRanking) {
  if (!esPartidoBye(partido)) return null;
  const humano = esNodoBye(partido.jugador_1_id)
    ? partido.jugador_2_id
    : partido.jugador_1_id;
  return esJugadorHumano(humano) ? humano : null;
}

function idVictoriaParaRanking(partido: PartidoParaRanking) {
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
    const ganadorId = idVictoriaParaRanking(partido);
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
    const ganadorId = idVictoriaParaRanking(partido);
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
    puntos:
      params.participaciones * PUNTOS_POR_PARTICIPACION +
      params.partidosGanados * PUNTOS_POR_PARTIDO_GANADO +
      params.bonus,
  };
}
