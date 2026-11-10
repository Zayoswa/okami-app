-- 020: borrar definitivamente a un tatuador inactivo, conservando consentimientos, pagos y actividad.
-- Ejecutar en Supabase SQL Editor después de 019. No borra datos y se puede volver a ejecutar completa.
--
-- Qué se borra al llamar a okami_borrar_tatuador:
--   * sus reservas y las sesiones de esas reservas;
--   * su perfil (usuarios) y, en cascada, sus titularidades de puesto y su historial de modalidad.
--   (La cuenta de Supabase Auth la borra el backend justo después.)
-- Qué se conserva, sin enlace al usuario borrado (la columna queda en NULL):
--   * consentimientos: respaldo legal (DS 304); ya guardan tatuador_nombre.
--   * pagos_arriendo: respaldo contable; se copia su nombre en tatuador_nombre antes de borrar.
--   * registro_actividad: guarda actor_nombre y el resumen en texto.
--   * cualquier otra columna que apunte a usuarios (creado_por, archivada_por, registrado_por...).
-- Las filas de tablas cuya llave primaria incluye al usuario (ej. destinatario) se borran con él.
-- Los permisos de consentimientos y registro_actividad no cambian: el backend sigue sin poder editarlos ni
-- borrarlos. Poner la columna en NULL lo hace la propia base al borrar el usuario (ON DELETE SET NULL).
BEGIN;

-- 1. Nombre del tatuador en los pagos (para que el pago siga diciendo de quién era).
ALTER TABLE public.pagos_arriendo ADD COLUMN IF NOT EXISTS tatuador_nombre text CHECK (char_length(tatuador_nombre) <= 120);

-- 2. Todas las llaves hacia usuarios que impedirían borrar (sin acción o RESTRICT) se cambian:
--    * si la columna es parte de la llave primaria de su tabla (ej. destinatario."user"), la fila no tiene
--      sentido sin el usuario: ON DELETE CASCADE (se borra junto con él);
--    * en el resto (consentimientos, pagos, creado_por...): ON DELETE SET NULL (la fila se conserva).
--    Se excluye reservas."user" (el tatuador de la reserva): esas reservas se borran antes, en la función.
--    Las que ya son CASCADE o SET NULL no se tocan.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT con.conname, cl.relname AS tabla, att.attname AS columna,
           EXISTS (SELECT 1 FROM pg_constraint pk
                   WHERE pk.conrelid = con.conrelid AND pk.contype = 'p' AND att.attnum = ANY (pk.conkey)) AS en_llave_primaria
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.usuarios'::regclass
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
      AND con.confdeltype IN ('a', 'r')
      AND NOT (cl.relname = 'reservas' AND att.attname = 'user')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tabla, fk.conname);
    IF fk.en_llave_primaria THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.usuarios(id) ON DELETE CASCADE',
                     fk.tabla, fk.conname, fk.columna);
      RAISE NOTICE 'ON DELETE CASCADE: %.%', fk.tabla, fk.columna;
    ELSE
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', fk.tabla, fk.columna);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.usuarios(id) ON DELETE SET NULL',
                     fk.tabla, fk.conname, fk.columna);
      RAISE NOTICE 'ON DELETE SET NULL: %.%', fk.tabla, fk.columna;
    END IF;
  END LOOP;
END $$;

-- 3. Borrado en una sola transacción: o se borra todo lo indicado, o nada.
CREATE OR REPLACE FUNCTION public.okami_borrar_tatuador(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  perfil record;
  n_reservas integer;
  n_sesiones integer;
BEGIN
  SELECT u.id, u.nombre, u.activo, lower(trim(r.nombre)) AS rol INTO perfil
  FROM public.usuarios u JOIN public.rol r ON r.id = u.rol
  WHERE u.id = p_id
  FOR UPDATE OF u;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El tatuador no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF perfil.rol IS DISTINCT FROM 'tatuador' THEN
    RAISE EXCEPTION 'Solo se pueden borrar tatuadores.' USING ERRCODE = '22023';
  END IF;
  IF perfil.activo THEN
    RAISE EXCEPTION 'Desactiva el acceso de % antes de borrarlo.', perfil.nombre USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pagos_arriendo SET tatuador_nombre = perfil.nombre WHERE tatuador = p_id;

  SELECT count(*) INTO n_sesiones
  FROM public.reserva_sesiones s JOIN public.reservas r ON r.id = s.reserva
  WHERE r."user" = p_id;
  DELETE FROM public.reservas WHERE "user" = p_id;  -- las sesiones se borran en cascada
  GET DIAGNOSTICS n_reservas = ROW_COUNT;

  DELETE FROM public.usuarios WHERE id = p_id;

  RETURN jsonb_build_object('nombre', perfil.nombre, 'reservas', n_reservas, 'sesiones', n_sesiones);
END $$;

REVOKE ALL ON FUNCTION public.okami_borrar_tatuador(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_borrar_tatuador(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación: no debe quedar ninguna llave hacia usuarios con borrado restringido (confdeltype a o r),
-- salvo reservas.user. c = CASCADE, n = SET NULL.
-- select cl.relname, con.conname, con.confdeltype from pg_constraint con join pg_class cl on cl.oid = con.conrelid
--  where con.contype = 'f' and con.confrelid = 'public.usuarios'::regclass order by 1;
