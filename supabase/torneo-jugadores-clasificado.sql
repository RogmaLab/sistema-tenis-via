-- Marca si el jugador ya clasificó al cuadro principal de ESTE torneo
-- (ganó su cruce de clasificación o recibió pase directo).
alter table public.torneo_jugadores
  add column if not exists clasificado boolean not null default false;

comment on column public.torneo_jugadores.clasificado is
  'True cuando el jugador ya está habilitado para el cuadro eliminatorio de este torneo.';
