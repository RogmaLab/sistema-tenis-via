import { createClient } from "@/lib/supabase/client";
import { esNodoBye } from "@/lib/motor-ranking";
import type { TorneoFuturo } from "@/lib/types";

export interface ProximoPartido {
  id: string;
  cancha: string | null;
  fecha_programada: string;
  categoria: string | null;
  fase: string;
  ronda: string | null;
  estado: string;
  jugador_1: { id: string; nombre_completo: string } | null;
  jugador_2: { id: string; nombre_completo: string } | null;
  torneo: { id: string; nombre: string } | null;
}

const SELECT_PROXIMOS_PARTIDOS =
  "id, cancha, fecha_programada, categoria, fase, ronda, estado, jugador_1:jugador_1_id ( id, nombre_completo ), jugador_2:jugador_2_id ( id, nombre_completo ), torneo:torneo_id ( id, nombre )";

export function nombreEnAgenda(
  jugador: { nombre_completo: string } | null | undefined
) {
  const nombre = jugador?.nombre_completo?.trim();
  if (!nombre || esNodoBye(nombre)) return "Por definir";
  return nombre;
}

export function etiquetaFasePartido(partido: {
  fase: string;
  ronda: string | null;
}) {
  return partido.ronda?.trim() || partido.fase;
}

export async function fetchProximosPartidos(): Promise<ProximoPartido[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("partidos")
    .select(SELECT_PROXIMOS_PARTIDOS)
    .not("fecha_programada", "is", null)
    .gte("fecha_programada", new Date().toISOString())
    .neq("estado", "Finalizado")
    .order("fecha_programada", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ProximoPartido[]).filter(
    (partido) => Boolean(partido.fecha_programada)
  );
}

export async function fetchTorneosFuturos(): Promise<TorneoFuturo[]> {
  const supabase = createClient();
  const hoy = new Date();
  const ymd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("upcoming_tournaments")
    .select("id, titulo, descripcion, fecha_inicio, fecha_fin, categorias, created_at")
    .gte("fecha_inicio", ymd)
    .order("fecha_inicio", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as TorneoFuturo[]) ?? [];
}

export async function guardarTorneoFuturo(params: {
  id?: string;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  categorias: string[];
}): Promise<void> {
  const supabase = createClient();
  const fila = {
    titulo: params.titulo,
    descripcion: params.descripcion,
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
    categorias: params.categorias,
  };

  if (params.id) {
    const { error } = await supabase
      .from("upcoming_tournaments")
      .update(fila)
      .eq("id", params.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("upcoming_tournaments").insert(fila);
  if (error) throw new Error(error.message);
}

export async function eliminarTorneoFuturo(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("upcoming_tournaments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
