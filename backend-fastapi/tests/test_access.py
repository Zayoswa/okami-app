import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
import main


class AccessTests(unittest.TestCase):
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
        main.app.dependency_overrides[main.require_admin] = lambda: {'role':'admin'}
        r = self.api.post('/api/usuarios/invitaciones', json={'nombre':' Artista ', 'email':'artist@example.com','role':'admin'})
        self.assertEqual(r.status_code, 201)
        args = client.return_value.auth.admin.invite_user_by_email.call_args.args
        self.assertEqual(args[1]['data'], {'nombre':'Artista', 'modalidad':None})

    @patch('main.client')
    def test_admin_cannot_disable_other_admin(self, client):
        main.app.dependency_overrides[main.require_admin] = lambda: {'role':'admin'}
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
        main.app.dependency_overrides[main.require_admin] = lambda: {'role':'admin'}
        client.return_value.auth.admin.invite_user_by_email.side_effect = ValueError('SMTP error')
        r = self.api.post('/api/usuarios/invitaciones', json={'nombre':'Artista','email':'a@example.com'})
        self.assertEqual(r.status_code, 400)

if __name__ == '__main__':
    unittest.main()
