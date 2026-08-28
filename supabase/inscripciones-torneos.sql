-- =============================================
-- SISTEMA DE INSCRIPCIÓN Y VALIDACIÓN DE PAGOS
-- =============================================

-- 1. Actualizar tabla torneos con campos de pago
alter table public.torneos
  add column if not exists precio_inscripcion numeric(10,2) default 0,
  add column if not exists datos_pago_texto text;

comment on column public.torneos.precio_inscripcion is
  'Precio de inscripción al torneo (0 = gratuito)';

comment on column public.torneos.datos_pago_texto is
  'Datos de pago configurados por el admin (Alias/CVU, instrucciones, etc.)';

-- 2. Crear tabla de inscripciones
create table if not exists public.inscripciones_torneo (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  estado_pago text not null default 'pendiente'
    check (estado_pago in ('pendiente', 'aprobado', 'rechazado')),
  fecha_inscripcion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  notas_admin text,
  created_at timestamptz not null default now(),
  
  -- Constraint: un jugador solo puede tener una inscripción por torneo
  constraint inscripciones_torneo_unica unique (torneo_id, jugador_id)
);

comment on table public.inscripciones_torneo is
  'Inscripciones de jugadores a torneos con validación de pago';

comment on column public.inscripciones_torneo.estado_pago is
  'Estado de la inscripción: pendiente (esperando validación), aprobado (puede jugar), rechazado (pago no válido)';

-- 3. Índices para rendimiento
create index if not exists inscripciones_torneo_torneo_idx
  on public.inscripciones_torneo (torneo_id);

create index if not exists inscripciones_torneo_jugador_idx
  on public.inscripciones_torneo (jugador_id);

create index if not exists inscripciones_torneo_estado_idx
  on public.inscripciones_torneo (estado_pago);

-- 4. Función para actualizar fecha_actualizacion automáticamente
create or replace function actualizar_fecha_actualizacion_inscripcion()
returns trigger as $$
begin
  new.fecha_actualizacion = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_actualizar_inscripcion on public.inscripciones_torneo;
create trigger trigger_actualizar_inscripcion
  before update on public.inscripciones_torneo
  for each row
  execute function actualizar_fecha_actualizacion_inscripcion();

-- 5. Row Level Security (RLS)
alter table public.inscripciones_torneo enable row level security;

-- Usuarios autenticados pueden ver sus propias inscripciones y las aprobadas de otros
drop policy if exists "inscripciones_torneo_select_autenticado" on public.inscripciones_torneo;
create policy "inscripciones_torneo_select_autenticado"
  on public.inscripciones_torneo
  for select
  to authenticated
  using (
    -- Ver sus propias inscripciones
    jugador_id in (
      select id from public.jugadores where user_id = auth.uid()
    )
    or
    -- Ver inscripciones aprobadas de otros
    estado_pago = 'aprobado'
    or
    -- Admins pueden ver todas
    public.es_admin()
  );

-- Usuarios autenticados pueden crear inscripciones para su propio jugador
drop policy if exists "inscripciones_torneo_insert_autenticado" on public.inscripciones_torneo;
create policy "inscripciones_torneo_insert_autenticado"
  on public.inscripciones_torneo
  for insert
  to authenticated
  with check (
    jugador_id in (
      select id from public.jugadores where user_id = auth.uid()
    )
  );

-- Solo admins pueden actualizar (aprobar/rechazar) inscripciones
drop policy if exists "inscripciones_torneo_update_admin" on public.inscripciones_torneo;
create policy "inscripciones_torneo_update_admin"
  on public.inscripciones_torneo
  for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Solo admins pueden eliminar inscripciones
drop policy if exists "inscripciones_torneo_delete_admin" on public.inscripciones_torneo;
create policy "inscripciones_torneo_delete_admin"
  on public.inscripciones_torneo
  for delete
  to authenticated
  using (public.es_admin());

-- 6. Grants
revoke all on public.inscripciones_torneo from anon;
grant select, insert on public.inscripciones_torneo to authenticated;
grant update, delete on public.inscripciones_torneo to authenticated; -- RLS maneja permisos

-- 7. Función auxiliar para verificar si un jugador está inscrito y aprobado
create or replace function esta_inscrito_y_aprobado(
  p_torneo_id uuid,
  p_jugador_id uuid
) returns boolean as $$
begin
  return exists (
    select 1
    from public.inscripciones_torneo
    where torneo_id = p_torneo_id
      and jugador_id = p_jugador_id
      and estado_pago = 'aprobado'
  );
end;
$$ language plpgsql security definer;

comment on function esta_inscrito_y_aprobado is
  'Verifica si un jugador tiene una inscripción aprobada en un torneo específico';
