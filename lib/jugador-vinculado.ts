import type { SupabaseClient } from "@supabase/supabase-js";
import type { Jugador } from "@/lib/types";

export async function fetchResumenJugadorVinculado(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; nombre_completo: string } | null> {
  const { data, error } = await supabase
    .from("jugadores")
    .select("id, nombre_completo")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error al buscar jugador vinculado:", error.message);
    return null;
  }
  if (!data) return null;
  return { id: data.id, nombre_completo: data.nombre_completo };
}

export async function fetchIdJugadorVinculado(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const resumen = await fetchResumenJugadorVinculado(supabase, userId);
  return resumen?.id ?? null;
}

export async function fetchMiJugador(
  supabase: SupabaseClient,
  userId: string
): Promise<Jugador | null> {
  const desdeVista = await supabase
    .from("jugadores_listado")
    .select("id, nombre_completo, whatsapp, categoria, genero, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!desdeVista.error && desdeVista.data) {
    return {
      id: desdeVista.data.id,
      nombre_completo: desdeVista.data.nombre_completo,
      categoria: desdeVista.data.categoria,
      genero: desdeVista.data.genero,
      user_id: desdeVista.data.user_id,
      whatsapp: desdeVista.data.whatsapp ?? "",
    };
  }

  const { data, error } = await supabase
    .from("jugadores")
    .select("id, nombre_completo, categoria, genero, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nombre_completo: data.nombre_completo,
    categoria: data.categoria,
    genero: data.genero,
    user_id: data.user_id,
    whatsapp: "",
  };
}

export async function fetchJugadorPorId(
  supabase: SupabaseClient,
  jugadorId: string
): Promise<Jugador | null> {
  const id = jugadorId.trim();
  if (!id) return null;

  const desdeVista = await supabase
    .from("jugadores_listado")
    .select("id, nombre_completo, whatsapp, categoria, genero, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!desdeVista.error && desdeVista.data) {
    return {
      id: desdeVista.data.id,
      nombre_completo: desdeVista.data.nombre_completo,
      categoria: desdeVista.data.categoria,
      genero: desdeVista.data.genero,
      user_id: desdeVista.data.user_id,
      whatsapp: desdeVista.data.whatsapp ?? "",
    };
  }

  const { data, error } = await supabase
    .from("jugadores")
    .select("id, nombre_completo, categoria, genero, user_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nombre_completo: data.nombre_completo,
    categoria: data.categoria,
    genero: data.genero,
    user_id: data.user_id,
    whatsapp: "",
  };
}

export async function listarJugadoresSinVincular(
  supabase: SupabaseClient
): Promise<Pick<Jugador, "id" | "nombre_completo" | "categoria" | "genero">[]> {
  const { data, error } = await supabase
    .from("jugadores")
    .select("id, nombre_completo, categoria, genero")
    .is("user_id", null)
    .order("nombre_completo", { ascending: true });

  if (error) {
    console.error("Error al listar jugadores sin vincular:", error.message);
    return [];
  }

  return data ?? [];
}
