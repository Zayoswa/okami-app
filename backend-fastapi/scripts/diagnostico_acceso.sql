-- Diagnóstico: SOLO LECTURA. No agrega campos, no cambia permisos ni elimina objetos.
-- Ejecutar en Supabase SQL Editor y compartir los resultados para revisar la migración.

-- 1. Triggers existentes sobre cuentas y perfiles.
SELECT n.nspname AS esquema, c.relname AS tabla, t.tgname AS trigger,
       pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND ((n.nspname = 'auth' AND c.relname = 'users')
    OR (n.nspname = 'public' AND c.relname = 'usuarios'));

-- 2. Políticas de usuarios y rol.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('usuarios', 'rol');

-- 3. Activación de RLS y propietario.
SELECT n.nspname AS esquema, c.relname AS tabla, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS forzar_rls, pg_get_userbyid(c.relowner) AS propietario
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('usuarios', 'rol');

-- 4. Privilegios efectivos de la clave de servidor y de clientes.
SELECT r.rolname AS rol, t.tabla,
       has_table_privilege(r.oid, t.tabla, 'SELECT') AS puede_leer,
       has_table_privilege(r.oid, t.tabla, 'INSERT') AS puede_insertar,
       has_table_privilege(r.oid, t.tabla, 'UPDATE') AS puede_actualizar
FROM pg_roles r
CROSS JOIN (VALUES ('public.usuarios'), ('public.rol')) AS t(tabla)
WHERE r.rolname IN ('service_role', 'authenticated', 'anon');

-- 5. Claves foráneas y restricciones existentes en usuarios.
SELECT conname AS nombre, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE conrelid = 'public.usuarios'::regclass;
