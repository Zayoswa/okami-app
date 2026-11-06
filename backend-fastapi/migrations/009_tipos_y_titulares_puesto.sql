-- 009: tipo de puesto (Full / Compartido / Rotativo) y titulares de cada puesto.
-- Ejecutar después de 008. No borra datos y se puede volver a ejecutar completa.
--
--   Full       -> 1 titular fijo
--   Compartido -> 2 titulares fijos
--   Rotativo   -> sin titulares; lo usan tatuadores de paso o en arriendo
--
-- Reglas que cuida la base de datos:
--   * un tatuador es titular de un solo puesto;
--   * un puesto no puede tener más titulares de los que permite su tipo;
--   * solo usuarios con rol tatuador pueden ser titulares.
-- Por ahora NO se restringe quién agenda sesiones en cada puesto (pendiente de definir con el estudio).
BEGIN;

-- 1. Tipo de puesto ---------------------------------------------------------------
ALTER TABLE public.puesto ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'Rotativo';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.puesto'::regclass AND conname = 'puesto_tipo_check') THEN
    ALTER TABLE public.puesto ADD CONSTRAINT puesto_tipo_check CHECK (tipo IN ('Full', 'Compartido', 'Rotativo'));
  END IF;
END;
$$;
GRANT SELECT, UPDATE ON public.puesto TO service_role;

CREATE OR REPLACE FUNCTION public.okami_puesto_max_titulares(p_tipo text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_tipo WHEN 'Full' THEN 1 WHEN 'Compartido' THEN 2 ELSE 0 END;
$$;

-- 2. Titulares --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.puesto_titulares (
  puesto bigint NOT NULL REFERENCES public.puesto(id) ON DELETE CASCADE,
  tatuador uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (puesto, tatuador),
  CONSTRAINT puesto_titulares_un_puesto_por_tatuador UNIQUE (tatuador)
);

ALTER TABLE public.puesto_titulares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.puesto_titulares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.puesto_titulares TO service_role;

-- Al agregar un titular: debe ser tatuador y el puesto debe tener cupo.
-- Se bloquea la fila del puesto para que dos altas simultáneas no superen el cupo.
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
    RAISE EXCEPTION '% es rotativo y no tiene titulares.', v_nombre USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.puesto_titulares WHERE puesto = NEW.puesto) >= v_max THEN
    RAISE EXCEPTION '% (%) ya tiene % titular(es).', v_nombre, v_tipo, v_max USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS okami_validar_titular ON public.puesto_titulares;
CREATE TRIGGER okami_validar_titular BEFORE INSERT OR UPDATE ON public.puesto_titulares
FOR EACH ROW EXECUTE FUNCTION public.okami_validar_titular();

-- Al cambiar el tipo: no puede quedar con más titulares de los que permite el nuevo tipo.
CREATE OR REPLACE FUNCTION public.okami_validar_tipo_puesto()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_actuales integer := (SELECT count(*) FROM public.puesto_titulares WHERE puesto = NEW.id);
  v_max integer := public.okami_puesto_max_titulares(NEW.tipo);
BEGIN
  IF v_actuales > v_max THEN
    RAISE EXCEPTION '% tiene % titular(es) y un puesto % admite %. Quita titulares antes de cambiar el tipo.',
      NEW.nombre, v_actuales, NEW.tipo, v_max USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS okami_validar_tipo_puesto ON public.puesto;
CREATE TRIGGER okami_validar_tipo_puesto BEFORE UPDATE OF tipo ON public.puesto
FOR EACH ROW EXECUTE FUNCTION public.okami_validar_tipo_puesto();

REVOKE ALL ON FUNCTION public.okami_puesto_max_titulares(text), public.okami_validar_titular(),
  public.okami_validar_tipo_puesto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_puesto_max_titulares(text) TO service_role;

COMMIT;

-- Verificación:
-- select id, nombre, tipo from public.puesto order by id;
-- select * from public.puesto_titulares;
