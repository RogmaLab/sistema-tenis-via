-- Categoría en la que el jugador compite en ESTE torneo.
-- Puede diferir de jugadores.categoria (ej. 5ta inscrita en un cuadro de 3ra).
alter table public.torneo_jugadores
  add column if not exists categoria text;

update public.torneo_jugadores as inscripcion
set categoria = jugador.categoria
from public.jugadores as jugador
where inscripcion.jugador_id = jugador.id
  and (inscripcion.categoria is null or btrim(inscripcion.categoria) = '');
