-- Ejecutar en Supabase SQL Editor. No importa datos del navegador ni crea reservas.
BEGIN;
GRANT SELECT ON public.reservas, public.reservas_estado, public.espacio, public.cliente TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.reservas TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.reservas FROM PUBLIC, anon, authenticated;

-- Los estados existentes pueden haberse insertado con IDs explícitos.
-- Alinear la secuencia sin cambiar IDs referenciados por reservas.
LOCK TABLE public.reservas_estado IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  secuencia regclass := pg_get_serial_sequence('public.reservas_estado', 'id')::regclass;
  siguiente bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reservas_estado WHERE lower(trim(nombre)) IN ('completado','completada')
  ) THEN
    SELECT COALESCE(max(id), 0) + 1 INTO siguiente FROM public.reservas_estado;
    IF secuencia IS NULL THEN
      INSERT INTO public.reservas_estado(id, nombre) VALUES (siguiente, 'Completado');
    ELSE
      siguiente := GREATEST(siguiente, COALESCE(pg_sequence_last_value(secuencia), 0) + 1);
      EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s', secuencia, siguiente);
      INSERT INTO public.reservas_estado(nombre) VALUES ('Completado');
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.okami_rol_reservas(p_actor uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT lower(trim(r.nombre)) FROM public.usuarios u JOIN public.rol r ON r.id = u.rol
  WHERE u.id = p_actor AND u.activo AND lower(trim(r.nombre)) IN ('admin','tatuador');
$$;

CREATE OR REPLACE FUNCTION public.okami_estado_reserva(p_nombre text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE lower(trim(p_nombre))
    WHEN 'cancelada' THEN 'Cancelado' WHEN 'cancelado' THEN 'Cancelado'
    WHEN 'confirmada' THEN 'Confirmada' WHEN 'confirmado' THEN 'Confirmada'
    WHEN 'completada' THEN 'Completado' WHEN 'completado' THEN 'Completado'
    WHEN 'pendiente' THEN 'Pendiente' ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.okami_listar_reservas(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE actor_rol text := public.okami_rol_reservas(p_actor);
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'tatuadorId', r."user", 'tatuador', COALESCE(u.nombre, 'Tatuador'),
      'espacioId', CASE WHEN e.nombre ~* '^Espacio [A-F]$' THEN upper(right(e.nombre,1)) ELSE COALESCE('db:' || e.id::text, '') END,
      'fecha', to_char(r.inicio AT TIME ZONE 'America/Santiago','YYYY-MM-DD'),
      'horaInicio', to_char(r.inicio AT TIME ZONE 'America/Santiago','HH24:MI'),
      'horaFin', to_char(r.fin AT TIME ZONE 'America/Santiago','HH24:MI'),
      'fechaCreacion', COALESCE(r.fecha_creacion,r.inicio),
      'estado', public.okami_estado_reserva(s.nombre)
    ) || CASE WHEN actor_rol = 'admin' OR r."user" = p_actor THEN
      jsonb_build_object('clienteId', r.cliente, 'cliente', COALESCE(c.nombre,'Sin nombre'), 'precio', r.precio)
    ELSE '{}'::jsonb END ORDER BY r.fecha_creacion DESC NULLS LAST, r.id)
    FROM public.reservas r
    LEFT JOIN public.usuarios u ON u.id = r."user"
    LEFT JOIN public.espacio e ON e.id = r.espacio
    LEFT JOIN public.cliente c ON c.id = r.cliente
    LEFT JOIN public.reservas_estado s ON s.id = r.estado_id
    WHERE r.inicio IS NOT NULL AND r.fin IS NOT NULL
      AND public.okami_estado_reserva(s.nombre) IS NOT NULL
  ), '[]'::jsonb);
END;
$$;

-- Serializa escrituras para que dos solicitudes no puedan tomar el último cupo.
CREATE OR REPLACE FUNCTION public.okami_mutar_reserva(
  p_actor uuid, p_operacion text, p_id uuid,
  p_cliente uuid DEFAULT NULL, p_tatuador uuid DEFAULT NULL,
  p_espacio bigint DEFAULT NULL, p_precio bigint DEFAULT NULL,
  p_inicio timestamp DEFAULT NULL, p_fin timestamp DEFAULT NULL, p_estado text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  anterior public.reservas%ROWTYPE;
  capacidad_espacio bigint;
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
      IF anterior.creado_por = p_actor AND anterior.cliente = p_cliente AND anterior."user" = p_tatuador
        AND anterior.espacio = p_espacio AND anterior.precio = p_precio AND anterior.inicio = inicio_real AND anterior.fin = fin_real
        AND EXISTS (SELECT 1 FROM public.reservas_estado WHERE id = anterior.estado_id AND public.okami_estado_reserva(nombre) = p_estado)
      THEN RETURN p_id; END IF;
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
  IF NOT EXISTS (SELECT 1 FROM public.cliente WHERE id = p_cliente) THEN
    RAISE EXCEPTION 'Selecciona un cliente existente.' USING ERRCODE = '22023';
  END IF;
  IF p_precio IS NULL OR p_precio < 0 OR p_inicio IS NULL OR p_fin IS NULL OR p_inicio::date <> p_fin::date
     OR inicio_real >= fin_real OR inicio_real AT TIME ZONE 'America/Santiago' <> p_inicio
     OR fin_real AT TIME ZONE 'America/Santiago' <> p_fin THEN
    RAISE EXCEPTION 'Revisa el precio y las horas de la sesión.' USING ERRCODE = '22023';
  END IF;
  SELECT capacidad INTO capacidad_espacio FROM public.espacio WHERE id = p_espacio;
  IF capacidad_espacio IS NULL OR capacidad_espacio < 1 THEN
    RAISE EXCEPTION 'Selecciona un espacio con capacidad válida.' USING ERRCODE = '22023';
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
    VALUES (p_id,p_tatuador,p_espacio,p_cliente,NULL,p_actor,p_precio,estado_destino,inicio_real,fin_real,now());
  ELSE
    UPDATE public.reservas SET "user"=p_tatuador, espacio=p_espacio, cliente=p_cliente, precio=p_precio,
      estado_id=estado_destino, inicio=inicio_real, fin=fin_real WHERE id=p_id;
  END IF;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.okami_rol_reservas(uuid), public.okami_estado_reserva(text), public.okami_listar_reservas(uuid),
 public.okami_mutar_reserva(uuid,text,uuid,uuid,uuid,bigint,bigint,timestamp,timestamp,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_rol_reservas(uuid), public.okami_estado_reserva(text), public.okami_listar_reservas(uuid),
 public.okami_mutar_reserva(uuid,text,uuid,uuid,uuid,bigint,bigint,timestamp,timestamp,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
