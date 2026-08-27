-- =============================================================================
-- Tenis La Vía — Vinculación jugadores ↔ auth.users + RLS propio
-- Correr en: Supabase Dashboard → SQL Editor → New query → Run
-- (después de roles-y-rls.sql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Columna user_id (nullable: fichas cargadas a mano por el admin)
-- -----------------------------------------------------------------------------
alter table public.jugadores
  add column if not exists user_id uuid references auth.users (id) on delete set null;

comment on column public.jugadores.user_id is
  'Cuenta de auth vinculada. NULL = ficha precargada, todavía no reclamada.';

create unique index if not exists jugadores_user_id_unico
  on public.jugadores (user_id)
  where user_id is not null;

-- -----------------------------------------------------------------------------
-- 2) RLS: el dueño puede INSERT (crear su ficha) y UPDATE su fila.
--    Admin sigue pudiendo todo. Nadie reclama una fila ajena con UPDATE
--    directo: eso va por la función vincular_mi_jugador.
-- -----------------------------------------------------------------------------
drop policy if exists "jugadores_insert_admin" on public.jugadores;
drop policy if exists "jugadores_insert_admin_o_propio" on public.jugadores;
create policy "jugadores_insert_admin_o_propio"
  on public.jugadores
  for insert
  to authenticated
  with check (public.es_admin() or user_id = auth.uid());

drop policy if exists "jugadores_update_propio" on public.jugadores;
create policy "jugadores_update_propio"
  on public.jugadores
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3) RPC de claim: setea user_id = auth.uid() solo si la ficha está libre
--    y el usuario todavía no tiene otra.
-- -----------------------------------------------------------------------------
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
-- 4) Vista de listado: WhatsApp visible para admin o para el dueño de la fila
-- -----------------------------------------------------------------------------
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

grant select on public.jugadores_listado to anon, authenticated;
