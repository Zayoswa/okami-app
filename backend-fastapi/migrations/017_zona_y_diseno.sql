-- 017: datos del tatuaje en la reserva.
-- Ejecutar en Supabase SQL Editor. Se puede ejecutar más de una vez (idempotente).
--
-- zona_cuerpo: parte del cuerpo donde se tatúa el cliente (ej. "Antebrazo derecho").
-- descripcion_diseno: nota libre con la descripción del diseño.
-- Ambas son opcionales: las reservas existentes quedan sin estos datos y se pueden completar al editarlas.
-- No cambia okami_guardar_reserva ni okami_listar_reservas: FastAPI guarda y lee estos dos campos.

BEGIN;

ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS zona_cuerpo text;
ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS descripcion_diseno text;

ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_zona_cuerpo_largo;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_zona_cuerpo_largo
  CHECK (zona_cuerpo IS NULL OR char_length(zona_cuerpo) BETWEEN 1 AND 80);

ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_descripcion_diseno_largo;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_descripcion_diseno_largo
  CHECK (descripcion_diseno IS NULL OR char_length(descripcion_diseno) BETWEEN 1 AND 1000);

COMMENT ON COLUMN public.reservas.zona_cuerpo IS 'Parte del cuerpo donde se tatúa el cliente.';
COMMENT ON COLUMN public.reservas.descripcion_diseno IS 'Nota con la descripción del diseño.';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación: deben aparecer las dos columnas.
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'reservas' and column_name in ('zona_cuerpo', 'descripcion_diseno');
