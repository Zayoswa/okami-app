"""Inspección de solo lectura: muestra estructura y recuentos, nunca claves ni registros."""
from pathlib import Path
from dotenv import dotenv_values
import httpx

values = dotenv_values(Path(__file__).resolve().parents[1] / '.env')
base = values.get('SUPABASE_URL', '').rstrip('/')
key = values.get('SUPABASE_SECRET_KEY', '')
if not base or not key:
    raise SystemExit('Falta URL o clave secreta del backend.')

with httpx.Client(timeout=15, headers={'apikey': key}) as client:
    response = client.get(base + '/rest/v1/', headers={'Accept': 'application/openapi+json'})
    print('Metadatos REST: HTTP', response.status_code)
    definitions = response.json().get('definitions', {}) if response.is_success else {}
    print('Tablas/vistas expuestas:', ', '.join(sorted(definitions)) or 'metadatos no disponibles')
    for table in ('usuarios', 'rol', 'modalidad', 'reservas', 'espacio', 'cliente'):
        definition = definitions.get(table, {})
        print('\nESTRUCTURA', table)
        required = definition.get('required', [])
        for name, prop in definition.get('properties', {}).items():
            print(' ', name, '|', prop.get('format', prop.get('type', '?')), '| requerido:', name in required, '| default:', prop.get('default', '-'))
        r = client.get(base + '/rest/v1/' + table, params={'select': '*', 'limit': '0'}, headers={'Prefer': 'count=exact'})
        print(' Lectura:', r.status_code, '| rango/recuento:', r.headers.get('content-range', '-'))
        if not r.is_success:
            print(' Código:', r.json().get('code', ''))
    for table, fields in [('usuarios', 'id,rol'), ('rol', 'id,nombre')]:
        r = client.get(base + '/rest/v1/' + table, params={'select': fields, 'limit': '100'})
        if not r.is_success:
            print('Resumen no disponible:', table, r.status_code)
            continue
        rows = r.json()
        if table == 'usuarios':
            users = rows
            print('\nPerfiles consultados (máximo 100):', len(rows))
        else:
            roles = {x['id']: x['nombre'].strip().lower() for x in rows}
            print('Nombres de roles:', ', '.join(sorted(roles.values())))
            if 'users' in locals():
                print('Perfiles admin:', sum(roles.get(u.get('rol')) == 'admin' for u in users))
                print('Perfiles tatuador:', sum(roles.get(u.get('rol')) == 'tatuador' for u in users))
    # Comprueba vinculación con Auth sin imprimir identidades ni correos.
    r = client.get(base + '/auth/v1/admin/users', params={'page': '1', 'per_page': '100'})
    print('Consulta administrativa Auth: HTTP', r.status_code)
    if r.is_success:
        accounts = r.json().get('users', [])
        ids = {u['id'] for u in accounts}
        print('Cuentas Auth consultadas (máximo 100):', len(accounts))
        if 'users' in locals():
            print('Perfiles vinculados en esta muestra:', sum(u['id'] in ids for u in users))
        else:
            print('Vinculación de perfiles: no comprobable por permisos insuficientes.')
print('\nLos metadatos REST no certifican triggers, políticas RLS ni privilegios SQL.')
