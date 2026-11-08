"""Prueba de carga: tiempos de respuesta de la API con varios usuarios a la vez, contra la base real (Supabase).

Uso (desde backend-fastapi):  .venv\\Scripts\\python.exe scripts\\prueba_carga.py

Levanta la API real (uvicorn, un proceso, como en el despliegue) en 127.0.0.1:8765 y la llama por HTTP con
1, 5, 10 y 20 usuarios simultáneos. Solo hace lecturas: no crea ni cambia datos.

La sesión se resuelve con el perfil del administrador sin pasar por Supabase Auth (no hay contraseñas en el
script); el resto del camino es el real: FastAPI -> validaciones -> consultas/funciones en Postgres.
Se mide aparte, una vez, cuánto suma la verificación del token en Supabase Auth (POST /auth/login fallido).
"""
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

db = main.client(admin=True)
ADMIN_ROL = next(r['id'] for r in db.table('rol').select('id,nombre').execute().data if r['nombre'].strip().lower() == 'admin')
ADMIN = db.table('usuarios').select('id').eq('rol', ADMIN_ROL).eq('activo', True).limit(1).execute().data[0]['id']
main.app.dependency_overrides[main.get_current_user] = lambda: main.profile(ADMIN)

PORT = 8765
RUTAS = ['/api/reservas', '/api/reservas/catalogos', '/api/puestos/estados', '/api/arriendos?mes=2026-11', '/api/actividad']
USUARIOS = [1, 5, 10, 20]
POR_USUARIO = 10

server = uvicorn.Server(uvicorn.Config(main.app, host='127.0.0.1', port=PORT, log_level='warning'))
threading.Thread(target=server.run, daemon=True).start()
while not server.started:
    time.sleep(0.05)

base = f'http://127.0.0.1:{PORT}'
http = httpx.Client(base_url=base, headers={'Authorization': 'Bearer prueba'}, timeout=30)
for ruta in RUTAS:  # calentamiento
    http.get(ruta)


def una(ruta):
    t0 = time.perf_counter()
    r = http.get(ruta)
    return (time.perf_counter() - t0) * 1000, r.status_code


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, round(p / 100 * (len(xs) - 1)))]


print('ruta,usuarios,peticiones,errores,p50_ms,p95_ms,max_ms,peticiones_por_s')
filas = []
for ruta in RUTAS:
    for n in USUARIOS:
        total = n * POR_USUARIO
        t0 = time.perf_counter()
        with ThreadPoolExecutor(n) as pool:
            res = list(pool.map(una, [ruta] * total))
        dur = time.perf_counter() - t0
        ms = [m for m, _ in res]
        errores = sum(1 for _, s in res if s >= 400)
        fila = (ruta, n, total, errores, statistics.median(ms), pct(ms, 95), max(ms), total / dur)
        filas.append(fila)
        print('%s,%d,%d,%d,%.0f,%.0f,%.0f,%.1f' % fila)

# Costo de Supabase Auth (una consulta real de credenciales, con un correo inexistente)
auth = []
for _ in range(5):
    t0 = time.perf_counter()
    httpx.post(f'{base}/auth/login', json={'email': 'carga-inexistente@okami.test', 'password': 'x' * 12}, timeout=30)
    auth.append((time.perf_counter() - t0) * 1000)
print('auth_login_fallido_p50_ms,%.0f' % statistics.median(auth))
server.should_exit = True
