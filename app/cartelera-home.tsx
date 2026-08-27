"use client";

import { useMemo, useState } from "react";
import { TorneoDetalleClient } from "@/app/torneos/[id]/torneo-detalle-client";
import { RankingCircuito } from "@/components/RankingCircuito";
import type { JugadorRanking, Torneo } from "@/lib/types";

type TorneoCartelera = Pick<
  Torneo,
  "id" | "nombre" | "estado" | "fecha_inicio" | "formato"
>;

interface CarteleraHomeProps {
  ranking: JugadorRanking[];
  torneos: TorneoCartelera[];
}

export function CarteleraHome({ ranking, torneos }: CarteleraHomeProps) {
  const vigentes = useMemo(
    () => torneos.filter((torneo) => torneo.estado !== "finalizado"),
    [torneos]
  );
  const destacados = vigentes.length > 0 ? vigentes : torneos.slice(0, 1);
  const [torneoId, setTorneoId] = useState(destacados[0]?.id ?? "");
  const torneoActivo = destacados.find((torneo) => torneo.id === torneoId);

  if (!torneoId) {
    return (
      <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Cartelera
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Todavía no hay un torneo publicado. El ranking del circuito sigue
              disponible.
            </p>
          </header>
          <RankingCircuito ranking={ranking} compacto />
        </div>
      </main>
    );
  }

  return (
    <div>
      {destacados.length > 1 ? (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/45">
            Torneos
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {destacados.map((torneo) => {
              const activo = torneo.id === torneoId;
              return (
                <button
                  key={torneo.id}
                  type="button"
                  onClick={() => setTorneoId(torneo.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    activo
                      ? "bg-accent text-white"
                      : "border border-border bg-surface text-foreground/55 hover:text-foreground"
                  }`}
                >
                  {torneo.nombre}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {vigentes.length === 0 && torneoActivo ? (
        <p className="mx-auto max-w-5xl px-4 pt-4 text-xs text-foreground/45 sm:px-6 lg:px-10">
          No hay un torneo en curso. Mostramos el más reciente.
        </p>
      ) : null}

      <TorneoDetalleClient
        key={torneoId}
        torneoId={torneoId}
        ocultarVolver
        pestanaInicial="ranking"
        ranking={ranking}
      />
    </div>
  );
}
