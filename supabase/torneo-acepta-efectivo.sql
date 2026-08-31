-- =============================================================================
-- Tenis La Vía — Pago en efectivo en el club (10% off)
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.torneos
  add column if not exists acepta_efectivo boolean not null default true;

comment on column public.torneos.acepta_efectivo is
  'Si es true, los jugadores pueden elegir abonar en efectivo en el club con 10% de descuento.';

alter table public.inscripciones_torneo
  add column if not exists medio_pago text not null default 'transferencia'
    check (medio_pago in ('transferencia', 'efectivo'));

comment on column public.inscripciones_torneo.medio_pago is
  'Medio de pago elegido por el jugador: transferencia o efectivo en el club.';
