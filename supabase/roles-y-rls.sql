-- =============================================================================
-- Tenis La Vía — Roles (admin/jugador) + RLS
-- Correr en: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabla perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null default 'jugador' check (rol in ('admin', 'jugador')),
  created_at timestamptz not null default now()
);

comment on table public.perfiles is
  'Perfil de app: rol admin | jugador. Se crea al registrarse vía trigger.';

-- -----------------------------------------------------------------------------
-- 2) Trigger: al crear un usuario en auth.users → insertar perfil (jugador)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, rol)
  values (new.id, 'jugador')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill: usuarios que ya existían antes del trigger
insert into public.perfiles (id, rol)
select u.id, 'jugador'
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3) Helper security definer: ¿el JWT actual es admin?
--    Evita recursión de RLS al leer perfiles dentro de otras policies.
-- -----------------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.rol = 'admin'
  );
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4) RLS en perfiles
-- -----------------------------------------------------------------------------
alter table public.perfiles enable row level security;

drop policy if exists "perfiles_select_propio_o_admin" on public.perfiles;
create policy "perfiles_select_propio_o_admin"
  on public.perfiles
  for select
  to authenticated
  using (auth.uid() = id or public.es_admin());

drop policy if exists "perfiles_update_solo_admin" on public.perfiles;
create policy "perfiles_update_solo_admin"
  on public.perfiles
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- INSERT lo hace el trigger (security definer). No hay policy de insert cliente.
-- DELETE: cascada desde auth.users.

-- -----------------------------------------------------------------------------
-- 5) Candado de titanio: torneos / partidos / jugadores
--    SELECT: cualquiera (anon o authenticated)
--    INSERT / UPDATE / DELETE: solo rol = admin
-- -----------------------------------------------------------------------------

-- --- torneos ---
alter table public.torneos enable row level security;

drop policy if exists "torneos_select_publico" on public.torneos;
create policy "torneos_select_publico"
  on public.torneos
  for select
  using (true);

drop policy if exists "torneos_insert_admin" on public.torneos;
create policy "torneos_insert_admin"
  on public.torneos
  for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "torneos_update_admin" on public.torneos;
create policy "torneos_update_admin"
  on public.torneos
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "torneos_delete_admin" on public.torneos;
create policy "torneos_delete_admin"
  on public.torneos
  for delete
  to authenticated
  using (public.es_admin());

-- --- partidos ---
alter table public.partidos enable row level security;

drop policy if exists "partidos_select_publico" on public.partidos;
create policy "partidos_select_publico"
  on public.partidos
  for select
  using (true);

drop policy if exists "partidos_insert_admin" on public.partidos;
create policy "partidos_insert_admin"
  on public.partidos
  for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "partidos_update_admin" on public.partidos;
create policy "partidos_update_admin"
  on public.partidos
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "partidos_delete_admin" on public.partidos;
create policy "partidos_delete_admin"
  on public.partidos
  for delete
  to authenticated
  using (public.es_admin());

-- --- jugadores ---
alter table public.jugadores enable row level security;

drop policy if exists "jugadores_select_publico" on public.jugadores;
create policy "jugadores_select_publico"
  on public.jugadores
  for select
  using (true);

drop policy if exists "jugadores_insert_admin" on public.jugadores;
create policy "jugadores_insert_admin"
  on public.jugadores
  for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "jugadores_update_admin" on public.jugadores;
create policy "jugadores_update_admin"
  on public.jugadores
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "jugadores_delete_admin" on public.jugadores;
create policy "jugadores_delete_admin"
  on public.jugadores
  for delete
  to authenticated
  using (public.es_admin());

-- -----------------------------------------------------------------------------
-- 6) Extra recomendado: torneo_jugadores (inscripciones)
--    Sin esto, un jugador autenticado podría mutar inscriptos aunque
--    torneos/jugadores estén cerrados.
-- -----------------------------------------------------------------------------
alter table public.torneo_jugadores enable row level security;

drop policy if exists "torneo_jugadores_select_publico" on public.torneo_jugadores;
create policy "torneo_jugadores_select_publico"
  on public.torneo_jugadores
  for select
  using (true);

drop policy if exists "torneo_jugadores_insert_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_insert_admin"
  on public.torneo_jugadores
  for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "torneo_jugadores_update_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_update_admin"
  on public.torneo_jugadores
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "torneo_jugadores_delete_admin" on public.torneo_jugadores;
create policy "torneo_jugadores_delete_admin"
  on public.torneo_jugadores
  for delete
  to authenticated
  using (public.es_admin());

-- -----------------------------------------------------------------------------
-- 7) Promover tu primer admin (reemplazá el email)
-- -----------------------------------------------------------------------------
-- update public.perfiles
-- set rol = 'admin'
-- where id = (
--   select id from auth.users where email = 'tu-admin@email.com'
-- );
