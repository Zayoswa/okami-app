import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
import main


class AccessTests(unittest.TestCase):
    @patch('main.client')
    def test_puestos_requires_session_and_serves_both_roles(self, client):
        self.assertEqual(self.api.get('/api/puestos').status_code, 401)
        rows = {
            'puesto_estados': [{'id': 1, 'estado': 'Habilitado'}, {'id': 2, 'estado': 'Mantenimiento'}],
            'puesto': [{'id': 10, 'nombre': 'Puesto 10', 'estado_id': 2, 'tipo': 'Rotativo'},
                       {'id': 2, 'nombre': 'Puesto 2', 'estado_id': 1, 'tipo': 'Compartido'}],
            'puesto_titulares': [{'puesto': 2, 'tatuador': 'u-b'}, {'puesto': 2, 'tatuador': 'u-a'}],
        }
        users = [{'id': 'u-a', 'nombre': 'Ana'}, {'id': 'u-b', 'nombre': 'Bruno'}]

        def table(name):
            if name == 'usuarios':
                return Mock(**{'select.return_value.in_.return_value.execute.return_value.data': users})
            return Mock(**{'select.return_value.execute.return_value.data': rows[name]})
        client.return_value.table.side_effect = table
        for role in ('admin', 'tatuador'):
            with self.subTest(role=role):
                main.app.dependency_overrides[main.get_current_user] = lambda: {'role':role}
                response = self.api.get('/api/puestos')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), [
                    {'id': '2', 'nombre': 'Puesto 2', 'estado': 'Habilitado', 'estadoId': 1, 'disponible': True,
                     'tipo': 'Compartido', 'titulares': [{'id': 'u-a', 'nombre': 'Ana'}, {'id': 'u-b', 'nombre': 'Bruno'}]},
                    {'id': '10', 'nombre': 'Puesto 10', 'estado': 'Mantenimiento', 'estadoId': 2, 'disponible': False,
                     'tipo': 'Rotativo', 'titulares': []},
                ])

    @patch('main.client')
    def test_only_admin_changes_puesto_state(self, client):
        self.assertEqual(self.api.patch('/api/puestos/3', json={'estadoId': 2}).status_code, 401)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'tatuador'}
        self.assertEqual(self.api.patch('/api/puestos/3', json={'estadoId': 2}).status_code, 403)
        self.assertEqual(self.api.get('/api/puestos/estados').status_code, 403)
        client.assert_not_called()
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'admin'}
        table = client.return_value.table.return_value
        table.select.return_value.eq.return_value.execute.return_value.data = [{'id': 2}]
        table.update.return_value.eq.return_value.execute.return_value.data = [{'id': 3}]
        self.assertEqual(self.api.patch('/api/puestos/3', json={'estadoId': 2}).status_code, 200)
        table.update.assert_called_with({'estado_id': 2})
        table.select.return_value.eq.return_value.execute.return_value.data = []
        self.assertEqual(self.api.patch('/api/puestos/3', json={'estadoId': 99}).status_code, 422)

    @patch('main.client')
    def test_admin_changes_puesto_type_and_type_rules_return_409(self, client):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'tatuador'}
        self.assertEqual(self.api.patch('/api/puestos/3', json={'tipo': 'Full'}).status_code, 403)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'admin'}
        self.assertEqual(self.api.patch('/api/puestos/3', json={}).status_code, 422)
        self.assertEqual(self.api.patch('/api/puestos/3', json={'tipo': 'Vip'}).status_code, 422)
        table = client.return_value.table.return_value
        table.update.return_value.eq.return_value.execute.return_value.data = [{'id': 3}]
        self.assertEqual(self.api.patch('/api/puestos/3', json={'tipo': 'Full'}).status_code, 200)
        table.update.assert_called_with({'tipo': 'Full'})
        message = 'Puesto 3 tiene 2 titular(es) y un puesto Full admite 1.'
        table.update.return_value.eq.return_value.execute.side_effect = APIError({'code': 'P0001', 'message': message})
        response = self.api.patch('/api/puestos/3', json={'tipo': 'Full'})
        self.assertEqual((response.status_code, response.json()['detail']), (409, message))

    @patch('main.client')
    def test_titular_must_be_active_artist_without_other_puesto(self, client):
        uid = '11111111-1111-1111-1111-111111111111'
        path = '/api/puestos/3/titulares'
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'tatuador'}
        self.assertEqual(self.api.post(path, json={'tatuadorId': uid}).status_code, 403)
        self.assertEqual(self.api.delete(f'{path}/{uid}').status_code, 403)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'admin'}

        def setup(user, role, current, other=None):
            data = {
                'puesto': [[{'id': 3, 'nombre': 'Puesto 3', 'tipo': 'Full'}]] + ([other] if other else []),
                'usuarios': [user], 'rol': [role], 'puesto_titulares': [current],
            }
            pending = {name: iter(values) for name, values in data.items()}
            modalities = [{'id': 1, 'nombre': 'Full'}, {'id': 2, 'nombre': 'Rotativo'}]

            def table(name):
                mock = Mock()
                if name == 'modalidad':
                    mock.select.return_value.execute.return_value = SimpleNamespace(data=modalities)
                    return mock
                values = pending[name]
                mock.select.return_value.eq.return_value.execute.side_effect = lambda: SimpleNamespace(data=next(values))
                mock.insert.return_value.execute.return_value = SimpleNamespace(data=[{}])
                return mock
            client.return_value.table.side_effect = table
            return data

        artist = [{'id': uid, 'nombre': 'Ana', 'rol': 2, 'activo': True}]
        setup(artist, [{'nombre': 'Admin'}], [])
        self.assertEqual(self.api.post(path, json={'tatuadorId': uid}).status_code, 422)
        setup([{**artist[0], 'activo': False}], [{'nombre': 'Tatuador'}], [])
        self.assertEqual(self.api.post(path, json={'tatuadorId': uid}).status_code, 422)
        setup(artist, [{'nombre': 'Tatuador'}], [{'puesto': 8}], [{'nombre': 'Puesto 8'}])
        response = self.api.post(path, json={'tatuadorId': uid})
        self.assertEqual(response.status_code, 409)
        self.assertIn('Puesto 8', response.json()['detail'])
        # La modalidad debe coincidir con el tipo del puesto (Full).
        setup([{**artist[0], 'modalidad': 2}], [{'nombre': 'Tatuador'}], [])
        response = self.api.post(path, json={'tatuadorId': uid})
        self.assertEqual(response.status_code, 422)
        self.assertIn('modalidad Full', response.json()['detail'])
        setup([{**artist[0], 'modalidad': None}], [{'nombre': 'Tatuador'}], [])
        self.assertIn('no tiene modalidad', self.api.post(path, json={'tatuadorId': uid}).json()['detail'])
        setup([{**artist[0], 'modalidad': 1}], [{'nombre': 'Tatuador'}], [])
        self.assertEqual(self.api.post(path, json={'tatuadorId': uid}).status_code, 201)

    @patch('main.client')
    def test_removing_missing_titular_is_404(self, client):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role': 'admin'}
        query = client.return_value.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute
        query.return_value.data = []
        uid = '11111111-1111-1111-1111-111111111111'
        self.assertEqual(self.api.delete(f'/api/puestos/3/titulares/{uid}').status_code, 404)
        query.return_value.data = [{'puesto': 3}]
        self.assertEqual(self.api.delete(f'/api/puestos/3/titulares/{uid}').status_code, 200)

    @patch.dict('os.environ', {'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_SECRET_KEY': 'sb_secret_example'})
    def test_supabase_client_options_are_compatible(self):
        # Construye el cliente real sin enviar solicitudes: detecta opciones incompatibles.
        db = main.client(admin=True)
        self.assertIsNotNone(db.auth)
        self.assertIsNotNone(db.table('usuarios'))

    def setUp(self):
        self.api = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_anonymous_cannot_read_or_invite(self):
        for method, path, body in [('GET', '/api/usuarios/', None), ('POST', '/api/usuarios/invitaciones', {'nombre':'Artista', 'email':'a@example.com'})]:
            r = self.api.request(method, path, json=body)
            self.assertEqual(r.status_code, 401)

    def test_artist_cannot_administer(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id':'artist', 'role':'tatuador'}
        self.assertEqual(self.api.get('/api/usuarios/').status_code, 403)
        self.assertEqual(self.api.post('/api/usuarios/invitaciones', json={'nombre':'A', 'email':'a@example.com'}).status_code, 403)
        self.assertEqual(self.api.patch('/api/usuarios/11111111-1111-1111-1111-111111111111/actividad', json={'activo':False}).status_code, 403)

    @patch('main.client')
    def test_invalid_token(self, client):
        client.return_value.auth.get_user.side_effect = ValueError('expired')
        self.assertEqual(self.api.get('/auth/me', headers={'Authorization':'Bearer invalid'}).status_code, 401)

    @patch('main.client')
    def test_inactive_profile_denied(self, client):
        client.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{'activo':False}]
        with self.assertRaises(main.HTTPException) as ctx:
            main.profile('inactive')
        self.assertEqual(ctx.exception.status_code, 403)

    @patch('main.client')
    def test_role_comes_from_database(self, client):
        query = client.return_value.table.return_value.select.return_value.eq.return_value.execute
        query.side_effect = [SimpleNamespace(data=[{'id':'real-id','nombre':'Dueño','rol':3,'activo':True}]), SimpleNamespace(data=[{'nombre':'Admin'}])]
        self.assertEqual(main.profile('real-id'), {'id':'real-id','name':'Dueño','role':'admin'})

    @patch('main.client')
    def test_mock_password_no_longer_bypasses_auth(self, client):
        client.return_value.auth.sign_in_with_password.side_effect = ValueError('invalid')
        r = self.api.post('/auth/login', json={'email':'admin@okami.cl','password':'admin'})
        self.assertEqual(r.status_code, 401)

    @patch.dict('os.environ', {'INVITE_REDIRECT_URL':'http://localhost:5173/invitacion'})
    @patch('main.client')
    def test_invite_does_not_assign_admin(self, client):
        main.app.dependency_overrides[main.require_staff] = lambda: {'role':'admin'}
        r = self.api.post('/api/usuarios/invitaciones', json={'nombre':' Artista ', 'email':'artist@example.com','role':'admin'})
        self.assertEqual(r.status_code, 201)
        args = client.return_value.auth.admin.invite_user_by_email.call_args.args
        self.assertEqual(args[1]['data'], {'nombre':'Artista', 'modalidad':None})

    @patch('main.client')
    def test_admin_cannot_disable_other_admin(self, client):
        main.app.dependency_overrides[main.require_staff] = lambda: {'role':'admin'}
        query = client.return_value.table.return_value.select.return_value.eq.return_value.execute
        query.side_effect = [SimpleNamespace(data=[{'id':'target','rol':1}]), SimpleNamespace(data=[{'nombre':'admin'}])]
        r = self.api.patch('/api/usuarios/11111111-1111-1111-1111-111111111111/actividad', json={'activo':False})
        self.assertEqual(r.status_code, 403)
        client.return_value.table.return_value.update.assert_not_called()

    def test_password_policy(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'role':'tatuador'}
        main.app.dependency_overrides[main.token] = lambda: 'verified-token'
        self.assertEqual(self.api.post('/auth/password', json={'password':'short'}).status_code, 422)

    @patch.dict('os.environ', {'SUPABASE_SECRET_KEY': ''})
    def test_missing_server_key_returns_configuration_error(self):
        r = self.api.post('/auth/login', json={'email':'owner@example.com','password':'example-password'})
        self.assertEqual(r.status_code, 503)
        self.assertIn('SUPABASE_SECRET_KEY', r.json()['detail'])

    @patch('main.client')
    def test_login_reads_name_role_and_activation_from_real_profile(self, client):
        db = client.return_value
        db.auth.sign_in_with_password.return_value = SimpleNamespace(
            user=SimpleNamespace(id='auth-uuid'),
            session=SimpleNamespace(access_token='access', refresh_token='refresh'))
        query = db.table.return_value.select.return_value.eq
        query.return_value.execute.side_effect = [
            SimpleNamespace(data=[{'id':'auth-uuid','nombre':'Dueño real','rol':7,'activo':True}]),
            SimpleNamespace(data=[{'nombre':'Admin'}])]
        r = self.api.post('/auth/login', json={'email':'owner@example.com','password':'example-password'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['user'], {'id':'auth-uuid','name':'Dueño real','role':'admin'})
        db.table.assert_any_call('usuarios')
        query.assert_any_call('id', 'auth-uuid')

    @patch('main.client')
    def test_auth_account_without_profile_is_denied(self, client):
        client.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
        with self.assertRaises(main.HTTPException) as ctx:
            main.profile('auth-uuid')
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn('usuarios', ctx.exception.detail)

    @patch('main.client')
    def test_refresh_checks_profile_again(self, client):
        client.return_value.auth.refresh_session.return_value = SimpleNamespace(
            user=SimpleNamespace(id='inactive'),
            session=SimpleNamespace(access_token='new', refresh_token='new-refresh'))
        client.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{'activo':False}]
        self.assertEqual(self.api.post('/auth/refresh', json={'refresh_token':'old'}).status_code, 403)

    @patch.dict('os.environ', {'INVITE_REDIRECT_URL':'http://localhost:5173/invitacion'})
    @patch('main.client')
    def test_failed_invitation_is_not_reported_as_success(self, client):
        main.app.dependency_overrides[main.require_staff] = lambda: {'role':'admin'}
        client.return_value.auth.admin.invite_user_by_email.side_effect = ValueError('SMTP error')
        r = self.api.post('/api/usuarios/invitaciones', json={'nombre':'Artista','email':'a@example.com'})
        self.assertEqual(r.status_code, 400)

if __name__ == '__main__':
    unittest.main()


class RegisterTests(unittest.TestCase):
    """Registro manual de usuarios (POST /api/usuarios/)."""

    def setUp(self):
        self.api = TestClient(main.app)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'a', 'role': 'admin'}
        self.body = {'email': 'Nuevo@Estudio.cl', 'nombre': '  Ana   Pérez ', 'password': 'una-clave-segura', 'rol': 2, 'modalidad': 1}

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def fake_db(self, client, created_profile=True, auth_error=None):
        db = client.return_value
        tables = {'rol': [{'id': 1, 'nombre': 'Admin'}, {'id': 2, 'nombre': 'Tatuador'}],
                  'modalidad': [{'id': 1, 'nombre': 'Full'}]}

        def table(name):
            mock = Mock()
            if name in tables:
                mock.select.return_value.execute.return_value = SimpleNamespace(data=tables[name])
            mock.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[{'id': 'u'}] if created_profile else [])
            mock.insert.return_value.execute.return_value = SimpleNamespace(data=[{}])
            self.tables[name] = mock
            return mock
        self.tables = {}
        db.table.side_effect = table
        if auth_error:
            db.auth.admin.create_user.side_effect = Exception(auth_error)
        else:
            db.auth.admin.create_user.return_value = SimpleNamespace(user=SimpleNamespace(id='u'))
        return db

    def test_only_admins_register(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 't', 'role': 'tatuador'}
        self.assertEqual(self.api.post('/api/usuarios/', json=self.body).status_code, 403)

    @patch('main.client')
    def test_creates_confirmed_account_and_adjusts_the_profile(self, client):
        db = self.fake_db(client)
        response = self.api.post('/api/usuarios/', json=self.body)
        self.assertEqual(response.status_code, 201, response.text)
        sent = db.auth.admin.create_user.call_args.args[0]
        self.assertEqual((sent['email'], sent['email_confirm'], sent['user_metadata']), ('nuevo@estudio.cl', True, {'nombre': 'Ana Pérez', 'modalidad': 1}))
        self.tables['usuarios'].update.assert_called_with({'nombre': 'Ana Pérez', 'rol': 2, 'modalidad': 1, 'activo': True})
        self.assertIn('Ya puede iniciar sesión', response.json()['message'])

    @patch('main.client')
    def test_without_the_auth_trigger_the_profile_is_inserted(self, client):
        # Si se borró el trigger okami_nuevo_usuario, no hay perfil que actualizar: se inserta.
        self.fake_db(client, created_profile=False)
        response = self.api.post('/api/usuarios/', json={**self.body, 'activo': True})
        self.assertEqual(response.status_code, 201, response.text)
        self.tables['usuarios'].insert.assert_called_with({'id': 'u', 'nombre': 'Ana Pérez', 'rol': 2, 'modalidad': 1, 'activo': True})

    @patch('main.client')
    def test_artist_needs_a_modality_and_admin_gets_none(self, client):
        db = self.fake_db(client)
        self.assertEqual(self.api.post('/api/usuarios/', json={**self.body, 'modalidad': None}).status_code, 422)
        self.assertEqual(self.api.post('/api/usuarios/', json={**self.body, 'modalidad': 9}).status_code, 422)
        self.assertEqual(self.api.post('/api/usuarios/', json={**self.body, 'rol': 7}).status_code, 422)
        db.auth.admin.create_user.assert_not_called()
        self.assertEqual(self.api.post('/api/usuarios/', json={**self.body, 'rol': 1}).status_code, 201)
        self.assertIsNone(db.auth.admin.create_user.call_args.args[0]['user_metadata']['modalidad'])

    @patch('main.client')
    def test_short_password_and_duplicate_email(self, client):
        self.fake_db(client, auth_error='A user with this email address has already been registered')
        self.assertEqual(self.api.post('/api/usuarios/', json={**self.body, 'password': 'corta'}).status_code, 422)
        response = self.api.post('/api/usuarios/', json=self.body)
        self.assertEqual(response.status_code, 409)
        self.assertIn('Ya existe', response.json()['detail'])

    @patch('main.client')
    def test_profile_failure_removes_the_account(self, client):
        db = self.fake_db(client)
        original = db.table.side_effect

        def broken(name):
            mock = original(name)
            if name == 'usuarios':
                mock.update.return_value.eq.return_value.execute.side_effect = Exception('falla')
            return mock
        db.table.side_effect = broken
        self.assertEqual(self.api.post('/api/usuarios/', json=self.body).status_code, 503)
        db.auth.admin.delete_user.assert_called_once_with('u')


class ReceptionTests(unittest.TestCase):
    """Recepción: gestiona el estudio, pero no ve el Dashboard gerencial ni registra admins."""

    def setUp(self):
        self.api = TestClient(main.app)
        self.addCleanup(main.app.dependency_overrides.clear)

    def as_role(self, role):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'r', 'role': role, 'name': 'Recepción'}

    @patch('main.client')
    def test_reception_can_sign_in(self, client):
        query = client.return_value.table.return_value.select.return_value.eq.return_value.execute
        query.side_effect = [SimpleNamespace(data=[{'id': 'r', 'nombre': 'Ana', 'rol': 2, 'activo': True}]), SimpleNamespace(data=[{'nombre': 'Recepcion'}])]
        self.assertEqual(main.profile('r'), {'id': 'r', 'name': 'Ana', 'role': 'recepcion'})

    def test_staff_routes_accept_reception_but_not_artists(self):
        self.assertEqual(main.require_staff({'role': 'recepcion'})['role'], 'recepcion')
        self.assertEqual(main.require_staff({'role': 'admin'})['role'], 'admin')
        with self.assertRaises(main.HTTPException) as ctx:
            main.require_staff({'role': 'tatuador'})
        self.assertEqual(ctx.exception.status_code, 403)

    def test_rent_is_admin_only(self):
        self.as_role('recepcion')
        self.assertEqual(self.api.get('/api/arriendos/historial?hasta=2026-11').status_code, 403)
        self.assertEqual(self.api.get('/api/arriendos?mes=2026-11').status_code, 403)
        pago = {'tatuadorId': '11111111-1111-1111-1111-111111111111', 'periodo': '2026-11', 'monto': 1000, 'pagadoEn': '2026-11-02'}
        self.assertEqual(self.api.post('/api/arriendos/pagos', json=pago).status_code, 403)
        self.assertEqual(self.api.delete('/api/arriendos/pagos/11111111-1111-1111-1111-111111111111').status_code, 403)

    @patch('main.client')
    def test_reception_only_sees_and_registers_artists(self, client):
        db = client.return_value
        rows = [{'id': 1, 'nombre': 'tatuador'}, {'id': 2, 'nombre': 'recepcion'}, {'id': 3, 'nombre': 'admin'}]
        db.table.return_value.select.return_value.execute.return_value = SimpleNamespace(data=rows)
        self.as_role('recepcion')
        self.assertEqual(self.api.get('/api/rol/').json(), [{'id': 1, 'nombre': 'tatuador'}])
        body = {'email': 'x@okami.cl', 'nombre': 'X', 'password': 'una-clave-segura', 'rol': 3}
        self.assertEqual(self.api.post('/api/usuarios/', json=body).status_code, 403)
        db.auth.admin.create_user.assert_not_called()
        self.as_role('admin')
        self.assertEqual(len(self.api.get('/api/rol/').json()), 3)
