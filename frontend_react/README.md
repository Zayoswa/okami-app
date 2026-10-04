# Frontend de Okami

Aplicación React + Vite para gestionar reservas y espacios del estudio.

## Desarrollo

Desde la raíz del repositorio, ejecutar `./setup.ps1` y luego `./start-dev.ps1`.
Para ejecutar únicamente el frontend desde esta carpeta: `npm run dev`.
La API local se configura en `.env.development`. Para personalizarla, copiar
`.env.example` a `.env.local` y reiniciar Vite.

## Funciones actuales

- Admin: Reservas Generales y Calendario.
- Tatuador: Mis Reservas y Calendario.
- Dashboard Gerencial, Alertas, Tatuadores, Perfil y Documentacion: módulos pendientes según el rol, sin navegación ni contenido.
- Crear, editar y borrar con confirmación, filtros, KPI y paginación de siete reservas.
- Sesiones con fecha, inicio, término y espacio; agenda mensual y columnas por espacio.

Los datos iniciales están en `src/data`. Los cambios se guardan en el navegador,
en `localStorage`, usando `okami.reservas.v1`; los JSON no se modifican.
Los ejemplos incluyen 80 reservas históricas adicionales y un catálogo de 30
tatuadores. Se conservan al desactivar el módulo Dashboard Gerencial.

La capacidad del resumen cuenta todas las reservas pendientes por espacio.
También se validan sesiones que se superponen. Las restricciones por rol son
parte de la demostración local; la autenticación real en el backend está pendiente.

## Código

- `pages`: pantallas y coordinación de sus acciones.
- `components`: tarjetas, agenda, modales, navegación y control de acceso a módulos.
- `hooks`: estado de reservas y ciclo de vida de los modales.
- `utils`: operaciones, persistencia, capacidad, filtros, fechas y propiedad de reservas.
- `config/navigation.js`: permisos, orden de módulos y marca `comingSoon`.

## Verificación

- `npm run lint`
- `npm test`
- `npm run build` (definir `VITE_API_BASE_URL` en `.env.local` o en el entorno).

Las credenciales de los dos usuarios de prueba están documentadas en el README
principal y definidas en `backend-fastapi/data/usuariosMock.json`.
