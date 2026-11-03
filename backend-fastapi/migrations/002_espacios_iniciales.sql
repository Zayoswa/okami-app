-- Carga inicial. Conserva los espacios existentes y sus capacidades.
BEGIN;
LOCK TABLE public.espacio IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.espacio (nombre, capacidad)
SELECT seed.nombre, seed.capacidad
FROM (VALUES ('Espacio A',3), ('Espacio B',2), ('Espacio C',4),
             ('Espacio D',1), ('Espacio E',2), ('Espacio F',3)) AS seed(nombre, capacidad)
WHERE NOT EXISTS (SELECT 1 FROM public.espacio e WHERE lower(e.nombre) = lower(seed.nombre));
COMMIT;
