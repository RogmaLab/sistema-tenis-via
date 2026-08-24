-- Segmentación de partidos por categoría de torneo (independiente de jugadores.categoria).
alter table public.partidos
  add column if not exists categoria text;

comment on column public.partidos.categoria is
  'Cuadro del torneo al que pertenece el partido (ej. 4ta). Obligatorio para clasificación y cuadro.';

-- Backfill: misma categoría de inscripción para ambos jugadores
update public.partidos as p
set categoria = sub.categoria
from (
  select
    partido.id as partido_id,
    tj1.categoria
  from public.partidos as partido
  inner join public.torneo_jugadores as tj1
    on tj1.torneo_id = partido.torneo_id
   and tj1.jugador_id = partido.jugador_1_id
  inner join public.torneo_jugadores as tj2
    on tj2.torneo_id = partido.torneo_id
   and tj2.jugador_id = partido.jugador_2_id
   and tj2.categoria = tj1.categoria
  where partido.categoria is null
    or btrim(partido.categoria) = ''
) as sub
where p.id = sub.partido_id;

-- Backfill: un solo jugador (bye / esperando rival)
update public.partidos as p
set categoria = tj.categoria
from public.torneo_jugadores as tj
where p.torneo_id = tj.torneo_id
  and (
    (p.jugador_1_id = tj.jugador_id and p.jugador_2_id is null)
    or (p.jugador_2_id = tj.jugador_id and p.jugador_1_id is null)
  )
  and (p.categoria is null or btrim(p.categoria) = '');

create index if not exists idx_partidos_torneo_categoria
  on public.partidos (torneo_id, categoria);

create index if not exists idx_partidos_torneo_categoria_fase
  on public.partidos (torneo_id, categoria, fase);
