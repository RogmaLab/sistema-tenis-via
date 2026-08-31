-- =============================================================================
-- Tenis La Vía — Control de apertura de disponibilidad horaria para jugadores
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.config_programacion_torneo
  add column if not exists disponibilidad_abierta boolean not null default false;

alter table public.config_programacion_torneo
  add column if not exists disponibilidad_habilitada_at timestamptz;

comment on column public.config_programacion_torneo.disponibilidad_abierta is
  'Si es true, los jugadores pueden cargar su disponibilidad horaria para el fin de semana.';

comment on column public.config_programacion_torneo.disponibilidad_habilitada_at is
  'Momento en que un admin confirmó canchas y habilitó la carga para jugadores.';

-- Jugadores: leer solo configs abiertas
drop policy if exists "config_programacion_select_jugadores_abierta" on public.config_programacion_torneo;
create policy "config_programacion_select_jugadores_abierta"
  on public.config_programacion_torneo
  for select
  to authenticated
  using (disponibilidad_abierta = true);

-- Jugadores: leer ventanas del torneo con disponibilidad abierta
drop policy if exists "disponibilidad_canchas_select_jugadores_abierta" on public.disponibilidad_canchas;
create policy "disponibilidad_canchas_select_jugadores_abierta"
  on public.disponibilidad_canchas
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.config_programacion_torneo c
      where c.torneo_id = disponibilidad_canchas.torneo_id
        and c.disponibilidad_abierta = true
    )
  );
