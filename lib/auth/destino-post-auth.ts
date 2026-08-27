import type { SupabaseClient } from "@supabase/supabase-js";
import { esAdmin } from "@/lib/auth/es-admin";
import { fetchIdJugadorVinculado } from "@/lib/jugador-vinculado";

function pathInternoSeguro(path: string | null | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path === "/login" || path.startsWith("/login?")) return null;
  return path;
}

/**
 * Admin → panel (o la ruta de la que venía).
 * Jugador sin ficha → vinculación.
 * Jugador vinculado → inicio (o la ruta original).
 */
export async function destinoDespuesDeAuth(
  supabase: SupabaseClient,
  userId: string,
  redirectTo?: string | null
): Promise<string> {
  const destinoPedido = pathInternoSeguro(redirectTo);

  if (await esAdmin(supabase, userId)) {
    return destinoPedido ?? "/";
  }

  const jugadorId = await fetchIdJugadorVinculado(supabase, userId);
  if (!jugadorId) return "/vincular-perfil";

  return destinoPedido ?? "/";
}
