# Despliegue en Render

La API (FastAPI) y la interfaz (React) se publican en [Render](https://render.com) como dos servicios. La base de datos y el login siguen en el mismo proyecto de Supabase: no hay migraciones nuevas.

La configuración está en [`render.yaml`](../render.yaml). Cada push a la rama configurada (`dev`) vuelve a desplegar ambos servicios.

| Servicio | Tipo en Render | Carpeta | URL esperada |
| --- | --- | --- | --- |
| `okami-api` | Web Service (Python) | `backend-fastapi` | `https://okami-api.onrender.com` |
| `okami-app` | Static Site | `frontend_react` | `https://okami-app.onrender.com` |

Si Render asigna otros nombres, usar las URLs reales en todos los pasos.

## Opción A: crear todo desde el Blueprint

1. En Render: **New → Blueprint** y elegir el repositorio `okami-app`. Render lee `render.yaml`.
2. Completar las tres claves que pide (están en Supabase → Project Settings → API):
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`: la clave secreta del servidor. Solo va en Render, nunca en el repositorio ni en una variable `VITE_`.
3. Esperar a que ambos servicios terminen el primer deploy.

## Opción B: servicios creados a mano

Si los servicios ya existen, no crear el Blueprint (se duplicarían). Revisar que cada uno tenga exactamente esto:

**API (`okami-api`)**

| Campo | Valor |
| --- | --- |
| Root Directory | `backend-fastapi` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"` |
| Health Check Path | `/health` |
| `PYTHON_VERSION` | `3.13` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Las del proyecto de Supabase |
| `CORS_ORIGINS` | URL del frontend, sin `/` final. Varias, separadas por comas |
| `INVITE_REDIRECT_URL` | URL del frontend + `/invitacion` |

No agregar `--workers`: el candado de edición de reservas y el límite de intentos de login viven en memoria y necesitan un solo proceso.

**Frontend (`okami-app`)**

| Campo | Valor |
| --- | --- |
| Root Directory | `frontend_react` |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| `VITE_API_BASE_URL` | URL de la API, sin `/` final |
| Redirects/Rewrites | Source `/*` → Destination `/index.html`, Action **Rewrite** |

`VITE_API_BASE_URL` se incrusta al compilar. Después de cambiarla hay que volver a desplegar el frontend (**Manual Deploy → Clear build cache & deploy**). El archivo `.env.development` solo se usa con `npm run dev` y apunta a localhost: no sirve para producción.

## Supabase Auth

En Supabase → **Authentication → URL Configuration**:

- **Site URL:** la URL del frontend.
- **Redirect URLs:** agregar `https://okami-app.onrender.com/invitacion`. Se pueden mantener las de `localhost` para desarrollo.

Sin esto, los correos de invitación siguen llevando a localhost.

## Verificación

1. `https://okami-api.onrender.com/health` responde un JSON.
2. La app abre en `https://okami-app.onrender.com` y se puede iniciar sesión.
3. Recargar con F5 en `/calendario` no da 404.
4. En F12 → Red, las peticiones van a `okami-api.onrender.com` (no a `127.0.0.1`) y no aparece *blocked by CORS policy* en la consola.

## Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| Las peticiones van a `127.0.0.1:8000` | Falta `VITE_API_BASE_URL` o no se recompiló | Definirla y redesplegar el frontend |
| Página en blanco: "Configura VITE_API_BASE_URL" | La variable no existía al compilar | Igual que arriba |
| *blocked by CORS policy* | `CORS_ORIGINS` no tiene la URL exacta del frontend (o tiene `/` final, o es otra URL) | Corregirla en la API; se aplica al reiniciar |
| *blocked by CORS policy* y `/health` no responde | La API no arrancó | Revisar los logs del servicio, el Start Command y las claves |
| La primera carga tarda 30–60 s | El plan gratuito duerme la API tras 15 min sin uso | Normal. Abrir la app unos minutos antes de una demo |
| 404 al recargar o al abrir el enlace de invitación | Falta la regla de rewrite | Agregar `/*` → `/index.html` |
