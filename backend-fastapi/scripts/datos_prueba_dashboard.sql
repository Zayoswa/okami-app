-- Datos de prueba para el Dashboard: 24 reservas de 20 clientes (unas 48 sesiones).
-- Requiere la migración 012 (el nombre y RUT del cliente se guardan en la reserva).
-- Se ejecuta en el SQL Editor de Supabase del proyecto okami-app. Se puede volver a ejecutar:
-- primero borra los datos de prueba anteriores y luego los crea de nuevo.
--
-- Cómo reconocer los datos de prueba: las reservas tienen RUT de cliente 30.000.001 a 30.000.020.
-- Para quitarlos: scripts/borrar_datos_prueba_dashboard.sql
--
-- Qué genera:
--   * sesiones desde hace ~6 meses hasta ~3 semanas adelante;
--   * pasadas: Completadas (algunas Canceladas); futuras: Programadas; una reserva completamente cancelada;
--   * reservas de 1, 2 y 3 sesiones; algunos clientes vuelven (más de una reserva);
--   * precios entre $45.000 y $450.000.
--
-- Reglas que respeta: ningún puesto ni tatuador tiene dos sesiones activas a la misma hora
-- (tampoco con las reservas reales), y los puestos Full/Compartido solo los usan sus titulares.
-- Usa los tatuadores activos que existan al ejecutarlo: con más tatuadores, los gráficos por tatuador se ven mejor.
--
-- La regla "no agendar en el pasado" se desactiva solo dentro de este bloque, para poder crear historial,
-- y se vuelve a activar al final. Todo ocurre en una sola transacción: si algo falla, no queda nada a medias.
DO $$
DECLARE
  nombres text[] := ARRAY[
    'Camila Rojas Fuentes', 'Matías Soto Herrera', 'Valentina Muñoz Pérez', 'Benjamín Díaz Contreras',
    'Fernanda Silva Morales', 'Joaquín Torres Vega', 'Antonia Reyes Castro', 'Vicente Araya Núñez',
    'Isidora Espinoza Lagos', 'Tomás Castillo Pino', 'Martina Vargas Ríos', 'Agustín Fuentes Paredes',
    'Catalina Sepúlveda Ortiz', 'Lucas Morales Riquelme', 'Javiera Navarro Bravo', 'Sebastián Carrasco León',
    'Florencia Gutiérrez Toro', 'Diego Sandoval Cáceres', 'Constanza Pizarro Molina', 'Nicolás Alarcón Vera'
  ];
  ruts text[] := ARRAY[]::text[];
  tatuadores uuid[];
  rotativos bigint[];
  actor uuid;
  id_programada bigint := (SELECT id FROM public.reservas_estado WHERE nombre = 'Programada');
  id_completada bigint := (SELECT id FROM public.reservas_estado WHERE nombre = 'Completada');
  id_cancelada bigint := (SELECT id FROM public.reservas_estado WHERE nombre = 'Cancelada');
  hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
  i integer;
  r integer;
  s integer;
  cuerpo text;
  dv text;
  v_reserva uuid;
  v_tatuador uuid;
  v_puesto bigint;
  v_sesiones integer;
  v_dia date;
  primer_dia date;
  v_hora integer;
  duracion integer;
  inicio_real timestamptz;
  fin_real timestamptz;
  v_estado bigint;
  creadas integer := 0;
BEGIN
  IF id_programada IS NULL OR id_completada IS NULL OR id_cancelada IS NULL THEN
    RAISE EXCEPTION 'Faltan los estados Programada, Completada o Cancelada. Ejecuta primero la migración 008.';
  END IF;

  SELECT array_agg(u.id ORDER BY u.nombre) INTO tatuadores
  FROM public.usuarios u JOIN public.rol ro ON ro.id = u.rol
  WHERE lower(trim(ro.nombre)) = 'tatuador' AND u.activo;
  IF tatuadores IS NULL THEN RAISE EXCEPTION 'No hay tatuadores activos para asignar las reservas.'; END IF;

  SELECT u.id INTO actor
  FROM public.usuarios u JOIN public.rol ro ON ro.id = u.rol
  WHERE lower(trim(ro.nombre)) = 'admin' ORDER BY u.nombre LIMIT 1;
  actor := COALESCE(actor, tatuadores[1]);

  SELECT array_agg(p.id ORDER BY p.id) INTO rotativos
  FROM public.puesto p JOIN public.puesto_estados pe ON pe.id = p.estado_id
  WHERE p.tipo = 'Rotativo' AND pe.estado = 'Habilitado';
  IF rotativos IS NULL THEN RAISE EXCEPTION 'No hay puestos Rotativos habilitados para los datos de prueba.'; END IF;

  -- 1. Borrar los datos de prueba anteriores (sus sesiones se borran en cascada).
  --    También los que creó la versión anterior de este script, que usaba la tabla cliente.
  DELETE FROM public.reservas
  WHERE cliente_rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$'
     OR cliente IN (SELECT id FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$');
  DELETE FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$';

  -- 2. RUT válidos 30.000.001 a 30.000.020 (el dígito verificador se busca con okami_rut_valido).
  FOR i IN 1..20 LOOP
    cuerpo := (30000000 + i)::text;
    SELECT d INTO dv FROM unnest(ARRAY['0','1','2','3','4','5','6','7','8','9','K']) d
    WHERE public.okami_rut_valido(cuerpo || d) LIMIT 1;
    ruts := ruts || (cuerpo || dv);
  END LOOP;

  -- 3. Reservas y sesiones.
  ALTER TABLE public.reserva_sesiones DISABLE TRIGGER okami_sesion_inicio_futuro;

  FOR r IN 1..24 LOOP
    v_reserva := gen_random_uuid();
    v_tatuador := tatuadores[1 + (r - 1) % cardinality(tatuadores)];
    -- Puesto: el del tatuador si es titular de uno habilitado; si no, un Rotativo.
    SELECT t.puesto INTO v_puesto FROM public.puesto_titulares t
    JOIN public.puesto p ON p.id = t.puesto JOIN public.puesto_estados pe ON pe.id = p.estado_id
    WHERE t.tatuador = v_tatuador AND pe.estado = 'Habilitado';
    v_puesto := COALESCE(v_puesto, rotativos[1 + (r * 3) % cardinality(rotativos)]);
    v_sesiones := 1 + r % 3;                      -- 1, 2 o 3 sesiones
    primer_dia := hoy - 182 + r * 8;            -- de hace ~6 meses a ~3 semanas adelante
    v_hora := 10 + (r % 4) * 3;                   -- 10:00, 13:00, 16:00 o 19:00
    duracion := CASE WHEN v_hora = 19 THEN 2 ELSE 2 + r % 2 END;

    -- Los clientes 1 a 4 vuelven por una segunda reserva.
    INSERT INTO public.reservas(id, "user", cliente, cliente_nombre, cliente_rut, documentos, creado_por, precio, fecha_creacion)
    VALUES (v_reserva, v_tatuador, NULL, nombres[1 + (r - 1) % 20], ruts[1 + (r - 1) % 20], NULL, actor,
            (45000 + ((r * 7919) % 17) * 25000)::bigint,
            LEAST(now(), (primer_dia - (5 + r % 20))::timestamp AT TIME ZONE 'America/Santiago' + interval '12 hours'));

    FOR s IN 1..v_sesiones LOOP
      v_dia := primer_dia + (s - 1) * 14;          -- una sesión cada dos semanas
      -- Si el puesto o el tatuador ya tienen una sesión activa a esa hora, se pasa al día siguiente.
      LOOP
        inicio_real := (v_dia + make_time(v_hora, 0, 0)) AT TIME ZONE 'America/Santiago';
        fin_real := (v_dia + make_time(v_hora + duracion, 0, 0)) AT TIME ZONE 'America/Santiago';
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.reserva_sesiones x JOIN public.reservas y ON y.id = x.reserva
          WHERE x.estado_id <> id_cancelada AND y.archivada_en IS NULL AND x.inicio < fin_real AND x.fin > inicio_real
            AND (x.puesto = v_puesto OR y."user" = v_tatuador));
        v_dia := v_dia + 1;
      END LOOP;

      v_estado := CASE
        WHEN r % 11 = 0 THEN id_cancelada                      -- reserva completamente cancelada
        WHEN inicio_real > now() THEN id_programada            -- futura
        WHEN (r + s) % 7 = 0 THEN id_cancelada                 -- algunas pasadas se cancelaron
        WHEN fin_real > now() - interval '3 days' AND r % 2 = 0 THEN id_programada  -- reciente, aún sin cerrar
        ELSE id_completada
      END;

      INSERT INTO public.reserva_sesiones(id, reserva, puesto, estado_id, inicio, fin)
      VALUES (gen_random_uuid(), v_reserva, v_puesto, v_estado, inicio_real, fin_real);
      creadas := creadas + 1;
    END LOOP;
  END LOOP;

  ALTER TABLE public.reserva_sesiones ENABLE TRIGGER okami_sesion_inicio_futuro;
  RAISE NOTICE 'Datos de prueba creados: 24 reservas de 20 clientes, % sesiones, % tatuador(es).', creadas, cardinality(tatuadores);
END;
$$;

-- Verificación: sesiones de prueba por mes y estado.
SELECT to_char(s.inicio AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS mes, e.nombre AS estado, count(*) AS sesiones
FROM public.reserva_sesiones s
JOIN public.reservas r ON r.id = s.reserva
JOIN public.reservas_estado e ON e.id = s.estado_id
WHERE r.cliente_rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$'
GROUP BY 1, 2 ORDER BY 1, 2;
