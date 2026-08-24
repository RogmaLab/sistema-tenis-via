-- Programación logística del partido (fecha/hora + cancha).
-- Si la columna vieja se llamaba fecha_horario, renombrala:
-- alter table public.partidos rename column fecha_horario to fecha_programada;

alter table public.partidos
  add column if not exists fecha_programada timestamptz;

alter table public.partidos
  add column if not exists cancha text;

comment on column public.partidos.fecha_programada is
  'Fecha y hora programadas del partido (timestamptz).';

comment on column public.partidos.cancha is
  'Cancha asignada (ej. Cancha 1, Cancha 2).';
