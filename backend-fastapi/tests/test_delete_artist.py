import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import main

USER = '11111111-1111-1111-1111-111111111111'


class DeleteArtistTests(unittest.TestCase):
    """Borrado definitivo de un tatuador inactivo (DELETE /api/usuarios/{id}, migración 020)."""

    def setUp(self):
        self.api = TestClient(main.app)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'a', 'name': 'Admin', 'role': 'admin'}

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_requires_session_and_admin(self):
        main.app.dependency_overrides.clear()
        self.assertEqual(self.api.delete(f'/api/usuarios/{USER}').status_code, 401)
        for role in ('recepcion', 'tatuador'):
            with self.subTest(role=role):
                main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'x', 'role': role}
                self.assertEqual(self.api.delete(f'/api/usuarios/{USER}').status_code, 403)

    @patch('main.log_event')
    @patch('main.client')
    def test_deletes_data_then_auth_account(self, client, log_event):
        db = client.return_value
        db.rpc.return_value.execute.return_value.data = {'nombre': 'Ana', 'reservas': 2, 'sesiones': 3}
        response = self.api.delete(f'/api/usuarios/{USER}')
        self.assertEqual(response.status_code, 200, response.text)
        db.rpc.assert_called_once_with('okami_borrar_tatuador', {'p_id': USER})
        db.auth.admin.delete_user.assert_called_once_with(USER)
        self.assertEqual(response.json()['message'], 'Ana fue borrado definitivamente.')
        self.assertTrue(response.json()['authDeleted'])
        self.assertEqual(log_event.call_args.args[2], 'borrado')

    @patch('main.log_event')
    @patch('main.client')
    def test_reports_when_auth_account_could_not_be_deleted(self, client, _log_event):
        db = client.return_value
        db.rpc.return_value.execute.return_value.data = {'nombre': 'Ana', 'reservas': 0, 'sesiones': 0}
        db.auth.admin.delete_user.side_effect = RuntimeError('auth caído')
        response = self.api.delete(f'/api/usuarios/{USER}')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['authDeleted'])
        self.assertIn('Supabase Auth', response.json()['message'])

    @patch('main.log_event')
    @patch('main.client')
    def test_database_rules_become_clear_errors(self, client, log_event):
        cases = {'P0001': 409, 'P0002': 404, '22023': 422}
        for code, status in cases.items():
            with self.subTest(code=code):
                client.return_value.rpc.return_value.execute.side_effect = APIError({'code': code, 'message': 'regla de la base'})
                response = self.api.delete(f'/api/usuarios/{USER}')
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()['detail'], 'regla de la base')
        client.return_value.auth.admin.delete_user.assert_not_called()
        log_event.assert_not_called()

    @patch('main.client')
    def test_missing_migration_is_a_503(self, client):
        client.return_value.rpc.return_value.execute.side_effect = APIError({'code': 'PGRST202', 'message': 'no existe'})
        response = self.api.delete(f'/api/usuarios/{USER}')
        self.assertEqual(response.status_code, 503)
        self.assertIn('020', response.json()['detail'])


if __name__ == '__main__':
    unittest.main()
