"use client";

import { Info } from "lucide-react";
import { RankingTable } from "@/app/ranking/ranking-table";
import { CRITERIOS_PUNTAJE } from "@/lib/ranking-datos";
import type { JugadorRanking } from "@/lib/types";

interface RankingCircuitoProps {
  ranking: JugadorRanking[];
  compacto?: boolean;
}

export function RankingCircuito({ ranking, compacto = false }: RankingCircuitoProps) {
  return (
    <section>
      {compacto ? (
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Ranking del circuito
        </h2>
      ) : (
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Ranking
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Posiciones por categoría
          </p>
        </header>
      )}

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
              <p className="text-2xl font-bold text-accent">+{criterio.puntos}</p>
              <p className="mt-1 text-xs leading-snug text-foreground/60">
                {criterio.etiqueta}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-foreground/50">
          Un W.O. en contra (no presentación o retiro) anula todos los puntos
          de ese torneo. Los BYE del cuadro no cuentan como partido ganado ni
          en la diferencia de games. Empate: más partidos ganados, después
          mejor diferencia de games.
        </p>
      </div>

      <RankingTable ranking={ranking} />
    </section>
  );
}
