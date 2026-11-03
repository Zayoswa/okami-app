-- Rechaza inicios pasados sin impedir cambios de estado de reservas históricas.
BEGIN;
CREATE OR REPLACE FUNCTION public.okami_validar_inicio_futuro()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.inicio IS NOT DISTINCT FROM OLD.inicio AND NEW.fin IS NOT DISTINCT FROM OLD.fin THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.inicio IS NULL OR NEW.inicio <= clock_timestamp() THEN
    RAISE EXCEPTION 'La reserva debe comenzar después de la fecha y hora actuales de Santiago.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okami_reserva_inicio_futuro ON public.reservas;
CREATE TRIGGER okami_reserva_inicio_futuro BEFORE INSERT OR UPDATE OF inicio, fin ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.okami_validar_inicio_futuro();
COMMIT;
