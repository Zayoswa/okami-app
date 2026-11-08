# Frontend de Okami

Aplicación React + Vite para gestionar reservas y espacios del estudio.

## Desarrollo

Desde la raíz del repositorio, ejecutar `./setup.ps1` y luego `./start-dev.ps1`.
Para ejecutar únicamente el frontend desde esta carpeta: `npm run dev`.
La API local se configura en `.env.development`. Para personalizarla, copiar
`.env.example` a `.env.local` y reiniciar Vite.

## Funciones actuales

- Admin: Reservas Generales, Calendario y Tatuadores (invitación y activación).
- Tatuador: Mis Reservas y Calendario.
- Dashboard Gerencial, Alertas y Documentacion: módulos pendientes según el rol, sin navegación ni contenido.
- Crear, editar y borrar con confirmación, filtros, KPI y paginación de siete reservas.
- Sesiones con fecha, inicio, término y espacio; agenda mensual y columnas por espacio.

Las reservas, espacios y catálogos se consultan por FastAPI. Sigue la [guía de activación](../docs/reservas-reales.md). La aplicación ya no carga los datos de demostración ni lee reservas de localStorage.

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

Las credenciales mockup ya no dan acceso. Configurar el primer administrador y las invitaciones según la guía de acceso cerrado del repositorio.
