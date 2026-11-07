-- Borra los datos de prueba del Dashboard (scripts/datos_prueba_dashboard.sql).
-- Solo toca clientes con RUT 30.000.001 a 30.000.020 y sus reservas; las sesiones se borran en cascada.
BEGIN;

DELETE FROM public.reservas
WHERE cliente IN (SELECT id FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$');

DELETE FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$';

COMMIT;

-- Verificación: debe devolver 0.
SELECT count(*) AS clientes_de_prueba FROM public.cliente WHERE rut ~ '^300000(0[1-9]|1[0-9]|20)[0-9K]$';
