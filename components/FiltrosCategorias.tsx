"use client";

import { CATEGORIAS_TORNEO, type CategoriaJugador } from "@/lib/types";

interface FiltrosCategoriasProps {
  categoriaActiva: CategoriaJugador | "todas";
  onCambiarCategoria: (categoria: CategoriaJugador | "todas") => void;
  conteos?: Record<string, number>;
  categorias?: readonly CategoriaJugador[];
}

export function FiltrosCategorias({
  categoriaActiva,
  onCambiarCategoria,
  conteos,
  categorias = CATEGORIAS_TORNEO,
}: FiltrosCategoriasProps) {
  const opciones: Array<{ id: CategoriaJugador | "todas"; label: string }> = [
    { id: "todas", label: "Todas" },
    ...categorias.map((cat) => ({ id: cat, label: cat })),
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
      {opciones.map(({ id, label }) => {
        const activo = categoriaActiva === id;
        const conteo = conteos?.[id];
        
        return (
          <button
            key={id}
            onClick={() => onCambiarCategoria(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
              activo
                ? "border-accent bg-accent text-white shadow-sm"
                : "border-border bg-surface text-foreground/70 hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
            }`}
          >
            <span>{label}</span>
            {conteo !== undefined && conteo > 0 ? (
              <span
                className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  activo
                    ? "bg-white/20 text-white"
                    : "bg-foreground/10 text-foreground/60"
                }`}
              >
                {conteo}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
