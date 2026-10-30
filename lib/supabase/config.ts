const URL_PRODUCCION = "https://exxdjntvqagvthqqrvtg.supabase.co";
const ANON_KEY_PRODUCCION =
  "sb_publishable_8cRoDfXS4AOSJ16axmawsQ_zUrPYC1e";

const urlDesdeEnv = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || URL_PRODUCCION
).trim();

const keyDesdeEnv = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ANON_KEY_PRODUCCION
).trim();

export const SUPABASE_URL = /^https?:\/\//i.test(urlDesdeEnv)
  ? urlDesdeEnv
  : URL_PRODUCCION;

export const SUPABASE_ANON_KEY = keyDesdeEnv || ANON_KEY_PRODUCCION;
