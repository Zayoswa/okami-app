import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import main

USER = '11111111-1111-1111-1111-111111111111'
ROLES = [{'id': 1, 'nombre': 'admin'}, {'id': 2, 'nombre': 'Tatuador'}, {'id': 3, 'nombre': 'recepcion'}]


def fake_db(perfil, titular=None, reservas=None, pendientes=None):
    """Cliente de Supabase falso: cada tabla devuelve sus filas sin importar los filtros."""
    data = {
        'usuarios': [perfil] if perfil else [],
        'rol': ROLES,
        'modalidad': [{'id': 1, 'nombre': 'Full'}, {'id': 4, 'nombre': 'Guest'}],
        'puesto_titulares': titular or [],
        'reservas': reservas or [],
        'reservas_estado': [{'id': 7}],
        'reserva_sesiones': pendientes or [],
    }
    db = MagicMock()
    tables = {}

    def table(name):
        query = MagicMock()
        for method in ('select', 'eq', 'is_', 'in_', 'gte', 'update'):
            getattr(query, method).return_value = query
        query.execute.return_value = SimpleNamespace(data=data[name])
        tables[name] = query
        return query
    db.table.side_effect = table
    db.tables = tables
    return db


class ChangeRoleTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'a', 'name': 'Admin', 'role': 'admin'}

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def patch_role(self, body):
        return self.api.patch(f'/api/usuarios/{USER}/rol', json=body)

    def test_only_admin(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'r', 'role': 'recepcion'}
        self.assertEqual(self.patch_role({'rol': 3}).status_code, 403)

    @patch('main.log_event')
    @patch('main.client')
    def test_tatuador_becomes_recepcion_without_modality(self, client, log_event):
        db = client.return_value = fake_db({'id': USER, 'nombre': 'Ana', 'rol': 2, 'modalidad': 1})
        response = self.patch_role({'rol': 3})
        self.assertEqual(response.status_code, 200, response.text)
        db.tables['usuarios'].update.assert_called_with({'rol': 3, 'modalidad': None})
        self.assertIn('tatuador → recepción', log_event.call_args.args[3])

    @patch('main.log_event')
    @patch('main.client')
    def test_recepcion_becomes_tatuador_needs_modality(self, client, _log_event):
        client.return_value = fake_db({'id': USER, 'nombre': 'Rodrigo', 'rol': 3, 'modalidad': None})
        self.assertEqual(self.patch_role({'rol': 2}).status_code, 422)
        db = client.return_value = fake_db({'id': USER, 'nombre': 'Rodrigo', 'rol': 3, 'modalidad': None})
        self.assertEqual(self.patch_role({'rol': 2, 'modalidad': 4}).status_code, 200)
        db.tables['usuarios'].update.assert_called_with({'rol': 2, 'modalidad': 4})

    @patch('main.client')
    def test_admin_accounts_and_admin_role_are_off_limits(self, client):
        client.return_value = fake_db({'id': USER, 'nombre': 'Dueño', 'rol': 1, 'modalidad': None})
        self.assertEqual(self.patch_role({'rol': 3}).status_code, 403)
        client.return_value = fake_db({'id': USER, 'nombre': 'Ana', 'rol': 2, 'modalidad': 1})
        self.assertEqual(self.patch_role({'rol': 1}).status_code, 422)

    @patch('main.client')
    def test_titular_or_pending_sessions_block_leaving_tatuador(self, client):
        client.return_value = fake_db({'id': USER, 'nombre': 'Ana', 'rol': 2, 'modalidad': 1}, titular=[{'puesto': 3}])
        response = self.patch_role({'rol': 3})
        self.assertEqual(response.status_code, 409)
        self.assertIn('titular', response.json()['detail'])
        client.return_value = fake_db({'id': USER, 'nombre': 'Ana', 'rol': 2, 'modalidad': 1},
                                      reservas=[{'id': 'r1'}], pendientes=[{'id': 's1'}, {'id': 's2'}])
        response = self.patch_role({'rol': 3})
        self.assertEqual(response.status_code, 409)
        self.assertIn('2 sesión(es)', response.json()['detail'])

    @patch('main.client')
    def test_missing_user(self, client):
        client.return_value = fake_db(None)
        self.assertEqual(self.patch_role({'rol': 3}).status_code, 404)


if __name__ == '__main__':
    unittest.main()
