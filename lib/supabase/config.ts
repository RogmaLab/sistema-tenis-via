// FIX TEMPORAL: Vercel no está levantando bien NEXT_PUBLIC_SUPABASE_URL en
// algún entorno de despliegue, así que la URL queda escrita a fuego acá para
// que la app arranque sí o sí, sin depender de esa env var. La Anon Key sí
// sigue leyendo la env var (por si en algún entorno cambia), con un fallback
// hardcodeado por las dudas. Ninguno de los dos valores es secreto: ambos
// están pensados para exponerse en el bundle del navegador (por eso el
// prefijo NEXT_PUBLIC_) y quedan protegidos por las políticas de Row Level
// Security de Supabase, no por estar ocultos.
//
// TODO: una vez confirmado el nombre/valor correcto de la variable en
// Vercel (Project Settings > Environment Variables), se puede volver a
// `process.env.NEXT_PUBLIC_SUPABASE_URL` sin fallback.
export const SUPABASE_URL = "https://exxdjntvqagvthqqrvtg.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_8cRoDfXS4AOSJ16axmawsQ_zUrPYC1e";
