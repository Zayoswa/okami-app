-- Borra TODOS los clientes y las reservas asociadas a ellos. Uso único, para limpiar datos de prueba.
-- No es una migración: no ejecutar en una base con clientes reales.
-- Ejecutar ANTES de migrations/006_validacion_rut_clientes.sql.
--
-- Paso 1 (solo lectura): ejecuta solo este SELECT para ver qué se borrará.
-- SELECT
--   (SELECT count(*) FROM public.cliente) AS clientes_a_borrar,
--   (SELECT count(*) FROM public.reservas WHERE cliente IS NOT NULL) AS reservas_a_borrar,
--   (SELECT count(*) FROM public.reservas WHERE cliente IS NULL) AS reservas_sin_cliente_que_se_conservan;
--
-- Paso 2: ejecuta el bloque siguiente. Si algo falla, no se borra nada.
BEGIN;
LOCK TABLE public.cliente, public.reservas IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM public.reservas WHERE cliente IS NOT NULL;
DELETE FROM public.cliente;
COMMIT;
