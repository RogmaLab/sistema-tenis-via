"use client";

import { useMemo } from "react";
import type { PartidoParaCuadro } from "@/lib/adaptar-cuadro-torneo";

const ORDEN_FASE: Record<string, number> = {
  "Octavos de Final": 1,
  "Cuartos de Final": 2,
  Semifinal: 3,
  Final: 4,
};

const FASES_CUADRO = new Set(Object.keys(ORDEN_FASE));

interface ListaPartidosMobileProps {
  partidos: PartidoParaCuadro[];
}

function nombreJugador(
  jugador: { nombre_completo: string } | null | undefined
) {
  return jugador?.nombre_completo?.trim() || "Por definir";
}

export function ListaPartidosMobile({ partidos }: ListaPartidosMobileProps) {
  const grupos = useMemo(() => {
    const delCuadro = partidos.filter((p) => FASES_CUADRO.has(p.fase));
    const porFase = new Map<string, PartidoParaCuadro[]>();

    for (const partido of delCuadro) {
      const lista = porFase.get(partido.fase) ?? [];
      lista.push(partido);
      porFase.set(partido.fase, lista);
    }

    return [...porFase.entries()].sort(
      ([faseA], [faseB]) =>
        (ORDEN_FASE[faseA] ?? 99) - (ORDEN_FASE[faseB] ?? 99)
    );
  }, [partidos]);

  if (grupos.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-foreground/50">
        Todavía no hay cuadro eliminatorio para este torneo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grupos.map(([fase, partidosFase]) => (
        <section key={fase} className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            {fase}
          </h4>
          <ul className="flex flex-col gap-2">
            {partidosFase.map((partido) => {
              const j1 = nombreJugador(partido.jugador_1);
              const j2 = nombreJugador(partido.jugador_2);
              const finalizado = partido.estado === "Finalizado";
              const resultado =
                finalizado && partido.resultado
                  ? partido.resultado
                  : null;

              return (
                <li
                  key={partido.id}
                  className="rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {j1}{" "}
                    <span className="text-foreground/40">vs</span> {j2}
                  </p>
                  {resultado ? (
                    <p className="mt-1 text-sm font-semibold text-accent">
                      {resultado}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-foreground/40">
                      {partido.estado === "Pendiente"
                        ? "Pendiente"
                        : partido.estado}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
