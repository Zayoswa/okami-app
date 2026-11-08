"""Prueba de concurrencia: varios usuarios guardando reservas al mismo tiempo contra la base real (Supabase).

Uso (desde backend-fastapi):  .venv\\Scripts\\python.exe scripts\\prueba_concurrencia.py

Cada escenario lanza las peticiones en hilos que arrancan a la vez (threading.Barrier) y pasan por el mismo
camino que la API: main.write_reservation -> validaciones de Python -> okami_guardar_reserva en Postgres.
Lo que se comprueba es que nunca quedan dos sesiones en el mismo puesto y horario, ni un tatuador en dos
puestos a la vez, aunque las peticiones lleguen juntas.

Las ediciones llevan la versión de la reserva (como el formulario real): si otra persona la cambió, se rechazan.

No deja rastro: no escribe en el registro de Actividad (log_event se desactiva) y al final borra todas las
reservas de prueba (cliente "Prueba Concurrencia", RUT 30.000.099-1), con sus sesiones, aunque algo falle.
Usa fechas de 2031 para no cruzarse con la agenda real.
"""
import sys
import threading
import time
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

CLIENTE = 'Prueba Concurrencia'
RUT = '300000991'
FECHA = '2031-02-03'
db = main.client(admin=True)
resultados = []


def ok(nombre, condicion, detalle=''):
    resultados.append(bool(condicion))
    print(('  OK   ' if condicion else '  FALLA'), nombre, f'({detalle})' if detalle != '' else '')


def tatuadores(n):
    rows = db.table('usuarios').select('id,nombre,rol,activo').eq('activo', True).execute().data
    roles = {r['id']: r['nombre'].strip().lower() for r in db.table('rol').select('id,nombre').execute().data}
    lista = [r for r in rows if roles.get(r['rol']) == 'tatuador']
    if len(lista) < n:
        sys.exit(f'Se necesitan {n} tatuadores activos y hay {len(lista)}.')
    return [{'id': r['id'], 'name': r['nombre'], 'role': 'tatuador'} for r in lista[:n]]


def puestos_rotativos(n):
    estados = {r['id']: r['estado'].strip().lower() for r in db.table('puesto_estados').select('id,estado').execute().data}
    rows = [p for p in db.table('puesto').select('id,nombre,tipo,estado_id').order('id').execute().data
            if p['tipo'] == 'Rotativo' and estados.get(p['estado_id']) == 'habilitado']
    if len(rows) < n:
        sys.exit(f'Se necesitan {n} puestos Rotativo habilitados y hay {len(rows)}.')
    return rows[:n]


def reserva(user, puesto_id, hora, precio=10000, reserva_id=None, sesion_id=None, version=None):
    return main.ReservationCreate(
        id=reserva_id or str(uuid.uuid4()), clienteNombre=CLIENTE, clienteRut=RUT, tatuadorId=user['id'], precio=precio, version=version,
        sesiones=[dict(id=sesion_id or str(uuid.uuid4()), puestoId=puesto_id, fecha=FECHA,
                       horaInicio=f'{hora:02d}:00', horaFin=f'{hora + 1:02d}:00', estado='Programada')])


def a_la_vez(tareas):
    """Ejecuta las tareas [(operacion, id, datos, usuario)] en hilos que arrancan juntos. Devuelve [(ok, detalle, ms)]."""
    barrera = threading.Barrier(len(tareas))
    salida = [None] * len(tareas)

    def correr(i, operacion, rid, datos, usuario):
        barrera.wait()
        inicio = time.perf_counter()
        try:
            main.write_reservation(operacion, rid or datos.id, datos, usuario)
            salida[i] = (True, 'guardada', (time.perf_counter() - inicio) * 1000)
        except main.HTTPException as exc:
            causa = exc.__cause__
            extra = f' [Postgres {getattr(causa, "code", "?")}: {str(getattr(causa, "message", causa))[:120]}]' if exc.status_code >= 500 and causa else ''
            salida[i] = (False, f'{exc.status_code}: {exc.detail}{extra}', (time.perf_counter() - inicio) * 1000)
        except Exception as exc:  # noqa: BLE001 - se informa como fallo de la prueba
            salida[i] = (False, f'ERROR {exc!r}', (time.perf_counter() - inicio) * 1000)

    hilos = [threading.Thread(target=correr, args=(i, *t)) for i, t in enumerate(tareas)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    return salida


def resumen(salida):
    return ' | '.join(f"{'✓' if s[0] else '✗'} {s[1][:220]} {s[2]:.0f} ms" for s in salida)


def sesiones_activas(puesto_id=None, tatuador_id=None, hora=None):
    """Sesiones de prueba no canceladas, filtradas por puesto, tatuador u hora de inicio."""
    rows = db.rpc('okami_listar_reservas', {'p_actor': ADMIN}).execute().data or []
    out = []
    for r in rows:
        if r.get('clienteRut', '').replace('.', '').replace('-', '').upper() != RUT and r.get('cliente') != CLIENTE:
            continue
        for s in r.get('sesiones') or []:
            if s['estado'] == 'Cancelada' or s['fecha'] != FECHA:
                continue
            if puesto_id is not None and str(s['puestoId']) != str(puesto_id):
                continue
            if tatuador_id is not None and str(r['tatuadorId']) != str(tatuador_id):
                continue
            if hora is not None and s['horaInicio'] != f'{hora:02d}:00':
                continue
            out.append((r['id'], s))
    return out


def limpiar():
    ids = [r['id'] for r in db.table('reservas').select('id').eq('cliente_rut', RUT).execute().data]
    if ids:
        db.table('reserva_sesiones').delete().in_('reserva', ids).execute()
        db.table('reservas').delete().in_('id', ids).execute()
    quedan = db.table('reservas').select('id').eq('cliente_rut', RUT).execute().data
    return len(ids), len(quedan)


ADMIN = db.table('usuarios').select('id').eq('rol', next(r['id'] for r in db.table('rol').select('id,nombre').execute().data
                                                         if r['nombre'].strip().lower() == 'admin')).limit(1).execute().data[0]['id']

def version_actual(rid):
    """La versión que entrega GET /api/reservas para esa reserva (la que tendría un formulario recién abierto)."""
    return main.reservation_version(main.reservation_snapshot({'id': ADMIN}, rid))


with patch('main.log_event'):
    try:
        borradas, _ = limpiar()
        if borradas:
            print(f'(Se borraron {borradas} reservas de una prueba anterior)')
        artistas = tatuadores(4)
        puestos = puestos_rotativos(3)
        p1, p2, p3 = (p['id'] for p in puestos)
        a, b = artistas[0], artistas[1]
        print(f"Tatuadores: {', '.join(t['name'] for t in artistas)} · Puestos: {', '.join(p['nombre'] for p in puestos)} · Fecha {FECHA}\n")

        print('1) Dos tatuadores reservan el mismo puesto y horario al mismo tiempo (5 rondas)')
        for ronda in range(5):
            hora = 8 + ronda
            salida = a_la_vez([('crear', None, reserva(a, p1, hora), a), ('crear', None, reserva(b, p1, hora), b)])
            ganadas = sum(s[0] for s in salida)
            rechazo_claro = all('ocupado' in s[1] for s in salida if not s[0])
            ok(f'ronda {ronda + 1}: solo una se guarda y la otra recibe "ocupado"', ganadas == 1 and rechazo_claro, resumen(salida))
            ok(f'ronda {ronda + 1}: en la base queda una sola sesión en ese horario', len(sesiones_activas(p1, hora=hora)) == 1)

        print('\n2) El mismo tatuador reserva dos puestos distintos a la misma hora, a la vez (3 rondas)')
        for ronda in range(3):
            hora = 14 + ronda
            salida = a_la_vez([('crear', None, reserva(a, p2, hora), a), ('crear', None, reserva(a, p3, hora), a)])
            ok(f'ronda {ronda + 1}: solo una se guarda (no puede estar en dos puestos)', sum(s[0] for s in salida) == 1, resumen(salida))
            ok(f'ronda {ronda + 1}: en la base el tatuador tiene una sola sesión a esa hora', len(sesiones_activas(tatuador_id=a['id'], hora=hora)) == 1)

        print('\n3) Carga: 4 tatuadores × 2 peticiones = 8 peticiones al mismo puesto y horario')
        hora = 19
        tareas = [('crear', None, reserva(t, p2, hora), t) for t in artistas for _ in range(2)]
        salida = a_la_vez(tareas)
        tiempos = sorted(s[2] for s in salida)
        ok('solo 1 de 8 se guarda', sum(s[0] for s in salida) == 1, f'{sum(s[0] for s in salida)} guardadas')
        ok('ninguna falla con un error inesperado (todas son "guardada" u "ocupado")',
           all(s[0] or 'ocupado' in s[1] or 'otra sesión' in s[1] for s in salida))
        ok('en la base queda una sola sesión', len(sesiones_activas(p2, hora=hora)) == 1)
        print(f'     tiempos: el más rápido {tiempos[0]:.0f} ms, el más lento {tiempos[-1]:.0f} ms')

        print('\n4) Dos tatuadores reservan puestos distintos a la misma hora (no chocan)')
        hora = 21
        salida = a_la_vez([('crear', None, reserva(a, p1, hora), a), ('crear', None, reserva(b, p3, hora), b)])
        ok('las dos se guardan (el bloqueo no rechaza reservas válidas)', all(s[0] for s in salida), resumen(salida))

        print('\n5) Dos personas abren la misma reserva y guardan al mismo tiempo (3 rondas)')
        admin = {'id': ADMIN, 'name': 'Admin', 'role': 'admin'}
        for ronda in range(3):
            hora, puesto = (22, 6, 5)[ronda], p1  # horas libres para el tatuador b
            rid, sid = str(uuid.uuid4()), str(uuid.uuid4())
            main.write_reservation('crear', rid, reserva(b, puesto, hora, reserva_id=rid, sesion_id=sid), b)
            v = version_actual(rid)  # los dos formularios se abrieron con la misma versión
            salida = a_la_vez([('editar', rid, reserva(b, puesto, hora, precio=11111, reserva_id=rid, sesion_id=sid, version=v), b),
                               ('editar', rid, reserva(b, puesto, hora, precio=22222, reserva_id=rid, sesion_id=sid, version=v), admin)])
            final = db.table('reservas').select('precio').eq('id', rid).execute().data[0]['precio']
            ganadora = next((p for (okk, _, _), p in zip(salida, (11111, 22222)) if okk), None)
            ok(f'ronda {ronda + 1}: se guarda una y la otra recibe "cambió mientras la editabas"',
               sum(x[0] for x in salida) == 1 and all('cambió mientras la editabas' in x[1] for x in salida if not x[0]), resumen(salida))
            ok(f'ronda {ronda + 1}: la reserva queda con el precio de la edición que se guardó', final == ganadora,
               f'precio final ${final:,}'.replace(',', '.'))

        print('\n6) Alguien guarda un formulario desactualizado (otra persona cambió la reserva antes)')
        rid, sid = str(uuid.uuid4()), str(uuid.uuid4())
        main.write_reservation('crear', rid, reserva(a, p3, 7, reserva_id=rid, sesion_id=sid), a)
        vieja = version_actual(rid)
        main.write_reservation('editar', rid, reserva(a, p3, 7, precio=15000, reserva_id=rid, sesion_id=sid, version=vieja), admin)
        salida = a_la_vez([('editar', rid, reserva(a, p3, 7, precio=30000, reserva_id=rid, sesion_id=sid, version=vieja), a)])
        final = db.table('reservas').select('precio').eq('id', rid).execute().data[0]['precio']
        ok('el formulario viejo se rechaza', not salida[0][0] and 'cambió mientras la editabas' in salida[0][1], resumen(salida))
        ok('se conserva el cambio de la otra persona', final == 15000, f'precio final ${final:,}'.replace(',', '.'))
        nueva = version_actual(rid)
        salida = a_la_vez([('editar', rid, reserva(a, p3, 7, precio=30000, reserva_id=rid, sesion_id=sid, version=nueva), a)])
        ok('al reabrir el formulario (versión nueva) sí se guarda', salida[0][0], resumen(salida))
    finally:
        borradas, quedan = limpiar()
        print(f'\nLimpieza: {borradas} reservas de prueba borradas, quedan {quedan}.')

total, bien = len(resultados), sum(resultados)
print(f'\nResultado: {bien}/{total} comprobaciones OK')
sys.exit(0 if bien == total else 1)
