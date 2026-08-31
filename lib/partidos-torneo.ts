import { createClient } from "@/lib/supabase/client";
import {
  esPartidoClasificacion,
  esPartidoEliminatorio,
  esFaseDeCuadro,
  ordenarPorNumeroSlot,
} from "@/lib/adaptar-cuadro-torneo";

export { esFaseDeCuadro, esPartidoClasificacion, esPartidoEliminatorio };

export interface PartidoTorneoRow {
  id: string;
  resultado: string | null;
  estado: string;
  ganador_id: string | null;
  fase: string;
  tipo_fase: string | null;
  ronda: string | null;
  numero_slot: number | null;
  categoria: string | null;
  cancha: string | null;
  fecha_programada: string | null;
  suspendido_lluvia?: boolean;
  siguiente_partido_id: string | null;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
}

const SELECT_PARTIDOS =
  "id, resultado, estado, ganador_id, fase, tipo_fase, ronda, numero_slot, categoria, cancha, fecha_programada, suspendido_lluvia, siguiente_partido_id, jugador_1:jugador_1_id ( id, nombre_completo ), jugador_2:jugador_2_id ( id, nombre_completo )";

export function normalizarCategoriaPartido(categoria: string | null | undefined) {
  return (categoria ?? "").trim();
}

/** Un partido pertenece a la categoría activa si su columna categoria coincide. */
export function partidoEsDeCategoria(
  partido: { categoria?: string | null },
  categoriaActiva: string
) {
  const cat = normalizarCategoriaPartido(categoriaActiva);
  if (!cat || cat === "Todas") return false;
  return normalizarCategoriaPartido(partido.categoria) === cat;
}

export function filtrarPartidosPorCategoria<T extends { categoria?: string | null }>(
  partidos: T[],
  categoriaActiva: string | null | undefined
): T[] {
  const cat = normalizarCategoriaPartido(categoriaActiva);
  if (!cat || cat === "Todas") return [];
  return partidos.filter((partido) => partidoEsDeCategoria(partido, cat));
}

export async function fetchPartidosTorneo(torneoId: string): Promise<{
  data: PartidoTorneoRow[];
  error: Error | null;
}> {
  const id = torneoId.trim();
  if (!id) {
    return { data: [], error: new Error("Falta el id del torneo.") };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("partidos")
    .select(SELECT_PARTIDOS)
    .eq("torneo_id", id)
    .order("numero_slot", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error al cargar partidos del torneo:", error.message);
    return { data: [], error: new Error(error.message) };
  }

  return { data: (data as unknown as PartidoTorneoRow[]) ?? [], error: null };
}

export function partidosClasificacionDe<
  T extends {
    fase: string;
    tipo_fase?: string | null;
    categoria?: string | null;
    numero_slot?: number | null;
  },
>(partidos: T[], categoriaActiva: string) {
  return ordenarPorNumeroSlot(
    filtrarPartidosPorCategoria(partidos, categoriaActiva).filter((partido) =>
      esPartidoClasificacion(partido)
    )
  );
}

export function partidosCuadroDe<
  T extends {
    fase: string;
    tipo_fase?: string | null;
    categoria?: string | null;
    numero_slot?: number | null;
  },
>(partidos: T[], categoriaActiva: string) {
  return ordenarPorNumeroSlot(
    filtrarPartidosPorCategoria(partidos, categoriaActiva).filter((partido) =>
      esPartidoEliminatorio(partido)
    )
  );
}
