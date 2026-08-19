export const dynamic = "force-dynamic";

import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Jugador, JugadorRanking } from "@/lib/types";
import { RankingTable } from "./ranking-table";
import {
  PUNTOS_BONUS_CAMPEON,
  PUNTOS_BONUS_FINALISTA,
  PUNTOS_POR_PARTICIPACION,
  PUNTOS_POR_PARTIDO_GANADO,
  calcularBonusFinales,
  contarApariciones,
  contarVictoriasRanking,
  puntajeDesdeConteos,
  type PartidoParaRanking,
} from "@/lib/motor-ranking";

interface CriterioPuntaje {
  etiqueta: string;
  puntos: number;
}

const CRITERIOS_PUNTAJE: CriterioPuntaje[] = [
  { etiqueta: "Participación / Inscripción", puntos: PUNTOS_POR_PARTICIPACION },
  { etiqueta: "Partido ganado (incluye BYE)", puntos: PUNTOS_POR_PARTIDO_GANADO },
  { etiqueta: "Bonus finalista", puntos: PUNTOS_BONUS_FINALISTA },
  { etiqueta: "Bonus campeón", puntos: PUNTOS_BONUS_CAMPEON },
];

export default async function RankingPage() {
  const supabase = await createClient();

  const [jugadoresResult, inscripcionesResult, partidosFinalizadosResult] =
    await Promise.all([
      supabase.from("jugadores").select("*"),
      // Participación: una fila por cada torneo en el que el jugador está inscripto.
      supabase.from("torneo_jugadores").select("jugador_id"),
      // Victorias y bonus de Final: todos los partidos ya finalizados, con
      // los jugadores y la fase para poder calcular ambas cosas de una sola consulta.
      supabase
        .from("partidos")
        .select("ganador_id, fase, jugador_1_id, jugador_2_id, resultado")
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

  const jugadores = (jugadoresResult.data as Jugador[]) ?? [];
  const partidosFinalizados =
    (partidosFinalizadosResult.data as PartidoParaRanking[]) ?? [];

  const participacionesPorJugador = contarApariciones(
    inscripcionesResult.data ?? [],
    "jugador_id"
  );
  const victoriasPorJugador = contarVictoriasRanking(partidosFinalizados);
  const bonusPorJugador = calcularBonusFinales(partidosFinalizados);

  const ranking: JugadorRanking[] = jugadores.map((jugador) => {
    const participaciones = participacionesPorJugador.get(jugador.id) ?? 0;
    const { partidosGanados, puntos } = puntajeDesdeConteos({
      participaciones,
      partidosGanados: victoriasPorJugador.get(jugador.id) ?? 0,
      bonus: bonusPorJugador.get(jugador.id) ?? 0,
    });

    return {
      ...jugador,
      participaciones,
      partidosGanados,
      puntos,
    };
  });

  // Orden: más puntos primero; empate -> más partidos ganados; empate -> alfabético.
  ranking.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.partidosGanados !== a.partidosGanados) {
      return b.partidosGanados - a.partidosGanados;
    }
    return a.nombre_completo.localeCompare(b.nombre_completo, "es");
  });

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Encabezado */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ranking
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Posiciones por categoría
          </p>
        </header>

        {/* Sistema de Puntos */}
        <div className="mb-6 rounded-2xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15">
              <Info size={16} className="text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Sistema de Puntos
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CRITERIOS_PUNTAJE.map((criterio) => (
              <div
                key={criterio.etiqueta}
                className="rounded-xl border border-border bg-background p-3"
              >
                <p className="text-2xl font-bold text-accent">
                  +{criterio.puntos}
                </p>
                <p className="mt-1 text-xs leading-snug text-foreground/60">
                  {criterio.etiqueta}
                </p>
              </div>
            ))}
          </div>
        </div>

        <RankingTable ranking={ranking} />
      </div>
    </main>
  );
}
