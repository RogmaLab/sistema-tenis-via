-- Agregar columna de disponibilidad horaria a la tabla jugadores
-- Los jugadores declaran en qué bloques horarios pueden jugar

-- Definir el tipo de bloque horario (enum)
do $$ begin
  create type bloque_horario as enum (
    'sabado_manana',    -- Sábado 08:00-13:00
    'sabado_tarde',     -- Sábado 13:00-18:00
    'sabado_noche',     -- Sábado 18:00-22:00
    'domingo_manana',   -- Domingo 08:00-13:00
    'domingo_tarde',    -- Domingo 13:00-18:00
    'domingo_noche'     -- Domingo 18:00-22:00
  );
exception
  when duplicate_object then null;
end $$;

-- Agregar columna de disponibilidad (array de bloques)
alter table public.jugadores
  add column if not exists disponibilidad_horaria bloque_horario[] default '{}';

comment on column public.jugadores.disponibilidad_horaria is
  'Bloques horarios en los que el jugador puede jugar (para auto-asignación de horarios)';

-- Crear índice para búsquedas eficientes de disponibilidad
create index if not exists jugadores_disponibilidad_idx
  on public.jugadores using gin(disponibilidad_horaria);

-- Actualizar los jugadores existentes con disponibilidad completa por defecto
-- (Pueden jugar en cualquier horario hasta que elijan lo contrario)
update public.jugadores
  set disponibilidad_horaria = array[
    'sabado_manana',
    'sabado_tarde',
    'sabado_noche',
    'domingo_manana',
    'domingo_tarde',
    'domingo_noche'
  ]::bloque_horario[]
  where disponibilidad_horaria = '{}';
