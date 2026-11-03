# Activación del acceso cerrado

El código sustituye el login mockup por Supabase Auth. No hay registro público en la interfaz. El módulo Tatuadores permite invitar, activar y desactivar tatuadores; no permite crear administradores.

## Configurar antes de iniciar

1. Hacer una copia del esquema y revisar `backend-fastapi/migrations/001_acceso_cerrado.sql`. Está escrito para las tablas del diagrama: `usuarios`, `rol` y `modalidad`. Ejecutarlo en el SQL Editor. Si hay triggers previos sobre `auth.users`, revisarlos para evitar que ambos creen el mismo perfil. La migración no se ha ejecutado automáticamente.
2. En Supabase Auth, desactivar **Allow new users to sign up** y el acceso anónimo. Mantener el acceso por correo y contraseña. No habilitar proveedores que creen cuentas sin aprobación.
3. Configurar Site URL y Redirect URLs. Permitir exactamente `http://localhost:5173/invitacion` (o la dirección real). Configurar SMTP para las invitaciones y comprobar la entrega. El flujo espera el enlace de invitación estándar de Supabase con tokens en el fragmento; no usa un enlace personalizado con `code`.
4. Completar `backend-fastapi/.env` con los valores del ejemplo. `SUPABASE_SECRET_KEY` es la clave secreta del servidor de Supabase (o la clave legacy `service_role`), nunca la pública. No se necesita compartirla en el chat.
5. Reiniciar FastAPI y Vite.

## Primer administrador

Crear la cuenta del dueño en Supabase Auth mediante el panel administrativo, con su correo real y contraseña. El trigger crea un perfil de tatuador por defecto. Copiar su UUID y ejecutar, sustituyendo el valor:

```sql
UPDATE public.usuarios
SET rol = (SELECT id FROM public.rol WHERE lower(trim(nombre)) = 'admin'),
    activo = true
WHERE id = '<UUID_DEL_DUEÑO>'::uuid;
```

Si la cuenta ya existía antes del trigger, crear primero su fila `usuarios` con el mismo UUID, nombre, rol y modalidad correspondiente. No asignar el rol por metadatos ni desde el navegador. Comprobar que solo hay una fila de cada rol lógico (`admin`, `tatuador`). Si `modalidad` es obligatoria en el esquema, asignarla al crear cuentas desde el panel; el trigger necesita un valor válido en sus metadatos o adaptar ese requisito antes de usarlo.

## Prueba completa

- Entrar como dueño. Las contraseñas de `usuariosMock.json` ya no dan acceso por sí solas.
- Abrir Tatuadores e invitar un correo de prueba autorizado. Solo pulsar Enviar cuando se quiera enviar un correo real.
- Abrir el correo, establecer contraseña y comprobar acceso como tatuador.
- Recargar para comprobar la restauración de sesión; cerrar sesión y comprobar que no se restaura.
- Desactivar el tatuador y comprobar que `/auth/me` y las operaciones protegidas rechazan también su sesión existente.
- Comprobar que un tatuador obtiene 403 al invitar o cambiar activación, y una petición sin token obtiene 401.
- Intentar registro directo en Supabase: debe estar bloqueado por la configuración del proyecto.

## Alcance y decisiones

Los tokens se conservan en sessionStorage de la pestaña y se renuevan al expirar. Cada solicitud protegida verifica la identidad con Supabase y consulta `activo` y rol en la base de datos. No se comparte un cliente autenticado global entre solicitudes. El cierre remoto revoca la renovación; un JWT ya emitido puede seguir siendo válido hasta expirar. La desactivación se comprueba en cada operación de esta API.

El catálogo de espacios se lee desde Supabase mediante `GET /api/espacios` para ambos roles. La carga inicial está en `backend-fastapi/migrations/002_espacios_iniciales.sql`. Para activar la agenda compartida consulta [Reservas reales](reservas-reales.md). No se importan reservas del navegador.

La invitación es la aprobación del administrador. No se agregó una lista de espera. Los roles solo se modifican administrativamente. La migración restringe acceso directo a perfiles; revisar las políticas y privilegios de las demás tablas antes de conectar las reservas.

## Verificación local sin conexión externa

```powershell
cd backend-fastapi
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Las pruebas usan dobles de Supabase: no crean usuarios, no envían correos y no modifican la base remota.
