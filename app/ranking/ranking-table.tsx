"use client";

import { useMemo, useState } from "react";
import { Award } from "lucide-react";
import {
  CATEGORIAS_JUGADOR,
  GENEROS,
  type CategoriaJugador,
  type Genero,
  type JugadorRanking,
} from "@/lib/types";

type FiltroCategoria = CategoriaJugador | "todas";
type FiltroGenero = Genero | "todos";

interface RankingTableProps {
  ranking: JugadorRanking[];
}

const ESTILO_PODIO = {
  1: {
    fila: "border-l-[3px] border-l-[#eab308] bg-[#eab308]/[0.07]",
    badge: "bg-[#eab308]/20 text-[#eab308]",
  },
  2: {
    fila: "border-l-[3px] border-l-[#c4c9d4] bg-[#c4c9d4]/[0.06]",
    badge: "bg-[#c4c9d4]/15 text-[#d1d5db]",
  },
  3: {
    fila: "border-l-[3px] border-l-[#d97706] bg-[#d97706]/[0.08]",
    badge: "bg-[#d97706]/20 text-[#f59e0b]",
  },
} as const;

function formatDiferenciaGames(valor: number) {
  if (valor > 0) return `+${valor}`;
  return String(valor);
}

export function RankingTable({ ranking }: RankingTableProps) {
  const [filtroCategoria, setFiltroCategoria] =
    useState<FiltroCategoria>("todas");
  const [filtroGenero, setFiltroGenero] = useState<FiltroGenero>("todos");

  const rankingFiltrado = useMemo(() => {
    return ranking.filter((jugador) => {
      const coincideCategoria =
        filtroCategoria === "todas" || jugador.categoria === filtroCategoria;
      const coincideGenero =
        filtroGenero === "todos" || jugador.genero === filtroGenero;
      return coincideCategoria && coincideGenero;
    });
  }, [ranking, filtroCategoria, filtroGenero]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="filtro_genero_ranking"
            className="block text-sm font-medium text-foreground/80"
          >
            Género
          </label>
          <select
            id="filtro_genero_ranking"
            value={filtroGenero}
            onChange={(event) =>
              setFiltroGenero(event.target.value as FiltroGenero)
            }
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="todos">Todos los géneros</option>
            {GENEROS.map((genero) => (
              <option key={genero} value={genero}>
                {genero}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="filtro_categoria_ranking"
            className="block text-sm font-medium text-foreground/80"
          >
            Categoría
          </label>
          <select
            id="filtro_categoria_ranking"
            value={filtroCategoria}
            onChange={(event) =>
              setFiltroCategoria(event.target.value as FiltroCategoria)
            }
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="todas">Todas las categorías</option>
            {CATEGORIAS_JUGADOR.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rankingFiltrado.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <Award size={22} className="text-accent" />
            </div>
            <p className="text-sm text-foreground/60">
              No hay jugadores que coincidan con los filtros seleccionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                  <th className="w-14 px-3 py-3 font-medium sm:px-4">#</th>
                  <th className="px-4 py-3 font-medium sm:px-6">Jugador</th>
                  <th className="px-4 py-3 font-medium sm:px-6">Categoría</th>
                  <th className="px-4 py-3 font-medium sm:px-6">Puntos</th>
                  <th
                    className="px-4 py-3 font-medium sm:px-6"
                    title="Partidos ganados"
                  >
                    PG
                  </th>
                  <th
                    className="px-4 py-3 font-medium sm:px-6"
                    title="Games ganados menos games perdidos"
                  >
                    Dif. games
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankingFiltrado.map((jugador, indice) => {
                  const puesto = indice + 1;
                  const podio =
                    puesto === 1 || puesto === 2 || puesto === 3
                      ? ESTILO_PODIO[puesto]
                      : null;

                  return (
                    <tr
                      key={jugador.id}
                      className={`border-b border-border last:border-0 ${
                        podio
                          ? podio.fila
                          : "hover:bg-background/40"
                      }`}
                    >
                      <td className="px-3 py-3 sm:px-4">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                            podio
                              ? podio.badge
                              : "bg-background text-foreground/50"
                          }`}
                        >
                          {puesto}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground sm:px-6">
                        {jugador.nombre_completo}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <span className="inline-block rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground/80">
                          {jugador.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-accent sm:px-6">
                        {jugador.puntos}
                      </td>
                      <td className="px-4 py-3 text-foreground/70 sm:px-6">
                        {jugador.partidosGanados}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium tabular-nums sm:px-6 ${
                          jugador.diferenciaGames > 0
                            ? "text-emerald-400/90"
                            : jugador.diferenciaGames < 0
                              ? "text-foreground/45"
                              : "text-foreground/70"
                        }`}
                      >
                        {formatDiferenciaGames(jugador.diferenciaGames)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
