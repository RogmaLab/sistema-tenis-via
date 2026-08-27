-- =============================================================================
-- Tenis La Vía — Disponibilidad de canchas (fin de semana) por torneo
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

create table if not exists public.config_programacion_torneo (
  torneo_id uuid primary key references public.torneos (id) on delete cascade,
  duracion_minutos integer not null default 90
    check (duracion_minutos in (60, 90)),
  updated_at timestamptz not null default now()
);

comment on table public.config_programacion_torneo is
  'Duración de cada bloque horario para auto-asignar partidos del torneo.';

create table if not exists public.disponibilidad_canchas (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos (id) on delete cascade,
  dia text not null check (dia in ('sabado', 'domingo')),
  cancha text not null,
  hora_inicio time not null,
  hora_fin time not null,
  created_at timestamptz not null default now(),
  constraint disponibilidad_canchas_horario_ok check (hora_fin > hora_inicio),
  constraint disponibilidad_canchas_unica unique (torneo_id, dia, cancha, hora_inicio, hora_fin)
);

comment on table public.disponibilidad_canchas is
  'Tramos libres Sábado/Domingo por cancha. Puede haber huecos (clases) entre un tramo y el siguiente.';

create index if not exists disponibilidad_canchas_torneo_idx
  on public.disponibilidad_canchas (torneo_id);

alter table public.config_programacion_torneo enable row level security;
alter table public.disponibilidad_canchas enable row level security;

drop policy if exists "config_programacion_select_admin" on public.config_programacion_torneo;
create policy "config_programacion_select_admin"
  on public.config_programacion_torneo
  for select
  to authenticated
  using (public.es_admin());

drop policy if exists "config_programacion_write_admin" on public.config_programacion_torneo;
create policy "config_programacion_write_admin"
  on public.config_programacion_torneo
  for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "disponibilidad_canchas_select_admin" on public.disponibilidad_canchas;
create policy "disponibilidad_canchas_select_admin"
  on public.disponibilidad_canchas
  for select
  to authenticated
  using (public.es_admin());

drop policy if exists "disponibilidad_canchas_write_admin" on public.disponibilidad_canchas;
create policy "disponibilidad_canchas_write_admin"
  on public.disponibilidad_canchas
  for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

revoke all on public.config_programacion_torneo from anon;
revoke all on public.disponibilidad_canchas from anon;

grant select, insert, update, delete on public.config_programacion_torneo to authenticated;
grant select, insert, update, delete on public.disponibilidad_canchas to authenticated;

-- Si la tabla ya existía con un solo rango por cancha/día, permite varios tramos.
alter table public.disponibilidad_canchas
  drop constraint if exists disponibilidad_canchas_unica;

alter table public.disponibilidad_canchas
  add constraint disponibilidad_canchas_unica
  unique (torneo_id, dia, cancha, hora_inicio, hora_fin);
