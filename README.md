# Okami — Gestión de reservas y puestos

Aplicación web para coordinar las reservas y los puestos de trabajo del estudio de tatuajes Okami. Centraliza la información de las sesiones y facilita la organización del administrador y los tatuadores.

**Estado del proyecto:** acceso y reservas mediante Supabase. Para activar las reservas en una instalación existente, sigue la [guía de reservas reales](docs/reservas-reales.md).

**Configuración del acceso cerrado:** seguir [la guía de activación](docs/acceso-cerrado.md), aplicar la migración revisada y crear al primer administrador antes de probar el login.

## Funciones disponibles

- Acceso diferenciado para administrador y tatuador, con cierre de sesión.
- Creación y edición de reservas mediante formularios en un modal.
- Eliminación de reservas con un modal de confirmación.
- Registro de cliente, tatuador, precio total y fecha de creación, con una o más sesiones; cada sesión tiene puesto, fecha, horario y estado.
- Estados de sesión: Programada (azul), Completada (verde) y Cancelada (rojo). El estado de la reserva se calcula a partir de sus sesiones.
- Filtros por estado y fecha: hoy, últimos siete días y mes actual.
- Indicadores de total, completadas, canceladas y pendientes que se actualizan con los filtros.
- Listado paginado con diez reservas por página.
- 15 puestos que atienden una sesión a la vez; se valida que no se crucen puestos ni tatuadores.
- Calendario semanal (lunes a domingo) con sesiones identificadas por tatuador y agenda del día organizada por puestos.
- Búsqueda y alta automática de clientes dentro de una reserva; cada cliente nuevo requiere un RUT válido, guardado completo en un solo campo. Los clientes no tienen cuentas ni roles.

### Módulos por rol

| Rol | Disponibles | Próximamente |
| --- | --- | --- |
| Administrador | Calendario, Reservas, Tatuadores, Espacios | Alertas, Dashboard Gerencial, Perfil, Documentacion |
| Tatuador | Mis Reservas, Calendario | Alertas, Perfil |

El administrador puede gestionar todas las reservas. El tatuador puede gestionar sus propias reservas y consultar la organización de los puestos en el calendario. Los módulos marcados como «Proximamente» no abren contenido al pulsarlos.

## Tecnologías

| Componente | Tecnologías |
| --- | --- |
| Interfaz | React 19, React Router, Vite y CSS |
| API local | Python, FastAPI y Uvicorn |
| Datos de prueba | Archivos JSON |
| Persistencia de reservas | PostgreSQL en Supabase |
| Verificación | ESLint y pruebas con Node.js |

## Requisitos

- Git para clonar el repositorio.
- Node.js 22.12 o superior y npm.
- Python 3.10 o superior, disponible mediante el comando `python`.
- PowerShell para utilizar los scripts de instalación e inicio en Windows.

Comprueba las herramientas antes de instalar:

```powershell
git --version
node --version
npm --version
python --version
```

## Instalación e inicio en Windows

### 1. Clonar el repositorio

Copia la URL desde el botón **Code** de GitHub. Sustituye `<URL_DEL_REPOSITORIO>` por esa dirección:

```powershell
git clone <URL_DEL_REPOSITORIO> okami-app
cd okami-app
```

### 2. Instalar las dependencias

Desde la raíz del proyecto:

```powershell
.\setup.ps1
```

El script crea el entorno virtual del backend en `backend-fastapi/.venv`, instala las dependencias de Python e instala las del frontend.

### 3. Iniciar la aplicación

```powershell
.\start-dev.ps1
```

El script abre dos terminales: una para FastAPI y otra para Vite. Mantén ambas abiertas mientras pruebas la aplicación.

| Servicio | Dirección local |
| --- | --- |
| Aplicación web | http://localhost:5173 |
| API | http://127.0.0.1:8000 |
| Documentación interactiva de la API | http://127.0.0.1:8000/docs |
| Estado de la API | http://127.0.0.1:8000/health |

Si el puerto 5173 está ocupado, consulta la dirección que muestra Vite en la terminal. La configuración actual permite conectar la API desde los puertos 5173 y 5174. Para detener los servicios, pulsa **Ctrl + C** en cada terminal.

### Inicio manual alternativo

Si PowerShell bloquea los scripts, puedes instalar e iniciar cada servicio manualmente sin cambiar la política de ejecución.

**Terminal 1 — backend**, desde la raíz:

```powershell
cd backend-fastapi
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

**Terminal 2 — frontend**, desde la raíz:

```powershell
cd frontend_react
npm install
npm run dev
```

## Acceso de usuarios

No hay registro público. El dueño recibe una cuenta administrativa creada de forma controlada. Desde Tatuadores puede invitar por correo y activar o desactivar el acceso de tatuadores, conservando sus reservas.

El login valida cuentas reales de Supabase Auth. Las antiguas credenciales mockup ya no habilitan acceso. La sesión se conserva en sessionStorage durante la vida de la pestaña, se verifica al recargar y renueva sus tokens cuando es necesario.

Antes de iniciar, configurar las claves del backend, bloquear el registro público en Supabase, aplicar la migración y configurar las URLs de invitación siguiendo [esta guía](docs/acceso-cerrado.md).

## Configuración de la API

El frontend utiliza `VITE_API_BASE_URL`. El archivo `frontend_react/.env.development` incluye la dirección local, por lo que no se necesita configuración adicional para iniciar el desarrollo.

Para personalizarla, ejecuta desde la raíz:

```powershell
Copy-Item frontend_react/.env.example frontend_react/.env.local
```

Edita `frontend_react/.env.local` y reinicia Vite:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

El archivo `.env.local` está excluido de Git. Las variables con prefijo `VITE_` son públicas y no deben contener contraseñas ni secretos.

## Datos y reglas de la demostración

El estudio tiene 15 puestos (`Puesto 1` a `Puesto 15`). Cada puesto atiende una sesión a la vez y los tatuadores rotan entre ellos. Un puesto en mantenimiento no acepta sesiones nuevas. Las sesiones canceladas no ocupan el puesto.

La agenda, los puestos y las reservas se consultan desde Supabase. Para activar los puestos y las reservas con varias sesiones, ejecutar la migración `007_puestos_y_sesiones.sql` descrita en [Reservas reales](docs/reservas-reales.md).

Los clientes son registros del estudio: se pueden buscar por nombre o RUT desde una reserva. Si no existe una coincidencia, el tatuador o administrador puede crearlo al guardar esa misma reserva. Para activar este flujo, ejecutar las migraciones `005` y `006` descrita en [Reservas reales](docs/reservas-reales.md).

## Estructura del proyecto

```text
okami-app/
├── backend-fastapi/
│   ├── data/                 # Usuarios de prueba
│   ├── main.py               # API de inicio de sesión y estado
│   └── requirements.txt      # Dependencias de Python
├── frontend_react/
│   ├── src/
│   │   ├── components/       # Tarjetas, modales, agenda y menú
│   │   ├── config/           # API y navegación por rol
│   │   ├── data/             # Catálogos de presentación
│   │   ├── hooks/            # Estado de reservas y manejo de modales
│   │   ├── pages/            # Login, reservas y calendario
│   │   └── utils/            # Filtros, fechas, permisos y capacidad
│   └── tests/                # Pruebas de lógica de negocio
├── setup.ps1                 # Instalación local en Windows
└── start-dev.ps1             # Inicio de frontend y backend
```

## Verificación y compilación

Desde `frontend_react`:

```powershell
npm run lint
npm test
```

Para generar la compilación, define la dirección de la API en `.env.local` o en el entorno:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
npm run build
```

El resultado se genera en `frontend_react/dist`. Para revisarlo localmente, ejecuta `npm run preview` y abre la dirección indicada por Vite. El backend debe permanecer activo para iniciar sesión; si se usa un puerto distinto de 5173 o 5174, debe añadirse su origen a la configuración CORS de `backend-fastapi/main.py`.

## Alcance pendiente

- Alta y gestión de clientes desde la aplicación.
- Desarrollo de los módulos marcados como «Proximamente».

Este repositorio presenta el avance funcional del flujo de reservas y la coordinación de puestos; todavía no corresponde a una versión lista para producción.
