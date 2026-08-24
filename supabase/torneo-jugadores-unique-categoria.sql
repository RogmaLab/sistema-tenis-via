-- Un jugador puede inscribirse en N categorías del mismo torneo.
-- La unicidad es por (torneo_id, jugador_id, categoria), NO solo (torneo_id, jugador_id).

-- 1) Asegurar columna categoria (ver también torneo-jugadores-categoria.sql)
alter table public.torneo_jugadores
  add column if not exists categoria text;

-- Backfill filas legacy sin categoría de inscripción
update public.torneo_jugadores as inscripcion
set categoria = jugador.categoria
from public.jugadores as jugador
where inscripcion.jugador_id = jugador.id
  and (inscripcion.categoria is null or btrim(inscripcion.categoria) = '');

update public.torneo_jugadores
set categoria = 'Sin categoría'
where categoria is null or btrim(categoria) = '';

-- 2) Quitar restricción única vieja (torneo_id, jugador_id)
alter table public.torneo_jugadores
  drop constraint if exists torneo_jugadores_torneo_id_jugador_id_key;

alter table public.torneo_jugadores
  drop constraint if exists torneo_jugadores_torneo_id_jugador_id_unique;

alter table public.torneo_jugadores
  drop constraint if exists unique_torneo_jugador;

drop index if exists public.torneo_jugadores_torneo_id_jugador_id_key;
drop index if exists public.torneo_jugadores_torneo_id_jugador_id_idx;
drop index if exists public.idx_torneo_jugadores_torneo_jugador;

-- 3) Obligatorio para la clave compuesta
alter table public.torneo_jugadores
  alter column categoria set not null;

-- 4) Nueva unicidad: una fila por categoría de torneo por jugador
alter table public.torneo_jugadores
  drop constraint if exists torneo_jugadores_torneo_jugador_categoria_key;

alter table public.torneo_jugadores
  add constraint torneo_jugadores_torneo_jugador_categoria_key
  unique (torneo_id, jugador_id, categoria);

comment on constraint torneo_jugadores_torneo_jugador_categoria_key
  on public.torneo_jugadores is
  'Permite múltiples inscripciones del mismo jugador en distintas categorías del torneo.';

create index if not exists idx_torneo_jugadores_torneo_categoria
  on public.torneo_jugadores (torneo_id, categoria);
