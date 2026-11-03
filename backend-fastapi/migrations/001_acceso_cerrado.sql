-- Ejecutar en SQL Editor con una cuenta administradora, después de revisar el esquema.
-- Basado en public.usuarios(id, nombre, rol, modalidad) y public.rol(id, nombre).
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

-- No duplicar los roles existentes. Se aceptan nombres con distinta capitalización.
INSERT INTO public.rol(nombre)
SELECT 'admin' WHERE NOT EXISTS (SELECT 1 FROM public.rol WHERE lower(trim(nombre)) = 'admin');
INSERT INTO public.rol(nombre)
SELECT 'tatuador' WHERE NOT EXISTS (SELECT 1 FROM public.rol WHERE lower(trim(nombre)) = 'tatuador');

CREATE OR REPLACE FUNCTION public.okami_usuario_actualizado()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okami_usuario_actualizado ON public.usuarios;
CREATE TRIGGER okami_usuario_actualizado BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.okami_usuario_actualizado();

-- La creación del usuario Auth y del perfil debe ser atómica.
-- Nunca tomar el rol desde metadatos editables por el usuario.
CREATE OR REPLACE FUNCTION public.okami_nuevo_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tatuador_rol bigint;
BEGIN
  SELECT id INTO STRICT tatuador_rol FROM public.rol WHERE lower(trim(nombre)) = 'tatuador';
  INSERT INTO public.usuarios(id, nombre, rol, modalidad, activo)
  VALUES (NEW.id, COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''), split_part(NEW.email, '@', 1)),
          tatuador_rol, NULLIF(NEW.raw_user_meta_data->>'modalidad', '')::bigint, true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS okami_nuevo_usuario ON auth.users;
CREATE TRIGGER okami_nuevo_usuario AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.okami_nuevo_usuario();
REVOKE ALL ON FUNCTION public.okami_nuevo_usuario() FROM PUBLIC, anon, authenticated;

-- FastAPI consulta perfiles con clave de servidor, tras validar el JWT.
-- Evita cambiar rol/activo a través de la API pública de Supabase.
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.usuarios TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.rol FROM anon, authenticated;
COMMIT;
