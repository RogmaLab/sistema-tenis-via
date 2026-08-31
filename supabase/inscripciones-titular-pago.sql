-- =============================================================================
-- Tenis La Vía — Titular de la cuenta desde la que transfirió el jugador
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.inscripciones_torneo
  add column if not exists titular_pago text;

comment on column public.inscripciones_torneo.titular_pago is
  'Nombre del titular de la cuenta bancaria desde la que el jugador realizó la transferencia.';
