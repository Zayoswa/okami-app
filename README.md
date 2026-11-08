# Okami — Gestión del estudio

Aplicación web para gestionar el estudio de tatuajes Okami: reservas, puestos de trabajo, tatuadores y arriendos. Centraliza la información de las sesiones y facilita la organización del administrador, recepción y los tatuadores.

**Estado del proyecto:** acceso, reservas, espacios, arriendos y registro de actividad funcionan con datos reales en Supabase. Para preparar una instalación nueva, aplica las migraciones de `backend-fastapi/migrations` en orden (001 a 016) siguiendo [la guía de acceso cerrado](docs/acceso-cerrado.md) y [la guía de reservas reales](docs/reservas-reales.md), y crea al primer administrador antes de probar el login.

## Funciones disponibles

- Acceso con cuentas reales de Supabase Auth para tres roles: administrador, recepción y tatuador.
- Reservas con cliente (nombre y RUT validado), tatuador, precio total y una o más sesiones; cada sesión tiene puesto, fecha, horario y estado.
- Estados de sesión: Programada (azul), Completada (verde) y Cancelada (rojo). Una reserva nueva siempre queda Programada; el estado se cambia al editar. El estado de la reserva se calcula a partir de sus sesiones.
- Borrar una reserva la archiva: sus sesiones dejan de ocupar el puesto y se puede restaurar.
- Validación de choques: un puesto atiende una sesión a la vez y un tatuador no puede estar en dos puestos a la vez, incluso si dos personas guardan al mismo tiempo.
- Listado de reservas paginado con diez reservas por página e indicadores del mes.
- Calendario semanal (lunes a domingo) con detalle de cada reserva y agenda del día organizada por puestos.
- Espacios: estado (habilitado, mantenimiento, deshabilitado), tipo (Full, Compartido, Rotativo, Guest), titulares y quién está ocupando cada puesto en este momento.
- Tatuadores: registro, activación o desactivación del acceso (conservando sus reservas) y modalidad de arriendo.
- Arriendos: cálculo del arriendo mensual de cada tatuador según su modalidad, registro de pagos e historial.
- Dashboard gerencial (admin) y Mi panel (tatuador) con ventas, ganancias, sesiones y arriendo del mes.
- Actividad: registro de quién hizo qué y cuándo; solo se agregan filas, nadie puede editarlas ni borrarlas.

### Módulos por rol

| Rol | Módulos | Próximamente |
| --- | --- | --- |
| Administrador | Inicio, Dashboard, Arriendos, Calendario, Reservas, Tatuadores, Espacios, Actividad | Alertas, Documentación |
| Recepción | Inicio, Calendario, Tatuadores, Espacios, Actividad | Alertas, Documentación |
| Tatuador | Inicio, Mi panel, Mis reservas, Calendario | — |

El administrador gestiona todo el estudio. Recepción gestiona tatuadores, espacios y todas las reservas desde el Calendario, pero no ve el Dashboard, Arriendos ni el módulo Reservas. El tatuador gestiona solo sus propias reservas; en el calendario ve los horarios ocupados por otros, sin sus clientes ni precios. Los módulos marcados como «Próximamente» no abren contenido al pulsarlos.

## Tecnologías

| Componente | Tecnologías |
| --- | --- |
| Interfaz | React 19, React Router, Vite y CSS |
| API | Python, FastAPI y Uvicorn |
| Autenticación | Supabase Auth |
| Base de datos | PostgreSQL en Supabase |
| Verificación | ESLint, pruebas con Node.js y pruebas con unittest de Python |

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

No hay registro público. El administrador crea las cuentas de recepción y tatuadores desde el módulo Tatuadores, y puede activar o desactivar el acceso de un tatuador conservando sus reservas.

El login valida cuentas reales de Supabase Auth; no existen usuarios de demostración. La sesión se conserva en sessionStorage durante la vida de la pestaña, se verifica al recargar y renueva sus tokens cuando es necesario.

Antes de iniciar, configurar las claves del backend, bloquear el registro público en Supabase, aplicar las migraciones y configurar las URLs de invitación siguiendo [esta guía](docs/acceso-cerrado.md).

### Seguridad de la API

- Todas las rutas `/api` exigen una sesión válida y revisan el rol en el backend; el frontend solo oculta lo que el rol no puede usar.
- Límite de intentos de login: después de 5 intentos fallidos con el mismo correo desde el mismo equipo, la API responde 429 durante 15 minutos. Un login correcto reinicia el conteo.
- Cabeceras de seguridad en todas las respuestas: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy` y `Strict-Transport-Security`.
- CORS solo permite los orígenes locales de la app.

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

## Reglas del estudio

Cada puesto atiende una sesión a la vez. Un puesto en mantenimiento o deshabilitado no acepta sesiones nuevas; las ya agendadas se conservan y se pueden completar o cancelar. Las sesiones canceladas no ocupan el puesto.

| Tipo de puesto | Quién lo agenda |
| --- | --- |
| Full | Su titular (1) |
| Compartido | Sus dos titulares |
| Rotativo | Cualquier tatuador |
| Guest | Solo tatuadores con modalidad Guest |

El cliente se guarda dentro de cada reserva (nombre y RUT con dígito verificador); no tiene cuenta ni rol en la app. El arriendo de cada tatuador depende de su modalidad: monto mensual fijo (Full, Compartido), por turno con mínimo mensual (Rotativo, Rotativo light) o por día (Guest).

## Estructura del proyecto

```text
okami-app/
├── backend-fastapi/
│   ├── main.py               # API: acceso, reservas, puestos, tatuadores y seguridad
│   ├── arriendos.py          # Cálculo del arriendo mensual
│   ├── actividad.py          # Registro de actividad
│   ├── migrations/           # Migraciones SQL de Supabase (001 a 016)
│   ├── scripts/              # Pruebas de seguridad, carga y concurrencia contra la base real
│   ├── tests/                # Pruebas del backend
│   └── requirements.txt      # Dependencias de Python
├── docs/                     # Guías de instalación y diseño de la base de datos
├── frontend_react/
│   ├── src/
│   │   ├── components/       # Tarjetas, modales, agenda y menú
│   │   ├── config/           # API y navegación por rol
│   │   ├── data/             # Catálogos de presentación
│   │   ├── hooks/            # Estado de reservas y manejo de modales
│   │   ├── pages/            # Una página por módulo
│   │   ├── services/         # Llamadas a la API y sesión
│   │   └── utils/            # Fechas, permisos, RUT, puestos y arriendos
│   └── tests/                # Pruebas de lógica del frontend
├── setup.ps1                 # Instalación local en Windows
└── start-dev.ps1             # Inicio de frontend y backend
```

## Verificación y compilación

Desde `frontend_react`:

```powershell
npm run lint
npm test
```

Desde `backend-fastapi` (no usan la base real):

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Pruebas contra la base real de Supabase, desde `backend-fastapi`. La de seguridad y la de concurrencia crean reservas de prueba y las borran al terminar:

```powershell
.\.venv\Scripts\python.exe scripts\prueba_seguridad.py
.\.venv\Scripts\python.exe scripts\prueba_carga.py
.\.venv\Scripts\python.exe scripts\prueba_concurrencia.py
```

Para generar la compilación, define la dirección de la API en `.env.local` o en el entorno:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
npm run build
```

El resultado se genera en `frontend_react/dist`. Para revisarlo localmente, ejecuta `npm run preview` y abre la dirección indicada por Vite. El backend debe permanecer activo para iniciar sesión; si se usa un puerto distinto de 5173 o 5174, debe añadirse su origen a la configuración CORS de `backend-fastapi/main.py`.

## Alcance pendiente

- Módulos Alertas y Documentación.
- Envío de invitaciones por correo (requiere configurar un servidor SMTP); mientras tanto, las cuentas se crean manualmente desde Tatuadores.
- Configuración de despliegue: orígenes CORS y HTTPS del servidor final.

Este repositorio presenta el avance funcional de la gestión del estudio; todavía no corresponde a una versión desplegada en producción.
