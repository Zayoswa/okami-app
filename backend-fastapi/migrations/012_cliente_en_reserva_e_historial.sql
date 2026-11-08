-- 012: el cliente se guarda dentro de la reserva, "Borrar" archiva y el estado de una sesión se cambia solo.
-- Ejecutar después de 011. No borra datos y se puede volver a ejecutar completa.
--
--   * Cliente dentro de la reserva: reservas.cliente_nombre y reservas.cliente_rut.
--     Se copian desde la tabla cliente. La app deja de usar esa tabla y su buscador
--     (okami_buscar_clientes se elimina); la tabla cliente queda intacta.
--   * Historial: "Borrar" ya no elimina. La reserva queda archivada (archivada_en, archivada_por),
--     sus sesiones dejan de ocupar el puesto y se puede restaurar.
--   * okami_estado_sesion: cambia el estado de una sola sesión sin reenviar la reserva completa.
BEGIN;

-- 0. Por si 011 no se ejecutó: el estado se llama "Deshabilitado".
UPDATE public.puesto_estados SET estado = 'Deshabilitado'
WHERE lower(trim(estado)) IN ('desahabilitado', 'deshabilitado') AND estado <> 'Deshabilitado';

-- 1. Columnas nuevas de la reserva ----------------------------------------------------------
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS cliente_nombre text,
  ADD COLUMN IF NOT EXISTS cliente_rut text,
  ADD COLUMN IF NOT EXISTS archivada_en timestamptz,
  ADD COLUMN IF NOT EXISTS archivada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- Copia el nombre y RUT del cliente a cada reserva (solo las que aún no los tienen).
UPDATE public.reservas r SET cliente_nombre = c.nombre, cliente_rut = c.rut
FROM public.cliente c
WHERE c.id = r.cliente AND r.cliente_nombre IS NULL;

-- Las reservas nuevas ya no apuntan a la tabla cliente.
ALTER TABLE public.reservas ALTER COLUMN cliente DROP NOT NULL;

CREATE INDEX IF NOT EXISTS reservas_cliente_rut_idx ON public.reservas(cliente_rut);
CREATE INDEX IF NOT EXISTS reservas_archivada_en_idx ON public.reservas(archivada_en);

-- 2. Sin buscador de clientes ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.okami_buscar_clientes(uuid, text);

-- 3. Listado: cliente desde la reserva y reservas archivadas ----------------------------------
-- Las archivadas solo las ven el admin y el tatuador de la reserva.
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
          'archivadaEn', r.archivada_en,
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
          jsonb_build_object('cliente', COALESCE(r.cliente_nombre, 'Sin nombre'), 'clienteRut', r.cliente_rut, 'precio', r.precio)
        ELSE '{}'::jsonb END AS reserva
      FROM public.reservas r
      LEFT JOIN public.usuarios u ON u.id = r."user"
      WHERE EXISTS (SELECT 1 FROM public.reserva_sesiones s WHERE s.reserva = r.id)
        AND (r.archivada_en IS NULL OR actor_rol = 'admin' OR r."user" = p_actor)
    ) x
  ), '[]'::jsonb);
END;
$$;

-- 4. Guardado de reservas --------------------------------------------------------------------
-- Operaciones: crear, editar, borrar (archiva) y restaurar.
-- Las sesiones de reservas archivadas no ocupan puestos ni la agenda del tatuador.
DROP FUNCTION IF EXISTS public.okami_guardar_reserva(uuid,text,uuid,uuid,text,text,uuid,bigint,jsonb);

CREATE OR REPLACE FUNCTION public.okami_guardar_reserva(
  p_actor uuid, p_operacion text, p_id uuid,
  p_cliente_nombre text DEFAULT NULL, p_cliente_rut text DEFAULT NULL,
  p_tatuador uuid DEFAULT NULL, p_precio bigint DEFAULT NULL, p_sesiones jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  anterior public.reservas%ROWTYPE;
  previa public.reserva_sesiones%ROWTYPE;
  existe boolean;
  nombre_limpio text := nullif(regexp_replace(trim(COALESCE(p_cliente_nombre, '')), '\s+', ' ', 'g'), '');
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
  puesto_tipo text;
  cambia boolean;
  cambia_tatuador boolean := false;
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF p_operacion NOT IN ('crear','editar','borrar','restaurar') THEN
    RAISE EXCEPTION 'Operación no válida.' USING ERRCODE = '22023';
  END IF;
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

  -- Borrar: la reserva pasa al historial. No se elimina nada.
  IF p_operacion = 'borrar' THEN
    IF anterior.archivada_en IS NOT NULL THEN
      RAISE EXCEPTION 'La reserva ya está en el historial.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.reservas SET archivada_en = now(), archivada_por = p_actor WHERE id = p_id;
    RETURN p_id;
  END IF;

  -- Restaurar: vuelve a la agenda si sus sesiones activas no chocan con otras reservas.
  IF p_operacion = 'restaurar' THEN
    IF anterior.archivada_en IS NULL THEN
      RAISE EXCEPTION 'La reserva no está en el historial.' USING ERRCODE = 'P0001';
    END IF;
    SELECT p.nombre, s.inicio AT TIME ZONE 'America/Santiago', s.fin AT TIME ZONE 'America/Santiago'
    INTO puesto_nombre, inicio_local, fin_local
    FROM public.reserva_sesiones s
    JOIN public.puesto p ON p.id = s.puesto
    JOIN public.reservas_estado e ON e.id = s.estado_id
    WHERE s.reserva = p_id AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelada'
      AND EXISTS (
        SELECT 1 FROM public.reserva_sesiones o
        JOIN public.reservas ro ON ro.id = o.reserva
        JOIN public.reservas_estado eo ON eo.id = o.estado_id
        WHERE o.reserva <> p_id AND ro.archivada_en IS NULL
          AND public.okami_estado_reserva(eo.nombre) IS DISTINCT FROM 'Cancelada'
          AND o.inicio < s.fin AND o.fin > s.inicio
          AND (o.puesto = s.puesto OR ro."user" = anterior."user")
      )
    ORDER BY s.inicio LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'No se puede restaurar: la sesión del % entre % y % en % choca con otra reserva. Edita o cancela esa sesión primero.',
        to_char(inicio_local, 'DD-MM-YYYY'), to_char(inicio_local, 'HH24:MI'), to_char(fin_local, 'HH24:MI'), puesto_nombre
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.reservas SET archivada_en = NULL, archivada_por = NULL WHERE id = p_id;
    RETURN p_id;
  END IF;

  IF p_operacion = 'editar' AND anterior.archivada_en IS NOT NULL THEN
    RAISE EXCEPTION 'Esta reserva está en el historial. Restáurala para editarla.' USING ERRCODE = '22023';
  END IF;
  -- Si la reserva pasa a otro tatuador, sus sesiones vuelven a validarse contra los titulares.
  cambia_tatuador := p_operacion = 'editar' AND anterior."user" IS DISTINCT FROM p_tatuador;

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

  -- Cliente: nombre (solo texto) y RUT válido, guardados en la misma reserva.
  IF nombre_limpio IS NULL THEN RAISE EXCEPTION 'Ingresa el nombre del cliente.' USING ERRCODE = '22023'; END IF;
  IF nombre_limpio ~ '[0-9]' THEN
    RAISE EXCEPTION 'El nombre del cliente solo puede tener letras.' USING ERRCODE = '22023';
  END IF;
  IF char_length(nombre_limpio) > 120 THEN
    RAISE EXCEPTION 'El nombre del cliente puede tener como máximo 120 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.okami_rut_valido(rut_limpio) THEN
    RAISE EXCEPTION 'Ingresa un RUT válido con su dígito verificador.' USING ERRCODE = '22023';
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
    INSERT INTO public.reservas(id, "user", cliente, cliente_nombre, cliente_rut, documentos, creado_por, precio, fecha_creacion)
    VALUES (p_id, p_tatuador, NULL, nombre_limpio, rut_limpio, NULL, p_actor, p_precio, now());
  ELSE
    UPDATE public.reservas
    SET "user" = p_tatuador, cliente_nombre = nombre_limpio, cliente_rut = rut_limpio, precio = p_precio
    WHERE id = p_id;
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

    SELECT p.nombre, pe.estado, p.tipo INTO puesto_nombre, puesto_estado, puesto_tipo
    FROM public.puesto p LEFT JOIN public.puesto_estados pe ON pe.id = p.estado_id
    WHERE p.id = sesion_puesto;
    IF puesto_nombre IS NULL THEN RAISE EXCEPTION 'Selecciona un puesto válido.' USING ERRCODE = '22023'; END IF;

    SELECT * INTO previa FROM public.reserva_sesiones WHERE id = sesion_id;
    existe := FOUND;
    cambia := NOT existe OR previa.puesto <> sesion_puesto OR previa.inicio <> inicio_real OR previa.fin <> fin_real;

    -- Un puesto que no está Habilitado (Deshabilitado o en Mantenimiento) no acepta sesiones nuevas ni movidas;
    -- una sesión ya agendada en él se puede completar o cancelar.
    IF cambia AND sesion_estado <> 'Cancelada' AND lower(trim(COALESCE(puesto_estado, ''))) <> 'habilitado' THEN
      RAISE EXCEPTION '% está % y no acepta sesiones nuevas. Elige otro puesto.', puesto_nombre,
        CASE lower(trim(COALESCE(puesto_estado, '')))
          WHEN 'mantenimiento' THEN 'en mantenimiento'
          WHEN '' THEN 'sin estado'
          ELSE lower(trim(puesto_estado))
        END
        USING ERRCODE = '22023';
    END IF;
    -- Full y Compartido son solo para sus titulares; Rotativo está abierto a todos.
    IF (cambia OR cambia_tatuador) AND sesion_estado <> 'Cancelada' AND puesto_tipo IN ('Full', 'Compartido')
       AND NOT EXISTS (SELECT 1 FROM public.puesto_titulares t WHERE t.puesto = sesion_puesto AND t.tatuador = p_tatuador) THEN
      RAISE EXCEPTION '% es un puesto % y solo lo usan sus titulares. Elige tu puesto o uno rotativo.',
        puesto_nombre, puesto_tipo USING ERRCODE = '22023';
    END IF;

    -- Choques con sesiones de otras reservas que siguen en la agenda (las archivadas no cuentan).
    IF sesion_estado <> 'Cancelada' THEN
      IF EXISTS (
        SELECT 1 FROM public.reserva_sesiones s
        JOIN public.reservas r ON r.id = s.reserva
        JOIN public.reservas_estado e ON e.id = s.estado_id
        WHERE s.puesto = sesion_puesto AND s.reserva <> p_id AND r.archivada_en IS NULL
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
        WHERE r."user" = p_tatuador AND s.reserva <> p_id AND r.archivada_en IS NULL
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

-- 5. Estado de una sola sesión ----------------------------------------------------------------
-- Para el botón de estado de las tarjetas, el Dashboard y el Calendario. No revisa el cliente ni
-- el tatuador de la reserva, así que también sirve para cerrar sesiones de un tatuador desactivado.
-- Volver a Programada o Completada una sesión Cancelada revisa que el puesto y el tatuador sigan libres.
CREATE OR REPLACE FUNCTION public.okami_estado_sesion(
  p_actor uuid, p_reserva uuid, p_sesion uuid, p_estado text
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  v_reserva public.reservas%ROWTYPE;
  v_sesion public.reserva_sesiones%ROWTYPE;
  v_estado_id bigint;
  v_estado_actual text;
  v_puesto text;
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF p_estado NOT IN ('Programada', 'Completada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de sesión no válido.' USING ERRCODE = '22023';
  END IF;
  LOCK TABLE public.reservas, public.reserva_sesiones IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_reserva FROM public.reservas WHERE id = p_reserva;
  IF NOT FOUND THEN RAISE EXCEPTION 'La reserva ya no existe.' USING ERRCODE = 'P0002'; END IF;
  IF actor_rol <> 'admin' AND v_reserva."user" <> p_actor THEN
    RAISE EXCEPTION 'Solo puedes gestionar tus propias reservas.' USING ERRCODE = '42501';
  END IF;
  IF v_reserva.archivada_en IS NOT NULL THEN
    RAISE EXCEPTION 'Esta reserva está en el historial. Restáurala para cambiar sus sesiones.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sesion FROM public.reserva_sesiones WHERE id = p_sesion AND reserva = p_reserva;
  IF NOT FOUND THEN RAISE EXCEPTION 'La sesión ya no existe; recarga la página.' USING ERRCODE = 'P0002'; END IF;

  SELECT public.okami_estado_reserva(nombre) INTO v_estado_actual FROM public.reservas_estado WHERE id = v_sesion.estado_id;
  SELECT id INTO v_estado_id FROM public.reservas_estado
  WHERE public.okami_estado_reserva(nombre) = p_estado ORDER BY id LIMIT 1;
  IF v_estado_id IS NULL THEN RAISE EXCEPTION 'Estado de sesión no válido.' USING ERRCODE = '22023'; END IF;

  IF v_estado_actual = 'Cancelada' AND p_estado <> 'Cancelada' THEN
    SELECT nombre INTO v_puesto FROM public.puesto WHERE id = v_sesion.puesto;
    IF EXISTS (
      SELECT 1 FROM public.reserva_sesiones s
      JOIN public.reservas r ON r.id = s.reserva
      JOIN public.reservas_estado e ON e.id = s.estado_id
      WHERE s.reserva <> p_reserva AND r.archivada_en IS NULL
        AND public.okami_estado_reserva(e.nombre) IS DISTINCT FROM 'Cancelada'
        AND s.inicio < v_sesion.fin AND s.fin > v_sesion.inicio
        AND (s.puesto = v_sesion.puesto OR r."user" = v_reserva."user")
    ) THEN
      RAISE EXCEPTION 'No se puede reactivar: % o el tatuador ya tienen otra sesión el % entre % y %.', v_puesto,
        to_char(v_sesion.inicio AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY'),
        to_char(v_sesion.inicio AT TIME ZONE 'America/Santiago', 'HH24:MI'),
        to_char(v_sesion.fin AT TIME ZONE 'America/Santiago', 'HH24:MI')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.reserva_sesiones SET estado_id = v_estado_id WHERE id = p_sesion;
  RETURN p_sesion;
END;
$$;

REVOKE ALL ON FUNCTION public.okami_listar_reservas(uuid),
  public.okami_guardar_reserva(uuid,text,uuid,text,text,uuid,bigint,jsonb),
  public.okami_estado_sesion(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_listar_reservas(uuid),
  public.okami_guardar_reserva(uuid,text,uuid,text,text,uuid,bigint,jsonb),
  public.okami_estado_sesion(uuid,uuid,uuid,text)
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación: todas las reservas deben tener nombre y RUT del cliente (sin_cliente = 0).
-- select count(*) filter (where cliente_nombre is null) as sin_cliente,
--        count(*) filter (where archivada_en is not null) as archivadas,
--        count(*) as total
-- from public.reservas;
