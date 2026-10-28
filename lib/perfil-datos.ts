import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularPuntajesRanking,
  type InscripcionParaRanking,
  type PartidoParaRanking,
} from "@/lib/motor-ranking";
import {
  contarPartidosJugados,
  elegirProximoPartido,
  extraerTrofeos,
  posicionRankingEnCategoria,
  type ProximoPartidoPerfil,
  type TrofeoPerfil,
} from "@/lib/perfil-jugador";
import {
  partidoTieneJugadorRetirado,
  type InscripcionVigente,
} from "@/lib/retirar-jugador-torneo";

export interface ResumenPerfil {
  partidosJugados: number;
  partidosGanados: number;
  diferenciaGames: number;
  puntos: number;
  posicion: { puesto: number; total: number } | null;
  trofeos: TrofeoPerfil[];
  proximoPartido: ProximoPartidoPerfil | null;
}

export async function fetchResumenPerfil(
  supabase: SupabaseClient,
  jugadorId: string,
  categoria: string
): Promise<ResumenPerfil> {
  const [
    jugadoresResult,
    inscripcionesResult,
    partidosResult,
    torneosFinalizadosResult,
    proximosResult,
  ] = await Promise.all([
    supabase.from("jugadores").select("id, nombre_completo, categoria"),
    supabase.from("torneo_jugadores").select("jugador_id, torneo_id, categoria"),
    supabase
      .from("partidos")
      .select(
        "torneo_id, ganador_id, fase, estado, categoria, jugador_1_id, jugador_2_id, resultado"
      )
      .eq("estado", "Finalizado"),
    supabase
      .from("torneos")
      .select("id, nombre")
      .eq("estado", "finalizado"),
    supabase
      .from("partidos")
      .select(
        "id, torneo_id, fase, estado, categoria, cancha, fecha_programada, jugador_1_id, jugador_2_id, jugador_1:jugador_1_id ( id, nombre_completo ), jugador_2:jugador_2_id ( id, nombre_completo ), torneo:torneo_id ( id, nombre, estado )"
      )
      .eq("estado", "Pendiente")
      .not("fecha_programada", "is", null)
      .or(`jugador_1_id.eq.${jugadorId},jugador_2_id.eq.${jugadorId}`)
      .order("fecha_programada", { ascending: true }),
  ]);

  const partidosFinalizados =
    (partidosResult.data as PartidoParaRanking[] | null) ?? [];
  const categoriasFicha = new Map(
    (jugadoresResult.data ?? []).map(
      (fila: { id: string; categoria: string }) => [fila.id, fila.categoria]
    )
  );
  const puntajes = calcularPuntajesRanking(
    (inscripcionesResult.data as InscripcionParaRanking[] | null) ?? [],
    partidosFinalizados,
    categoriasFicha
  );

  const jugadoresRanking = (jugadoresResult.data ?? []).map(
    (fila: {
      id: string;
      nombre_completo: string;
      categoria: string;
    }) => {
      const puntaje = puntajes.get(fila.id);
      return {
        id: fila.id,
        categoria: fila.categoria,
        nombre_completo: fila.nombre_completo,
        puntos: puntaje?.puntos ?? 0,
        partidosGanados: puntaje?.partidosGanados ?? 0,
        diferenciaGames: puntaje?.diferenciaGames ?? 0,
      };
    }
  );

  const mio = puntajes.get(jugadorId);
  const posicion = posicionRankingEnCategoria({
    jugadorId,
    categoria,
    jugadores: jugadoresRanking,
  });

  const trofeos = extraerTrofeos({
    jugadorId,
    categoriaFicha: categoriasFicha.get(jugadorId),
    torneosFinalizados: torneosFinalizadosResult.data ?? [],
    partidos: (partidosResult.data ?? []) as {
      torneo_id: string | null;
      categoria: string | null;
      fase: string | null;
      estado: string | null;
      ganador_id: string | null;
      jugador_1_id: string | null;
      jugador_2_id: string | null;
    }[],
  });

  type RivalEmbed = { id: string; nombre_completo: string } | null;
  type TorneoEmbed = { id: string; nombre: string; estado: string } | null;

  const inscripcionesVigentes =
    (inscripcionesResult.data as InscripcionVigente[] | null) ?? [];
  const proximosCrudos = inscripcionesResult.error
    ? (proximosResult.data ?? [])
    : (proximosResult.data ?? []).filter(
        (fila: {
          torneo_id: string;
          categoria: string | null;
          jugador_1_id: string | null;
          jugador_2_id: string | null;
        }) =>
          !partidoTieneJugadorRetirado(
            {
              torneo_id: fila.torneo_id,
              categoria: fila.categoria,
              jugador_1_id: fila.jugador_1_id,
              jugador_2_id: fila.jugador_2_id,
            },
            inscripcionesVigentes
          )
      );

  const proximos = proximosCrudos.map(
    (fila: {
      torneo_id: string;
      fase: string;
      estado: string;
      cancha: string | null;
      fecha_programada: string | null;
      jugador_1_id: string | null;
      jugador_2_id: string | null;
      jugador_1: RivalEmbed | RivalEmbed[];
      jugador_2: RivalEmbed | RivalEmbed[];
      torneo: TorneoEmbed | TorneoEmbed[];
    }) => {
      const rivalEmbed =
        fila.jugador_1_id === jugadorId ? fila.jugador_2 : fila.jugador_1;
      const rival = Array.isArray(rivalEmbed) ? rivalEmbed[0] : rivalEmbed;
      const torneo = Array.isArray(fila.torneo) ? fila.torneo[0] : fila.torneo;
      return {
        torneo_id: fila.torneo_id,
        torneo_nombre: torneo?.nombre ?? "Torneo",
        torneo_estado: torneo?.estado ?? "",
        fase: fila.fase,
        estado: fila.estado,
        cancha: fila.cancha,
        fecha_programada: fila.fecha_programada,
        jugador_1_id: fila.jugador_1_id,
        jugador_2_id: fila.jugador_2_id,
        rival_nombre: rival?.nombre_completo ?? null,
      };
    }
  );

  return {
    partidosJugados: contarPartidosJugados(
      jugadorId,
      partidosFinalizados,
      categoriasFicha.get(jugadorId),
    ),
    partidosGanados: mio?.partidosGanados ?? 0,
    diferenciaGames: mio?.diferenciaGames ?? 0,
    puntos: mio?.puntos ?? 0,
    posicion,
    trofeos,
    proximoPartido: elegirProximoPartido({ jugadorId, partidos: proximos }),
  };
}
