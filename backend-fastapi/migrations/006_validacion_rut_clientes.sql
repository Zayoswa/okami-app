-- 006: el RUT del cliente se guarda completo en una sola columna de texto.
-- Forma canónica: sin puntos ni guion y con K mayúscula (ej. 12345678K). El formato se aplica al mostrarlo.
-- Ejecutar después de 005 y DESPUÉS de revisar scripts/vista_previa_006.sql.
--
-- ATENCIÓN, BORRA DATOS: elimina los clientes cuyo RUT no puede normalizarse a uno válido
-- (vacío, mal formado o con dígito verificador incorrecto) y las reservas de esos clientes.
-- Si hay dos clientes con el mismo RUT, se detiene sin cambiar nada.
-- Elimina la columna cliente.identificador y las funciones de reserva de 003 y 005.
BEGIN;

-- 1. Utilidades de RUT ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.okami_rut_normalizar(p_rut text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')), '');
$$;

-- Recibe el RUT ya normalizado (cuerpo + dígito verificador).
CREATE OR REPLACE FUNCTION public.okami_rut_valido(p_rut text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  cuerpo text;
  suma integer := 0;
  factor integer := 2;
  posicion integer;
  resultado integer;
BEGIN
  IF p_rut IS NULL OR p_rut !~ '^[0-9]{1,9}[0-9K]$' THEN RETURN false; END IF;
  cuerpo := left(p_rut, -1);
  IF cuerpo ~ '^0+$' THEN RETURN false; END IF;
  -- Con REVERSE el primer límite es el mayor: recorre el cuerpo de derecha a izquierda.
  FOR posicion IN REVERSE char_length(cuerpo)..1 LOOP
    suma := suma + substring(cuerpo FROM posicion FOR 1)::integer * factor;
    factor := CASE WHEN factor = 7 THEN 2 ELSE factor + 1 END;
  END LOOP;
  resultado := 11 - suma % 11;
  RETURN right(p_rut, 1) = CASE resultado WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE resultado::text END;
END;
$$;

-- 2. Normalizar los clientes existentes y borrar los inválidos -----------------
-- Sin tablas temporales: el SQL Editor de Supabase puede no conservarlas entre sentencias.
LOCK TABLE public.cliente, public.reservas IN SHARE ROW EXCLUSIVE MODE;

-- Auxiliar de esta migración (se elimina al final): RUT canónico válido o NULL.
-- Acepta el RUT completo en "rut" o el cuerpo en "rut" y el dígito en "identificador".
CREATE OR REPLACE FUNCTION public.okami_rut_migrar(p_rut text, p_identificador text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN public.okami_rut_valido(public.okami_rut_normalizar(p_rut))
      THEN public.okami_rut_normalizar(p_rut)
    WHEN public.okami_rut_valido(public.okami_rut_normalizar(coalesce(p_rut, '') || coalesce(p_identificador, '')))
      THEN public.okami_rut_normalizar(coalesce(p_rut, '') || coalesce(p_identificador, ''))
  END;
$$;

-- Un solo bloque que funciona aunque una ejecución anterior haya quedado a medias:
-- si la columna "identificador" ya no existe, normaliza solo con "rut".
DO $$
DECLARE
  dv text := CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'identificador'
    ) THEN 'c.identificador' ELSE 'NULL::text' END;
  canonico text;
  duplicado boolean;
BEGIN
  canonico := format('public.okami_rut_migrar(c.rut::text, %s)', dv);

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.cliente c WHERE %1$s IS NOT NULL GROUP BY %1$s HAVING count(*) > 1)', canonico)
  INTO duplicado;
  IF duplicado THEN
    RAISE EXCEPTION 'Hay clientes distintos con el mismo RUT. Revisa la vista previa (accion = DUPLICADO) y unifícalos antes de continuar.';
  END IF;

  EXECUTE format('DELETE FROM public.reservas WHERE cliente IN (SELECT c.id FROM public.cliente c WHERE %s IS NULL)', canonico);
  EXECUTE format('DELETE FROM public.cliente c WHERE %s IS NULL', canonico);

  -- 3. Estructura final de cliente.rut
  ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_rut_check;
  ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_rut_formato_check;
  ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_digito_verificador_check;
  ALTER TABLE public.cliente DROP CONSTRAINT IF EXISTS cliente_rut_valido_check;
  ALTER TABLE public.cliente ALTER COLUMN rut TYPE text USING rut::text;

  EXECUTE format('UPDATE public.cliente c SET rut = %1$s WHERE c.rut IS DISTINCT FROM %1$s', canonico);
  ALTER TABLE public.cliente DROP COLUMN IF EXISTS identificador;
END;
$$;
DROP FUNCTION IF EXISTS public.okami_rut_migrar(text, text);
ALTER TABLE public.cliente
  ALTER COLUMN rut SET NOT NULL,
  ADD CONSTRAINT cliente_rut_valido_check CHECK (public.okami_rut_valido(rut));

-- El diagrama ya marca rut como único; se crea el índice solo si falta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.cliente'::regclass AND i.indisunique AND i.indnatts = 1 AND a.attname = 'rut'
  ) THEN
    CREATE UNIQUE INDEX cliente_rut_unico ON public.cliente(rut);
  END IF;
END;
$$;

-- 4. Funciones: una sola función de escritura de reservas ----------------------
DROP FUNCTION IF EXISTS public.okami_mutar_reserva(uuid,text,uuid,uuid,uuid,bigint,bigint,timestamp,timestamp,text);
DROP FUNCTION IF EXISTS public.okami_mutar_reserva_cliente(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text);
DROP FUNCTION IF EXISTS public.okami_mutar_reserva_cliente_rut(uuid,text,uuid,uuid,text,text,text,uuid,bigint,bigint,timestamp,timestamp,text);
DROP FUNCTION IF EXISTS public.okami_digito_verificador_rut(text);

CREATE OR REPLACE FUNCTION public.okami_buscar_clientes(p_actor uuid, p_busqueda text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  query_text text := nullif(trim(p_busqueda), '');
  query_rut text := CASE WHEN p_busqueda ~ '[0-9]' THEN public.okami_rut_normalizar(p_busqueda) END;
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF query_text IS NULL OR char_length(query_text) < 2 THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rut', c.rut))
    FROM (
      SELECT id, nombre, rut FROM public.cliente
      WHERE nombre IS NOT NULL AND (
        nombre ILIKE '%' || query_text || '%'
        OR (query_rut IS NOT NULL AND rut LIKE '%' || query_rut || '%')
      ) ORDER BY nombre, id LIMIT 12
    ) c
  ), '[]'::jsonb);
END;
$$;

-- Crea, edita o borra una reserva. Si no llega p_cliente, busca o crea al cliente por su RUT
-- dentro de la misma transacción. Las reglas de capacidad son las mismas de 005.
CREATE OR REPLACE FUNCTION public.okami_mutar_reserva_cliente_rut(
  p_actor uuid, p_operacion text, p_id uuid,
  p_cliente uuid DEFAULT NULL, p_cliente_nombre text DEFAULT NULL, p_cliente_rut text DEFAULT NULL,
  p_tatuador uuid DEFAULT NULL, p_espacio bigint DEFAULT NULL, p_precio bigint DEFAULT NULL,
  p_inicio timestamp DEFAULT NULL, p_fin timestamp DEFAULT NULL, p_estado text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor_rol text := public.okami_rol_reservas(p_actor);
  anterior public.reservas%ROWTYPE;
  cliente_destino uuid := p_cliente;
  nombre_limpio text := nullif(trim(p_cliente_nombre), '');
  rut_limpio text := public.okami_rut_normalizar(p_cliente_rut);
  capacidad_espacio bigint;
  disponible_espacio boolean;
  estado_destino bigint;
  inicio_real timestamptz := p_inicio AT TIME ZONE 'America/Santiago';
  fin_real timestamptz := p_fin AT TIME ZONE 'America/Santiago';
BEGIN
  IF actor_rol IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.' USING ERRCODE = '42501'; END IF;
  IF p_operacion NOT IN ('crear','editar','borrar') THEN RAISE EXCEPTION 'Operación no válida.' USING ERRCODE = '22023'; END IF;
  -- Serializa escrituras para que dos solicitudes no puedan tomar el último cupo ni duplicar un cliente.
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

-- 5. Permisos -------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.okami_rut_normalizar(text), public.okami_rut_valido(text),
  public.okami_buscar_clientes(uuid,text),
  public.okami_mutar_reserva_cliente_rut(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okami_rut_normalizar(text), public.okami_rut_valido(text),
  public.okami_buscar_clientes(uuid,text),
  public.okami_mutar_reserva_cliente_rut(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamp,timestamp,text)
  TO service_role;
GRANT SELECT, INSERT ON public.cliente TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
