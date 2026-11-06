# Activar reservas reales

La app consulta, crea, edita y elimina reservas mediante FastAPI y Supabase. Usa tatuadores activos y espacios de la base de datos. Las reservas de demostración y los cambios guardados en el navegador ya no se leen ni se importan.

1. Confirma que la configuración de [acceso cerrado](acceso-cerrado.md) funciona y que están cargados los espacios.
2. Revisa y ejecuta [003_reservas_reales.sql](../backend-fastapi/migrations/003_reservas_reales.sql) en **Supabase → SQL Editor**. Agrega funciones de reservas, da acceso al backend, retira la escritura directa a los roles públicos y agrega `Completado` si falta. No borra ni crea reservas ni modifica los clientes existentes.
3. Reinicia FastAPI y recarga la app. En **Reservas → Crear reserva**, elige cliente, tatuador, espacio, fecha, horario, precio y estado. Para el tatuador, la asignación es su propia cuenta.
4. Comprueba que una reserva nueva aparece también en otra sesión. Verifica que el calendario compartido de un tatuador no exponga el cliente ni el precio de reservas ajenas.

La base de datos valida los cupos simultáneos y el límite de pendientes. Las escrituras quedan serializadas mientras se comprueba el cupo; si otra solicitud ocupa el último espacio, la segunda recibe un conflicto. La fecha y las horas se interpretan en `America/Santiago`. El formulario selecciona clientes existentes; el alta de clientes es un paso aparte.

## Clientes básicos y disponibilidad de espacios

Después de activar las reservas, ejecutar [005_clientes_y_espacios_disponibles.sql](../backend-fastapi/migrations/005_clientes_y_espacios_disponibles.sql). Esta migración prepara la búsqueda y el alta de clientes dentro de la misma reserva. A continuación se debe ejecutar 006 para exigir y validar el RUT completo de cada cliente. Ninguna de estas migraciones crea cuentas ni roles para clientes.

Al escribir dos o más caracteres en el campo Cliente, la aplicación muestra coincidencias por nombre o RUT. Al seleccionar una se reutiliza ese cliente; si no se selecciona ninguna, se crea un cliente con el nombre escrito al guardar la reserva. Las reservas se pueden filtrar por cliente desde Mis reservas.

## RUT de clientes

Ejecuta también [006_validacion_rut_clientes.sql](../backend-fastapi/migrations/006_validacion_rut_clientes.sql), después de 005. El RUT se guarda completo en `cliente.rut`, en forma canónica: solo dígitos y K mayúscula, sin puntos ni guion (por ejemplo `12345678K`). El formulario acepta un único campo con o sin puntos y guion, y lo muestra como `12.345.678-K`. La aplicación, la API y la base de datos validan el dígito verificador.

Antes de ejecutarla, revisa [vista_previa_006.sql](../backend-fastapi/scripts/vista_previa_006.sql), que es de solo lectura. **La migración borra los clientes cuyo RUT no se puede normalizar a uno válido, junto con sus reservas**, elimina la columna `identificador` y deja una sola función de escritura de reservas. Si encuentra dos clientes con el mismo RUT, se detiene sin modificar datos.

La misma migración asigna el estado Habilitado a los espacios actuales que todavía no tienen estado. Espacios en Mantencion, Desahabilitado o sin estado se muestran como no disponibles y el servidor rechaza nuevas reservas en ellos.

## Puestos y reservas con varias sesiones

Ejecuta [007_puestos_y_sesiones.sql](../backend-fastapi/migrations/007_puestos_y_sesiones.sql) después de 006. **Borra todas las reservas** y reemplaza los espacios A–F por 15 puestos.

- **Puestos:** la tabla `espacio` pasa a llamarse `puesto` y `espacio_estados` pasa a `puesto_estados`. Se crean `Puesto 1` a `Puesto 15`, sin capacidad: cada puesto atiende una sesión a la vez. Un puesto en `Mantenimiento` no acepta sesiones nuevas, pero las ya agendadas se pueden completar o cancelar. Por ahora el estado se cambia directamente en Supabase.
- **Reservas y sesiones:** la reserva es el tatuaje (cliente, tatuador, precio total). La tabla `reserva_sesiones` guarda cada visita con su puesto, fecha y horario (`inicio`, `fin`) y estado. Una reserva tiene entre 1 y 30 sesiones; el estado de la reserva se calcula a partir de sus sesiones.
- **Reglas al guardar:** un puesto no puede tener dos sesiones que se crucen; un tatuador no puede tener dos sesiones a la misma hora; las sesiones de una misma reserva no pueden cruzarse entre sí; no se agendan sesiones en el pasado ni en puestos en mantenimiento. Las sesiones canceladas no ocupan el puesto. Ya no existe el límite global de reservas pendientes.

En el formulario, **+ Agregar sesión** suma una fecha más y **Quitar sesión** la elimina al guardar. En el calendario cada sesión aparece en su puesto; al abrirla se edita la reserva completa.

## Estados de sesión

Ejecuta [008_estados_programada.sql](../backend-fastapi/migrations/008_estados_programada.sql) después de 007. Renombra los estados de `reservas_estado` a **Programada** (antes Pendiente), **Completada** y **Cancelada**, sin cambiar sus IDs ni borrar sesiones. El estado "Confirmada" ya no existe. En la app, Programada se muestra en azul, Completada en verde y Cancelada en rojo.

## Tipos de puesto y titulares

Ejecuta [009_tipos_y_titulares_puesto.sql](../backend-fastapi/migrations/009_tipos_y_titulares_puesto.sql) después de 008. No borra datos: todos los puestos quedan como **Rotativo** hasta que el admin los cambie.

- **Full:** 1 titular fijo. **Compartido:** 2 titulares fijos. **Rotativo:** sin titulares, para tatuadores de paso o en arriendo.
- La tabla `puesto_titulares` guarda quién es titular de cada puesto. Un tatuador es titular de un solo puesto, y la base de datos rechaza más titulares de los que permite el tipo. Para cambiar un puesto a un tipo con menos cupos, primero hay que quitar titulares.
- En **Espacios** (solo admin), cada tarjeta muestra el tipo, los titulares (✕ para quitar) y una lista para agregar tatuadores que aún no tienen puesto.
- Al crear una reserva, el puesto del titular aparece preseleccionado y marcado como "Titular".

## Reglas de uso de los puestos

Ejecuta [010_reglas_uso_puestos.sql](../backend-fastapi/migrations/010_reglas_uso_puestos.sql) después de 009. No borra datos.

- **Full y Compartido** solo aceptan sesiones de sus titulares. Para prestar un puesto, el admin lo cambia a **Rotativo**, que está abierto a todos los tatuadores, titulares incluidos.
- Igual que con mantenimiento, las sesiones ya agendadas se conservan y se pueden completar o cancelar. Si una reserva pasa a otro tatuador, sus sesiones en puestos Full o Compartido vuelven a validarse.
