import type { MatchType, ParticipantType } from "react-tournament-brackets";

// Forma mínima de partido que necesitamos para armar el árbol visual.
// Coincide con lo que trae la vista de detalle (jugadores embebidos + cadena).
export interface PartidoParaCuadro {
  id: string;
  resultado: string | null;
  estado: string;
  ganador_id: string | null;
  fase: string;
  fecha_horario: string | null;
  siguiente_partido_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

const FASES_CUADRO = [
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Final",
] as const;

const ORDEN_FASE: Record<string, number> = {
  "Octavos de Final": 1,
  "Cuartos de Final": 2,
  Semifinal: 3,
  Final: 4,
};

function esFaseDeCuadro(fase: string) {
  return (FASES_CUADRO as readonly string[]).includes(fase);
}

function participanteDesdeJugador(
  jugador: { id: string; nombre_completo: string } | null,
  partido: PartidoParaCuadro,
  placeholderId: string
): ParticipantType {
  if (!jugador) {
    return {
      id: placeholderId,
      name: "Por definir",
      isWinner: false,
      status: "NO_PARTY",
      resultText: null,
    };
  }

  const esGanador =
    partido.estado === "Finalizado" && partido.ganador_id === jugador.id;

  return {
    id: jugador.id,
    name: jugador.nombre_completo,
    isWinner: esGanador,
    status: partido.estado === "Finalizado" ? "PLAYED" : null,
    // En partidos finalizados mostramos el marcador en la tarjeta del ganador.
    resultText:
      partido.estado === "Finalizado" && esGanador
        ? (partido.resultado ?? "Ganó")
        : partido.estado === "Finalizado"
          ? ""
          : null,
  };
}

/**
 * Adapta nuestros partidos de Supabase al formato MatchType[] que exige
 * `react-tournament-brackets` (SingleEliminationBracket).
 * Solo incluye fases del cuadro eliminatorio (Octavos → Final).
 */
export function adaptarPartidosABracket(
  partidos: PartidoParaCuadro[]
): MatchType[] {
  const delCuadro = partidos.filter((partido) => esFaseDeCuadro(partido.fase));

  const adaptados = delCuadro.map((partido) => {
    const participants: ParticipantType[] = [
      participanteDesdeJugador(partido.jugador_1, partido, `${partido.id}-j1`),
      participanteDesdeJugador(partido.jugador_2, partido, `${partido.id}-j2`),
    ];

    const match: MatchType = {
      id: partido.id,
      name:
        partido.estado === "Finalizado" && partido.resultado
          ? `${partido.fase} · ${partido.resultado}`
          : partido.fase,
      nextMatchId: partido.siguiente_partido_id,
      tournamentRoundText: String(ORDEN_FASE[partido.fase] ?? ""),
      startTime: partido.fecha_horario ?? "",
      state: partido.estado === "Finalizado" ? "DONE" : "SCHEDULED",
      participants,
    };

    return match;
  });

  // Orden estable: ronda temprana primero (la lib arma el árbol por nextMatchId).
  return adaptados.sort((a, b) => {
    const ordenA = Number(a.tournamentRoundText) || 0;
    const ordenB = Number(b.tournamentRoundText) || 0;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function hayCuadroEliminatorio(partidos: PartidoParaCuadro[]) {
  return partidos.some((partido) => esFaseDeCuadro(partido.fase));
}
