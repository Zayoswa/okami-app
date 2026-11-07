-- 008: los estados de sesión pasan a ser Programada, Completada y Cancelada.
-- "Programada" reemplaza a "Pendiente": la sesión ya tiene fecha y hora y espera realizarse.
-- Ejecutar después de 007. No borra datos y se puede volver a ejecutar.
BEGIN;

-- 1. Nombres en la tabla de estados (los IDs no cambian, las sesiones existentes se conservan).
UPDATE public.reservas_estado SET nombre = 'Programada'
WHERE lower(trim(nombre)) IN ('pendiente', 'programada', 'programado') AND nombre <> 'Programada';
UPDATE public.reservas_estado SET nombre = 'Completada'
WHERE lower(trim(nombre)) IN ('completado', 'completada') AND nombre <> 'Completada';
UPDATE public.reservas_estado SET nombre = 'Cancelada'
WHERE lower(trim(nombre)) IN ('cancelado', 'cancelada') AND nombre <> 'Cancelada';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.reservas_estado WHERE nombre IN ('Programada', 'Completada', 'Cancelada')) < 3 THEN
    RAISE EXCEPTION 'Falta alguno de los estados Programada, Completada o Cancelada en reservas_estado. Revisa la tabla.';
  END IF;
END;
$$;

-- 2. Traducción de nombres: acepta también los nombres antiguos.
CREATE OR REPLACE FUNCTION public.okami_estado_reserva(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE lower(trim(p_nombre))
    WHEN 'programada' THEN 'Programada' WHEN 'programado' THEN 'Programada' WHEN 'pendiente' THEN 'Programada'
    WHEN 'completada' THEN 'Completada' WHEN 'completado' THEN 'Completada'
    WHEN 'cancelada' THEN 'Cancelada' WHEN 'cancelado' THEN 'Cancelada'
    ELSE NULL END;
$$;

-- 3. Guardado de reservas: igual que en 007, con los nombres nuevos.
-- Crea, edita o borra una reserva con todas sus sesiones, en una sola transacción.
-- p_sesiones: [{"id": uuid, "puesto": id, "inicio": "YYYY-MM-DDTHH:MM", "fin": "...", "estado": "Programada"}]
-- Al editar, las sesiones que no vienen en la lista se borran.
CREATE OR REPLACE FUNCTION public.okami_guardar_reserva(
  p_actor uuid, p_operacion text, p_id uuid,
  p_cliente uuid DEFAULT NULL, p_cliente_nombre text DEFAULT NULL, p_cliente_rut text DEFAULT NULL,
  p_tatuador uuid DEFAULT NULL, p_precio bigint DEFAULT NULL, p_sesiones jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  anterior public.reservas%ROWTYPE;
  previa public.reserva_sesiones%ROWTYPE;
  existe boolean;
  cliente_destino uuid := p_cliente;
  nombre_limpio text := nullif(trim(p_cliente_nombre), '');
  rut_limpio text := public.okami_rut_normalizar(p_cliente_rut);
  ids uuid[];
  sesion jsonb;
  sesion_id uuid;
  sesion_puesto bigint;
  sesion_estado text;
  sesion_estado_id bigint;
  inicio_local timestamp;
  fin_local timestamp;
  inicio_real timestamptz;
  fin_real timestamptz;
  puesto_nombre text;
  puesto_estado text;
  cambia boolean;
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF p_operacion NOT IN ('crear','editar','borrar') THEN RAISE EXCEPTION 'Operación no válida.' USING ERRCODE = '22023'; END IF;
  -- Serializa las escrituras: dos solicitudes no pueden tomar el mismo puesto y horario.
  LOCK TABLE public.reservas, public.reserva_sesiones IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO anterior FROM public.reservas WHERE id = p_id;
  IF FOUND THEN
    IF actor_rol <> 'admin' AND anterior."user" <> p_actor THEN
      RAISE EXCEPTION 'Solo puedes gestionar tus propias reservas.' USING ERRCODE = '42501';
    END IF;
    IF p_operacion = 'crear' THEN
      RAISE EXCEPTION 'La reserva ya existe; recarga para comprobarla.' USING ERRCODE = '23505';
    END IF;
  ELSIF p_operacion <> 'crear' THEN
    RAISE EXCEPTION 'La reserva ya no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF p_operacion = 'borrar' THEN DELETE FROM public.reservas WHERE id = p_id; RETURN p_id; END IF;

  IF actor_rol = 'tatuador' AND p_tatuador IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Solo puedes asignar reservas a tu cuenta.' USING ERRCODE = '42501';
  END IF;
  IF public.okami_rol_reservas(p_tatuador) IS DISTINCT FROM 'tatuador' THEN
    RAISE EXCEPTION 'Selecciona un tatuador activo.' USING ERRCODE = '22023';
  END IF;
  IF p_precio IS NULL OR p_precio < 0 THEN
    RAISE EXCEPTION 'Ingresa un precio entero igual o mayor a cero.' USING ERRCODE = '22023';
  END IF;
  IF p_sesiones IS NULL OR jsonb_typeof(p_sesiones) <> 'array' OR jsonb_array_length(p_sesiones) < 1 THEN
    RAISE EXCEPTION 'Agrega al menos una sesión.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_sesiones) > 30 THEN
    RAISE EXCEPTION 'Una reserva puede tener como máximo 30 sesiones.' USING ERRCODE = '22023';
  END IF;

  -- Cliente: el elegido, o se busca/crea por RUT.
  IF cliente_destino IS NULL THEN
    IF nombre_limpio IS NULL THEN RAISE EXCEPTION 'Ingresa el nombre del cliente.' USING ERRCODE = '22023'; END IF;
    IF NOT public.okami_rut_valido(rut_limpio) THEN
      RAISE EXCEPTION 'Ingresa un RUT válido con su dígito verificador.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO cliente_destino FROM public.cliente WHERE rut = rut_limpio;
    IF cliente_destino IS NULL THEN
      INSERT INTO public.cliente(nombre, rut) VALUES (nombre_limpio, rut_limpio) RETURNING id INTO cliente_destino;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.cliente WHERE id = cliente_destino) THEN
    RAISE EXCEPTION 'El cliente seleccionado ya no existe.' USING ERRCODE = '22023';
  END IF;

  -- Identificadores de sesión: únicos y propios de esta reserva.
  SELECT array_agg((x ->> 'id')::uuid) INTO ids FROM jsonb_array_elements(p_sesiones) x;
  IF ids IS NULL OR array_position(ids, NULL) IS NOT NULL
     OR cardinality(ids) <> (SELECT count(DISTINCT v) FROM unnest(ids) v) THEN
    RAISE EXCEPTION 'Cada sesión necesita un identificador distinto.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reserva_sesiones WHERE id = ANY(ids) AND reserva <> p_id) THEN
    RAISE EXCEPTION 'Una de las sesiones pertenece a otra reserva; recarga la página.' USING ERRCODE = '22023';
  END IF;

  -- Las sesiones activas de la misma reserva no pueden cruzarse entre sí.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_sesiones) WITH ORDINALITY a(s, i)
    JOIN jsonb_array_elements(p_sesiones) WITH ORDINALITY b(s, j) ON a.i < b.j
    WHERE a.s ->> 'estado' <> 'Cancelada' AND b.s ->> 'estado' <> 'Cancelada'
      AND (a.s ->> 'inicio')::timestamp < (b.s ->> 'fin')::timestamp
      AND (b.s ->> 'inicio')::timestamp < (a.s ->> 'fin')::timestamp
  ) THEN
    RAISE EXCEPTION 'Las sesiones de esta reserva no pueden cruzarse entre sí.' USING ERRCODE = '22023';
  END IF;

  IF p_operacion = 'crear' THEN
    INSERT INTO public.reservas(id, "user", cliente, documentos, creado_por, precio, fecha_creacion)
    VALUES (p_id, p_tatuador, cliente_destino, NULL, p_actor, p_precio, now());
  ELSE
    UPDATE public.reservas SET "user" = p_tatuador, cliente = cliente_destino, precio = p_precio WHERE id = p_id;
    DELETE FROM public.reserva_sesiones WHERE reserva = p_id AND NOT (id = ANY(ids));
  END IF;

  FOR sesion IN SELECT value FROM jsonb_array_elements(p_sesiones) LOOP
    sesion_id := (sesion ->> 'id')::uuid;
    sesion_puesto := (sesion ->> 'puesto')::bigint;
    sesion_estado := sesion ->> 'estado';
    inicio_local := (sesion ->> 'inicio')::timestamp;
    fin_local := (sesion ->> 'fin')::timestamp;
    IF inicio_local IS NULL OR fin_local IS NULL OR inicio_local::date <> fin_local::date OR fin_local <= inicio_local THEN
      RAISE EXCEPTION 'Cada sesión debe terminar después de empezar, dentro del mismo día.' USING ERRCODE = '22023';
    END IF;
    inicio_real := inicio_local AT TIME ZONE 'America/Santiago';
    fin_real := fin_local AT TIME ZONE 'America/Santiago';
    -- Horas que no existen por el cambio de horario de Santiago.
    IF inicio_real AT TIME ZONE 'America/Santiago' <> inicio_local OR fin_real AT TIME ZONE 'America/Santiago' <> fin_local THEN
      RAISE EXCEPTION 'Una de las horas no existe por el cambio de horario. Elige otra.' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO sesion_estado_id FROM public.reservas_estado
    WHERE public.okami_estado_reserva(nombre) = sesion_estado ORDER BY id LIMIT 1;
    IF sesion_estado_id IS NULL THEN RAISE EXCEPTION 'Estado de sesión no válido.' USING ERRCODE = '22023'; END IF;

    SELECT p.nombre, pe.estado INTO puesto_nombre, puesto_estado
    FROM public.puesto p LEFT JOIN public.puesto_estados pe ON pe.id = p.estado_id
    WHERE p.id = sesion_puesto;
    IF puesto_nombre IS NULL THEN RAISE EXCEPTION 'Selecciona un puesto válido.' USING ERRCODE = '22023'; END IF;

    SELECT * INTO previa FROM public.reserva_sesiones WHERE id = sesion_id;
    existe := FOUND;
    cambia := NOT existe OR previa.puesto <> sesion_puesto OR previa.inicio <> inicio_real OR previa.fin <> fin_real;

    -- Una sesión ya agendada en un puesto que pasó a mantenimiento se puede completar o cancelar.
    IF cambia AND sesion_estado <> 'Cancelada' AND lower(trim(COALESCE(puesto_estado, ''))) <> 'habilitado' THEN
      RAISE EXCEPTION '% está en mantenimiento. Elige otro puesto.', puesto_nombre USING ERRCODE = '22023';
    END IF;

    IF sesion_estado <> 'Cancelada' THEN
      IF EXISTS (
        SELECT 1 FROM public.reserva_sesiones s JOIN public.reservas_estado e ON e.id = s.estado_id
        WHERE s.puesto = sesion_puesto AND s.reserva <> p_id
          AND s.inicio < fin_real AND s.fin > inicio_real
          AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelada'
      ) THEN
        RAISE EXCEPTION '% ya está ocupado el % entre % y %.', puesto_nombre,
          to_char(inicio_local, 'DD-MM-YYYY'), to_char(inicio_local, 'HH24:MI'), to_char(fin_local, 'HH24:MI')
          USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.reserva_sesiones s
        JOIN public.reservas r ON r.id = s.reserva
        JOIN public.reservas_estado e ON e.id = s.estado_id
        WHERE r."user" = p_tatuador AND s.reserva <> p_id
          AND s.inicio < fin_real AND s.fin > inicio_real
          AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelada'
      ) THEN
        RAISE EXCEPTION 'El tatuador ya tiene otra sesión el % entre % y %.',
          to_char(inicio_local, 'DD-MM-YYYY'), to_char(inicio_local, 'HH24:MI'), to_char(fin_local, 'HH24:MI')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF existe THEN
      UPDATE public.reserva_sesiones
      SET puesto = sesion_puesto, estado_id = sesion_estado_id, inicio = inicio_real, fin = fin_real
      WHERE id = sesion_id;
    ELSE
      INSERT INTO public.reserva_sesiones(id, reserva, puesto, estado_id, inicio, fin)
      VALUES (sesion_id, p_id, sesion_puesto, sesion_estado_id, inicio_real, fin_real);
    END IF;
  END LOOP;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.okami_estado_reserva(text),
  public.okami_guardar_reserva(uuid,text,uuid,uuid,text,text,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_estado_reserva(text),
  public.okami_guardar_reserva(uuid,text,uuid,uuid,text,text,uuid,bigint,jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
