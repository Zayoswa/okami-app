# Okami — Gestión de reservas y espacios

Aplicación web para coordinar las reservas y los espacios de trabajo del estudio de tatuajes Okami. Centraliza la información de las sesiones y facilita la organización del administrador y los tatuadores.

**Estado del proyecto:** prototipo funcional para pruebas locales. Este avance utiliza datos mockup y guarda los cambios de las reservas en el navegador. La conexión a una base de datos y la autenticación de producción están pendientes.

## Funciones disponibles

- Acceso diferenciado para administrador y tatuador, con cierre de sesión.
- Creación y edición de reservas mediante formularios en un modal.
- Eliminación de reservas con un modal de confirmación.
- Registro de cliente, tatuador, precio, espacio, fecha, hora de inicio y término, estado y fecha de creación.
- Estados de reserva: Pendiente, Completado y Cancelado.
- Filtros por estado y fecha: hoy, últimos siete días y mes actual.
- Indicadores de total, completadas, canceladas y pendientes que se actualizan con los filtros.
- Listado paginado con siete reservas por página.
- Resumen de ocupación por espacio y validación de capacidad.
- Calendario mensual con sesiones identificadas por tatuador y agenda del día organizada por espacios.

### Módulos por rol

| Rol | Disponibles | Próximamente |
| --- | --- | --- |
| Administrador | Calendario, Reservas Generales | Alertas, Dashboard Gerencial, Tatuadores, Perfil, Documentacion |
| Tatuador | Mis Reservas, Calendario | Alertas, Perfil |

El administrador puede gestionar todas las reservas. El tatuador puede gestionar sus propias reservas y consultar la organización de los espacios en el calendario. Los módulos marcados como «Proximamente» no abren contenido al pulsarlos.

## Tecnologías

| Componente | Tecnologías |
| --- | --- |
| Interfaz | React 19, React Router, Vite y CSS |
| API local | Python, FastAPI y Uvicorn |
| Datos de prueba | Archivos JSON |
| Persistencia de reservas | localStorage del navegador |
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

## Usuarios de prueba

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | admin@okami.cl | admin |
| Tatuador (Bruno Toro) | tatuador@okami.cl | tatuador |

Estas credenciales son únicamente para la demostración local. La sesión permanece en memoria: al recargar la página se debe iniciar sesión nuevamente.

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

Los datos iniciales están en `frontend_react/src/data`: reservas, ejemplos históricos, un catálogo de treinta tatuadores y los espacios del estudio.

| Espacio | Capacidad |
| --- | --- |
| A | 3 personas |
| B | 2 personas |
| C | 4 personas |
| D | 1 persona |
| E | 2 personas |
| F | 3 personas |

El resumen de ocupación cuenta todas las reservas pendientes asignadas a cada espacio. La validación aplica ese límite y también comprueba las sesiones que se superponen en fecha y horario. Las reservas canceladas no ocupan cupos.

Las modificaciones se guardan bajo la clave `okami.reservas.v1` en `localStorage`; no modifican los archivos JSON ni se comparten entre navegadores o equipos. Para recuperar los datos iniciales, elimina esa clave desde las herramientas de desarrollo del navegador y recarga la página. Esto elimina los cambios locales de las reservas.

Las credenciales mockup se encuentran en `backend-fastapi/data/usuariosMock.json`. Los permisos actuales sirven para probar la interfaz; la autorización de las operaciones en el servidor y la persistencia centralizada aún deben implementarse.

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
│   │   ├── data/             # Reservas, tatuadores y espacios mockup
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

- Conexión a una base de datos para compartir y conservar la información de forma centralizada.
- Autenticación y autorización de producción en el backend.
- Desarrollo de los módulos marcados como «Proximamente».

Este repositorio presenta el avance funcional del flujo de reservas y la coordinación de espacios; todavía no corresponde a una versión lista para producción.
