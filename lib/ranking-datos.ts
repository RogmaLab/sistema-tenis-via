import type { SupabaseClient } from "@supabase/supabase-js";
import type { Jugador, JugadorRanking } from "@/lib/types";
import {
  PUNTOS_BONUS_CAMPEON,
  PUNTOS_BONUS_FINALISTA,
  PUNTOS_POR_PARTICIPACION,
  PUNTOS_POR_PARTIDO_GANADO,
  calcularPuntajesRanking,
  compararPuntajesRanking,
  type InscripcionParaRanking,
  type PartidoParaRanking,
} from "@/lib/motor-ranking";

export const CRITERIOS_PUNTAJE = [
  { etiqueta: "Participación / Inscripción", puntos: PUNTOS_POR_PARTICIPACION },
  { etiqueta: "Partido ganado (incluye W.O.)", puntos: PUNTOS_POR_PARTIDO_GANADO },
  { etiqueta: "Bonus finalista", puntos: PUNTOS_BONUS_FINALISTA },
  { etiqueta: "Bonus por el título", puntos: PUNTOS_BONUS_CAMPEON },
] as const;

export async function fetchRankingCircuito(
  supabase: SupabaseClient
): Promise<JugadorRanking[]> {
  const [jugadoresResult, inscripcionesResult, partidosFinalizadosResult] =
    await Promise.all([
      supabase
        .from("jugadores")
        .select("id, nombre_completo, categoria, genero"),
      supabase.from("torneo_jugadores").select("jugador_id, torneo_id, categoria"),
      supabase
        .from("partidos")
        .select(
          "torneo_id, ganador_id, fase, categoria, jugador_1_id, jugador_2_id, resultado"
        )
        .eq("estado", "Finalizado"),
    ]);

  if (jugadoresResult.error) {
    console.error(
      "Error al cargar jugadores para el ranking:",
      jugadoresResult.error.message
    );
  }
  if (inscripcionesResult.error) {
    console.error(
      "Error al cargar inscripciones para el ranking:",
      inscripcionesResult.error.message
    );
  }
  if (partidosFinalizadosResult.error) {
    console.error(
      "Error al cargar partidos finalizados para el ranking:",
      partidosFinalizadosResult.error.message
    );
  }

  const jugadores = (
    (jugadoresResult.data as Omit<Jugador, "whatsapp">[]) ?? []
  ).map((jugador) => ({
    ...jugador,
    whatsapp: "",
  }));

  const puntajesPorJugador = calcularPuntajesRanking(
    (inscripcionesResult.data as InscripcionParaRanking[] | null) ?? [],
    (partidosFinalizadosResult.data as PartidoParaRanking[] | null) ?? [],
    new Map(jugadores.map((jugador) => [jugador.id, jugador.categoria]))
  );

  const ranking: JugadorRanking[] = jugadores.map((jugador) => {
    const puntaje = puntajesPorJugador.get(jugador.id);
    return {
      ...jugador,
      participaciones: puntaje?.participaciones ?? 0,
      partidosGanados: puntaje?.partidosGanados ?? 0,
      puntos: puntaje?.puntos ?? 0,
      diferenciaGames: puntaje?.diferenciaGames ?? 0,
    };
  });

  ranking.sort(compararPuntajesRanking);
  return ranking;
}
