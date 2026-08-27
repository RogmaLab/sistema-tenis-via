-- =============================================================================
-- Partidos: árbol de eliminación (parent-child) + aislamiento de fases
-- Correr en: Supabase Dashboard → SQL Editor → Run
--
-- INVARIANTES (este script NO hace ninguna de estas cosas):
--   * No toca public.torneo_jugadores ni public.jugadores
--   * No UPDATE/DELETE de resultado, ganador_id, jugador_1_id, jugador_2_id,
--     estado ni fase en filas donde fase = 'Clasificacion'
--   * No borra partidos
--
-- Es aditivo: columnas nuevas + backfill de esas columnas + FK/índices.
-- La columna histórica `fase` se deja intacta para no romper la app actual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tipos de aislamiento (clasificacion vs eliminatoria)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'partido_tipo_fase'
  ) then
    create type public.partido_tipo_fase as enum (
      'clasificacion',
      'eliminatoria',
      'grupos'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) Columnas del árbol (idempotente)
-- -----------------------------------------------------------------------------
alter table public.partidos
  add column if not exists tipo_fase public.partido_tipo_fase;

alter table public.partidos
  add column if not exists ronda text;

alter table public.partidos
  add column if not exists numero_slot integer;

-- siguiente_partido_id: el código ya lo usa; se asegura columna + FK.
alter table public.partidos
  add column if not exists siguiente_partido_id uuid;

comment on column public.partidos.tipo_fase is
  'Aislamiento de fase: clasificacion | eliminatoria | grupos. Las consultas del cuadro deben filtrar tipo_fase = eliminatoria.';

comment on column public.partidos.ronda is
  'Ronda del cuadro (solo eliminatoria): Octavos de Final, Cuartos de Final, Semifinal, Final. NULL en clasificación.';

comment on column public.partidos.numero_slot is
  'Orden estable en la llave (1-based) dentro de (torneo, categoria, tipo_fase, ronda).';

comment on column public.partidos.siguiente_partido_id is
  'Padre en el árbol: el ganador de este partido se sienta en ese cruce. NULL = Final o partido de Qualy.';

-- -----------------------------------------------------------------------------
-- 3) Backfill SOLO de columnas nuevas (no pisa resultados de Qualy)
-- -----------------------------------------------------------------------------
update public.partidos
set tipo_fase = 'clasificacion'
where tipo_fase is null
  and fase = 'Clasificacion';

update public.partidos
set tipo_fase = 'grupos'
where tipo_fase is null
  and fase = 'Fase de Grupos';

update public.partidos
set
  tipo_fase = 'eliminatoria',
  ronda = fase
where tipo_fase is null
  and fase in (
    'Octavos de Final',
    'Cuartos de Final',
    'Semifinal',
    'Final'
  );

-- No se etiquetan fases desconocidas: exigirían ronda y podrían mezclar Qualy.

-- Slot: orden de inserción original. No usa UUID (evita mezclar la llave).
update public.partidos as p
set numero_slot = ranked.slot
from (
  select
    id,
    row_number() over (
      partition by
        torneo_id,
        coalesce(nullif(btrim(categoria), ''), '-'),
        tipo_fase,
        coalesce(ronda, '-')
      order by created_at asc nulls last, id asc
    ) as slot
  from public.partidos
  where numero_slot is null
) as ranked
where p.id = ranked.id
  and p.numero_slot is null;

-- -----------------------------------------------------------------------------
-- 4) Restricciones lógicas (no destructivas)
-- -----------------------------------------------------------------------------
alter table public.partidos
  drop constraint if exists partidos_ronda_check;

alter table public.partidos
  add constraint partidos_ronda_check
  check (
    ronda is null
    or ronda in (
      'Octavos de Final',
      'Cuartos de Final',
      'Semifinal',
      'Final'
    )
  );

alter table public.partidos
  drop constraint if exists partidos_ronda_segun_tipo_check;

alter table public.partidos
  add constraint partidos_ronda_segun_tipo_check
  check (
    (tipo_fase = 'clasificacion' and ronda is null)
    or (tipo_fase = 'grupos' and ronda is null)
    or (tipo_fase = 'eliminatoria' and ronda is not null)
    or tipo_fase is null
  );

alter table public.partidos
  drop constraint if exists partidos_numero_slot_positivo_check;

alter table public.partidos
  add constraint partidos_numero_slot_positivo_check
  check (numero_slot is null or numero_slot >= 1);

-- Qualy no apunta al árbol (evita que el cuadro “trague” clasificación).
alter table public.partidos
  drop constraint if exists partidos_qualy_sin_padre_check;

alter table public.partidos
  add constraint partidos_qualy_sin_padre_check
  check (
    tipo_fase is distinct from 'clasificacion'
    or siguiente_partido_id is null
  );

-- FK auto-referencial: al borrar una ronda posterior, los hijos quedan huérfanos
-- limpiamente (ON DELETE SET NULL) en vez de bloquear el hard-reset del cuadro.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'partidos_siguiente_partido_id_fkey'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos
      add constraint partidos_siguiente_partido_id_fkey
      foreign key (siguiente_partido_id)
      references public.partidos (id)
      on delete set null;
  end if;
end
$$;

-- Unicidad de slot en el árbol (permite NULL mientras hay filas viejas).
drop index if exists public.partidos_slot_unicos;
create unique index partidos_slot_unicos
  on public.partidos (
    torneo_id,
    coalesce(categoria, ''),
    tipo_fase,
    coalesce(ronda, ''),
    numero_slot
  )
  where numero_slot is not null
    and tipo_fase is not null;

-- Índices de consulta del cuadro (aislados de Qualy).
create index if not exists idx_partidos_eliminatoria
  on public.partidos (torneo_id, categoria, ronda, numero_slot)
  where tipo_fase = 'eliminatoria';

create index if not exists idx_partidos_clasificacion
  on public.partidos (torneo_id, categoria, created_at)
  where tipo_fase = 'clasificacion';

create index if not exists idx_partidos_siguiente
  on public.partidos (siguiente_partido_id)
  where siguiente_partido_id is not null;

-- -----------------------------------------------------------------------------
-- 5) Integridad del padre: mismo torneo, misma categoría, destino eliminatoria
-- -----------------------------------------------------------------------------
create or replace function public.partidos_validar_siguiente_partido()
returns trigger
language plpgsql
as $$
declare
  destino public.partidos%rowtype;
begin
  if new.siguiente_partido_id is null then
    return new;
  end if;

  if new.siguiente_partido_id = new.id then
    raise exception 'un partido no puede ser padre de sí mismo';
  end if;

  select *
  into destino
  from public.partidos
  where id = new.siguiente_partido_id;

  if not found then
    raise exception 'siguiente_partido_id no existe';
  end if;

  if destino.torneo_id is distinct from new.torneo_id then
    raise exception 'siguiente_partido_id debe pertenecer al mismo torneo';
  end if;

  if coalesce(destino.categoria, '') is distinct from coalesce(new.categoria, '') then
    raise exception 'siguiente_partido_id debe pertenecer a la misma categoría';
  end if;

  if destino.tipo_fase is not null
    and destino.tipo_fase is distinct from 'eliminatoria' then
    raise exception 'siguiente_partido_id debe apuntar a un partido eliminatorio';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_partidos_validar_siguiente on public.partidos;
create trigger trg_partidos_validar_siguiente
  before insert or update of siguiente_partido_id, torneo_id, categoria, tipo_fase
  on public.partidos
  for each row
  execute function public.partidos_validar_siguiente_partido();

-- -----------------------------------------------------------------------------
-- 6) Vista de lectura del cuadro (el frontend no mezcla Qualy)
-- -----------------------------------------------------------------------------
create or replace view public.partidos_cuadro_eliminatorio as
select
  id,
  torneo_id,
  categoria,
  ronda,
  numero_slot,
  siguiente_partido_id,
  jugador_1_id,
  jugador_2_id,
  ganador_id,
  resultado,
  estado,
  cancha,
  fecha_programada,
  created_at
from public.partidos
where tipo_fase = 'eliminatoria';

comment on view public.partidos_cuadro_eliminatorio is
  'Solo partidos del cuadro. Nunca incluye fase Clasificacion.';

grant select on public.partidos_cuadro_eliminatorio to anon, authenticated;
