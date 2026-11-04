-- Clientes básicos dentro de Reservas y disponibilidad real de espacios.
-- No borra clientes ni reservas existentes.
BEGIN;

-- El identificador es opcional; el cliente se puede registrar solo con su nombre.
ALTER TABLE public.cliente ALTER COLUMN rut DROP NOT NULL;
GRANT SELECT, INSERT ON public.cliente TO service_role;

-- Los seis espacios actuales quedan disponibles. Valores NULL o estados desconocidos
-- se consideran no disponibles por seguridad después de esta migración.
UPDATE public.espacio e
SET estado_id = s.id
FROM public.espacio_estados s
WHERE e.estado_id IS NULL AND lower(trim(s.estado)) IN ('habilitado', 'habiltado');

CREATE OR REPLACE FUNCTION public.okami_estado_espacio(p_nombre text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(trim(coalesce(p_nombre, ''))) IN ('habilitado', 'habiltado');
$$;

CREATE OR REPLACE FUNCTION public.okami_buscar_clientes(p_actor uuid, p_busqueda text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE actor_rol text := public.okami_rol_reservas(p_actor);
DECLARE query_text text := nullif(trim(p_busqueda), '');
BEGIN
  IF actor_rol IS NULL THEN
    RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501';
  END IF;
  IF query_text IS NULL OR char_length(query_text) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'identificador', c.identificador))
    FROM (
      SELECT id, nombre, identificador
      FROM public.cliente
      WHERE nombre IS NOT NULL
        AND (nombre ILIKE '%' || query_text || '%' OR coalesce(identificador, '') ILIKE '%' || query_text || '%')
      ORDER BY nombre, id
      LIMIT 12
    ) c
  ), '[]'::jsonb);
END;
$$;

-- Esta versión resuelve o crea al cliente antes de guardar la reserva, en la misma transacción.
CREATE OR REPLACE FUNCTION public.okami_mutar_reserva_cliente(
  p_actor uuid, p_operacion text, p_id uuid,
  p_cliente uuid DEFAULT NULL, p_cliente_nombre text DEFAULT NULL, p_cliente_identificador text DEFAULT NULL,
  p_tatuador uuid DEFAULT NULL, p_espacio bigint DEFAULT NULL, p_precio bigint DEFAULT NULL,
  p_inicio timestamp DEFAULT NULL, p_fin timestamp DEFAULT NULL, p_estado text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  anterior public.reservas%ROWTYPE;
  cliente_destino uuid := p_cliente;
  cliente_nombre_limpio text := nullif(trim(p_cliente_nombre), '');
  cliente_identificador_limpio text := nullif(trim(p_cliente_identificador), '');
  capacidad_espacio bigint;
  disponible_espacio boolean;
  estado_destino bigint;
  inicio_real timestamptz := p_inicio AT TIME ZONE 'America/Santiago';
  fin_real timestamptz := p_fin AT TIME ZONE 'America/Santiago';
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF p_operacion NOT IN ('crear','editar','borrar') THEN RAISE EXCEPTION 'Operación no válida.' USING ERRCODE = '22023'; END IF;
  LOCK TABLE public.reservas IN SHARE ROW EXCLUSIVE MODE;
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
  IF cliente_destino IS NULL THEN
    IF cliente_nombre_limpio IS NULL THEN
      RAISE EXCEPTION 'Ingresa el nombre del cliente.' USING ERRCODE = '22023';
    END IF;
    -- Evita duplicar altas iguales que ocurren al mismo tiempo.
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(cliente_nombre_limpio) || '|' || coalesce(lower(cliente_identificador_limpio), ''), 0));
    SELECT id INTO cliente_destino FROM public.cliente
    WHERE lower(trim(nombre)) = lower(cliente_nombre_limpio)
      AND coalesce(lower(trim(identificador)), '') = coalesce(lower(cliente_identificador_limpio), '')
    ORDER BY id LIMIT 1;
    IF cliente_destino IS NULL THEN
      INSERT INTO public.cliente(nombre, identificador, rut)
      VALUES (cliente_nombre_limpio, cliente_identificador_limpio, NULL)
      RETURNING id INTO cliente_destino;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.cliente WHERE id = cliente_destino) THEN
    RAISE EXCEPTION 'El cliente seleccionado ya no existe.' USING ERRCODE = '22023';
  END IF;
  IF p_precio IS NULL OR p_precio < 0 OR p_inicio IS NULL OR p_fin IS NULL OR p_inicio::date <> p_fin::date
     OR inicio_real >= fin_real OR inicio_real AT TIME ZONE 'America/Santiago' <> p_inicio
     OR fin_real AT TIME ZONE 'America/Santiago' <> p_fin THEN
    RAISE EXCEPTION 'Revisa el precio y las horas de la sesión.' USING ERRCODE = '22023';
  END IF;
  SELECT e.capacidad, public.okami_estado_espacio(es.estado)
  INTO capacidad_espacio, disponible_espacio
  FROM public.espacio e LEFT JOIN public.espacio_estados es ON es.id = e.estado_id
  WHERE e.id = p_espacio;
  IF capacidad_espacio IS NULL OR capacidad_espacio < 1 THEN
    RAISE EXCEPTION 'Selecciona un espacio con capacidad válida.' USING ERRCODE = '22023';
  END IF;
  IF NOT disponible_espacio THEN
    RAISE EXCEPTION 'El espacio seleccionado no está disponible.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO estado_destino FROM public.reservas_estado
  WHERE public.okami_estado_reserva(nombre) = p_estado ORDER BY id LIMIT 1;
  IF estado_destino IS NULL THEN RAISE EXCEPTION 'Estado de reserva no válido.' USING ERRCODE = '22023'; END IF;
  IF p_estado = 'Pendiente' AND (
    SELECT count(*) FROM public.reservas r JOIN public.reservas_estado s ON s.id = r.estado_id
    WHERE r.espacio = p_espacio AND r.id <> p_id AND public.okami_estado_reserva(s.nombre) = 'Pendiente'
  ) >= capacidad_espacio THEN
    RAISE EXCEPTION 'El espacio alcanzó su límite de reservas pendientes.' USING ERRCODE = 'P0001';
  END IF;
  IF p_estado <> 'Cancelado' AND EXISTS (
    WITH sesiones AS (
      SELECT r.inicio, r.fin FROM public.reservas r LEFT JOIN public.reservas_estado s ON s.id = r.estado_id
      WHERE r.espacio = p_espacio AND r.id <> p_id AND r.inicio < fin_real AND r.fin > inicio_real
        AND public.okami_estado_reserva(s.nombre) IS DISTINCT FROM 'Cancelado'
    ), instantes AS (
      SELECT inicio_real AS instante UNION SELECT inicio FROM sesiones WHERE inicio > inicio_real
    )
    SELECT 1 FROM instantes i JOIN sesiones s ON s.inicio <= i.instante AND s.fin > i.instante
    GROUP BY i.instante HAVING count(*) >= capacidad_espacio
  ) THEN RAISE EXCEPTION 'El espacio está lleno durante parte de la sesión.' USING ERRCODE = 'P0001'; END IF;
  IF p_operacion = 'crear' THEN
    INSERT INTO public.reservas(id,"user",espacio,cliente,documentos,creado_por,precio,estado_id,inicio,fin,fecha_creacion)
    VALUES (p_id,p_tatuador,p_espacio,cliente_destino,NULL,p_actor,p_precio,estado_destino,inicio_real,fin_real,now());
  ELSE
    UPDATE public.reservas SET "user"=p_tatuador, espacio=p_espacio, cliente=cliente_destino, precio=p_precio,
      estado_id=estado_destino, inicio=inicio_real, fin=fin_real WHERE id=p_id;
  END IF;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.okami_estado_espacio(text), public.okami_buscar_clientes(uuid,text),
  public.okami_mutar_reserva_cliente(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_estado_espacio(text), public.okami_buscar_clientes(uuid,text),
  public.okami_mutar_reserva_cliente(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
