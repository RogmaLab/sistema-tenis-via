import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Cliente para usar en Client Components ("use client"). A diferencia del
// cliente "normal" de @supabase/supabase-js, este guarda la sesión en
// cookies (no en localStorage) para que el proxy/servidor pueda leerla y
// proteger rutas.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
