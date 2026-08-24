-- Categoría de COMPETENCIA de la inscripción (atributo del torneo, no del club).
-- jugadores.categoria = ficha oficial (Ferrer = 3ra). NUNCA se modifica al inscribir.
-- torneo_jugadores.categoria = cuadro en el que el admin lo anotó (ej. 4ta).
alter table public.torneo_jugadores
  add column if not exists categoria text;

comment on column public.torneo_jugadores.categoria is
  'Categoría del torneo en la que compite esta inscripción. Independiente de jugadores.categoria.';

-- Solo filas viejas sin categoría de inscripción: se asume el cuadro = ficha de entonces.
-- No escribe sobre public.jugadores.
update public.torneo_jugadores as inscripcion
set categoria = jugador.categoria
from public.jugadores as jugador
where inscripcion.jugador_id = jugador.id
  and (inscripcion.categoria is null or btrim(inscripcion.categoria) = '');
