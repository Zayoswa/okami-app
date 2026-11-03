# Preparación de la conexión a Supabase

> Documento histórico de preparación. La autenticación ya fue implementada; consultar [Acceso cerrado](acceso-cerrado.md). El repositorio de reservas sigue siendo local.

## Estado de esta preparación

La app sigue utilizando el login de demostración de FastAPI y las reservas locales. No hay una conexión activa a Supabase ni cambios de permisos o capacidad. No se requieren claves nuevas para ejecutar esta preparación.

## Separación implementada

- `frontend_react/src/services/authService.js`: encapsula la petición de login existente.
- `frontend_react/src/services/localReservationsRepository.js`: implementa lectura, guardado y eliminación locales mediante promesas.
- `frontend_react/src/services/reservationsRepository.js`: selecciona el repositorio que usa la app. Actualmente selecciona exclusivamente el local.
- `useReservations`: controla carga y errores, ofrece reintento y actualiza la interfaz tras una escritura exitosa.
- Formularios de reservas y confirmación de borrado: esperan la respuesta, bloquean controles mientras se procesa y conservan el modal abierto si ocurre un error.

## Contrato interno para el futuro adaptador

```js
await repository.list(user); // Reservation[]
await repository.save(user, candidate, editingId); // Reservation[] actualizadas
await repository.remove(user, id); // Reservation[] actualizadas
```

Las tres operaciones devuelven la lista completa autorizada que necesita la vista, sin paginación remota en esta primera interfaz. `editingId === undefined` significa creación; cualquier otro valor significa edición. Un fallo debe rechazar la promesa con un Error comprensible; no devolver una lista vacía ni datos mock como sustitución silenciosa. Guardar y borrar resuelven únicamente cuando la persistencia fue confirmada. Si una escritura remota se confirma y falla la lectura posterior, distinguir ese caso de una escritura rechazada y reconciliar antes de permitir un reintento; considerar claves de idempotencia en creaciones.

Modelo actual de la interfaz:

```js
{
  id: "identificador",
  cliente: "Nombre del cliente",
  tatuador: "Nombre del artista",
  tatuadorId: "identificador del artista",
  espacioId: "A",
  precio: 120000,
  fecha: "2026-10-28",
  horaInicio: "15:00",
  horaFin: "17:00",
  estado: "Pendiente", // Completado o Cancelado
  fechaCreacion: "2026-10-28T12:00:00Z"
}
```

El futuro adaptador traducirá este modelo al esquema final de PostgreSQL. No es un contrato HTTP ni obliga a crear estas mismas columnas. Los nombres de cliente y tatuador aún son texto libre en el formulario; al conectar será necesario seleccionar entidades reales por ID.

## Información que falta acordar

1. Esquema SQL final: tablas, claves, tipos, estados, relaciones y capacidades.
2. Identidades: el código actual compara `user.id` con `tatuadorId`. Si el esquema separa perfiles y tatuadores, será necesario resolver la ficha del artista y adaptar esa comparación. No comparar ambos UUID como si fueran equivalentes.
3. Acceso: decidir si React usará Supabase directamente o si FastAPI mediará las operaciones. Ambos requieren autorización real y validaciones transaccionales.
4. Agenda compartida: hoy el calendario usa reservas completas de todos los tatuadores. Si solo se comparten campos de ocupación, implementar una consulta/modelo específico para esa agenda, sin exponer clientes ni precios ajenos.
5. Autenticación: sustituir login, restaurar sesión y cerrar sesión realmente en Supabase; obtener rol desde el perfil confiable. La sesión actual continúa en memoria y el cierre de sesión actual es local.
6. Catálogos: espacios todavía se importan de JSON, incluso en la validación local. Sustituirlos por datos remotos y actualizar formularios, calendario y validación; el servidor debe ser la autoridad final.
7. Horarios: convertir usando America/Santiago, incluyendo horario de verano, y confirmar si se conserva el límite global de pendientes o se usa solo capacidad por horario.

## Configuración cuando exista el proyecto

La dirección de la API actual se configura con `VITE_API_BASE_URL`. No se agregaron variables Supabase vacías o una opción de proveedor que todavía no tenga implementación.

Si se elige acceso directo, el navegador necesitará URL del proyecto y clave pública de Supabase. Las claves secretas, credenciales de PostgreSQL y claves con privilegios elevados deben quedar exclusivamente en el servidor, fuera de variables `VITE_` y de Git. Las claves públicas requieren RLS y privilegios adecuados; no sustituyen permisos de usuario.

No importar las reservas de localStorage automáticamente al activar la conexión: son datos de demostración y no una fuente compartida confiable.

## Validación requerida al conectar

Probar acceso entre dos tatuadores, rol administrador, usuario inactivo, sesión expirada, errores de red, escrituras concurrentes al último cupo, cambios de espacio/horario y un fallo de lectura después de una escritura confirmada. Las validaciones locales actuales solo sirven para la demostración.
