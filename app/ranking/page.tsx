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
  calcularPuntajesRanking,
  compararPuntajesRanking,
  type InscripcionParaRanking,
  type PartidoParaRanking,
} from "@/lib/motor-ranking";

interface CriterioPuntaje {
  etiqueta: string;
  puntos: number;
}

const CRITERIOS_PUNTAJE: CriterioPuntaje[] = [
  { etiqueta: "Participación / Inscripción", puntos: PUNTOS_POR_PARTICIPACION },
  { etiqueta: "Partido ganado (incluye W.O.)", puntos: PUNTOS_POR_PARTIDO_GANADO },
  { etiqueta: "Bonus finalista", puntos: PUNTOS_BONUS_FINALISTA },
  { etiqueta: "Bonus campeón", puntos: PUNTOS_BONUS_CAMPEON },
];

export default async function RankingPage() {
  const supabase = await createClient();

  const [jugadoresResult, inscripcionesResult, partidosFinalizadosResult] =
    await Promise.all([
      supabase
        .from("jugadores")
        .select("id, nombre_completo, categoria, genero"),
      // Participación: una fila por cada torneo en el que el jugador está inscripto.
      supabase.from("torneo_jugadores").select("jugador_id, torneo_id"),
      // Victorias, bonus de Final y W.O. disciplinarios, por torneo.
      supabase
        .from("partidos")
        .select(
          "torneo_id, ganador_id, fase, jugador_1_id, jugador_2_id, resultado"
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

  const jugadores = ((jugadoresResult.data as Omit<Jugador, "whatsapp">[]) ?? []).map(
    (jugador) => ({
      ...jugador,
      whatsapp: "",
    })
  );
  const puntajesPorJugador = calcularPuntajesRanking(
    (inscripcionesResult.data as InscripcionParaRanking[] | null) ?? [],
    (partidosFinalizadosResult.data as PartidoParaRanking[] | null) ?? []
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

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
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
          <p className="mt-4 text-xs leading-relaxed text-foreground/50">
            Un W.O. en contra (no presentación o retiro) anula todos los
            puntos de ese torneo. Los BYE del cuadro no cuentan como
            partido ganado ni en la diferencia de games. Empate: más
            partidos ganados, después mejor diferencia de games.
          </p>
        </div>

        <RankingTable ranking={ranking} />
      </div>
    </main>
  );
}
