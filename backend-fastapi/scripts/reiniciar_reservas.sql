-- Reinicia las reservas: BORRA TODAS las reservas (y sus sesiones) y crea 24 reservas de prueba nuevas,
-- ahora con zona del cuerpo y descripción del diseño.
-- Requiere las migraciones 012 (cliente en la reserva) y 017 (zona y diseño).
-- Se ejecuta en el SQL Editor de Supabase del proyecto okami-app. Se puede volver a ejecutar.
--
-- OJO: borra también las reservas creadas a mano, no solo las de prueba. No se puede deshacer.
-- No toca usuarios, puestos, arriendos, pagos ni el registro de actividad (sus entradas antiguas quedan como historial).
--
-- Cómo reconocer los datos de prueba: RUT de cliente 30.000.001 a 30.000.020.
-- Para quitar solo esos: scripts/borrar_datos_prueba_dashboard.sql
--
-- Qué genera:
--   * 24 reservas de 20 clientes (los clientes 1 a 4 vuelven), unas 48 sesiones;
--   * sesiones desde hace ~6 meses hasta ~3 semanas adelante; pasadas Completadas (algunas Canceladas),
--     futuras Programadas, una reserva completamente cancelada;
--   * zona del cuerpo y descripción del diseño acordes al tamaño (1, 2 o 3 sesiones);
--     dos reservas quedan sin descripción y una sin zona, porque ambos datos son opcionales;
--   * precios entre $45.000 y $450.000.
--
-- Reglas que respeta: ningún puesto ni tatuador tiene dos sesiones activas a la misma hora, y los puestos
-- Full/Compartido solo los usan sus titulares (los demás usan puestos Rotativos).
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
  -- Reserva r usa zonas[r] y disenos[r]. Las reservas con r % 3 = 2 tienen 3 sesiones (diseños grandes),
  -- r % 3 = 1 tienen 2 y r % 3 = 0 tienen 1 (diseños chicos).
  zonas text[] := ARRAY[
    'Antebrazo derecho',            -- 1  (2 sesiones)
    'Espalda completa',             -- 2  (3)
    'Muñeca interior izquierda',    -- 3  (1)
    'Pantorrilla derecha',          -- 4  (2)
    'Brazo izquierdo completo',     -- 5  (3)
    'Clavícula derecha',            -- 6  (1)
    'Muslo izquierdo',              -- 7  (2)
    'Costillas lado izquierdo',     -- 8  (3)
    'Tobillo derecho',              -- 9  (1)
    'Hombro derecho',               -- 10 (2)
    'Espalda alta',                 -- 11 (3)
    'Detrás de la oreja',           -- 12 (1)
    'Antebrazo izquierdo',          -- 13 (2)
    'Pierna derecha completa',      -- 14 (3)
    'Nuca',                         -- 15 (1)
    'Pecho, lado derecho',          -- 16 (2)
    'Brazo derecho completo',       -- 17 (3)
    NULL,                           -- 18 (1) sin zona: se completa después
    'Pantorrilla izquierda',        -- 19 (2)
    'Espalda baja',                 -- 20 (3)
    'Dedo anular izquierdo',        -- 21 (1)
    'Antebrazo derecho, interior',  -- 22 (2)
    'Costado derecho',              -- 23 (3)
    'Mano derecha (dorso)'          -- 24 (1)
  ];
  disenos text[] := ARRAY[
    'Rosa en línea fina con sombreado suave, tallo con espinas hacia la muñeca. 15 cm aprox.',
    E'Dragón japonés de cuerpo completo entre nubes y olas.\nColor: rojo, negro y gris. Se trabaja por zonas: contorno, sombra y color.',
    'Frase "Siempre adelante" en letra cursiva fina. 6 cm.',
    'Brújula con mapa antiguo de fondo, estilo realista en negro y gris.',
    E'Manga de temática marina: pulpo, ancla y oleaje.\nEstilo neotradicional a color. Referencias enviadas por WhatsApp.',
    'Golondrina pequeña en línea fina, solo contorno.',
    'Retrato de perro (golden retriever) realista en negro y gris, a partir de foto del cliente.',
    E'Ramo de flores silvestres y mariposas bajando por el costado.\nLínea fina con toques de acuarela.',
    'Ola minimalista estilo japonés, 5 cm, solo negro.',
    'Mandala geométrico con puntillismo, centrado en el hombro.',
    E'Polilla de la muerte con ornamentos geométricos simétricos.\nBlackwork con puntillismo.',
    'Nota musical (clave de sol) en línea fina, 3 cm.',
    'Lobo aullando con luna llena y bosque de pinos, realismo en negro y gris.',
    E'Serpiente enroscada desde el tobillo hasta el muslo, con flores de cerezo.\nTradicional japonés a color.',
    NULL,                           -- 15: sin descripción, se conversa en la primera sesión
    'Golondrinas tradicionales a color (dos), estilo old school.',
    E'Manga biomecánica: engranajes y piezas metálicas bajo la piel.\nNegro y gris con detalles en azul.',
    'Corazón anatómico pequeño en línea fina.',
    'Calavera mexicana (catrina) con flores, color.',
    E'Fénix con alas abiertas cubriendo la espalda baja.\nDegradado de rojo a naranja.',
    NULL,                           -- 21: sin descripción
    'Fecha de nacimiento en números romanos con una línea fina debajo.',
    E'Koi subiendo una cascada con flores de loto.\nTradicional japonés a color, sigue la curva del costado.',
    'Pequeño sol y luna entrelazados, solo contorno.'
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
  borradas integer;
  creadas integer := 0;
BEGIN
  IF id_programada IS NULL OR id_completada IS NULL OR id_cancelada IS NULL THEN
    RAISE EXCEPTION 'Faltan los estados Programada, Completada o Cancelada. Ejecuta primero la migración 008.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'reservas' AND column_name = 'descripcion_diseno') THEN
    RAISE EXCEPTION 'Falta la migración 017 (zona del cuerpo y descripción del diseño).';
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

  -- 1. Borrar TODAS las reservas (sus sesiones se borran en cascada) y los clientes de prueba antiguos.
  DELETE FROM public.reserva_sesiones;
  DELETE FROM public.reservas;
  GET DIAGNOSTICS borradas = ROW_COUNT;
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
    v_puesto := NULL;
    SELECT t.puesto INTO v_puesto FROM public.puesto_titulares t
    JOIN public.puesto p ON p.id = t.puesto JOIN public.puesto_estados pe ON pe.id = p.estado_id
    WHERE t.tatuador = v_tatuador AND pe.estado = 'Habilitado' LIMIT 1;
    v_puesto := COALESCE(v_puesto, rotativos[1 + (r * 3) % cardinality(rotativos)]);
    v_sesiones := 1 + r % 3;                      -- 1, 2 o 3 sesiones
    primer_dia := hoy - 182 + r * 8;              -- de hace ~6 meses a ~3 semanas adelante
    v_hora := 10 + (r % 4) * 3;                   -- 10:00, 13:00, 16:00 o 19:00
    duracion := CASE WHEN v_hora = 19 THEN 2 ELSE 2 + r % 2 END;

    -- Los clientes 1 a 4 vuelven por una segunda reserva.
    INSERT INTO public.reservas(id, "user", cliente, cliente_nombre, cliente_rut, documentos, creado_por, precio, fecha_creacion,
                                zona_cuerpo, descripcion_diseno)
    VALUES (v_reserva, v_tatuador, NULL, nombres[1 + (r - 1) % 20], ruts[1 + (r - 1) % 20], NULL, actor,
            (45000 + ((r * 7919) % 17) * 25000)::bigint,
            LEAST(now(), (primer_dia - (5 + r % 20))::timestamp AT TIME ZONE 'America/Santiago' + interval '12 hours'),
            zonas[r], disenos[r]);

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
  RAISE NOTICE 'Reservas borradas: %. Creadas: 24 reservas de 20 clientes, % sesiones, % tatuador(es).',
    borradas, creadas, cardinality(tatuadores);
END;
$$;

-- Verificación: una fila por reserva, con su zona, diseño y sesiones.
SELECT r.cliente_nombre AS cliente, u.nombre AS tatuador, r.zona_cuerpo, left(r.descripcion_diseno, 60) AS diseno,
       count(s.id) AS sesiones, r.precio
FROM public.reservas r
JOIN public.usuarios u ON u.id = r."user"
LEFT JOIN public.reserva_sesiones s ON s.reserva = r.id
GROUP BY r.id, u.nombre
ORDER BY min(s.inicio);
