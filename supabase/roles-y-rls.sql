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
--    SELECT: solo usuarios autenticados
--    INSERT: admin, o el usuario creando SU ficha (user_id = auth.uid())
--    UPDATE: admin, o el dueño de la ficha (user_id = auth.uid())
--    DELETE: solo admin
--    Claim de ficha ajena: función vincular_mi_jugador (no UPDATE directo)
-- -----------------------------------------------------------------------------

-- --- torneos ---
alter table public.torneos enable row level security;

drop policy if exists "torneos_select_publico" on public.torneos;
drop policy if exists "torneos_select_autenticado" on public.torneos;
create policy "torneos_select_autenticado"
  on public.torneos
  for select
  to authenticated
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
drop policy if exists "partidos_select_autenticado" on public.partidos;
create policy "partidos_select_autenticado"
  on public.partidos
  for select
  to authenticated
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

alter table public.jugadores
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.jugadores.user_id is
  'Cuenta de auth vinculada. NULL = ficha precargada, todavía no reclamada.';

create unique index if not exists jugadores_user_id_unico
  on public.jugadores (user_id)
  where user_id is not null;

drop policy if exists "jugadores_select_publico" on public.jugadores;
drop policy if exists "jugadores_select_autenticado" on public.jugadores;
create policy "jugadores_select_autenticado"
  on public.jugadores
  for select
  to authenticated
  using (true);

drop policy if exists "jugadores_insert_admin" on public.jugadores;
drop policy if exists "jugadores_insert_admin_o_propio" on public.jugadores;
create policy "jugadores_insert_admin_o_propio"
  on public.jugadores
  for insert
  to authenticated
  with check (public.es_admin() or user_id = auth.uid());

drop policy if exists "jugadores_update_admin" on public.jugadores;
create policy "jugadores_update_admin"
  on public.jugadores
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "jugadores_update_propio" on public.jugadores;
create policy "jugadores_update_propio"
  on public.jugadores
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "jugadores_delete_admin" on public.jugadores;
create policy "jugadores_delete_admin"
  on public.jugadores
  for delete
  to authenticated
  using (public.es_admin());

create or replace function public.vincular_mi_jugador(p_jugador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  if exists (
    select 1 from public.jugadores j where j.user_id = auth.uid()
  ) then
    raise exception 'Ya tenés un perfil de jugador vinculado.';
  end if;

  update public.jugadores
  set user_id = auth.uid()
  where id = p_jugador_id
    and user_id is null;

  get diagnostics filas = row_count;
  if filas = 0 then
    raise exception 'Ese perfil no está disponible para vincular.';
  end if;
end;
$$;

revoke all on function public.vincular_mi_jugador(uuid) from public;
grant execute on function public.vincular_mi_jugador(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Extra recomendado: torneo_jugadores (inscripciones)
--    Sin esto, un jugador autenticado podría mutar inscriptos aunque
--    torneos/jugadores estén cerrados.
-- -----------------------------------------------------------------------------
alter table public.torneo_jugadores enable row level security;

drop policy if exists "torneo_jugadores_select_publico" on public.torneo_jugadores;
drop policy if exists "torneo_jugadores_select_autenticado" on public.torneo_jugadores;
create policy "torneo_jugadores_select_autenticado"
  on public.torneo_jugadores
  for select
  to authenticated
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
-- 8) Privileges de escritura: anon no muta. authenticated escribe solo
--    si pasa RLS (es_admin()).
-- -----------------------------------------------------------------------------
revoke select, insert, update, delete on public.torneos from anon;
revoke select, insert, update, delete on public.partidos from anon;
revoke select, insert, update, delete on public.jugadores from anon;
revoke select, insert, update, delete on public.torneo_jugadores from anon;
revoke select, insert, update, delete on public.perfiles from anon;

grant select on public.torneos to authenticated;
grant select on public.partidos to authenticated;
grant select on public.jugadores to authenticated;
grant select on public.torneo_jugadores to authenticated;

grant insert, update, delete on public.torneos to authenticated;
grant insert, update, delete on public.partidos to authenticated;
grant insert, update, delete on public.jugadores to authenticated;
grant insert, update, delete on public.torneo_jugadores to authenticated;

-- WhatsApp: RLS es por fila, no por columna. Revocamos SELECT del teléfono
-- en la tabla (anon/authenticated). La vista (security definer / invoker=false)
-- lee con privilegios del owner y enmascara: NULL si el JWT no es admin.
-- Los embeds de partidos/torneo_jugadores no piden whatsapp, así que siguen OK.
revoke select (whatsapp) on public.jugadores from public, anon, authenticated;

drop view if exists public.jugadores_listado;
create view public.jugadores_listado
with (security_invoker = false)
as
select
  id,
  nombre_completo,
  categoria,
  genero,
  created_at,
  user_id,
  case
    when public.es_admin() or user_id = auth.uid() then whatsapp
    else null
  end as whatsapp
from public.jugadores;

comment on view public.jugadores_listado is
  'Listado de jugadores. whatsapp solo para admin o el dueño de la ficha.';

grant select on public.jugadores_listado to authenticated;

-- -----------------------------------------------------------------------------
-- 9) Promover tu primer admin (reemplazá el email)
-- -----------------------------------------------------------------------------
-- update public.perfiles
-- set rol = 'admin'
-- where id = (
--   select id from auth.users where email = 'tu-admin@email.com'
-- );
