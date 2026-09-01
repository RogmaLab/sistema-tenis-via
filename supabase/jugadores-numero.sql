-- =============================================================================
-- Tenis La Vía — Número de jugador (club)
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.jugadores
  add column if not exists numero_jugador integer;

comment on column public.jugadores.numero_jugador is
  'Identificador numérico estable del club para sorteos y referencia rápida del admin.';

with maximo as (
  select coalesce(max(numero_jugador), 0) as n from public.jugadores
),
numerados as (
  select
    id,
    (select n from maximo)
      + row_number() over (order by created_at asc nulls last, id asc) as nuevo
  from public.jugadores
  where numero_jugador is null
)
update public.jugadores as jugador
set numero_jugador = numerados.nuevo
from numerados
where jugador.id = numerados.id;

create sequence if not exists public.jugadores_numero_jugador_seq;

select setval(
  'public.jugadores_numero_jugador_seq',
  coalesce((select max(numero_jugador) from public.jugadores), 0)
);

alter table public.jugadores
  alter column numero_jugador set default nextval('public.jugadores_numero_jugador_seq');

alter sequence public.jugadores_numero_jugador_seq
  owned by public.jugadores.numero_jugador;

alter table public.jugadores
  alter column numero_jugador set not null;

create unique index if not exists jugadores_numero_jugador_unico
  on public.jugadores (numero_jugador);

drop view if exists public.jugadores_listado;
create view public.jugadores_listado
with (security_invoker = false)
as
select
  id,
  numero_jugador,
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
