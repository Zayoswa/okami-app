-- 007: los espacios pasan a ser 15 puestos (capacidad 1) y cada reserva puede tener varias sesiones.
-- Ejecutar después de 006. Se puede volver a ejecutar completa si una ejecución queda a medias.
--
-- ATENCIÓN, BORRA DATOS: elimina TODAS las reservas (son de prueba) y los espacios A–F.
--
-- Resultado:
--   puesto(id, nombre único, estado_id obligatorio)      <- antes "espacio"; sin capacidad
--   puesto_estados(id, estado): Habilitado / Mantenimiento <- antes "espacio_estados"
--   reservas(id, user, cliente, documentos, creado_por, precio, fecha_creacion)
--   reserva_sesiones(id, reserva, puesto, estado_id, inicio, fin, creado_en)
BEGIN;

-- 1. Borrar las reservas de prueba (sus sesiones se borran en cascada si ya existían) ---
DELETE FROM public.reservas;

-- 2. Espacios -> puestos ---------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.espacio') IS NOT NULL AND to_regclass('public.puesto') IS NOT NULL THEN
    RAISE EXCEPTION 'Existen las tablas "espacio" y "puesto" a la vez. Revisa cuál se usa antes de continuar.';
  END IF;
  IF to_regclass('public.espacio_estados') IS NOT NULL AND to_regclass('public.puesto_estados') IS NOT NULL THEN
    RAISE EXCEPTION 'Existen las tablas "espacio_estados" y "puesto_estados" a la vez. Revisa cuál se usa antes de continuar.';
  END IF;
  IF to_regclass('public.espacio') IS NOT NULL THEN ALTER TABLE public.espacio RENAME TO puesto; END IF;
  IF to_regclass('public.espacio_estados') IS NOT NULL THEN ALTER TABLE public.espacio_estados RENAME TO puesto_estados; END IF;
END;
$$;

-- Estados: "Habilitado" (corrige el antiguo "Habiltado") y "Mantenimiento".
DO $$
DECLARE secuencia text := pg_get_serial_sequence('public.puesto_estados', 'id');
BEGIN
  -- Alinear la secuencia por si los estados se insertaron con IDs explícitos.
  IF secuencia IS NOT NULL THEN
    PERFORM setval(secuencia, COALESCE((SELECT max(id) FROM public.puesto_estados), 1),
                   EXISTS (SELECT 1 FROM public.puesto_estados));
  END IF;
  UPDATE public.puesto_estados SET estado = 'Habilitado'
  WHERE lower(trim(estado)) IN ('habilitado', 'habiltado') AND estado <> 'Habilitado';
  IF NOT EXISTS (SELECT 1 FROM public.puesto_estados WHERE estado = 'Habilitado') THEN
    INSERT INTO public.puesto_estados(estado) VALUES ('Habilitado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.puesto_estados WHERE lower(trim(estado)) = 'mantenimiento') THEN
    INSERT INTO public.puesto_estados(estado) VALUES ('Mantenimiento');
  END IF;
END;
$$;

-- Puestos 1 a 15. Las reservas ya se borraron, así que los espacios A–F no tienen referencias.
DO $$
DECLARE
  secuencia text := pg_get_serial_sequence('public.puesto', 'id');
  habilitado bigint := (SELECT min(id) FROM public.puesto_estados WHERE estado = 'Habilitado');
BEGIN
  DELETE FROM public.puesto WHERE nombre NOT IN (SELECT 'Puesto ' || n FROM generate_series(1, 15) n);
  IF secuencia IS NOT NULL THEN
    PERFORM setval(secuencia, COALESCE((SELECT max(id) FROM public.puesto), 1), EXISTS (SELECT 1 FROM public.puesto));
  END IF;
  INSERT INTO public.puesto(nombre, estado_id)
  SELECT 'Puesto ' || n, habilitado FROM generate_series(1, 15) n
  WHERE NOT EXISTS (SELECT 1 FROM public.puesto p WHERE p.nombre = 'Puesto ' || n);
  UPDATE public.puesto SET estado_id = habilitado WHERE estado_id IS NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.puesto'::regclass AND conname = 'puesto_nombre_unico') THEN
    ALTER TABLE public.puesto ADD CONSTRAINT puesto_nombre_unico UNIQUE (nombre);
  END IF;
END;
$$;

ALTER TABLE public.puesto DROP COLUMN IF EXISTS capacidad;
ALTER TABLE public.puesto ALTER COLUMN nombre SET NOT NULL, ALTER COLUMN estado_id SET NOT NULL;
GRANT SELECT ON public.puesto, public.puesto_estados TO service_role;

-- 3. Sesiones de cada reserva ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,
  puesto bigint NOT NULL REFERENCES public.puesto(id),
  estado_id bigint NOT NULL REFERENCES public.reservas_estado(id),
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reserva_sesiones_intervalo_check CHECK (fin > inicio)
);
CREATE INDEX IF NOT EXISTS reserva_sesiones_reserva_idx ON public.reserva_sesiones(reserva);
CREATE INDEX IF NOT EXISTS reserva_sesiones_puesto_inicio_idx ON public.reserva_sesiones(puesto, inicio);
CREATE INDEX IF NOT EXISTS reserva_sesiones_inicio_idx ON public.reserva_sesiones(inicio);

ALTER TABLE public.reserva_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserva_sesiones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reserva_sesiones TO service_role;

-- La regla "no agendar en el pasado" (004) pasa de reservas a sesiones.
DROP TRIGGER IF EXISTS okami_reserva_inicio_futuro ON public.reservas;
DROP TRIGGER IF EXISTS okami_sesion_inicio_futuro ON public.reserva_sesiones;
CREATE TRIGGER okami_sesion_inicio_futuro BEFORE INSERT OR UPDATE OF inicio, fin ON public.reserva_sesiones
FOR EACH ROW EXECUTE FUNCTION public.okami_validar_inicio_futuro();

-- 4. Campos que pasan de la reserva a cada sesión --------------------------------
ALTER TABLE public.reservas
  DROP COLUMN IF EXISTS espacio,
  DROP COLUMN IF EXISTS estado_id,
  DROP COLUMN IF EXISTS inicio,
  DROP COLUMN IF EXISTS fin;

-- 5. Funciones ----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.okami_mutar_reserva_cliente_rut(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text);
DROP FUNCTION IF EXISTS public.okami_estado_espacio(text);

-- Reservas con sus sesiones. Cliente y precio solo para el admin o el tatuador de la reserva.
CREATE OR REPLACE FUNCTION public.okami_listar_reservas(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE actor_rol text := public.okami_rol_reservas(p_actor);
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x.reserva ORDER BY x.fecha_creacion DESC NULLS LAST, x.id)
    FROM (
      SELECT r.id, r.fecha_creacion,
        jsonb_build_object(
          'id', r.id, 'tatuadorId', r."user", 'tatuador', COALESCE(u.nombre, 'Tatuador'),
          'fechaCreacion', r.fecha_creacion,
          'sesiones', (
            SELECT jsonb_agg(jsonb_build_object(
              'id', s.id, 'puestoId', s.puesto::text, 'puesto', p.nombre,
              'fecha', to_char(s.inicio AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD'),
              'horaInicio', to_char(s.inicio AT TIME ZONE 'America/Santiago', 'HH24:MI'),
              'horaFin', to_char(s.fin AT TIME ZONE 'America/Santiago', 'HH24:MI'),
              'estado', public.okami_estado_reserva(e.nombre)
            ) ORDER BY s.inicio)
            FROM public.reserva_sesiones s
            JOIN public.puesto p ON p.id = s.puesto
            JOIN public.reservas_estado e ON e.id = s.estado_id
            WHERE s.reserva = r.id
          )
        ) || CASE WHEN actor_rol = 'admin' OR r."user" = p_actor THEN
          jsonb_build_object('clienteId', r.cliente, 'cliente', COALESCE(c.nombre, 'Sin nombre'), 'clienteRut', c.rut, 'precio', r.precio)
        ELSE '{}'::jsonb END AS reserva
      FROM public.reservas r
      LEFT JOIN public.usuarios u ON u.id = r."user"
      LEFT JOIN public.cliente c ON c.id = r.cliente
      WHERE EXISTS (SELECT 1 FROM public.reserva_sesiones s WHERE s.reserva = r.id)
    ) x
  ), '[]'::jsonb);
END;
$$;

-- Crea, edita o borra una reserva con todas sus sesiones, en una sola transacción.
-- p_sesiones: [{"id": uuid, "puesto": id, "inicio": "YYYY-MM-DDTHH:MM", "fin": "...", "estado": "Pendiente"}]
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
    WHERE a.s ->> 'estado' <> 'Cancelado' AND b.s ->> 'estado' <> 'Cancelado'
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
    IF cambia AND sesion_estado <> 'Cancelado' AND lower(trim(COALESCE(puesto_estado, ''))) <> 'habilitado' THEN
      RAISE EXCEPTION '% está en mantenimiento. Elige otro puesto.', puesto_nombre USING ERRCODE = '22023';
    END IF;

    IF sesion_estado <> 'Cancelado' THEN
      IF EXISTS (
        SELECT 1 FROM public.reserva_sesiones s JOIN public.reservas_estado e ON e.id = s.estado_id
        WHERE s.puesto = sesion_puesto AND s.reserva <> p_id
          AND s.inicio < fin_real AND s.fin > inicio_real
          AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelado'
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
          AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelado'
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

-- 6. Permisos -------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.okami_listar_reservas(uuid),
  public.okami_guardar_reserva(uuid,text,uuid,uuid,text,text,uuid,bigint,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_listar_reservas(uuid),
  public.okami_guardar_reserva(uuid,text,uuid,uuid,text,text,uuid,bigint,jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
