-- 015: nuevo tipo de puesto Guest.
-- Ejecutar después de 014. No borra datos y se puede volver a ejecutar completa.
--
--   Full       -> 1 titular fijo
--   Compartido -> 2 titulares fijos
--   Rotativo   -> sin titulares; lo agenda cualquier tatuador (Rotativo, Rotativo light, Guest...)
--   Guest      -> sin titulares; solo lo agendan tatuadores con modalidad Guest
--
-- La regla "solo tatuadores Guest" la valida el backend (FastAPI) al guardar una reserva,
-- igual que la decisión de llevar la lógica de negocio a Python. Aquí solo se permite el valor nuevo.
-- El cupo de titulares de Guest es 0: okami_puesto_max_titulares (009) ya devuelve 0 para todo
-- lo que no sea Full o Compartido, así que no hay que cambiarla.
BEGIN;

ALTER TABLE public.puesto DROP CONSTRAINT IF EXISTS puesto_tipo_check;
ALTER TABLE public.puesto ADD CONSTRAINT puesto_tipo_check
  CHECK (tipo IN ('Full', 'Compartido', 'Rotativo', 'Guest'));

-- El mensaje del trigger de titulares decía "es rotativo"; ahora sirve para Rotativo y Guest.
CREATE OR REPLACE FUNCTION public.okami_validar_titular()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_tipo text;
  v_nombre text;
  v_max integer;
BEGIN
  SELECT tipo, nombre INTO v_tipo, v_nombre FROM public.puesto WHERE id = NEW.puesto FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El puesto no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.rol r ON r.id = u.rol
    WHERE u.id = NEW.tatuador AND lower(trim(r.nombre)) = 'tatuador'
  ) THEN
    RAISE EXCEPTION 'Solo un tatuador puede ser titular de un puesto.' USING ERRCODE = '22023';
  END IF;
  v_max := public.okami_puesto_max_titulares(v_tipo);
  IF v_max = 0 THEN
    RAISE EXCEPTION '% es un puesto % y no tiene titulares.', v_nombre, v_tipo USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.puesto_titulares WHERE puesto = NEW.puesto) >= v_max THEN
    RAISE EXCEPTION '% (%) ya tiene % titular(es).', v_nombre, v_tipo, v_max USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
