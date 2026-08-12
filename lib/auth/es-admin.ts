import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolUsuario } from "./types";

/** Lee el rol del perfil. Si no hay fila, asume jugador (fail-closed para writes). */
export async function obtenerRol(
  supabase: SupabaseClient,
  userId: string
): Promise<RolUsuario> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.rol) return "jugador";
  return data.rol === "admin" ? "admin" : "jugador";
}

export async function esAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  return (await obtenerRol(supabase, userId)) === "admin";
}
