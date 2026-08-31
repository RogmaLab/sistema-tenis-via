-- =============================================================================
-- Tenis La Vía — Partidos suspendidos por lluvia
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.partidos
  add column if not exists suspendido_lluvia boolean not null default false;

comment on column public.partidos.suspendido_lluvia is
  'Partido desprogramado por lluvia; prioridad en el próximo ciclo de asignación de canchas.';

create index if not exists idx_partidos_suspendido_lluvia
  on public.partidos (torneo_id, suspendido_lluvia)
  where suspendido_lluvia = true;
