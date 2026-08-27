-- =============================================================================
-- Tenis La Vía — SELECT solo para usuarios autenticados
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- Cierra la lectura anónima de torneos, partidos, jugadores y ranking.
-- =============================================================================

drop policy if exists "torneos_select_publico" on public.torneos;
drop policy if exists "torneos_select_autenticado" on public.torneos;
create policy "torneos_select_autenticado"
  on public.torneos
  for select
  to authenticated
  using (true);

drop policy if exists "partidos_select_publico" on public.partidos;
drop policy if exists "partidos_select_autenticado" on public.partidos;
create policy "partidos_select_autenticado"
  on public.partidos
  for select
  to authenticated
  using (true);

drop policy if exists "jugadores_select_publico" on public.jugadores;
drop policy if exists "jugadores_select_autenticado" on public.jugadores;
create policy "jugadores_select_autenticado"
  on public.jugadores
  for select
  to authenticated
  using (true);

drop policy if exists "torneo_jugadores_select_publico" on public.torneo_jugadores;
drop policy if exists "torneo_jugadores_select_autenticado" on public.torneo_jugadores;
create policy "torneo_jugadores_select_autenticado"
  on public.torneo_jugadores
  for select
  to authenticated
  using (true);

revoke select on public.torneos from anon;
revoke select on public.partidos from anon;
revoke select on public.jugadores from anon;
revoke select on public.torneo_jugadores from anon;

do $$
begin
  if to_regclass('public.jugadores_listado') is not null then
    execute 'revoke select on public.jugadores_listado from anon';
    execute 'grant select on public.jugadores_listado to authenticated';
  end if;

  if to_regclass('public.partidos_cuadro_eliminatorio') is not null then
    execute 'revoke select on public.partidos_cuadro_eliminatorio from anon';
    execute 'grant select on public.partidos_cuadro_eliminatorio to authenticated';
  end if;
end $$;
