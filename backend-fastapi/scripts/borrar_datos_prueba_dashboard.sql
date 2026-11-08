-- Borra los datos de prueba del Dashboard (scripts/datos_prueba_dashboard.sql).
-- Solo toca reservas con RUT de cliente 30.000.001 a 30.000.020; las sesiones se borran en cascada.
-- Las elimina de verdad (no las deja en el historial): son datos inventados.
-- También limpia los clientes de prueba que creó la versión anterior del script en la tabla cliente.
BEGIN;

DELETE FROM public.reservas
WHERE cliente_rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$'
   OR cliente IN (SELECT id FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$');

DELETE FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$';

COMMIT;

-- Verificación: debe devolver 0.
SELECT count(*) AS reservas_de_prueba FROM public.reservas WHERE cliente_rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$';
