-- 016: el rol recepcion puede gestionar todas las reservas (desde el Calendario), igual que el admin.
-- Ejecutar después de 015. No borra datos y se puede volver a ejecutar completa.
--
-- Las funciones de reservas (okami_listar_reservas, okami_guardar_reserva, okami_estado_sesion) preguntan
-- por el rol con okami_rol_reservas y dan acceso completo cuando vale 'admin'. Para no tocar esas funciones,
-- recepcion se informa como 'admin' solo dentro de las reservas. El resto de los permisos de recepcion
-- (qué módulos ve y qué puede cambiar) los decide el backend.
BEGIN;

CREATE OR REPLACE FUNCTION public.okami_rol_reservas(p_actor uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE lower(trim(r.nombre)) WHEN 'recepcion' THEN 'admin' ELSE lower(trim(r.nombre)) END
  FROM public.usuarios u JOIN public.rol r ON r.id = u.rol
  WHERE u.id = p_actor AND u.activo AND lower(trim(r.nombre)) IN ('admin', 'tatuador', 'recepcion');
$$;

COMMIT;

-- Verificación (con el id de una cuenta de recepción):
-- select public.okami_rol_reservas('<uuid>');  -- debe devolver 'admin'
