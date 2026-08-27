-- =============================================================================
-- Tenis La Vía — Anuncios de torneos futuros ("Lo que viene")
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

create table if not exists public.upcoming_tournaments (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha_inicio date not null,
  fecha_fin date,
  categorias text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint upcoming_tournaments_titulo_ok check (char_length(trim(titulo)) > 0),
  constraint upcoming_tournaments_fechas_ok check (
    fecha_fin is null or fecha_fin >= fecha_inicio
  )
);

comment on table public.upcoming_tournaments is
  'Campeonatos futuros del club. No es un torneo activo: solo anuncio hasta que se cree en torneos.';

create index if not exists upcoming_tournaments_fecha_idx
  on public.upcoming_tournaments (fecha_inicio);

alter table public.upcoming_tournaments enable row level security;

drop policy if exists "upcoming_tournaments_select_autenticado" on public.upcoming_tournaments;
create policy "upcoming_tournaments_select_autenticado"
  on public.upcoming_tournaments
  for select
  to authenticated
  using (true);

drop policy if exists "upcoming_tournaments_insert_admin" on public.upcoming_tournaments;
create policy "upcoming_tournaments_insert_admin"
  on public.upcoming_tournaments
  for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "upcoming_tournaments_update_admin" on public.upcoming_tournaments;
create policy "upcoming_tournaments_update_admin"
  on public.upcoming_tournaments
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "upcoming_tournaments_delete_admin" on public.upcoming_tournaments;
create policy "upcoming_tournaments_delete_admin"
  on public.upcoming_tournaments
  for delete
  to authenticated
  using (public.es_admin());

revoke all on public.upcoming_tournaments from anon;
grant select, insert, update, delete on public.upcoming_tournaments to authenticated;
