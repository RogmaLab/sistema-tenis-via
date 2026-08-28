-- =============================================================================
-- VALIDACIÓN DE DEADLINE PARA DISPONIBILIDAD HORARIA (Backend)
-- Fecha: 2026-08-28
-- Criticidad: ALTA
-- =============================================================================
-- 
-- PROBLEMA: Actualmente la validación del deadline (jueves 22:00) solo existe
-- en el frontend, permitiendo que usuarios maliciosos saltaran la validación.
--
-- SOLUCIÓN: Agregar trigger en Supabase que valide el deadline en el backend.
-- =============================================================================

-- Función que valida si se puede modificar la disponibilidad
CREATE OR REPLACE FUNCTION public.validar_deadline_disponibilidad()
RETURNS TRIGGER AS $$
DECLARE
  dia_semana integer;
  hora_actual time;
  ahora_ts timestamptz;
  jueves_actual date;
  deadline_jueves timestamptz;
  fin_weekend timestamptz;
BEGIN
  -- Solo validar si el usuario NO es admin
  IF public.es_admin() THEN
    RETURN NEW;
  END IF;

  ahora_ts := now();
  dia_semana := EXTRACT(DOW FROM ahora_ts); -- 0=Domingo, 1=Lunes, ..., 4=Jueves, ..., 6=Sábado
  hora_actual := ahora_ts::time;

  -- Calcular el jueves de esta semana
  -- date_trunc('week', ...) da el lunes. Jueves = lunes + 3 días
  jueves_actual := (date_trunc('week', ahora_ts) + interval '3 days')::date;
  
  -- Deadline: jueves a las 22:00
  deadline_jueves := jueves_actual + time '22:00:00';
  
  -- Fin del período bloqueado: lunes a las 00:00 (siguiente semana)
  fin_weekend := (jueves_actual + interval '4 days')::timestamptz;

  -- LÓGICA DE VALIDACIÓN:
  -- Si estamos entre jueves 22:00 y lunes 00:00 (viernes/sábado/domingo), rechazar
  IF ahora_ts >= deadline_jueves AND ahora_ts < fin_weekend THEN
    RAISE EXCEPTION 'El plazo para modificar la disponibilidad cerró el jueves a las 22:00 hs. Los horarios están siendo procesados por la organización.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger que se ejecuta ANTES de actualizar disponibilidad_horaria
DROP TRIGGER IF EXISTS check_deadline_disponibilidad ON public.jugadores;
CREATE TRIGGER check_deadline_disponibilidad
  BEFORE UPDATE OF disponibilidad_horaria ON public.jugadores
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_deadline_disponibilidad();

COMMENT ON FUNCTION public.validar_deadline_disponibilidad IS
  'Valida que los jugadores solo puedan modificar su disponibilidad horaria antes del jueves 22:00. Los admins pueden modificar en cualquier momento.';

-- =============================================================================
-- TESTING
-- =============================================================================
-- Para probar la función manualmente:
--
-- 1. Como jugador (no admin), intentar actualizar disponibilidad un viernes:
--    UPDATE jugadores SET disponibilidad_horaria = '{}' WHERE id = '<tu-id>';
--    Resultado esperado: ERROR con mensaje del deadline
--
-- 2. Como jugador, intentar actualizar un lunes o martes:
--    UPDATE jugadores SET disponibilidad_horaria = '{}' WHERE id = '<tu-id>';
--    Resultado esperado: Actualización exitosa
--
-- 3. Como admin, intentar actualizar cualquier día:
--    Resultado esperado: Siempre exitoso (bypass del deadline)
-- =============================================================================
