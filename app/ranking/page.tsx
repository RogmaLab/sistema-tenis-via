export const dynamic = "force-dynamic";

import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Jugador, JugadorRanking } from "@/lib/types";
import { RankingTable } from "./ranking-table";

interface CriterioPuntaje {
  etiqueta: string;
  puntos: number;
}

const CRITERIOS_PUNTAJE: CriterioPuntaje[] = [
  { etiqueta: "Participación / Inscripción", puntos: 1 },
  { etiqueta: "Partido ganado", puntos: 3 },
  { etiqueta: "Bonus finalista", puntos: 5 },
  { etiqueta: "Bonus campeón", puntos: 10 },
];

const PUNTOS_POR_PARTICIPACION = 1;
const PUNTOS_POR_PARTIDO_GANADO = 3;
const PUNTOS_BONUS_FINALISTA = 5;
const PUNTOS_BONUS_CAMPEON = 10;

// La fase que dispara los bonus de Final. Coincide con el último valor de
// FASES_PARTIDO (ver lib/types.ts), que alimenta el <select> de "Fase" en
// el modal de edición de partidos.
const FASE_FINAL = "Final";

// Fila mínima de "partidos" que necesitamos para calcular victorias y bonus.
// El índice de firma extra permite reutilizar `contarApariciones` (que
// espera un registro genérico columna -> valor) sin duplicar esa función.
interface PartidoFinalizado {
  ganador_id: string | null;
  fase: string | null;
  jugador_1_id: string | null;
  jugador_2_id: string | null;
  [columna: string]: string | null;
}

// Suma las apariciones de un jugador en un array de filas que tienen la
// columna indicada (ej. contar cuántas veces aparece cada jugador_id).
function contarApariciones(
  filas: Record<string, string | null>[],
  columna: string
) {
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const id = fila[columna];
    if (!id) continue;
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }
  return conteo;
}

// Bonus Campeón (+10) para el ganador y Bonus Finalista (+5) para el
// perdedor de cada partido de fase "Final" ya finalizado. Un torneo puede
// tener más de una Final (ej. varias categorías), así que se suman todas.
function calcularBonusFinales(partidos: PartidoFinalizado[]) {
  const bonusPorJugador = new Map<string, number>();

  const sumarBonus = (id: string | null | undefined, puntos: number) => {
    if (!id) return;
    bonusPorJugador.set(id, (bonusPorJugador.get(id) ?? 0) + puntos);
  };

  for (const partido of partidos) {
    if (partido.fase !== FASE_FINAL || !partido.ganador_id) continue;

    sumarBonus(partido.ganador_id, PUNTOS_BONUS_CAMPEON);

    const perdedorId =
      partido.jugador_1_id === partido.ganador_id
        ? partido.jugador_2_id
        : partido.jugador_2_id === partido.ganador_id
          ? partido.jugador_1_id
          : null;

    sumarBonus(perdedorId, PUNTOS_BONUS_FINALISTA);
  }

  return bonusPorJugador;
}

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
        .select("ganador_id, fase, jugador_1_id, jugador_2_id")
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
    (partidosFinalizadosResult.data as PartidoFinalizado[]) ?? [];

  const participacionesPorJugador = contarApariciones(
    inscripcionesResult.data ?? [],
    "jugador_id"
  );
  const victoriasPorJugador = contarApariciones(
    partidosFinalizados,
    "ganador_id"
  );
  const bonusPorJugador = calcularBonusFinales(partidosFinalizados);

  const ranking: JugadorRanking[] = jugadores.map((jugador) => {
    const participaciones = participacionesPorJugador.get(jugador.id) ?? 0;
    const partidosGanados = victoriasPorJugador.get(jugador.id) ?? 0;
    const bonus = bonusPorJugador.get(jugador.id) ?? 0;

    return {
      ...jugador,
      participaciones,
      partidosGanados,
      puntos:
        participaciones * PUNTOS_POR_PARTICIPACION +
        partidosGanados * PUNTOS_POR_PARTIDO_GANADO +
        bonus,
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
