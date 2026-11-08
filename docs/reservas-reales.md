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

## Puesto Guest

Ejecuta [015_puesto_guest.sql](../backend-fastapi/migrations/015_puesto_guest.sql) después de 014. No borra datos.

- **Guest:** cuarto tipo de puesto. No tiene titulares y solo acepta sesiones de tatuadores con modalidad **Guest**.
- Los tatuadores Guest también pueden seguir agendando en puestos **Rotativo**, que siguen abiertos a todos.
- La regla la valida el backend al crear o editar una reserva (`guest_puesto_error` en `main.py`), no una función SQL; la migración solo permite el valor nuevo del tipo.
- Igual que con los titulares: una sesión ya agendada que no cambia se puede completar o cancelar aunque el tatuador haya cambiado de modalidad. Si se mueve la sesión o la reserva pasa a otro tatuador, se vuelve a validar.
- En Espacios, al cambiar un puesto a Guest se avisa de las sesiones pendientes de tatuadores que no son Guest; esas sesiones se conservan.

## Estados de los puestos

Ejecuta [011_estados_puestos.sql](../backend-fastapi/migrations/011_estados_puestos.sql) después de 010. No borra datos.

- Los puestos tienen tres estados: **Habilitado**, **Deshabilitado** y **Mantenimiento**. La migración corrige el nombre antiguo "Desahabilitado" sin cambiar su ID.
- Solo un puesto Habilitado acepta sesiones nuevas. En los otros dos, las sesiones ya agendadas se conservan y se pueden completar o cancelar.
- El aviso al agendar nombra el estado real del puesto: "Puesto 4 está deshabilitado…" o "Puesto 4 está en mantenimiento…".

## Cliente en la reserva, historial y cierre de sesiones

Ejecuta [012_cliente_en_reserva_e_historial.sql](../backend-fastapi/migrations/012_cliente_en_reserva_e_historial.sql) después de 011. No borra datos.

- **Cliente dentro de la reserva:** no hay una ficha ni un buscador de clientes. El formulario pide el nombre (solo letras) y el RUT, y ambos se guardan en la reserva (`reservas.cliente_nombre` y `reservas.cliente_rut`). La migración copia esos datos desde la tabla `cliente`, que queda intacta pero la app ya no usa.
- **Buscar reservas por cliente:** el buscador de Reservas acepta el nombre del cliente o del tatuador, o el RUT, con o sin puntos y guion (por ejemplo `12.345.678-5`, `12345678` o `678-5`).
- **Historial:** "Borrar" ya no elimina. La reserva pasa a la pestaña **Historial** de Reservas: deja de ocupar el puesto y la agenda del tatuador, y no aparece en el Calendario ni en Espacios. Solo la ven el admin y su tatuador. **Restaurar** la devuelve a la agenda, salvo que una de sus sesiones choque con otra reserva.
- **Ganancias:** las sesiones completadas de una reserva borrada siguen contando en las ganancias y el ranking del Dashboard. Sus sesiones programadas ya no cuentan como "por cobrar".
- **Cambiar el estado de una sesión** usa `PATCH /api/reservas/{id}/sesiones/{sesion}` (función `okami_estado_sesion`), sin reenviar la reserva completa. Así también se pueden cerrar sesiones de un tatuador desactivado. Volver a activar una sesión cancelada revisa que el puesto y el tatuador sigan libres.
- **Sesiones por cerrar:** en el Dashboard, cada sesión que ya terminó y sigue Programada tiene botones **Completada** y **Cancelada**. En el Calendario, el detalle de una sesión también permite cambiar su estado.

## Arriendos

Ejecuta [013_arriendos.sql](../backend-fastapi/migrations/013_arriendos.sql) después de 012. No borra datos. El arriendo es lo que cada tatuador paga al estudio según su **modalidad** (`usuarios.modalidad`).

| Modalidad | Cobro |
|---|---|
| Full | $220.000 al mes |
| Compartido | $120.000 al mes, cada titular |
| Rotativo | $12.000 por turno; mínimo $60.000 al mes, a principio de mes |
| Rotativo light | $12.000 por turno; mínimo $36.000 al mes |
| Guest | $15.000 por día; con 5 o más días en el mes, $12.000 cada día |

- **Turno** es una sesión no cancelada del mes, y **día** es una fecha con al menos una sesión. De una reserva borrada solo cuentan las sesiones Completadas. El mínimo del Rotativo cubre sus primeros turnos: con 7 turnos paga $84.000 ($60.000 al inicio y $24.000 después); con 3, solo $60.000.
- **Tablas:** `modalidad_tarifas` guarda el precio de cada modalidad desde un mes (un cambio de precio no altera los meses anteriores), `modalidad_historial` qué modalidad tuvo cada tatuador cada mes (se llena sola al cambiarla) y `pagos_arriendo` los pagos que registra el admin.
- **Tatuadores:** el admin asigna la modalidad de cada uno, y el cambio vale desde el mes actual.
- **Espacios:** un puesto Full solo acepta titulares con modalidad Full, y uno Compartido, titulares Compartido. Rotativo, Rotativo light y Guest agendan en puestos rotativos. Un titular no puede cambiar de modalidad sin dejar antes su puesto.
- **Arriendos** (menú, solo admin): por mes, lo que debe cada tatuador, cómo se calculó, lo pagado, el saldo y su estado (Pagado, Pago parcial, Pendiente, Falta el mínimo). Desde ahí se registran y borran pagos.
- **Dashboard:** arriba muestra el arriendo del mes (total, cobrado y pendiente) y debajo las ventas de los tatuadores.
- El cálculo está en [arriendos.py](../backend-fastapi/arriendos.py), con sus tests en `tests/test_arriendos.py`.

## Dashboard del admin y Mi panel

- **Dashboard (admin), por mes:** lo principal es el arriendo.
  - Indicadores: arriendo cobrado frente al estimado, total estimado y pendiente (con botón a Arriendos).
  - Gráficos: arriendo por mes (últimos 6 meses, cobrado sobre estimado), cobro por tatuador, arriendo por modalidad y uso de los puestos.
  - También muestra sesiones por cerrar y próximas sesiones; al final, las ventas de los tatuadores como referencia.
  - Usa `GET /api/arriendos/historial?hasta=YYYY-MM&meses=6`.
- **Mi panel (tatuador), por mes:**
  - Indicadores: sus ganancias (con variación frente al mes anterior), lo que tiene por realizar, sus sesiones y su arriendo del mes.
  - Gráficos y listas: sus ganancias por mes, sus reservas por estado, sus sesiones por cerrar (con botones) y sus próximas sesiones.
  - Su arriendo sale de `GET /api/arriendos/mio?mes=YYYY-MM`: solo el suyo y sin las notas de los pagos.

## Registro de actividad

Ejecuta [014_registro_actividad.sql](../backend-fastapi/migrations/014_registro_actividad.sql) después de 013. No borra datos.

- **Qué se registra:** cada cambio hecho desde la app, con quién lo hizo, cuándo, un resumen legible y el detalle.
  - Reservas: crear, editar (con la lista de cambios), borrar y restaurar.
  - Sesiones: cada cambio de estado (Programada, Completada, Cancelada).
  - Espacios: estado, tipo y titulares de los puestos.
  - Tatuadores: registro, invitación, activar o desactivar el acceso y modalidad.
  - Arriendos: pagos registrados y borrados.
- **No se puede alterar:** el backend solo puede leer y agregar registros (`registro_actividad`); no tiene permiso para editarlos ni borrarlos.
- **Nunca bloquea una acción:** si guardar el registro falla, el cambio del usuario se mantiene y el error queda en el log del servidor.
- **Módulo Actividad** (solo admin): línea de tiempo por día, con filtros por tipo, persona, fechas y texto, y "Cargar más". Usa `GET /api/actividad`.
- Los resúmenes se arman en [actividad.py](../backend-fastapi/actividad.py), con tests en `tests/test_actividad.py`.
