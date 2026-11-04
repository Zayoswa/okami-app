# Activar reservas reales

La app consulta, crea, edita y elimina reservas mediante FastAPI y Supabase. Usa tatuadores activos y espacios de la base de datos. Las reservas de demostración y los cambios guardados en el navegador ya no se leen ni se importan.

1. Confirma que la configuración de [acceso cerrado](acceso-cerrado.md) funciona y que están cargados los espacios.
2. Revisa y ejecuta [003_reservas_reales.sql](../backend-fastapi/migrations/003_reservas_reales.sql) en **Supabase → SQL Editor**. Agrega funciones de reservas, da acceso al backend, retira la escritura directa a los roles públicos y agrega `Completado` si falta. No borra ni crea reservas ni modifica los clientes existentes.
3. Reinicia FastAPI y recarga la app. En **Reservas Generales → Crear reserva**, elige cliente, tatuador, espacio, fecha, horario, precio y estado. Para el tatuador, la asignación es su propia cuenta.
4. Comprueba que una reserva nueva aparece también en otra sesión. Verifica que el calendario compartido de un tatuador no exponga el cliente ni el precio de reservas ajenas.

La base de datos valida los cupos simultáneos y el límite de pendientes. Las escrituras quedan serializadas mientras se comprueba el cupo; si otra solicitud ocupa el último espacio, la segunda recibe un conflicto. La fecha y las horas se interpretan en `America/Santiago`. El formulario selecciona clientes existentes; el alta de clientes es un paso aparte.

## Clientes básicos y disponibilidad de espacios

Después de activar las reservas, ejecutar [005_clientes_y_espacios_disponibles.sql](../backend-fastapi/migrations/005_clientes_y_espacios_disponibles.sql). Esta migración prepara la búsqueda y el alta de clientes dentro de la misma reserva. A continuación se debe ejecutar 006 para exigir y validar el RUT completo de cada cliente. Ninguna de estas migraciones crea cuentas ni roles para clientes.

Al escribir dos o más caracteres en el campo Cliente, la aplicación muestra coincidencias por nombre o RUT. Al seleccionar una se reutiliza ese cliente; si no se selecciona ninguna, se crea un cliente con el nombre escrito al guardar la reserva. Las reservas se pueden filtrar por cliente desde Reservas Generales y Mis reservas.

## RUT de clientes

Ejecuta también [006_validacion_rut_clientes.sql](../backend-fastapi/migrations/006_validacion_rut_clientes.sql), después de 005. El RUT se guarda completo en `cliente.rut`, en forma canónica: solo dígitos y K mayúscula, sin puntos ni guion (por ejemplo `12345678K`). El formulario acepta un único campo con o sin puntos y guion, y lo muestra como `12.345.678-K`. La aplicación, la API y la base de datos validan el dígito verificador.

Antes de ejecutarla, revisa [vista_previa_006.sql](../backend-fastapi/scripts/vista_previa_006.sql), que es de solo lectura. **La migración borra los clientes cuyo RUT no se puede normalizar a uno válido, junto con sus reservas**, elimina la columna `identificador` y deja una sola función de escritura de reservas. Si encuentra dos clientes con el mismo RUT, se detiene sin modificar datos.

La misma migración asigna el estado Habilitado a los espacios actuales que todavía no tienen estado. Espacios en Mantencion, Desahabilitado o sin estado se muestran como no disponibles y el servidor rechaza nuevas reservas en ellos.
