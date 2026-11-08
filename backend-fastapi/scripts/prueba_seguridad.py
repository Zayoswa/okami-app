"""Prueba de seguridad de la API y de Supabase, contra la base real.

Uso (desde backend-fastapi):  .venv\\Scripts\\python.exe scripts\\prueba_seguridad.py

Intenta lo que haría alguien malintencionado y comprueba que se rechaza:
  1. Usar Supabase directamente con la clave pública (la que podría ver cualquiera) para leer o escribir datos.
  2. Llamar a la API sin sesión o con un token inventado.
  3. Entrar a rutas de otro rol (tatuador -> gestión, recepción -> arriendos).
  4. Leer o cambiar reservas de otro tatuador (IDOR) y asignarse reservas ajenas.
  5. Escalar privilegios (recepción creando un admin) o colar campos extra en el cuerpo.
  6. Inyección SQL y textos gigantes en los campos y filtros.
  7. CORS desde un sitio ajeno y el registro de actividad, que no se puede editar ni borrar.
También informa (sin fallar) lo que conviene revisar: límite de intentos de login y cabeceras de seguridad.

No deja rastro: lo único que crea es una reserva de prueba (cliente "Prueba Seguridad", RUT 30.000.098-3, año 2031)
que se borra al final aunque algo falle; no escribe en el registro de Actividad.
"""
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402
from supabase import create_client  # noqa: E402
import main  # noqa: E402

RUT = '300000983'
db = main.client(admin=True)
api = TestClient(main.app)
resultados, avisos = [], []


def ok(nombre, condicion, detalle=''):
    resultados.append(bool(condicion))
    print(('  OK   ' if condicion else '  FALLA'), nombre, f'({detalle})' if detalle != '' else '')


def aviso(texto):
    avisos.append(texto)
    print('  AVISO', texto)


def como(usuario):
    main.app.dependency_overrides[main.get_current_user] = lambda: usuario


def sin_sesion():
    main.app.dependency_overrides.pop(main.get_current_user, None)


roles = {r['nombre'].strip().lower(): r['id'] for r in db.table('rol').select('id,nombre').execute().data}
usuarios = db.table('usuarios').select('id,nombre,rol,activo').eq('activo', True).execute().data
admin = next({'id': u['id'], 'name': u['nombre'], 'role': 'admin'} for u in usuarios if u['rol'] == roles['admin'])
tat = [{'id': u['id'], 'name': u['nombre'], 'role': 'tatuador'} for u in usuarios if u['rol'] == roles['tatuador']][:2]
if len(tat) < 2:
    sys.exit('Se necesitan dos tatuadores activos.')
A, B = tat
recepcion = {'id': B['id'], 'name': 'Recepción (simulada)', 'role': 'recepcion'}
puesto = next(p['id'] for p in db.table('puesto').select('id,tipo').order('id').execute().data if p['tipo'] == 'Rotativo')
FALSO = '11111111-1111-1111-1111-111111111111'


def reserva_body(tatuador_id, nombre='Prueba Seguridad', **extra):
    return {'clienteNombre': nombre, 'clienteRut': RUT, 'tatuadorId': tatuador_id, 'precio': 1000,
            'sesiones': [{'id': str(uuid.uuid4()), 'puestoId': puesto, 'fecha': '2031-03-10', 'horaInicio': '10:00',
                          'horaFin': '11:00', 'estado': 'Programada'}], **extra}


def limpiar():
    ids = [r['id'] for r in db.table('reservas').select('id').eq('cliente_rut', RUT).execute().data]
    if ids:
        db.table('reserva_sesiones').delete().in_('reserva', ids).execute()
        db.table('reservas').delete().in_('id', ids).execute()
    return len(ids)


with patch('main.log_event'):
    try:
        limpiar()
        print(f'Tatuadores de prueba: {A["name"]} (dueño) y {B["name"]} (otro) · admin: {admin["name"]}\n')

        # 1. Supabase directo con la clave pública ---------------------------------------------------
        print('1) Supabase directo con la clave pública (sin pasar por la API)')
        anon = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_PUBLISHABLE_KEY'])
        for tabla in ('usuarios', 'reservas', 'reserva_sesiones', 'pagos_arriendo', 'registro_actividad', 'modalidad_historial',
                      'puesto_titulares', 'rol', 'puesto', 'modalidad', 'modalidad_tarifas'):
            try:
                filas = anon.table(tabla).select('*').limit(5).execute().data
                ok(f'no puede leer {tabla}', not filas, f'{len(filas)} filas visibles' if filas else 'sin filas')
            except Exception as exc:  # noqa: BLE001 - un rechazo también es un OK
                ok(f'no puede leer {tabla}', True, f'rechazado: {getattr(exc, "code", type(exc).__name__)}')
        for tabla, fila in (('reservas', {'id': str(uuid.uuid4()), 'cliente_rut': RUT}),
                            ('pagos_arriendo', {'tatuador': A['id'], 'periodo': '2031-03-01', 'monto': 1}),
                            ('registro_actividad', {'categoria': 'reserva', 'accion': 'x', 'resumen': 'x'}),
                            ('usuarios', {'id': str(uuid.uuid4()), 'nombre': 'x', 'rol': roles['admin']})):
            try:
                anon.table(tabla).insert(fila).execute()
                ok(f'no puede escribir en {tabla}', False, 'la escritura se aceptó')
            except Exception as exc:  # noqa: BLE001
                ok(f'no puede escribir en {tabla}', True, f'rechazado: {getattr(exc, "code", type(exc).__name__)}')
        try:
            anon.table('usuarios').update({'rol': roles['admin']}).eq('id', A['id']).execute()
            cambiado = db.table('usuarios').select('rol').eq('id', A['id']).execute().data[0]['rol'] == roles['admin']
            ok('no puede hacerse admin cambiando su rol', not cambiado)
        except Exception as exc:  # noqa: BLE001
            ok('no puede hacerse admin cambiando su rol', True, f'rechazado: {getattr(exc, "code", type(exc).__name__)}')
        for funcion, params in (('okami_listar_reservas', {'p_actor': admin['id']}),
                                ('okami_guardar_reserva', {'p_actor': admin['id'], 'p_operacion': 'borrar', 'p_id': FALSO}),
                                ('okami_rol_reservas', {'p_actor': admin['id']})):
            try:
                anon.rpc(funcion, params).execute()
                ok(f'no puede ejecutar {funcion} haciéndose pasar por el admin', False, 'se ejecutó')
            except Exception as exc:  # noqa: BLE001
                ok(f'no puede ejecutar {funcion} haciéndose pasar por el admin', True, f'rechazado: {getattr(exc, "code", type(exc).__name__)}')

        # 2. API sin sesión o con token inventado -----------------------------------------------------
        print('\n2) API sin sesión o con un token inventado')
        sin_sesion()
        rutas = [(sorted(r.methods)[0], r.path) for r in main.app.routes
                 if getattr(r, 'methods', None) and r.path.startswith('/api')]
        abiertas = []
        for metodo, ruta in rutas:
            url = ruta.replace('{puesto_id}', '1').replace('{tatuador_id}', FALSO).replace('{user_id}', FALSO) \
                      .replace('{reservation_id}', FALSO).replace('{session_id}', FALSO).replace('{pago_id}', FALSO)
            for headers in ({}, {'Authorization': 'Bearer token-inventado'}):
                codigo = api.request(metodo, url, headers=headers, json={}).status_code
                if codigo != 401:
                    abiertas.append(f'{metodo} {url} -> {codigo}')
        ok(f'las {len(rutas)} rutas /api piden sesión (401 sin token y con token falso)', not abiertas, '; '.join(abiertas[:5]))
        ok('/auth/me sin sesión -> 401', api.get('/auth/me').status_code == 401)

        # 3. Rutas de otro rol --------------------------------------------------------------------------
        print('\n3) Rutas de otro rol')
        de_gestion = [('GET', '/api/usuarios/'), ('GET', '/api/rol/'), ('GET', '/api/modalidad/'), ('GET', '/api/puestos/estados'),
                      ('PATCH', '/api/puestos/1'), ('POST', '/api/puestos/1/titulares'), ('PATCH', f'/api/usuarios/{FALSO}/actividad'),
                      ('PATCH', f'/api/usuarios/{FALSO}/modalidad'), ('POST', '/api/usuarios/'), ('GET', '/api/actividad'),
                      ('GET', '/api/arriendos?mes=2031-03'), ('POST', '/api/arriendos/pagos'), ('GET', '/api/arriendos/historial?hasta=2031-03')]
        como(A)
        dejadas = [f'{m} {u} -> {c}' for m, u in de_gestion if (c := api.request(m, u, json={}).status_code) not in (403, 422)]
        ok('un tatuador no entra a ninguna ruta de gestión', not dejadas, '; '.join(dejadas))
        ok('un tatuador sí ve su propio arriendo', api.get('/api/arriendos/mio?mes=2031-03').status_code == 200)
        como(recepcion)
        solo_admin = [('GET', '/api/arriendos?mes=2031-03'), ('GET', '/api/arriendos/historial?hasta=2031-03'),
                      ('POST', '/api/arriendos/pagos'), ('DELETE', f'/api/arriendos/pagos/{FALSO}')]
        dejadas = [f'{m} {u} -> {c}' for m, u in solo_admin if (c := api.request(m, u, json={'tatuadorId': A['id'], 'periodo': '2031-03', 'monto': 1, 'pagadoEn': '2031-03-01'}).status_code) != 403]
        ok('recepción no entra a arriendos ni pagos', not dejadas, '; '.join(dejadas))

        # 4. Reservas de otro tatuador (IDOR) --------------------------------------------------------
        print('\n4) Reservas de otro tatuador')
        como(A)
        rid = str(uuid.uuid4())
        creada = api.post('/api/reservas', json={**reserva_body(A['id']), 'id': rid})
        ok('el dueño crea su reserva de prueba', creada.status_code == 201, creada.text[:120])
        sid = db.table('reserva_sesiones').select('id').eq('reserva', rid).execute().data[0]['id']
        como(B)
        vista = next((r for r in api.get('/api/reservas').json() if r['id'] == rid), {})
        ok('otro tatuador ve el horario ocupado, pero no el cliente, el RUT ni el precio',
           vista and 'clienteRut' not in vista and 'cliente' not in vista and 'precio' not in vista, sorted(vista.keys()))
        cuerpo = {k: v for k, v in reserva_body(A['id'], nombre='Cambiado Por Otro').items()}
        r = api.patch(f'/api/reservas/{rid}', json=cuerpo)
        ok('otro tatuador no puede editarla', r.status_code == 403, r.status_code)
        r = api.delete(f'/api/reservas/{rid}')
        ok('otro tatuador no puede borrarla', r.status_code == 403, r.status_code)
        r = api.patch(f'/api/reservas/{rid}/sesiones/{sid}', json={'estado': 'Cancelada'})
        ok('otro tatuador no puede cancelar su sesión', r.status_code == 403, r.status_code)
        intacta = db.table('reservas').select('cliente_nombre,archivada_en').eq('id', rid).execute().data[0]
        ok('la reserva sigue intacta', intacta['cliente_nombre'] == 'Prueba Seguridad' and not intacta['archivada_en'])
        r = api.post('/api/reservas', json={**reserva_body(A['id']), 'id': str(uuid.uuid4())})
        ok('un tatuador no puede crear reservas a nombre de otro', r.status_code == 403, r.status_code)

        # 5. Escalada de privilegios y campos extra --------------------------------------------------
        print('\n5) Escalada de privilegios')
        como(recepcion)
        r = api.post('/api/usuarios/', json={'email': 'escalada@okami.test', 'nombre': 'Escalada', 'password': 'clave-larga-123',
                                             'rol': roles['admin']})
        ok('recepción no puede crear un admin', r.status_code == 403, r.status_code)
        ok('no se creó ninguna cuenta', not db.table('usuarios').select('id').eq('nombre', 'Escalada').execute().data)
        como(B)
        r = api.patch(f'/api/reservas/{rid}', json={**cuerpo, 'p_actor': A['id'], 'role': 'admin', 'user': A['id']})
        ok('mandar p_actor, role o user en el cuerpo no da permisos', r.status_code == 403, r.status_code)

        # 6. Inyección y textos gigantes ------------------------------------------------------------
        print('\n6) Inyección SQL y textos gigantes')
        como(A)
        r = api.post('/api/reservas', json={**reserva_body(A['id'], nombre="Robert'); DROP TABLE reservas;--"), 'id': str(uuid.uuid4())})
        ok('un nombre con SQL se rechaza (solo letras)', r.status_code == 422, r.json().get('detail'))
        r = api.post('/api/reservas', json={**reserva_body(A['id'], nombre='<script>alert(1)</script>'), 'id': str(uuid.uuid4())})
        ok('un nombre con HTML/JS se rechaza', r.status_code == 422, r.json().get('detail'))
        r = api.post('/api/reservas', json={**reserva_body(A['id'], nombre='A' * 5000), 'id': str(uuid.uuid4())})
        ok('un nombre de 5.000 letras se rechaza', r.status_code == 422)
        r = api.post('/api/reservas', json={**reserva_body(A['id']), 'id': str(uuid.uuid4()), 'precio': -1})
        ok('un precio negativo se rechaza', r.status_code == 422)
        como(admin)
        for filtro in ("%' OR 1=1 --", 'x),or(id.gt.0', "'; DELETE FROM registro_actividad; --", '*' * 300):
            r = api.get('/api/actividad', params={'q': filtro, 'limite': 5})
            ok(f'el buscador de Actividad aguanta {filtro[:24]!r}', r.status_code in (200, 422), r.status_code)
        ok('la tabla reservas sigue existiendo', isinstance(db.table('reservas').select('id').limit(1).execute().data, list))

        # 7. CORS y registro de actividad ------------------------------------------------------------
        print('\n7) CORS y registro de actividad')
        sin_sesion()
        malo = api.options('/api/reservas', headers={'Origin': 'https://sitio-malicioso.example', 'Access-Control-Request-Method': 'POST'})
        ok('un sitio ajeno no recibe permiso CORS', 'access-control-allow-origin' not in {k.lower() for k in malo.headers})
        bueno = api.options('/api/reservas', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST'})
        ok('la app (localhost:5173) sí lo recibe', bueno.headers.get('access-control-allow-origin') == 'http://localhost:5173')
        fila = db.table('registro_actividad').select('id,resumen').order('id').limit(1).execute().data
        if fila:
            for accion, fn in (('editar', lambda: db.table('registro_actividad').update({'resumen': 'alterado'}).eq('id', fila[0]['id']).execute()),
                               ('borrar', lambda: db.table('registro_actividad').delete().eq('id', fila[0]['id']).execute())):
                try:
                    fn()
                    sigue = db.table('registro_actividad').select('resumen').eq('id', fila[0]['id']).execute().data
                    ok(f'ni el backend puede {accion} el registro de actividad', sigue and sigue[0]['resumen'] == fila[0]['resumen'])
                except Exception as exc:  # noqa: BLE001
                    ok(f'ni el backend puede {accion} el registro de actividad', True, f'rechazado: {getattr(exc, "code", type(exc).__name__)}')

        # Avisos (no fallan la prueba) -----------------------------------------------------------------
        print('\n8) Para revisar (no fallan la prueba)')
        codigos = [api.post('/auth/login', json={'email': 'nadie-existe@okami.test', 'password': f'mala-{i}'}).status_code for i in range(6)]
        if 429 not in codigos:
            aviso(f'login: 6 intentos fallidos seguidos no se frenan en la API ({codigos}); solo queda el límite propio de Supabase Auth')
        cabeceras = {k.lower() for k in api.get('/auth/me').headers}
        faltan = [h for h in ('x-content-type-options', 'x-frame-options', 'content-security-policy', 'strict-transport-security') if h not in cabeceras]
        if faltan:
            aviso('la API no envía cabeceras de seguridad: ' + ', '.join(faltan) + ' (se suelen poner en el servidor web al desplegar)')
    finally:
        main.app.dependency_overrides.clear()
        print(f'\nLimpieza: {limpiar()} reservas de prueba borradas.')

total, bien = len(resultados), sum(resultados)
print(f'\nResultado: {bien}/{total} comprobaciones OK · {len(avisos)} avisos')
sys.exit(0 if bien == total else 1)
