-- =============================================================================
-- Tenis La Vía — Datos de pago por torneo (inscripciones)
-- Correr en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

alter table public.torneos
  add column if not exists precio_inscripcion numeric(10,2) default 0;

alter table public.torneos
  add column if not exists datos_pago_alias_cbu text;

alter table public.torneos
  add column if not exists datos_pago_titular text;

comment on column public.torneos.precio_inscripcion is
  'Precio de inscripción al torneo (0 = gratuito)';

comment on column public.torneos.datos_pago_alias_cbu is
  'Alias o CBU/CVU para transferir la inscripción';

comment on column public.torneos.datos_pago_titular is
  'Nombre del titular de la cuenta de pago';

-- Migración opcional desde el campo legacy datos_pago_texto (si existía)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'torneos'
      and column_name = 'datos_pago_texto'
  ) then
    update public.torneos
    set datos_pago_alias_cbu = datos_pago_texto
    where datos_pago_alias_cbu is null
      and datos_pago_texto is not null
      and btrim(datos_pago_texto) <> '';
  end if;
end $$;
