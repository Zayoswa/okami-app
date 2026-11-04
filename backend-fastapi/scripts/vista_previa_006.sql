-- Vista previa de la migración 006. SOLO LECTURA: no modifica nada.
-- Muestra qué pasará con cada cliente al dejar el RUT completo en una sola columna.
--   rut_nuevo = valor normalizado que se guardará (sin puntos ni guion, K mayúscula)
--   accion    = 'conservar', 'BORRAR' (RUT inválido o vacío) o 'DUPLICADO' (bloquea la migración)
WITH base AS (
  SELECT c.id, c.nombre, c.rut, c.identificador,
    nullif(upper(regexp_replace(coalesce(c.rut::text, ''), '[^0-9kK]', '', 'g')), '') AS solo_rut,
    nullif(upper(regexp_replace(coalesce(c.rut::text, '') || coalesce(c.identificador, ''), '[^0-9kK]', '', 'g')), '') AS rut_mas_dv
  FROM public.cliente c
), candidatos AS (
  SELECT b.id, x.valor, x.orden
  FROM base b, LATERAL (VALUES (b.solo_rut, 1), (b.rut_mas_dv, 2)) x(valor, orden)
  WHERE x.valor ~ '^[0-9]{1,9}[0-9K]$' AND left(x.valor, -1) !~ '^0+$'
    AND right(x.valor, 1) = (
      SELECT CASE 11 - t.suma % 11 WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11 - t.suma % 11)::text END
      FROM (SELECT sum(substr(left(x.valor, -1), length(x.valor) - i, 1)::int * (2 + (i - 1) % 6)) AS suma
            FROM generate_series(1, length(x.valor) - 1) i) t)
), elegido AS (
  SELECT DISTINCT ON (id) id, valor AS rut_nuevo FROM candidatos ORDER BY id, orden
)
SELECT b.id, b.nombre, b.rut AS rut_actual, b.identificador AS identificador_actual, e.rut_nuevo,
  CASE WHEN e.rut_nuevo IS NULL THEN 'BORRAR'
       WHEN count(*) OVER (PARTITION BY e.rut_nuevo) > 1 THEN 'DUPLICADO'
       ELSE 'conservar' END AS accion,
  (SELECT count(*) FROM public.reservas r WHERE r.cliente = b.id) AS reservas_que_se_borran_si_borrar
FROM base b LEFT JOIN elegido e ON e.id = b.id
ORDER BY accion, b.nombre;
